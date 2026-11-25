#!/usr/bin/env python3
import json
import os
import re
import socket
import ssl
import subprocess
import sys
import time
import urllib.request

SCRIPT_PATH = os.path.abspath(__file__)
ROOT_DIR = os.path.dirname(os.path.dirname(SCRIPT_PATH))
TG_ENV_PATH = os.path.join(ROOT_DIR, ".env.telegram")
LEGACY_CONF_PATH = "/etc/puc-telegram.conf"
PROD_ENV_PATH = os.path.join(ROOT_DIR, ".env.prod")
BACKUP_DIR = os.path.join(ROOT_DIR, "backups")
BACKUP_SCRIPT = os.path.join(ROOT_DIR, "scripts", "puc-backup-db.sh")
DEPLOY_LOCK_PATH = os.path.join(ROOT_DIR, ".deploying")

CONTAINER_MAP = {
    "": "puc-backend",
    "backend": "puc-backend",
    "nginx": "puc-nginx",
    "frontend": "puc-frontend",
    "db": "puc-db",
    "certbot": "puc-certbot",
}


def parse_kv_file(path):
    conf = {}
    if not os.path.isfile(path) or not os.access(path, os.R_OK):
        return conf
    with open(path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            conf[k.strip()] = v.strip().strip('"').strip("'")
    return conf


def load_tg_conf():
    conf = parse_kv_file(TG_ENV_PATH)
    if conf.get("TG_BOT_TOKEN") and conf.get("TG_CHAT_ID"):
        return conf
    return parse_kv_file(LEGACY_CONF_PATH)


def read_ssl_domain():
    prod = parse_kv_file(PROD_ENV_PATH)
    dom = prod.get("SSL_DOMAIN", "").strip()
    return dom if dom else "htxcune.com"


def tg_call(token, method, payload=None, timeout=40):
    url = f"https://api.telegram.org/bot{token}/{method}"
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def send_msg(token, chat_id, text):
    safe_text = text[:3900]
    try:
        tg_call(token, "sendMessage", {"chat_id": chat_id, "text": safe_text}, timeout=15)
    except Exception:
        pass


def run_cmd(args, timeout=12, cwd=None):
    try:
        r = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            cwd=cwd,
        )
        out = (r.stdout or "").strip()
        err = (r.stderr or "").strip()
        return r.returncode, out, err
    except Exception as e:
        return 1, "", str(e)


def run_priv_cmd(cmd_args, timeout=10):
    if os.geteuid() == 0:
        return run_cmd(cmd_args, timeout=timeout)
    return run_cmd(["/usr/bin/sudo", "-n"] + cmd_args, timeout=timeout)


def get_git_revision():
    rc, out, _ = run_cmd(["/usr/bin/git", "log", "-1", "--format=%h (%s)"], timeout=5, cwd=ROOT_DIR)
    if rc == 0 and out:
        return out[:140]
    return "Không xác định"


def is_deploying_now():
    try:
        if not os.path.exists(DEPLOY_LOCK_PATH):
            return False
        age = time.time() - os.path.getmtime(DEPLOY_LOCK_PATH)
        return age < 900
    except Exception:
        return False


def format_uptime():
    try:
        with open("/proc/uptime", "r", encoding="utf-8") as f:
            sec = int(float(f.read().split()[0]))
        days, rem = divmod(sec, 86400)
        hours, rem = divmod(rem, 3600)
        mins = rem // 60
        if days > 0:
            return f"{days} ngày {hours} giờ {mins} phút"
        return f"{hours} giờ {mins} phút"
    except Exception:
        return "Không xác định"


def read_mem_swap():
    info = {}
    with open("/proc/meminfo", "r", encoding="utf-8") as f:
        for line in f:
            parts = line.split(":")
            if len(parts) == 2:
                info[parts[0].strip()] = int(parts[1].strip().split()[0])
    mem_total = info.get("MemTotal", 0) / 1048576
    mem_avail = info.get("MemAvailable", 0) / 1048576
    mem_used = max(0.0, mem_total - mem_avail)
    mem_pct = (mem_used / mem_total * 100) if mem_total > 0 else 0.0

    sw_total = info.get("SwapTotal", 0) / 1048576
    sw_free = info.get("SwapFree", 0) / 1048576
    sw_used = max(0.0, sw_total - sw_free)
    return mem_used, mem_total, mem_pct, sw_used, sw_total


def read_disk():
    st = os.statvfs("/")
    total = (st.f_blocks * st.f_frsize) / (1024 ** 3)
    free = (st.f_bavail * st.f_frsize) / (1024 ** 3)
    used = max(0.0, total - free)
    pct = (used / total * 100) if total > 0 else 0.0
    return used, total, free, pct


def check_api_health():
    try:
        with urllib.request.urlopen("http://127.0.0.1/api/health", timeout=4) as r:
            return r.status == 200, f"Hoạt động tốt (HTTP {r.status})"
    except Exception as e:
        return False, f"Không phản hồi ({e})"


def inspect_ssl_cert():
    domain = read_ssl_domain()
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection(("127.0.0.1", 443), timeout=5) as sock:
            with ctx.wrap_socket(sock, server_hostname=domain) as ssock:
                cert = ssock.getpeercert()
        not_after = cert.get("notAfter")
        if not not_after:
            return domain, None, "Chưa đọc được hạn chứng chỉ"
        exp_epoch = ssl.cert_time_to_seconds(not_after)
        days_left = int((exp_epoch - time.time()) // 86400)
        exp_str = time.strftime("%d/%m/%Y %H:%M", time.localtime(exp_epoch))
        return domain, days_left, exp_str
    except Exception as e:
        return domain, None, f"Chưa bật cổng 443 hoặc lỗi chứng chỉ ({e})"


def latest_backup_info():
    try:
        if not os.path.isdir(BACKUP_DIR):
            return "Chưa có thư mục sao lưu"
        dumps = [
            os.path.join(BACKUP_DIR, name)
            for name in os.listdir(BACKUP_DIR)
            if name.endswith(".dump")
        ]
        if not dumps:
            return "Chưa có tệp sao lưu"
        newest = max(dumps, key=os.path.getmtime)
        size_mb = os.path.getsize(newest) / (1024 * 1024)
        mtime = time.strftime("%d/%m/%Y %H:%M", time.localtime(os.path.getmtime(newest)))
        return f"{os.path.basename(newest)} ({size_mb:.1f} MB, lúc {mtime})"
    except Exception:
        return "Không đọc được thông tin sao lưu"


def query_psql(sql):
    return run_cmd([
        "/usr/bin/docker", "exec", "puc-db", "sh", "-c",
        f'psql -At -F "|" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "{sql.strip()}"',
    ])


def handle_status():
    host = socket.gethostname()
    rev = get_git_revision()
    up = format_uptime()
    l1, l5, l15 = os.getloadavg()
    cores = os.cpu_count() or 1
    m_used, m_tot, m_pct, sw_used, sw_tot = read_mem_swap()
    _, d_tot, d_free, d_pct = read_disk()
    _, api_msg = check_api_health()
    bk = latest_backup_info()
    return "\n".join([
        f"[TÌNH TRẠNG MÁY CHỦ: {host}]",
        f"- Phiên bản mã nguồn: {rev}",
        f"- Thời gian chạy: {up}",
        f"- Tải CPU ({cores} nhân): {l1:.2f} / {l5:.2f} / {l15:.2f}",
        f"- Bộ nhớ RAM: {m_used:.2f} GB / {m_tot:.2f} GB ({m_pct:.0f}%)",
        f"- Bộ nhớ Swap: {sw_used:.2f} GB / {sw_tot:.2f} GB",
        f"- Ổ đĩa VPS: trống {d_free:.1f} GB / {d_tot:.1f} GB (đã dùng {d_pct:.0f}%)",
        f"- Phản hồi API: {api_msg}",
        f"- Sao lưu mới nhất: {bk}",
    ])


def handle_docker():
    rc1, ps_out, err1 = run_cmd(["/usr/bin/docker", "ps", "-a", "--format", "- {{.Names}}: {{.Status}}"])
    rc2, st_out, _ = run_cmd(
        ["/usr/bin/docker", "stats", "--no-stream", "--format", "- {{.Name}}: CPU {{.CPUPerc}}, RAM {{.MemUsage}}"],
        timeout=10,
    )
    if rc1 != 0:
        return f"[DOCKER] Không lấy được trạng thái container: {err1}"
    lines = ["[TRẠNG THÁI CONTAINER DOCKER]", ps_out or "Không có container nào."]
    if rc2 == 0 and st_out:
        lines.append("")
        lines.append("[MỨC SỬ DỤNG TÀI NGUYÊN]")
        lines.append(st_out)
    return "\n".join(lines)


def handle_db():
    sql = """
    SELECT
      (SELECT count(*) FROM users),
      (SELECT count(*) FROM households),
      (SELECT count(*) FROM plots),
      (SELECT count(*) FROM journal_entries),
      (SELECT count(*) FROM spray_records),
      (SELECT count(*) FROM harvest_lots),
      (SELECT count(*) FROM lab_tests),
      (SELECT count(*) FROM attachments),
      (SELECT CASE WHEN to_regclass('public.trace_access_requests') IS NOT NULL
                   THEN (SELECT count(*) FROM trace_access_requests WHERE status = 'pending')
                   ELSE 0 END),
      pg_size_pretty(pg_database_size(current_database()));
    """
    rc, out, err = query_psql(sql)
    if rc != 0 or not out:
        return f"[CSDL] Không truy vấn được puc-db: {err or 'Không có dữ liệu'}"
    cols = out.splitlines()[-1].split("|")
    if len(cols) < 10:
        return f"[CSDL] Kết quả: {out}"
    return "\n".join([
        "[THỐNG KÊ CƠ SỞ DỮ LIỆU PUC]",
        f"- Dung lượng CSDL: {cols[9]}",
        f"- Tài khoản người dùng: {cols[0]}",
        f"- Nông hộ thành viên: {cols[1]}",
        f"- Thửa đất định danh: {cols[2]}",
        f"- Nhật ký canh tác: {cols[3]}",
        f"- Bản ghi phun thuốc: {cols[4]}",
        f"- Lô thu hoạch: {cols[5]}",
        f"- Phiếu kiểm nghiệm: {cols[6]}",
        f"- Tệp ảnh và video: {cols[7]}",
        f"- Yêu cầu mở QR chờ duyệt: {cols[8]}",
    ])


def handle_qr():
    sql = """
    SELECT
      request_code,
      replace(requester_name, '|', '/'),
      replace(organization, '|', '/'),
      contact_phone,
      COALESCE(resolved_lot_code, scanned_code),
      to_char(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI')
    FROM trace_access_requests
    WHERE status = 'pending'
    ORDER BY created_at DESC
    LIMIT 5;
    """
    rc, out, err = query_psql(sql)
    if rc != 0:
        return f"[YÊU CẦU QR] Không đọc được danh sách chờ duyệt: {err}"
    if not out.strip():
        return "[YÊU CẦU MỞ HỒ SƠ QR]\nHiện không có yêu cầu nào đang chờ duyệt."
    lines = ["[YÊU CẦU MỞ HỒ SƠ QR ĐANG CHỜ DUYỆT]"]
    for idx, row in enumerate(out.splitlines(), start=1):
        parts = row.split("|")
        if len(parts) >= 6:
            lines.append(
                f"{idx}. Mã {parts[0]} ({parts[5]})\n"
                f"   Đại diện: {parts[1]} - {parts[2]}\n"
                f"   SĐT: {parts[3]} - Hồ sơ: {parts[4]}"
            )
    lines.append("\nTruy cập mục Cài đặt -> Duyệt cấp quyền xem hồ sơ QR trên trang Quản trị để phê duyệt.")
    return "\n".join(lines)


def handle_ssl():
    domain, days_left, detail = inspect_ssl_cert()
    if days_left is None:
        return f"[CHỨNG CHỈ HTTPS: {domain}]\n- Trạng thái: {detail}"
    state = "Còn hạn an toàn" if days_left > 14 else "Sắp hết hạn, cần kiểm tra Certbot"
    return "\n".join([
        f"[CHỨNG CHỈ HTTPS: {domain}]",
        f"- Trạng thái: {state}",
        f"- Số ngày còn lại: {days_left} ngày",
        f"- Hết hạn lúc: {detail}",
    ])


def handle_security():
    rc_ufw, ufw_out, _ = run_priv_cmd(["/usr/sbin/ufw", "status"])
    if rc_ufw == 0 and "Status: active" in ufw_out:
        ufw_state = "Đang bật (active)"
    elif rc_ufw == 0:
        ufw_state = "Chưa bật"
    else:
        ufw_state = "Cần chạy sudo ./scripts/setup-tg-bot.sh để cấp quyền đọc UFW"

    rc_f2b, f2b_out, _ = run_priv_cmd(["/usr/bin/fail2ban-client", "status", "sshd"])
    cur_ban = "0"
    tot_ban = "0"
    tot_fail = "0"
    if rc_f2b == 0:
        m1 = re.search(r"Currently banned:\s*(\d+)", f2b_out)
        m2 = re.search(r"Total banned:\s*(\d+)", f2b_out)
        m3 = re.search(r"Total failed:\s*(\d+)", f2b_out)
        if m1:
            cur_ban = m1.group(1)
        if m2:
            tot_ban = m2.group(1)
        if m3:
            tot_fail = m3.group(1)

    rc_al, al_out, _ = query_psql(
        "SELECT CASE WHEN to_regclass('public.system_alerts') IS NOT NULL "
        "THEN (SELECT count(*) FROM system_alerts WHERE created_at >= now() - interval '24 hours') "
        "ELSE 0 END;"
    )
    alerts_24h = al_out.strip() if rc_al == 0 and al_out.strip() else "0"

    return "\n".join([
        "[AN NINH MÁY CHỦ VPS]",
        f"- Tường lửa UFW: {ufw_state}",
        f"- Lượt dò mật khẩu SSH bị chặn: {tot_fail} lần",
        f"- Số IP đang bị Fail2Ban khóa: {cur_ban} IP (tổng cộng đã khóa {tot_ban} IP)",
        f"- Cảnh báo hệ thống PUC trong 24h qua: {alerts_24h}",
    ])


def handle_logs(target):
    cname = CONTAINER_MAP.get(target)
    if not cname:
        return "Chỉ hỗ trợ xem log của: backend, nginx, frontend, db, certbot (ví dụ: /logs backend hoặc /logs nginx)."
    _, out, err = run_cmd(["/usr/bin/docker", "logs", "--tail", "15", cname], timeout=10)
    combined = "\n".join(x for x in [out, err] if x).strip()
    if not combined:
        combined = "Chưa có dòng log mới."
    combined = re.sub(r"(?i)(password|secret|token|authorization)\s*[:=]\s*\S+", r"\1=[REDACTED]", combined)
    if len(combined) > 3200:
        combined = "...\n" + combined[-3200:]
    return f"[15 DÒNG LOG MỚI NHẤT: {cname}]\n{combined}"


def handle_help():
    return "\n".join([
        "[DANH SÁCH LỆNH QUẢN TRỊ MÁY CHỦ PUC]",
        "/status - Sức khỏe CPU, RAM, ổ đĩa, API và bản sao lưu",
        "/docker - Trạng thái và mức RAM các container",
        "/db - Số liệu bản ghi thực tế trong CSDL",
        "/qr - Xem các yêu cầu mở hồ sơ QR đang chờ duyệt",
        "/ssl - Kiểm tra thời hạn chứng chỉ bảo mật HTTPS",
        "/security - Trạng thái tường lửa UFW và IP bị Fail2Ban khóa",
        "/logs - Xem 15 dòng log backend (hoặc /logs nginx, /logs frontend, /logs db)",
        "/backup - Chạy sao lưu CSDL ngay lập tức",
        "/help - Xem bảng hướng dẫn này",
    ])


def register_menu(token):
    commands = [
        {"command": "status", "description": "Kiểm tra sức khỏe tổng quan máy chủ"},
        {"command": "docker", "description": "Xem trạng thái và RAM các container"},
        {"command": "db", "description": "Thống kê dữ liệu thực tế trong CSDL"},
        {"command": "qr", "description": "Xem yêu cầu mở hồ sơ QR chờ duyệt"},
        {"command": "ssl", "description": "Kiểm tra thời hạn chứng chỉ HTTPS"},
        {"command": "security", "description": "Kiểm tra tường lửa UFW và Fail2Ban"},
        {"command": "logs", "description": "Xem log mới nhất (backend, nginx, frontend, db)"},
        {"command": "backup", "description": "Sao lưu CSDL ngay lập tức"},
        {"command": "help", "description": "Danh sách các lệnh điều khiển"},
    ]
    try:
        tg_call(token, "setMyCommands", {"commands": commands}, timeout=15)
    except Exception:
        pass


def fetch_max_qr_request_id():
    rc, out, _ = query_psql(
        "SELECT CASE WHEN to_regclass('public.trace_access_requests') IS NOT NULL "
        "THEN COALESCE((SELECT max(id) FROM trace_access_requests), 0) ELSE 0 END;"
    )
    if rc == 0 and out.strip().isdigit():
        return int(out.strip())
    return None


def fetch_new_qr_requests(after_id):
    sql = f"""
    SELECT
      id,
      request_code,
      replace(requester_name, '|', '/'),
      replace(organization, '|', '/'),
      contact_phone,
      COALESCE(resolved_lot_code, scanned_code)
    FROM trace_access_requests
    WHERE id > {int(after_id)} AND status = 'pending'
    ORDER BY id ASC
    LIMIT 5;
    """
    rc, out, _ = query_psql(sql)
    if rc != 0 or not out.strip():
        return []
    rows = []
    for line in out.splitlines():
        parts = line.split("|")
        if len(parts) >= 6 and parts[0].isdigit():
            rows.append({
                "id": int(parts[0]),
                "code": parts[1],
                "name": parts[2],
                "org": parts[3],
                "phone": parts[4],
                "target": parts[5],
            })
    return rows


def notify_deploy_cli(state):
    conf = load_tg_conf()
    token = conf.get("TG_BOT_TOKEN", "")
    chat_id = str(conf.get("TG_CHAT_ID", ""))
    if not token or not chat_id:
        return 0
    rev = get_git_revision()
    host = socket.gethostname()
    if state == "ok":
        send_msg(
            token,
            chat_id,
            f"[PUC Deploy thành công] Máy chủ {host} đã cập nhật phiên bản mới: {rev}",
        )
    else:
        send_msg(
            token,
            chat_id,
            f"[CẢNH BÁO DEPLOY] Triển khai phiên bản {rev} trên máy chủ {host} thất bại. Vui lòng kiểm tra GitHub Actions!",
        )
    return 0


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "--notify-deploy":
        sys.exit(notify_deploy_cli(sys.argv[2]))

    conf = load_tg_conf()
    token = conf.get("TG_BOT_TOKEN", "")
    allowed_chat = str(conf.get("TG_CHAT_ID", ""))
    if not token or not allowed_chat:
        raise RuntimeError("Thiếu TG_BOT_TOKEN hoặc TG_CHAT_ID trong .env.telegram")

    boot_mtime = os.path.getmtime(SCRIPT_PATH)
    register_menu(token)

    offset = 0
    try:
        init = tg_call(token, "getUpdates", {"offset": -1, "timeout": 0}, timeout=15)
        items = init.get("result") or []
        if items:
            offset = int(items[-1]["update_id"]) + 1
    except Exception:
        pass

    rev = get_git_revision()
    send_msg(
        token,
        allowed_chat,
        f"[PUC Bot] Trợ lý giám sát máy chủ đã sẵn sàng (phiên bản {rev}). Bấm nút Menu hoặc gửi /status để kiểm tra.",
    )

    fail_streak = 0
    api_down_alerted = False
    last_check_ts = 0.0
    last_disk_warn_ts = 0.0
    last_ssl_warn_ts = 0.0
    last_qr_id = fetch_max_qr_request_id()

    while True:
        # Tự động thoát để systemd nạp lại mã nguồn mới ngay khi git pull/reset cập nhật tệp này
        try:
            if os.path.getmtime(SCRIPT_PATH) != boot_mtime:
                sys.exit(0)
        except SystemExit:
            raise
        except Exception:
            pass

        try:
            res = tg_call(token, "getUpdates", {"offset": offset, "timeout": 25}, timeout=35)
            for upd in res.get("result") or []:
                offset = int(upd["update_id"]) + 1
                msg = upd.get("message") or {}
                chat_id = str((msg.get("chat") or {}).get("id", ""))
                if chat_id != allowed_chat:
                    continue
                text = (msg.get("text") or "").strip()
                if not text.startswith("/"):
                    continue
                parts = text.split()
                cmd = parts[0].split("@")[0].lower()
                arg = parts[1].lower() if len(parts) > 1 else ""

                if cmd in ("/start", "/help"):
                    send_msg(token, allowed_chat, handle_help())
                elif cmd == "/status":
                    send_msg(token, allowed_chat, handle_status())
                elif cmd == "/docker":
                    send_msg(token, allowed_chat, handle_docker())
                elif cmd == "/db":
                    send_msg(token, allowed_chat, handle_db())
                elif cmd == "/qr":
                    send_msg(token, allowed_chat, handle_qr())
                elif cmd == "/ssl":
                    send_msg(token, allowed_chat, handle_ssl())
                elif cmd == "/security":
                    send_msg(token, allowed_chat, handle_security())
                elif cmd == "/logs":
                    send_msg(token, allowed_chat, handle_logs(arg))
                elif cmd == "/backup":
                    send_msg(token, allowed_chat, "Đang tiến hành sao lưu CSDL theo yêu cầu, vui lòng đợi vài giây...")
                    rc, _, err = run_cmd(["/bin/bash", BACKUP_SCRIPT], timeout=180)
                    if rc != 0:
                        send_msg(token, allowed_chat, f"[LỖI SAO LƯU] Mã lỗi {rc}: {err}")
                else:
                    send_msg(token, allowed_chat, "Lệnh không hợp lệ. Gửi /help để xem danh sách lệnh.")
        except Exception:
            time.sleep(5)

        now = time.time()
        if now - last_check_ts >= 60:
            last_check_ts = now

            # 1. Theo dõi sức khỏe API (tạm hoãn cảnh báo nếu đang trong lúc GitHub Actions deploy lại Docker)
            if not is_deploying_now():
                ok, detail = check_api_health()
                if not ok:
                    fail_streak += 1
                    if fail_streak >= 3 and not api_down_alerted:
                        api_down_alerted = True
                        send_msg(
                            token,
                            allowed_chat,
                            f"[CẢNH BÁO KHẨN] API máy chủ PUC không phản hồi liên tiếp 3 phút ({detail}). Gửi /docker hoặc /logs để kiểm tra ngay!",
                        )
                else:
                    if api_down_alerted:
                        api_down_alerted = False
                        send_msg(token, allowed_chat, "[PHỤC HỒI] Dịch vụ API máy chủ PUC đã hoạt động bình thường trở lại.")
                    fail_streak = 0

            # 2. Cảnh báo dung lượng ổ cứng khi vượt 85%
            try:
                _, d_tot, d_free, d_pct = read_disk()
                if d_pct >= 85.0 and (now - last_disk_warn_ts >= 21600):
                    last_disk_warn_ts = now
                    send_msg(
                        token,
                        allowed_chat,
                        f"[CẢNH BÁO Ổ ĐĨA] Ổ cứng VPS đã đầy {d_pct:.0f}% (chỉ còn trống {d_free:.1f} GB / {d_tot:.1f} GB).",
                    )
            except Exception:
                pass

            # 3. Cảnh báo chứng chỉ SSL sắp hết hạn (<= 14 ngày)
            if now - last_ssl_warn_ts >= 86400:
                domain, days_left, exp_str = inspect_ssl_cert()
                if days_left is not None and days_left <= 14:
                    last_ssl_warn_ts = now
                    send_msg(
                        token,
                        allowed_chat,
                        f"[CẢNH BÁO SSL] Chứng chỉ HTTPS của {domain} chỉ còn {days_left} ngày (hết hạn {exp_str}).",
                    )

            # 4. Báo tin tức thì khi có đoàn kiểm tra gửi yêu cầu mở hồ sơ QR mới ngoài thực địa
            if last_qr_id is None:
                last_qr_id = fetch_max_qr_request_id()
            else:
                for item in fetch_new_qr_requests(last_qr_id):
                    last_qr_id = max(last_qr_id, item["id"])
                    send_msg(
                        token,
                        allowed_chat,
                        f"[YÊU CẦU MỞ QR MỚI] Mã {item['code']} từ {item['name']} ({item['org']}, SĐT: {item['phone']}) cho hồ sơ {item['target']}. Gửi /qr để xem danh sách chờ duyệt.",
                    )


if __name__ == "__main__":
    main()

