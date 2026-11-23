import type { DatabaseService } from "../../database/database.service";

const tableCacheByDb = new WeakMap<object, Map<string, Promise<boolean>>>();

/**
 * Kiểm tra sự tồn tại của bảng trong schema `public` với bộ nhớ đệm theo từng thực thể `DatabaseService`.
 * Cắt bỏ hoàn toàn các truy vấn `SELECT to_regclass(...)` lặp lại trên từng request mà vẫn tự giải phóng khi đóng kết nối.
 */
export function hasPublicTable(db: Pick<DatabaseService, "query">, tableName: string): Promise<boolean> {
  let map = tableCacheByDb.get(db);
  if (!map) {
    map = new Map<string, Promise<boolean>>();
    tableCacheByDb.set(db, map);
  }
  const clean = tableName.trim().toLowerCase();
  const cached = map.get(clean);
  if (cached) return cached;

  const pending = db
    .query<{ reg: string | null }>("SELECT to_regclass($1) AS reg", [`public.${clean}`])
    .then((res) => res.rows[0]?.reg !== null && res.rows[0]?.reg !== undefined)
    .catch((err) => {
      map?.delete(clean);
      throw err;
    });

  map.set(clean, pending);
  return pending;
}

