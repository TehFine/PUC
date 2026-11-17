import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import type { ThrottlerStorage } from "@nestjs/throttler";

export interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

interface BucketState {
  hits: number[];
  expiresAt: number;
  blockedUntil: number;
}

const DEFAULT_MAX_KEYS = 25_000;
const DEFAULT_SWEEP_MS = 60_000;

/**
 * Bộ lưu trữ giới hạn tần suất trong bộ nhớ có giới hạn trần số khóa (`maxKeys`) chống tấn công làm tràn RAM (OOM):
 * - Tự động dọn các khóa hết hạn định kỳ bằng một bộ đếm `.unref()` duy nhất.
 * - Khi đạt trần `maxKeys`, ưu tiên thu hồi khóa cũ nhất KHÔNG đang bị khóa phạt (`blockedUntil <= now`),
 *   tuyệt đối không xóa trắng toàn bộ bảng để kẻ tấn công không thể tự gỡ trạng thái bị chặn bằng cách bơm khóa giả.
 */
@Injectable()
export class BoundedThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
  private readonly records = new Map<string, BucketState>();
  private sweepTimer?: ReturnType<typeof setInterval>;
  private readonly maxKeys: number;
  private readonly sweepIntervalMs: number;

  constructor(maxKeys = DEFAULT_MAX_KEYS, sweepIntervalMs = DEFAULT_SWEEP_MS) {
    this.maxKeys = Math.max(100, maxKeys);
    this.sweepIntervalMs = Math.max(5_000, sweepIntervalMs);
  }

  get size(): number {
    return this.records.size;
  }

  private ensureSweepTimer(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => {
      this.evictExpired(Date.now());
    }, this.sweepIntervalMs);
    this.sweepTimer.unref?.();
  }

  evictExpired(now = Date.now()): void {
    for (const [key, state] of this.records) {
      if (state.blockedUntil > now) continue;
      if (state.expiresAt > now && state.hits.some((exp) => exp > now)) continue;
      this.records.delete(key);
    }
  }

  private ensureCapacityForNewKey(now: number): void {
    if (this.records.size < this.maxKeys) return;
    this.evictExpired(now);
    if (this.records.size < this.maxKeys) return;

    // Ưu tiên đẩy bản ghi cũ nhất không đang chịu án phạt khóa (`blockedUntil <= now`).
    for (const [candidateKey, state] of this.records) {
      if (state.blockedUntil <= now) {
        this.records.delete(candidateKey);
        return;
      }
    }

    // Trường hợp cực đoan tất cả các mục đều đang bị khóa: đẩy mục cũ nhất theo thứ tự FIFO.
    const oldestKey = this.records.keys().next().value;
    if (oldestKey !== undefined) {
      this.records.delete(oldestKey);
    }
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    this.ensureSweepTimer();
    const now = Date.now();
    const compositeKey = `${throttlerName}:${key}`;
    const ttlMs = Math.max(1, ttl);
    const blockMs = Math.max(0, blockDuration);

    let state = this.records.get(compositeKey);
    if (!state) {
      this.ensureCapacityForNewKey(now);
      state = {
        hits: [],
        expiresAt: now + ttlMs,
        blockedUntil: 0,
      };
      this.records.set(compositeKey, state);
    }

    // Nếu đang trong thời gian khóa phạt thì giữ nguyên trạng thái chặn và không nối thêm mảng `hits` tránh phình bộ nhớ.
    if (state.blockedUntil > now) {
      const timeToBlockExpire = Math.max(1, Math.ceil((state.blockedUntil - now) / 1000));
      const timeToExpire = Math.max(1, Math.ceil((Math.max(state.expiresAt, state.blockedUntil) - now) / 1000));
      return {
        totalHits: limit + 1,
        timeToExpire,
        isBlocked: true,
        timeToBlockExpire,
      };
    }

    if (state.blockedUntil > 0 && state.blockedUntil <= now) {
      state.blockedUntil = 0;
    }

    // Lọc các lượt truy cập còn nằm trong cửa sổ trượt `ttlMs` (chỉ loại bỏ mốc đã thật sự hết hạn).
    state.hits = state.hits.filter((exp) => exp > now);
    if (state.expiresAt <= now) {
      state.expiresAt = now + ttlMs;
    }

    if (state.hits.length >= limit) {
      const effectiveBlockMs = blockMs > 0 ? blockMs : Math.max(1_000, (state.hits[0] ?? now + ttlMs) - now);
      state.blockedUntil = now + effectiveBlockMs;
      const timeToBlockExpire = Math.max(1, Math.ceil(effectiveBlockMs / 1000));
      const timeToExpire = Math.max(1, Math.ceil((state.expiresAt - now) / 1000));
      return {
        totalHits: state.hits.length + 1,
        timeToExpire,
        isBlocked: true,
        timeToBlockExpire,
      };
    }

    const hitExpiresAt = now + ttlMs;
    state.hits.push(hitExpiresAt);
    state.expiresAt = hitExpiresAt;

    // Đưa khóa vừa hoạt động xuống cuối Map để duy trì thứ tự LRU tự nhiên O(1).
    this.records.delete(compositeKey);
    this.records.set(compositeKey, state);

    const timeToExpire = Math.max(1, Math.ceil((state.expiresAt - now) / 1000));
    return {
      totalHits: state.hits.length,
      timeToExpire,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }

  onApplicationShutdown(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }
    this.records.clear();
  }
}

