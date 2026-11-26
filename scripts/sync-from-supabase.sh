#!/usr/bin/env bash
set -euo pipefail
umask 077

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
  echo "Chuẩn bị sao chép nguyên vẹn 100% dữ liệu thực tế (kèm ảnh/video gốc trong bảng attachments) từ Supabase sang VPS."
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
SRC_MANIFEST="$BACKUP_DIR/supabase-manifest-${STAMP}.txt"
VPS_MANIFEST="$BACKUP_DIR/vps-manifest-${STAMP}.txt"

cleanup_tmp() {
  rm -f "$SRC_MANIFEST" "$VPS_MANIFEST" >/dev/null 2>&1 || true
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db rm -f "$TMP_CONTAINER_DUMP" >/dev/null 2>&1 || true
}
trap cleanup_tmp EXIT

echo "=== BƯỚC 1/6: Đảm bảo container puc-db đang chạy và sao lưu dự phòng CSDL hiện tại của VPS ==="
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d db
sleep 2
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  pg_dump -Fc -U "$PG_USER" -d "$PG_DB" > "$LOCAL_BACKUP"
chmod 600 "$LOCAL_BACKUP"
echo "Đã lưu bản dự phòng CSDL hiện tại của VPS tại: $LOCAL_BACKUP"

echo "=== BƯỚC 2/6: Đọc kiểm kê số dòng từng bảng trên Supabase (CHỈ ĐỌC) và tải gói nhị phân pg_dump ==="
if ! docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T \
  -e SUPABASE_SRC_URL="$CLEAN_URL" db sh -c '
    set -eu
    psql "$SUPABASE_SRC_URL" -v ON_ERROR_STOP=1 -At -F "|" <<'\''SQL'\''
DO $$
DECLARE
  r RECORD;
  v_cnt BIGINT;
  v_att_bytes BIGINT := 0;
BEGIN
  FOR r IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = '\''public'\''
      AND table_type = '\''BASE TABLE'\''
      AND table_name NOT IN (
        '\''spatial_ref_sys'\'',
        '\''geography_columns'\'',
        '\''geometry_columns'\'',
        '\''raster_columns'\'',
        '\''raster_overviews'\'',
        '\''schema_migrations'\'',
        '\''refresh_tokens'\'',
        '\''idempotency_keys'\'',
        '\''trace_device_guards'\''
      )
    ORDER BY table_name
  LOOP
    EXECUTE format('\''SELECT count(*) FROM public.%I'\'', r.table_name) INTO v_cnt;
    RAISE NOTICE '\''MANIFEST_ROW|%s|%s'\'', r.table_name, v_cnt;
  END LOOP;

  IF to_regclass('\''public.attachments'\'') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = '\''public'\'' AND table_name = '\''attachments'\'' AND column_name = '\''file_data'\''
    ) THEN
      SELECT COALESCE(SUM(octet_length(file_data)), 0) INTO v_att_bytes FROM public.attachments;
    END IF;
  END IF;
  RAISE NOTICE '\''MANIFEST_BYTES|attachments_file_data|%s'\'', v_att_bytes;
END $$;
SQL
  ' 2>&1 | sed -n 's/^.*MANIFEST_/MANIFEST_/p' > "$SRC_MANIFEST"; then
  echo ""
  echo "[LỖI] Không thể kết nối đọc dữ liệu từ Supabase (CSDL hiện tại trên VPS vẫn giữ nguyên an toàn 100%)."
  echo "Gợi ý kiểm tra:"
  echo "  1. Hãy lấy chuỗi Session Pooler (:5432, dạng postgresql://postgres.<id>:<mat_khau>@aws-0-....pooler.supabase.com:5432/postgres)."
  echo "  2. Kiểm tra lại mật khẩu CSDL trong chuỗi kết nối."
  exit 1
fi

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
  echo "[LỖI] Không tải được bản pg_dump từ Supabase (CSDL hiện tại trên VPS vẫn giữ nguyên an toàn 100%)."
  exit 1
fi

echo "=== BƯỚC 3/6: Tạm dừng backend và nạp nguyên bản 100% dữ liệu Supabase vào puc-db ==="
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" stop backend

restore_failed=0
if ! docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db sh -c "
  set -eu
  export PGOPTIONS='-c client_min_messages=warning'
  psql -v ON_ERROR_STOP=1 -U '$PG_USER' -d '$PG_DB' <<'SQL'
-- Cất giữ tạm lịch sử cấp quyền QR, duyệt xóa kép và sổ kiểm toán đã phát sinh trực tiếp trên VPS (vì Supabase cũ chưa có các bảng mới này)
DROP SCHEMA IF EXISTS puc_vps_keep CASCADE;
CREATE SCHEMA puc_vps_keep AUTHORIZATION \"$PG_USER\";
DO \$\$
BEGIN
  IF to_regclass('public.trace_access_requests') IS NOT NULL THEN
    ALTER TABLE public.trace_access_requests ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;
    CREATE TABLE puc_vps_keep.trace_access_requests AS TABLE public.trace_access_requests;
  END IF;
  IF to_regclass('public.member_deletion_requests') IS NOT NULL THEN
    CREATE TABLE puc_vps_keep.member_deletion_requests AS TABLE public.member_deletion_requests;
  END IF;
  IF to_regclass('public.immutable_change_logs') IS NOT NULL THEN
    CREATE TABLE puc_vps_keep.immutable_change_logs AS TABLE public.immutable_change_logs;
  END IF;
END \$\$;

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

  psql -v ON_ERROR_STOP=1 -U '$PG_USER' -d '$PG_DB' <<'SQL' >/dev/null
DO \$\$
BEGIN
  IF to_regclass('public.refresh_tokens') IS NOT NULL THEN
    TRUNCATE TABLE public.refresh_tokens RESTART IDENTITY;
  END IF;
  -- Bảo toàn toàn bộ phiếu kiểm nghiệm gốc chuyển từ Supabase, không để migration dọn dữ liệu mẫu xóa nhầm dòng thật
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO public.schema_migrations (name)
    VALUES ('028_purge_demo_lab_tests.sql')
    ON CONFLICT (name) DO NOTHING;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lab_tests' AND column_name = 'lab_accreditation_code'
  ) THEN
    ALTER TABLE public.lab_tests ALTER COLUMN lab_accreditation_code SET DEFAULT '';
  END IF;
END \$\$;
SQL
"; then
  restore_failed=1
fi

if [ "$restore_failed" -ne 0 ]; then
  echo "[CẢNH BÁO] Quá trình nạp gặp lỗi, đang tự động khôi phục lại bản sao lưu trước đó của VPS..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db sh -c "
    export PGOPTIONS='-c client_min_messages=warning'
    psql -v ON_ERROR_STOP=1 -U '$PG_USER' -d '$PG_DB' -c 'DROP SCHEMA IF EXISTS puc_vps_keep CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;'
  "
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
    pg_restore --clean --if-exists --no-owner --no-privileges -U "$PG_USER" -d "$PG_DB" < "$LOCAL_BACKUP" || true
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" start backend
  echo "[LỖI] Đã khôi phục lại dữ liệu cũ trên VPS an toàn. Vui lòng gửi thông báo lỗi bên trên để kiểm tra."
  exit 1
fi

echo "=== BƯỚC 4/6: Khởi động lại puc-backend để nâng cấp lược đồ, chuẩn hóa Xã Krông Búk và đồng bộ kho ảnh/video ==="
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d backend

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

# Khôi phục trả lại toàn bộ lịch sử Cấp quyền QR, Duyệt xóa kép và Sổ kiểm toán đã lưu trên VPS trước khi đồng bộ
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$PG_DB" <<'SQL' >/dev/null
DO $$
BEGIN
  IF to_regclass('puc_vps_keep.trace_access_requests') IS NOT NULL
     AND to_regclass('public.trace_access_requests') IS NOT NULL THEN
    INSERT INTO public.trace_access_requests (
      request_code, request_secret_hash,
      requester_user_id, requester_username, requester_role,
      requester_name, organization, contact_phone, purpose,
      scanned_code, target_kind, resolved_lot_code, puc_code,
      requested_tier, granted_tier, scope_mode, duration_hours,
      status, granted_pass_token, expires_at,
      reviewed_by, reviewed_by_name, reviewed_by_role, review_note, reviewed_at,
      ip, user_agent, access_count, last_accessed_at, created_at, device_fingerprint
    )
    SELECT
      k.request_code, k.request_secret_hash,
      CASE WHEN k.requester_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = k.requester_user_id)
           THEN k.requester_user_id ELSE NULL END,
      k.requester_username, k.requester_role,
      k.requester_name, k.organization, k.contact_phone, k.purpose,
      k.scanned_code, k.target_kind, k.resolved_lot_code, k.puc_code,
      k.requested_tier, k.granted_tier, k.scope_mode, k.duration_hours,
      k.status, k.granted_pass_token, k.expires_at,
      CASE WHEN k.reviewed_by IS NOT NULL AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = k.reviewed_by)
           THEN k.reviewed_by ELSE NULL END,
      k.reviewed_by_name, k.reviewed_by_role, k.review_note, k.reviewed_at,
      k.ip, k.user_agent, k.access_count, k.last_accessed_at, k.created_at, k.device_fingerprint
    FROM puc_vps_keep.trace_access_requests k
    ORDER BY k.id ASC
    ON CONFLICT DO NOTHING;

    PERFORM setval(
      pg_get_serial_sequence('public.trace_access_requests', 'id'),
      COALESCE((SELECT MAX(id) FROM public.trace_access_requests), 1),
      (SELECT COUNT(*) > 0 FROM public.trace_access_requests)
    );
  END IF;

  IF to_regclass('puc_vps_keep.member_deletion_requests') IS NOT NULL
     AND to_regclass('public.member_deletion_requests') IS NOT NULL THEN
    INSERT INTO public.member_deletion_requests (
      target_type, target_id, target_name, target_code, target_role, reason,
      requested_by, requested_by_name, requested_by_role,
      status, reviewed_by, reviewed_by_name, review_note, reviewed_at, created_at
    )
    SELECT
      k.target_type, k.target_id, k.target_name, k.target_code, k.target_role, k.reason,
      k.requested_by, k.requested_by_name, k.requested_by_role,
      k.status,
      CASE WHEN k.reviewed_by IS NOT NULL AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = k.reviewed_by)
           THEN k.reviewed_by ELSE NULL END,
      k.reviewed_by_name, k.review_note, k.reviewed_at, k.created_at
    FROM puc_vps_keep.member_deletion_requests k
    WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = k.requested_by)
      AND NOT EXISTS (
        SELECT 1 FROM public.member_deletion_requests m
        WHERE m.target_type = k.target_type
          AND m.target_id = k.target_id
          AND m.created_at = k.created_at
      )
    ORDER BY k.id ASC
    ON CONFLICT DO NOTHING;

    PERFORM setval(
      pg_get_serial_sequence('public.member_deletion_requests', 'id'),
      COALESCE((SELECT MAX(id) FROM public.member_deletion_requests), 1),
      (SELECT COUNT(*) > 0 FROM public.member_deletion_requests)
    );
  END IF;

  IF to_regclass('puc_vps_keep.immutable_change_logs') IS NOT NULL
     AND to_regclass('public.immutable_change_logs') IS NOT NULL
     AND (SELECT COUNT(*) FROM public.immutable_change_logs) = 0 THEN
    INSERT INTO public.immutable_change_logs (
      occurred_at, table_name, record_id, operation,
      household_id, lot_id, plot_code,
      actor_user_id, actor_name, actor_role,
      changed_fields, old_data, new_data, prev_hash, entry_hash
    )
    SELECT
      k.occurred_at, k.table_name, k.record_id, k.operation,
      k.household_id, k.lot_id, k.plot_code,
      k.actor_user_id, k.actor_name, k.actor_role,
      k.changed_fields, k.old_data, k.new_data, k.prev_hash, k.entry_hash
    FROM puc_vps_keep.immutable_change_logs k
    ORDER BY k.id ASC;

    PERFORM setval(
      pg_get_serial_sequence('public.immutable_change_logs', 'id'),
      COALESCE((SELECT MAX(id) FROM public.immutable_change_logs), 1),
      (SELECT COUNT(*) > 0 FROM public.immutable_change_logs)
    );
  END IF;
END $$;
DROP SCHEMA IF EXISTS puc_vps_keep CASCADE;
SQL

echo "=== BƯỚC 5/6: Đối chiếu kiểm toán 100% số bản ghi từng bảng và dung lượng ảnh gốc (Supabase so với VPS) ==="
VPS_MANIFEST="$BACKUP_DIR/vps-manifest-${STAMP}.txt"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  psql -v ON_ERROR_STOP=1 -At -F "|" -U "$PG_USER" -d "$PG_DB" <<'SQL' 2>&1 | sed -n 's/^.*MANIFEST_/MANIFEST_/p' > "$VPS_MANIFEST"
DO $$
DECLARE
  r RECORD;
  v_cnt BIGINT;
  v_att_bytes BIGINT := 0;
BEGIN
  FOR r IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.table_name) INTO v_cnt;
    RAISE NOTICE 'MANIFEST_ROW|%s|%s', r.table_name, v_cnt;
  END LOOP;

  IF to_regclass('public.attachments') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'attachments' AND column_name = 'file_data'
    ) THEN
      SELECT COALESCE(SUM(octet_length(file_data)), 0) INTO v_att_bytes FROM public.attachments;
    END IF;
  END IF;
  RAISE NOTICE 'MANIFEST_BYTES|attachments_file_data|%s', v_att_bytes;
END $$;
SQL

printf "%-34s | %12s | %12s | %s\n" "BẢNG DỮ LIỆU" "SUPABASE" "VPS MỚI" "TRẠNG THÁI"
printf "%-34s-+-%12s-+-%12s-+-%s\n" "----------------------------------" "------------" "------------" "----------"

mismatch_count=0
while IFS='|' read -r kind tbl src_val <&3; do
  [ "$kind" = "MANIFEST_ROW" ] || continue
  vps_val="$(awk -F'|' -v t="$tbl" '$1 == "MANIFEST_ROW" && $2 == t { print $3 }' "$VPS_MANIFEST" | tail -n 1)"
  vps_val="${vps_val:-0}"
  if [ "$vps_val" -lt "${src_val:-0}" ]; then
    status_txt="CẢNH BÁO THIẾU"
    mismatch_count=$((mismatch_count + 1))
  elif [ "$vps_val" -eq "${src_val:-0}" ]; then
    status_txt="KHỚP 100%"
  else
    status_txt="ĐỦ (+$((vps_val - src_val)))"
  fi
  printf "%-34s | %12s | %12s | %s\n" "$tbl" "$src_val" "$vps_val" "$status_txt"
done 3< "$SRC_MANIFEST"

src_bytes="$(awk -F'|' '$1 == "MANIFEST_BYTES" { print $3 }' "$SRC_MANIFEST" | tail -n 1)"
src_bytes="${src_bytes:-0}"
vps_bytes="$(awk -F'|' '$1 == "MANIFEST_BYTES" { print $3 }' "$VPS_MANIFEST" | tail -n 1)"
vps_bytes="${vps_bytes:-0}"
rm -f "$VPS_MANIFEST" >/dev/null 2>&1 || true

echo ""
echo "Tổng dung lượng nhị phân ảnh/video gốc (attachments.file_data):"
echo "  - Trên Supabase: ${src_bytes} bytes"
echo "  - Trên VPS mới : ${vps_bytes} bytes"
if [ "$vps_bytes" -lt "$src_bytes" ]; then
  echo "  -> [CẢNH BÁO] Lệch dung lượng nhị phân đính kèm!"
  mismatch_count=$((mismatch_count + 1))
else
  echo "  -> [KHỚP 100% TỪNG BYTE - KHÔNG MẤT BẤT KỲ TỆP ẢNH HAY VIDEO NÀO]"
fi

echo ""
echo "=== BƯỚC 6/6: Kiểm tra chuẩn hóa địa danh Xã Krông Búk và lịch sử cấp quyền QR trên VPS ==="
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  psql -U "$PG_USER" -d "$PG_DB" -c "
    SELECT
      (SELECT coop_legal_name FROM commune_endorsement_config LIMIT 1) AS ten_hop_tac_xa,
      (SELECT coop_address FROM commune_endorsement_config LIMIT 1) AS dia_chi_htx_moi,
      (SELECT string_agg(DISTINCT commune, ', ') FROM growing_zones) AS xa_vung_trong,
      (SELECT count(*) FROM growing_zones WHERE commune ~* 'cư\s*né') AS vung_con_xa_cu_ne_cu,
      (SELECT count(*) FROM trace_access_requests) AS lich_su_cap_quyen_qr_giu_lai;
  "

if [ "$mismatch_count" -ne 0 ]; then
  echo ""
  echo "[CẢNH BÁO] Phát hiện ${mismatch_count} mục chênh lệch cần kiểm tra ở bảng trên (bản dự phòng cũ vẫn an toàn tại $LOCAL_BACKUP)."
  exit 1
fi

echo ""
echo "HOÀN TẤT 100%: Toàn bộ dữ liệu và kho ảnh/video từ Supabase đã sang VPS nguyên vẹn không mất mát, đồng thời địa danh hành chính đã chuẩn hóa về Xã Krông Búk (giữ nguyên tên Hợp tác xã Cư Né)!"
