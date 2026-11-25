#!/bin/sh
set -eu

DOMAIN="${SSL_DOMAIN:-htxcune.com}"
if ! printf '%s' "$DOMAIN" | grep -qE '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$'; then
  echo "[puc-nginx] SSL_DOMAIN không hợp lệ: ${DOMAIN}" >&2
  exit 1
fi
CERT_FILE="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
KEY_FILE="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"

mkdir -p /var/www/certbot /var/cache/nginx/puc_cache
chown -R nginx:nginx /var/cache/nginx/puc_cache 2>/dev/null || true

if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
  echo "[puc-nginx] Đã tìm thấy chứng chỉ SSL cho ${DOMAIN}. Bật chế độ HTTPS (cổng 443) và tự động chuyển hướng HTTP -> HTTPS."
  sed "s|__SSL_DOMAIN__|${DOMAIN}|g" /etc/nginx/puc-https.conf.template > /etc/nginx/conf.d/default.conf

  # Tự động nạp lại chứng chỉ mới định kỳ mỗi 6 giờ sau khi Certbot gia hạn thành công
  (
    while :; do
      sleep 6h
      nginx -s reload >/dev/null 2>&1 || true
    done
  ) &
else
  echo "[puc-nginx] Chưa có chứng chỉ SSL cho ${DOMAIN}. Chạy chế độ HTTP (cổng 80) sẵn sàng cho Certbot xác thực tên miền."
  cp /etc/nginx/puc-http.conf.template /etc/nginx/conf.d/default.conf
fi

exec nginx -g "daemon off;"
