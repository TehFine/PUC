#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="$ROOT_DIR/.env.prod"
COMPOSE_FILE="$ROOT_DIR/docker-compose.prod.yml"

if [ ! -f "$ENV_FILE" ]; then
  echo "[LỖI] Không tìm thấy tệp $ENV_FILE trên máy chủ."
  echo "Hãy tạo tệp .env.prod từ .env.prod.example trước khi chạy script này."
  exit 1
fi

read_env_val() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"
  if [ -z "$line" ]; then
    echo ""
    return
  fi
  local val="${line#*=}"
  val="${val%\"}"
  val="${val#\"}"
  val="${val%\'}"
  val="${val#\'}"
  printf '%s' "$val"
}

upsert_env_val() {
  local key="$1"
  local val="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}

DOMAIN="$(read_env_val SSL_DOMAIN)"
DOMAIN="${DOMAIN:-htxcune.com}"
EMAIL_ARG="${1:-$(read_env_val SSL_EMAIL)}"

echo "=== BƯỚC 1/4: Khởi động puc-nginx để mở đường dẫn xác thực tên miền (${DOMAIN}) ==="
upsert_env_val "SSL_DOMAIN" "$DOMAIN"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d nginx
sleep 2

echo "=== BƯỚC 2/4: Kiểm tra bản ghi DNS của ${DOMAIN} và www.${DOMAIN} ==="
MAIN_IP="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1 { print $1 }' || true)"
WWW_IP="$(getent ahostsv4 "www.${DOMAIN}" 2>/dev/null | awk 'NR==1 { print $1 }' || true)"

if [ -z "$MAIN_IP" ]; then
  echo "[LỖI] Tên miền ${DOMAIN} hiện chưa phân giải được sang địa chỉ IPv4."
  echo "Hãy kiểm tra lại bản ghi A của ${DOMAIN} trên trang quản lý tên miền rồi chạy lại."
  exit 1
fi

CERT_DOMAINS=(-d "$DOMAIN")
if [ -n "$WWW_IP" ] && [ "$WWW_IP" = "$MAIN_IP" ]; then
  echo "Phát hiện www.${DOMAIN} cùng trỏ về ${MAIN_IP}. Cấp chứng chỉ SSL gộp cho cả ${DOMAIN} và www.${DOMAIN}."
  CERT_DOMAINS+=(-d "www.${DOMAIN}")
else
  echo "Lưu ý: www.${DOMAIN} chưa trỏ về ${MAIN_IP}, hệ thống sẽ cấp chứng chỉ SSL cho ${DOMAIN}."
fi

EMAIL_FLAGS=(--register-unsafely-without-email)
if [ -n "$EMAIL_ARG" ]; then
  EMAIL_FLAGS=(--email "$EMAIL_ARG" --no-eff-email)
fi

echo "=== BƯỚC 3/4: Yêu cầu chứng chỉ SSL miễn phí từ Let's Encrypt ==="
if ! docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  "${EMAIL_FLAGS[@]}" \
  "${CERT_DOMAINS[@]}" \
  --rsa-key-size 4096 \
  --agree-tos \
  --non-interactive \
  --keep-until-expiring; then
  echo "[LỖI] Không thể cấp chứng chỉ SSL từ Let's Encrypt."
  echo "Vui lòng kiểm tra: (1) Tường lửa VPS đã mở cổng 80 và 443 chưa, (2) Bản ghi A của ${DOMAIN} đã trỏ đúng IP máy chủ chưa."
  exit 1
fi

echo "=== BƯỚC 4/4: Đồng bộ cấu hình bảo mật HTTPS vào .env.prod và khởi động lại dịch vụ ==="
cp "$ENV_FILE" "${ENV_FILE}.bak"
chmod 600 "$ENV_FILE" "${ENV_FILE}.bak"

JWT_CUR="$(read_env_val JWT_ACCESS_SECRET)"
if [ "${#JWT_CUR}" -lt 32 ] || printf '%s' "$JWT_CUR" | grep -qiE 'change-?me|example|dev-local-secret|test-access-secret|Thay_Bang'; then
  echo "Tự động nâng cấp JWT_ACCESS_SECRET sang khóa ngẫu nhiên chuẩn Production."
  upsert_env_val "JWT_ACCESS_SECRET" "$(openssl rand -base64 48 | tr -d '\n')"
fi

TOTP_CUR="$(read_env_val TOTP_ENCRYPTION_KEY)"
if [ "${#TOTP_CUR}" -lt 32 ] || printf '%s' "$TOTP_CUR" | grep -qiE 'change-?me|example|dev-local-secret|test-access-secret|Thay_Bang'; then
  echo "Tự động nâng cấp TOTP_ENCRYPTION_KEY sang khóa ngẫu nhiên chuẩn Production."
  upsert_env_val "TOTP_ENCRYPTION_KEY" "$(openssl rand -base64 48 | tr -d '\n')"
fi

DB_PASS_CUR="$(read_env_val POSTGRES_PASSWORD)"
upsert_env_val "CORS_ORIGIN" "https://${DOMAIN},https://www.${DOMAIN}"
upsert_env_val "COOKIE_SECURE" "true"

if [ -z "$DB_PASS_CUR" ] || printf '%s' "$DB_PASS_CUR" | grep -qiE 'htx_dev_password|change-?me|example|Thay_Bang'; then
  echo "[LỖI] POSTGRES_PASSWORD trong .env.prod đang để mặc định hoặc chuỗi mẫu không an toàn. Hãy đặt mật khẩu mạnh trước khi bật Production." >&2
  exit 1
fi
upsert_env_val "BACKEND_NODE_ENV" "production"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d backend certbot
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --force-recreate nginx

ok=0
for _ in $(seq 1 15); do
  if curl -kfsS -H "Host: ${DOMAIN}" https://127.0.0.1/api/health >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done

if [ "$ok" -eq 1 ]; then
  echo ""
  echo "HOÀN TẤT: Đã bật HTTPS thành công cho https://${DOMAIN}!"
  echo "- Trình duyệt truy cập http://${DOMAIN} sẽ tự động chuyển sang https://${DOMAIN}."
  echo "- Đã đồng bộ CORS_ORIGIN và COOKIE_SECURE=true để đăng nhập an toàn."
  echo "- Container puc-certbot sẽ tự động kiểm tra và gia hạn chứng chỉ định kỳ."
else
  echo "[CẢNH BÁO] Đã cấp chứng chỉ nhưng chưa kiểm tra được phản hồi trên cổng 443 nội bộ. Hãy xem log bằng lệnh:"
  echo "docker compose --env-file .env.prod -f docker-compose.prod.yml logs --tail=50 nginx backend"
  exit 1
fi
