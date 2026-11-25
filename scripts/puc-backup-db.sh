#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
TG_ENV_FILE="$ROOT_DIR/.env.telegram"
LEGACY_TG_CONF="/etc/puc-telegram.conf"

TG_BOT_TOKEN=""
TG_CHAT_ID=""

load_tg_conf() {
  local conf_file="$1"
  [ -r "$conf_file" ] || return 0
  while IFS='=' read -r raw_key raw_val || [ -n "${raw_key:-}" ]; do
    local key
    key="$(printf '%s' "${raw_key:-}" | tr -d '[:space:]')"
    case "$key" in
      ""|\#*) continue ;;
    esac
    local val="${raw_val:-}"
    val="$(printf '%s' "$val" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    val="${val%\"}"
    val="${val#\"}"
    val="${val%\'}"
    val="${val#\'}"
    if [ "$key" = "TG_BOT_TOKEN" ]; then
      TG_BOT_TOKEN="$val"
    elif [ "$key" = "TG_CHAT_ID" ]; then
      TG_CHAT_ID="$val"
    fi
  done < "$conf_file"
}

if [ -r "$TG_ENV_FILE" ]; then
  load_tg_conf "$TG_ENV_FILE"
elif [ -r "$LEGACY_TG_CONF" ]; then
  load_tg_conf "$LEGACY_TG_CONF"
fi

send_tg() {
  local msg="$1"
  if [ -z "$TG_BOT_TOKEN" ] || [ -z "$TG_CHAT_ID" ]; then
    return 0
  fi
  curl -fsS -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TG_CHAT_ID}" \
    --data-urlencode "text=${msg}" >/dev/null 2>&1 || true
}

trap 'send_tg "[CẢNH BÁO PUC] Sao lưu CSDL thất bại trên máy chủ $(hostname). Vui lòng kiểm tra ngay!"' ERR

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

OUT="$BACKUP_DIR/puc-daily-db-$(date +%Y%m%d).dump"
TMP_OUT="${OUT}.tmp.$$"
trap 'rm -f "$TMP_OUT"; send_tg "[CẢNH BÁO PUC] Sao lưu CSDL thất bại trên máy chủ $(hostname). Vui lòng kiểm tra ngay!"' ERR

/usr/bin/docker exec puc-db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$TMP_OUT"
chmod 600 "$TMP_OUT"
mv -f "$TMP_OUT" "$OUT"

find "$BACKUP_DIR" -maxdepth 1 -type f -name "puc-daily-db-*.dump" -mtime +14 -delete

SIZE="$(du -h "$OUT" | awk '{print $1}')"
DISK_FREE="$(df -h / | awk 'NR==2 {print $4 " trống (" $5 " đã dùng)"}')"
send_tg "[PUC Sao lưu thành công] Tệp: $(basename "$OUT") (${SIZE}) - Ổ đĩa VPS: ${DISK_FREE}"

