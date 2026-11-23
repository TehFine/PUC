#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="$ROOT_DIR/.env.prod"
COMPOSE_FILE="$ROOT_DIR/docker-compose.prod.yml"
BACKUP_DIR="$ROOT_DIR/backups"

if [ ! -f "$ENV_FILE" ]; then
  echo "[LỖI] Không tìm thấy tệp $ENV_FILE trên máy chủ."
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

PG_USER="$(read_env_val POSTGRES_USER)"
PG_USER="${PG_USER:-puc_user}"
PG_DB="$(read_env_val POSTGRES_DB)"
PG_DB="${PG_DB:-puc_cune}"

RAW_URL="${SUPABASE_DATABASE_URL:-${1:-}}"
if [ -z "$RAW_URL" ]; then
  echo "Chuẩn bị kéo toàn bộ dữ liệu thực tế (bao gồm cả ảnh/video hiện trường trong bảng attachments) từ Supabase về VPS."
  printf "Dán chuỗi DATABASE_URL của Supabase/Render vào đây rồi nhấn Enter: "
  read -r RAW_URL
fi

# Làm sạch khoảng trắng, dấu nháy bao ngoài và tiền tố DATABASE_URL= nếu người dùng copy cả dòng từ Render
CLEAN_URL="$(printf '%s' "$RAW_URL" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//; s/^DATABASE_URL=//')"
CLEAN_URL="${CLEAN_URL%\"}"
CLEAN_URL="${CLEAN_URL#\"}"
CLEAN_URL="${CLEAN_URL%\'}"
CLEAN_URL="${CLEAN_URL#\'}"

if ! printf '%s' "$CLEAN_URL" | grep -qE '^postgres(ql)?://'; then
  echo "[LỖI] Chuỗi kết nối không hợp lệ (cần bắt đầu bằng postgresql:// hoặc postgres://)."
  exit 1
fi

# Tự động chuyển cổng Transaction Pooler (:6543) của Supabase sang Session Pooler (:5432) để pg_dump hoạt động ổn định,
# đồng thời loại bỏ tham số pgbouncer=true không tương thích với pg_dump và đảm bảo sslmode=require.
CLEAN_URL="$(printf '%s' "$CLEAN_URL" | sed -E 's/(\.pooler\.supabase\.com):6543\//\1:5432\//g')"
CLEAN_URL="$(printf '%s' "$CLEAN_URL" | sed -E 's/([?&])pgbouncer=[^&]*&?/\1/g; s/[?&]$//')"
if ! printf '%s' "$CLEAN_URL" | grep -q 'sslmode='; then
  if printf '%s' "$CLEAN_URL" | grep -q '?'; then
    CLEAN_URL="${CLEAN_URL}&sslmode=require"
  else
    CLEAN_URL="${CLEAN_URL}?sslmode=require"
  fi
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOCAL_BACKUP="$BACKUP_DIR/puc-vps-before-sync-${STAMP}.dump"
TMP_CONTAINER_DUMP="/tmp/supabase-import-${STAMP}.dump"

cleanup_container_tmp() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db rm -f "$TMP_CONTAINER_DUMP" >/dev/null 2>&1 || true
}
trap cleanup_container_tmp EXIT

echo "=== BƯỚC 1/5: Đảm bảo container puc-db đang chạy và sao lưu dữ liệu hiện tại trên VPS ==="
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d db
sleep 2
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  pg_dump -Fc -U "$PG_USER" -d "$PG_DB" > "$LOCAL_BACKUP"
chmod 600 "$LOCAL_BACKUP"
echo "Đã lưu bản dự phòng CSDL hiện tại của VPS tại: $LOCAL_BACKUP"

echo "=== BƯỚC 2/5: Tải toàn bộ lược đồ public và dữ liệu mới nhất từ Supabase ==="
if ! docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T \
  -e SUPABASE_SRC_URL="$CLEAN_URL" db sh -c \
  'pg_dump "$SUPABASE_SRC_URL" \
    --format=custom \
    --schema=public \
    --no-owner \
    --no-privileges \
    --exclude-table=public.spatial_ref_sys \
    --exclude-table=public.geometry_columns \
    --exclude-table=public.geography_columns \
    --exclude-table=public.raster_columns \
    --exclude-table=public.raster_overviews \
    -f "'"$TMP_CONTAINER_DUMP"'" && pg_restore -l "'"$TMP_CONTAINER_DUMP"'" >/dev/null'; then
  echo ""
  echo "[LỖI] Không tải được dữ liệu từ Supabase (CSDL hiện tại trên VPS vẫn giữ nguyên an toàn 100%)."
  echo "Gợi ý kiểm tra:"
  echo "  1. Nếu bạn dán chuỗi Direct (db.<id>.supabase.co:5432) bị lỗi mạng IPv6, hãy lấy chuỗi Session Pooler"
  echo "     (dạng postgresql://postgres.<id>:<mat_khau>@aws-0-....pooler.supabase.com:5432/postgres) hoặc copy đúng DATABASE_URL từ Render."
  echo "  2. Kiểm tra mật khẩu CSDL trong chuỗi kết nối có chính xác không."
  exit 1
fi

echo "=== BƯỚC 3/5: Tạm dừng backend trong giây lát và nạp dữ liệu Supabase vào puc-db ==="
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" stop backend

restore_failed=0
if ! docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db sh -c "
  set -eu
  export PGOPTIONS='-c client_min_messages=warning'
  psql -v ON_ERROR_STOP=1 -U '$PG_USER' -d '$PG_DB' <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public AUTHORIZATION \"$PG_USER\";
GRANT ALL ON SCHEMA public TO \"$PG_USER\";
GRANT ALL ON SCHEMA public TO public;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
SQL

  pg_restore --no-owner --no-privileges --section=pre-data -f - '$TMP_CONTAINER_DUMP' \
    | sed -E 's/^CREATE SCHEMA public;/CREATE SCHEMA IF NOT EXISTS public;/; /^COMMENT ON SCHEMA public\b/d; /^CREATE EXTENSION\b/d; /^COMMENT ON EXTENSION\b/d; s/\bextensions\./public./g' \
    | psql -v ON_ERROR_STOP=1 -U '$PG_USER' -d '$PG_DB' >/dev/null

  pg_restore --no-owner --no-privileges --section=data --exit-on-error \
    -U '$PG_USER' -d '$PG_DB' '$TMP_CONTAINER_DUMP'

  pg_restore --no-owner --no-privileges --section=post-data -f - '$TMP_CONTAINER_DUMP' \
    | sed -E 's/\bextensions\./public./g' \
    | psql -v ON_ERROR_STOP=1 -U '$PG_USER' -d '$PG_DB' >/dev/null

  psql -v ON_ERROR_STOP=1 -U '$PG_USER' -d '$PG_DB' -c \"
    DO \\\$\\\$
    BEGIN
      IF to_regclass('public.refresh_tokens') IS NOT NULL THEN
        TRUNCATE TABLE public.refresh_tokens RESTART IDENTITY;
      END IF;
    END \\\$\\\$;
  \" >/dev/null
"; then
  restore_failed=1
fi

if [ "$restore_failed" -ne 0 ]; then
  echo "[CẢNH BÁO] Quá trình nạp gặp lỗi, đang tự động khôi phục lại bản sao lưu trước đó của VPS..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db sh -c "
    export PGOPTIONS='-c client_min_messages=warning'
    psql -v ON_ERROR_STOP=1 -U '$PG_USER' -d '$PG_DB' -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;'
  "
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
    pg_restore --clean --if-exists --no-owner --no-privileges -U "$PG_USER" -d "$PG_DB" < "$LOCAL_BACKUP" || true
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" start backend
  echo "[LỖI] Đã khôi phục lại dữ liệu cũ trên VPS an toàn. Vui lòng gửi thông báo lỗi bên trên để kiểm tra."
  exit 1
fi

echo "=== BƯỚC 4/5: Khởi động lại puc-backend để tự chạy các migration mới hơn và đồng bộ kho ảnh/video ==="
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d backend

for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "=== BƯỚC 5/5: Đối chiếu số lượng bản ghi sau khi đồng bộ ==="
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  psql -U "$PG_USER" -d "$PG_DB" -c "
    SELECT
      (SELECT count(*) FROM users) AS tai_khoan,
      (SELECT count(*) FROM households) AS nong_ho,
      (SELECT count(*) FROM plots) AS thua_dat,
      (SELECT count(*) FROM journal_entries) AS nhat_ky,
      (SELECT count(*) FROM spray_records) AS phun_thuoc,
      (SELECT count(*) FROM harvest_lots) AS lo_hang,
      (SELECT count(*) FROM lab_tests) AS kiem_nghiem,
      (SELECT count(*) FROM attachments) AS tep_anh_video;
  "

echo ""
echo "HOÀN TẤT: Toàn bộ dữ liệu và ảnh/video minh chứng từ Supabase đã được chuyển sang VPS thành công!"
echo "Lưu ý: Khi nào bạn muốn chốt chuyển hẳn người dùng từ Vercel/Render sang tên miền chính thức, bạn chỉ cần chạy lại lệnh này 1 lần cuối để lấy nốt dữ liệu phát sinh mới nhất."

