#!/usr/bin/env bash
set -euo pipefail
umask 077

if [ "$(id -u)" -ne 0 ]; then
  echo "[LỖI] Vui lòng chạy kịch bản cài đặt này với quyền sudo:"
  echo "  sudo ./scripts/setup-tg-bot.sh"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TG_ENV_FILE="$ROOT_DIR/.env.telegram"
LEGACY_TG_CONF="/etc/puc-telegram.conf"
BACKUP_DIR="$ROOT_DIR/backups"

RUN_USER="${SUDO_USER:-}"
if [ -z "$RUN_USER" ] || [ "$RUN_USER" = "root" ]; then
  if id -u deploy >/dev/null 2>&1; then
    RUN_USER="deploy"
  else
    RUN_USER="$(stat -c '%U' "$ROOT_DIR")"
  fi
fi

RUN_GROUP="$(id -gn "$RUN_USER")"

chmod +x "$ROOT_DIR/scripts/"*.sh "$ROOT_DIR/scripts/"*.py 2>/dev/null || true

# 1. Chuyển cấu hình Telegram sẵn có từ /etc/puc-telegram.conf sang .env.telegram (hoặc hỏi mới nếu chưa có)
if [ ! -s "$TG_ENV_FILE" ] && [ -s "$LEGACY_TG_CONF" ]; then
  cp "$LEGACY_TG_CONF" "$TG_ENV_FILE"
  echo "[1/4] Đã chuyển cấu hình từ $LEGACY_TG_CONF sang $TG_ENV_FILE."
fi

if [ ! -s "$TG_ENV_FILE" ]; then
  read -rp "Dán BOT_TOKEN từ @BotFather vào đây rồi nhấn Enter: " RAW_TOKEN
  TOKEN="$(printf '%s' "$RAW_TOKEN" | tr -d '<>[:space:]')"
  RAW_UPDATES="$(curl -s "https://api.telegram.org/bot${TOKEN}/getUpdates" || true)"
  if ! printf '%s' "$RAW_UPDATES" | grep -q '"ok":true'; then
    echo "[LỖI] BOT_TOKEN không hợp lệ. Vui lòng kiểm tra lại mã từ @BotFather."
    exit 1
  fi
  CHAT_ID="$(printf '%s' "$RAW_UPDATES" | grep -oE '"chat":\s*\{"id":\s*[-0-9]+' | tail -n 1 | grep -oE '[-0-9]+$' || true)"
  if [ -z "$CHAT_ID" ]; then
    echo "[LỖI] Chưa tìm thấy tin nhắn nào gửi vào Bot. Hãy mở Bot trên Telegram, bấm Start và gửi chữ 'test' rồi chạy lại."
    exit 1
  fi
  printf 'TG_BOT_TOKEN="%s"\nTG_CHAT_ID="%s"\n' "$TOKEN" "$CHAT_ID" > "$TG_ENV_FILE"
  echo "[1/4] Đã kết nối và lưu cấu hình Telegram (CHAT_ID=${CHAT_ID})."
fi

chown "$RUN_USER:$RUN_GROUP" "$TG_ENV_FILE"
chmod 600 "$TG_ENV_FILE"

mkdir -p "$BACKUP_DIR"
chown -R "$RUN_USER:$RUN_GROUP" "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
find "$BACKUP_DIR" -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null || true

# 2. Cấp quyền sudo tối thiểu (chỉ đọc UFW/Fail2Ban và khởi động lại dịch vụ Bot khi deploy code mới)
SUDOERS_TMP="/etc/sudoers.d/puc-tg-monitor.tmp"
cat > "$SUDOERS_TMP" <<EOF
${RUN_USER} ALL=(root) NOPASSWD: /usr/sbin/ufw status, /usr/bin/fail2ban-client status sshd, /bin/systemctl restart puc-tg-bot.service, /usr/bin/systemctl restart puc-tg-bot.service
EOF
chmod 440 "$SUDOERS_TMP"
visudo -cf "$SUDOERS_TMP" >/dev/null
mv -f "$SUDOERS_TMP" /etc/sudoers.d/puc-tg-monitor
echo "[2/4] Đã cấu hình quyền kiểm tra tường lửa và tự động khởi động lại Bot khi deploy."

# 3. Chuẩn hóa lịch sao lưu 02:00 sáng hàng ngày về kịch bản trong kho mã nguồn
if crontab -l >/dev/null 2>&1; then
  (crontab -l 2>/dev/null | grep -v 'puc-backup-db.sh' || true) | crontab -
fi
(crontab -u "$RUN_USER" -l 2>/dev/null | grep -v 'puc-backup-db.sh' || true; echo "0 2 * * * $ROOT_DIR/scripts/puc-backup-db.sh >/dev/null 2>&1") | crontab -u "$RUN_USER" -
rm -f /usr/local/sbin/puc-tg-bot.py /usr/local/sbin/puc-backup-db.sh
echo "[3/4] Đã đồng bộ lịch sao lưu 02:00 sáng hàng ngày về $ROOT_DIR/scripts/puc-backup-db.sh."

# 4. Đăng ký và khởi chạy dịch vụ systemd trỏ trực tiếp vào scripts/puc-tg-bot.py
cat > /etc/systemd/system/puc-tg-bot.service <<EOF
[Unit]
Description=PUC Telegram Server Monitor Bot (Git-managed)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_GROUP}
SupplementaryGroups=docker
WorkingDirectory=${ROOT_DIR}
ExecStart=/usr/bin/python3 ${ROOT_DIR}/scripts/puc-tg-bot.py
Restart=always
RestartSec=5
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable puc-tg-bot.service
systemctl restart puc-tg-bot.service
sleep 2

if systemctl is-active --quiet puc-tg-bot.service; then
  echo "[4/4] HOÀN TẤT: Dịch vụ puc-tg-bot.service đang hoạt động ổn định."
  echo "Từ nay mỗi khi bạn chỉnh sửa scripts/puc-tg-bot.py và git push lên nhánh main, Bot trên VPS sẽ tự động cập nhật tính năng mới!"
else
  echo "[CẢNH BÁO] Dịch vụ puc-tg-bot.service chưa khởi chạy. Xem chi tiết bằng lệnh: sudo journalctl -u puc-tg-bot.service -n 30 --no-pager"
  exit 1
fi

