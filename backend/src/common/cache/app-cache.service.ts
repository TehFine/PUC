import { Injectable, OnApplicationShutdown } from "@nestjs/common";

export type CacheTag =
  | "auth"
  | "uploads"
  | "plots"
  | "catalog"
  | "news"
  | "trace"
  | "dashboard"
  | "portal"
  | "public-overview";

export const ALL_CACHE_TAGS: readonly CacheTag[] = [
  "auth",
  "uploads",
  "plots",
  "catalog",
  "news",
  "trace",
  "dashboard",
  "portal",
  "public-overview",
] as const;

/**
 * Ánh xạ toàn bộ 37 bảng PostgreSQL của PUC sang các miền bộ nhớ đệm bị ảnh hưởng khi có lệnh ghi.
 * Các bảng nhật ký chỉ ghi nối thêm (`audit_logs`, `trace_scan_logs`, `trace_detail_access_logs`, `field_gps_checkins`)
 * được ánh xạ mảng rỗng `[]` để thao tác ghi log truy vết không làm trôi bộ nhớ đệm nghiệp vụ một cách vô ích.
 */
const TABLE_TO_TAGS: Record<string, readonly CacheTag[]> = {
  users: ["auth", "dashboard", "trace"],
  refresh_tokens: ["auth"],
  auth_otp_challenges: ["auth"],
  password_reset_requests: ["dashboard"],

  attachments: ["uploads", "trace"],
  approval_attachments: ["uploads"],

  plots: ["plots", "dashboard", "portal", "public-overview", "trace"],
  plot_measurements: ["plots", "dashboard", "trace"],
  plot_signboard_tokens: ["plots", "portal", "trace"],
  plot_season_quotas: ["plots", "dashboard", "portal", "trace"],
  growing_zones: ["plots", "dashboard", "public-overview", "trace"],

  villages: ["auth", "catalog", "plots", "dashboard", "portal", "public-overview", "trace"],
  households: ["auth", "catalog", "plots", "dashboard", "portal", "public-overview", "trace", "uploads"],
  pesticides: ["catalog", "portal", "trace"],
  fertilizers: ["catalog", "portal", "trace"],
  varieties: ["catalog", "portal", "trace"],
  training_courses: ["catalog", "dashboard", "portal"],
  training_registrations: ["dashboard", "portal"],

  news_articles: ["news"],

  approvals: ["dashboard", "portal", "uploads", "trace"],
  inspection_schedule: ["dashboard", "portal"],
  inspection_minutes: ["dashboard", "portal", "uploads", "trace"],
  journal_entries: ["dashboard", "portal", "uploads", "trace"],
  violations: ["dashboard", "portal", "trace"],
  spray_records: ["dashboard", "portal", "uploads", "trace"],
  lab_tests: ["dashboard", "portal", "uploads", "trace"],

  harvest_lots: ["dashboard", "portal", "uploads", "trace"],
  harvest_items: ["dashboard", "trace"],
  harvest_contributions: ["dashboard", "portal", "uploads", "trace"],
  harvest_declarations: ["dashboard", "portal", "uploads", "trace"],
  supply_chain_events: ["dashboard", "trace"],
  farmer_stamp_allocations: ["dashboard", "portal", "trace"],
  farmer_stamps: ["dashboard", "portal", "trace"],
  enterprises: ["auth", "uploads", "dashboard", "trace"],
  contracts: ["dashboard", "trace"],
  // Tránh vòng lặp SSE khi tăng bộ đếm access_count lúc đọc; thao tác cấp/duyệt/thu hồi chủ động gọi invalidateTags(["trace"]).
  field_audit_passes: [],
  trace_access_requests: ["dashboard"],
  member_deletion_requests: ["dashboard"],
  commune_endorsement_config: ["trace"],
  immutable_change_logs: ["trace"],

  notifications: ["portal"],
  system_alerts: [],
  plot_care_plans: ["portal", "trace"],
  care_milestone_declarations: ["portal", "uploads", "trace"],
  care_protocol_alert_logs: ["portal"],

  // Các bảng ghi log truy vết độc lập không làm thay đổi kết quả đọc của các bộ đệm trên:
  audit_logs: [],
  trace_scan_logs: [],
  trace_detail_access_logs: [],
  trace_device_guards: [],
  partner_inquiries: [],
  field_gps_checkins: [],
  api_idempotency_keys: [],
  schema_migrations: [],
};

const SQL_MUTATION_FAST_RE =
  /\b(?:INSERT\s+INTO|(?<!\bFOR\s+)UPDATE\s+(?:ONLY\s+)?(?:public\.)?"?[a-z_]|DELETE\s+FROM|TRUNCATE\b)/i;
const SQL_TARGET_TABLE_RE =
  /\b(?:INSERT\s+INTO|(?<!\bFOR\s+)UPDATE(?:\s+ONLY)?|DELETE\s+FROM(?:\s+ONLY)?|TRUNCATE(?:\s+TABLE)?)\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;

interface CachedRecord {
  value: unknown;
  expiresAt: number;
  tags: readonly CacheTag[];
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  coalescedInflight: number;
  invalidations: number;
}

const DEFAULT_MAX_CACHE_KEYS = 4_000;
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Bộ nhớ đệm L1 trung tâm trên RAM cho Backend PUC:
 * - Giới hạn cứng trần số khóa (`maxKeys`) theo thuật toán LRU O(1) chống phình bộ nhớ trên container 512 MB.
 * - Tích hợp Singleflight (`inflight`) gộp các truy vấn trùng lặp đồng thời thành 1 truy vấn SQL duy nhất (chống Cache Stampede).
 * - Chống Race Condition Đọc-Ghi bằng bộ đếm thế hệ (`tagEpochs`): nếu dữ liệu bị ghi đè trong lúc truy vấn `SELECT` đang chạy,
 *   kết quả cũ vẫn trả về cho request đó nhưng không được lưu đè vào bộ nhớ đệm.
 * - Xóa đệm tức thì theo miền (`CacheTag`) ngay khi `DatabaseService` phát hiện câu lệnh SQL thay đổi dữ liệu.
 */
@Injectable()
export class AppCacheService implements OnApplicationShutdown {
  private readonly store = new Map<string, CachedRecord>();
  private readonly tagIndex = new Map<CacheTag, Set<string>>();
  private readonly tagEpochs = new Map<CacheTag, number>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private sweepTimer?: ReturnType<typeof setInterval>;
  private readonly maxKeys: number;

  private hitCount = 0;
  private missCount = 0;
  private coalescedCount = 0;
  private invalidationCount = 0;

  constructor(maxKeys = DEFAULT_MAX_CACHE_KEYS) {
    this.maxKeys = Math.max(100, maxKeys);
    for (const tag of ALL_CACHE_TAGS) {
      this.tagIndex.set(tag, new Set());
      this.tagEpochs.set(tag, 0);
    }
  }

  private ensureSweep(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.evictExpired(Date.now()), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  private snapshotEpochs(tags: readonly CacheTag[]): number[] {
    return tags.map((tag) => this.tagEpochs.get(tag) ?? 0);
  }

  private epochsUnchanged(tags: readonly CacheTag[], snapshot: readonly number[]): boolean {
    for (let i = 0; i < tags.length; i += 1) {
      if ((this.tagEpochs.get(tags[i]!) ?? 0) !== snapshot[i]) {
        return false;
      }
    }
    return true;
  }

  private removeKeyInternal(key: string, record?: CachedRecord): void {
    const rec = record ?? this.store.get(key);
    this.store.delete(key);
    if (rec) {
      for (const tag of rec.tags) {
        this.tagIndex.get(tag)?.delete(key);
      }
    }
  }

  evictExpired(now = Date.now()): void {
    for (const [key, rec] of this.store) {
      if (rec.expiresAt <= now) {
        this.removeKeyInternal(key, rec);
      }
    }
  }

  get<T>(key: string): T | undefined {
    const rec = this.store.get(key);
    if (!rec) {
      this.missCount += 1;
      return undefined;
    }
    if (rec.expiresAt <= Date.now()) {
      this.removeKeyInternal(key, rec);
      this.missCount += 1;
      return undefined;
    }
    // Duy trì thứ tự LRU O(1)
    this.store.delete(key);
    this.store.set(key, rec);
    this.hitCount += 1;
    return rec.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number, tags: readonly CacheTag[]): void {
    if (ttlMs <= 0) return;
    this.ensureSweep();
    const now = Date.now();

    if (this.store.has(key)) {
      this.removeKeyInternal(key);
    } else if (this.store.size >= this.maxKeys) {
      this.evictExpired(now);
      if (this.store.size >= this.maxKeys) {
        const oldestKey = this.store.keys().next().value;
        if (oldestKey !== undefined) {
          this.removeKeyInternal(oldestKey);
        }
      }
    }

    const record: CachedRecord = {
      value,
      expiresAt: now + ttlMs,
      tags,
    };
    this.store.set(key, record);
    for (const tag of tags) {
      let bucket = this.tagIndex.get(tag);
      if (!bucket) {
        bucket = new Set();
        this.tagIndex.set(tag, bucket);
      }
      bucket.add(key);
    }
  }

  delete(key: string): void {
    this.removeKeyInternal(key);
  }

  async getOrLoad<T>(
    key: string,
    ttlMs: number,
    tags: readonly CacheTag[],
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const running = this.inflight.get(key) as Promise<T> | undefined;
    if (running) {
      this.coalescedCount += 1;
      return running;
    }

    const epochBefore = this.snapshotEpochs(tags);
    const promise = loader()
      .then((result) => {
        if (result !== undefined && this.epochsUnchanged(tags, epochBefore)) {
          this.set(key, result, ttlMs, tags);
        }
        return result;
      })
      .finally(() => {
        if (this.inflight.get(key) === promise) {
          this.inflight.delete(key);
        }
      });

    this.inflight.set(key, promise);
    return promise;
  }

  invalidateTags(tags: Iterable<CacheTag>, notifyListeners = true): void {
    const invalidated: CacheTag[] = [];
    const seen = new Set<CacheTag>();
    for (const tag of tags) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      this.tagEpochs.set(tag, (this.tagEpochs.get(tag) ?? 0) + 1);
      invalidated.push(tag);
      const keys = this.tagIndex.get(tag);
      if (!keys || keys.size === 0) continue;
      for (const key of Array.from(keys)) {
        this.removeKeyInternal(key);
      }
      keys.clear();
    }
    if (invalidated.length > 0) {
      this.invalidationCount += 1;
      if (notifyListeners && this.invalidationListeners.size > 0) {
        for (const listener of this.invalidationListeners) {
          try {
            listener(invalidated);
          } catch {
            // Listener errors must never disrupt cache operations
          }
        }
      }
    }
  }

  private readonly invalidationListeners = new Set<(tags: readonly CacheTag[]) => void>();

  /** Đăng ký lắng nghe sự kiện miền dữ liệu thay đổi (dùng để đẩy đồng bộ SSE thời gian thực). */
  onTagsInvalidated(listener: (tags: readonly CacheTag[]) => void): () => void {
    this.invalidationListeners.add(listener);
    return () => {
      this.invalidationListeners.delete(listener);
    };
  }

  invalidateAll(notifyListeners = true): void {
    this.invalidateTags(ALL_CACHE_TAGS, notifyListeners);
    this.store.clear();
  }

  /**
   * Phân tích siêu nhẹ câu lệnh SQL (< 5 micro-giây) để tự động làm mới đúng miền bộ nhớ đệm khi có thay đổi dữ liệu.
   * Trả về danh sách `CacheTag` đã bị ảnh hưởng (phục vụ giao dịch `BEGIN ... COMMIT`).
   */
  onSqlMutation(sqlText: string, notifyListeners = true): CacheTag[] {
    if (!sqlText || !SQL_MUTATION_FAST_RE.test(sqlText)) {
      return [];
    }
    if (/\bTRUNCATE\b/i.test(sqlText)) {
      this.invalidateAll(notifyListeners);
      return [...ALL_CACHE_TAGS];
    }

    const matchedTables: string[] = [];
    SQL_TARGET_TABLE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = SQL_TARGET_TABLE_RE.exec(sqlText)) !== null) {
      if (match[1]) {
        matchedTables.push(match[1].toLowerCase());
      }
    }

    // Nếu là CTE phức tạp hoặc câu lệnh ghi không khớp mẫu chuẩn, xóa toàn bộ đệm đọc để đảm bảo an toàn dữ liệu tuyệt đối.
    if (matchedTables.length === 0) {
      this.invalidateAll(notifyListeners);
      return [...ALL_CACHE_TAGS];
    }

    const affected = new Set<CacheTag>();
    for (const tbl of matchedTables) {
      const mapped = TABLE_TO_TAGS[tbl];
      if (mapped === undefined) {
        // Bảng mới chưa khai báo ánh xạ -> xóa toàn bộ đệm đọc để không bao giờ trả dữ liệu cũ.
        this.invalidateAll(notifyListeners);
        return [...ALL_CACHE_TAGS];
      }
      for (const tag of mapped) {
        affected.add(tag);
      }
    }

    if (affected.size === 0) {
      return [];
    }
    const tagList = Array.from(affected);
    this.invalidateTags(tagList, notifyListeners);
    return tagList;
  }

  stats(): CacheStats {
    return {
      size: this.store.size,
      hits: this.hitCount,
      misses: this.missCount,
      coalescedInflight: this.coalescedCount,
      invalidations: this.invalidationCount,
    };
  }

  onApplicationShutdown(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }
    this.inflight.clear();
    this.store.clear();
    for (const set of this.tagIndex.values()) {
      set.clear();
    }
  }
}
