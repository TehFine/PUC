import { Injectable } from "@nestjs/common";

export type SupportedTranslateTarget = "en" | "zh";

const MAX_SERVER_CACHE_ENTRIES = 6000;
const UPSTREAM_TIMEOUT_MS = 4500;
const UPSTREAM_CONCURRENCY = 6;
const CIRCUIT_COOLDOWN_MS = 3 * 60 * 1000;

const VI_DIACRITIC_RE =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗợơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

const VN_SURNAMES = new Set([
  "nguyễn", "trần", "lê", "phạm", "hoàng", "huỳnh", "phan", "vũ", "võ",
  "đặng", "bùi", "đỗ", "hồ", "ngô", "dương", "lý", "đinh", "đoàn", "trương",
  "bạch", "mai", "lâm", "tô", "hà", "lưu", "lương", "châu", "tạ", "phùng",
  "trịnh", "vương", "cao", "đào", "tống", "thái", "kiều", "nông", "vi",
  "lò", "điểu", "ksor", "rơ", "h'", "y", "y'", "ama", "ami",
]);

function isLikelyPersonName(text: string): boolean {
  const words = text.trim().split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;
  const firstLower = words[0].toLowerCase().replace(/[^a-zà-ỹ']/g, "");
  if (!VN_SURNAMES.has(firstLower) && !(firstLower.startsWith("y'") && VN_SURNAMES.has("y'"))) {
    return false;
  }
  return words.every((w) =>
    /^[A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ][a-zA-Zà-ỹÀ-Ỹ']*$/.test(w),
  );
}

function shouldSkipAutoTranslate(trimmed: string): boolean {
  if (trimmed.length < 2 || trimmed.length > 600) return true;
  if (!/[a-zA-ZÀ-ỹ]/.test(trimmed)) return true;
  // Bảo vệ dữ liệu nhạy cảm: không gửi email, URL hoặc chuỗi chứa dãy số định danh dài (SĐT, CCCD) ra ngoài.
  if (trimmed.includes("@") || /^https?:\/\//i.test(trimmed)) return true;
  if (/\d{6,}/.test(trimmed)) return true;
  if (isLikelyPersonName(trimmed)) return true;
  // Chỉ dịch tự động các câu/từ Tiếng Việt (có dấu Tiếng Việt hoặc nhiều từ tiếng Việt)
  if (!VI_DIACRITIC_RE.test(trimmed) && !/\b(va|cua|cho|trong|ngay|thua|vuon|cay|htx)\b/i.test(trimmed)) {
    return true;
  }
  return false;
}

@Injectable()
export class PortalTranslateService {
  private readonly cache = new Map<string, string>();
  private readonly inflight = new Map<string, Promise<string | null>>();
  private readonly userCooldownUntil = new Map<number, number>();
  private upstreamConsecutiveFailures = 0;
  private cooldownUntil = 0;

  private setUserCooldown(userId: number | undefined, durationMs: number): void {
    if (!userId) return;
    if (this.userCooldownUntil.size >= 2_000) {
      const now = Date.now();
      for (const [uid, exp] of this.userCooldownUntil) {
        if (exp <= now) this.userCooldownUntil.delete(uid);
      }
      if (this.userCooldownUntil.size >= 2_000) {
        const oldest = this.userCooldownUntil.keys().next().value;
        if (oldest !== undefined) this.userCooldownUntil.delete(oldest);
      }
    }
    this.userCooldownUntil.set(userId, Date.now() + durationMs);
  }

  private getCached(key: string): string | undefined {
    const hit = this.cache.get(key);
    if (hit !== undefined) {
      // Làm mới thứ tự LRU
      this.cache.delete(key);
      this.cache.set(key, hit);
    }
    return hit;
  }

  private setCached(key: string, value: string): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= MAX_SERVER_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, value);
  }

  private async fetchSingleUpstream(
    text: string,
    target: SupportedTranslateTarget,
    userId?: number,
  ): Promise<string | null> {
    if (Date.now() < this.cooldownUntil) return null;
    if (userId && (this.userCooldownUntil.get(userId) ?? 0) > Date.now()) return null;
    const tl = target === "zh" ? "zh-CN" : "en";
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=vi&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
    try {
      const signal =
        typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
          ? AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
          : undefined;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        signal,
      });
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          this.setUserCooldown(userId, 60_000);
          this.upstreamConsecutiveFailures += 1;
          if (this.upstreamConsecutiveFailures >= 6) {
            this.cooldownUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
          }
        }
        return null;
      }
      this.upstreamConsecutiveFailures = 0;
      const data: unknown = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const joined = data[0]
          .map((seg: unknown) => (Array.isArray(seg) && typeof seg[0] === "string" ? seg[0] : ""))
          .join("")
          .trim();
        if (joined && joined !== text) {
          return joined;
        }
      }
      return null;
    } catch {
      this.setUserCooldown(userId, 15_000);
      this.upstreamConsecutiveFailures += 1;
      if (this.upstreamConsecutiveFailures >= 6) {
        this.cooldownUntil = Date.now() + 30_000;
      }
      return null;
    }
  }

  private translateOneWithDedup(
    trimmed: string,
    target: SupportedTranslateTarget,
    userId?: number,
  ): Promise<string | null> {
    const cacheKey = `${target}\u0000${trimmed}`;
    const hit = this.getCached(cacheKey);
    if (hit !== undefined) return Promise.resolve(hit);

    const existing = this.inflight.get(cacheKey);
    if (existing) return existing;

    const promise = this.fetchSingleUpstream(trimmed, target, userId)
      .then((translated) => {
        if (translated) {
          this.setCached(cacheKey, translated);
        }
        return translated;
      })
      .finally(() => {
        this.inflight.delete(cacheKey);
      });

    this.inflight.set(cacheKey, promise);
    return promise;
  }

  async translateBatch(
    target: SupportedTranslateTarget,
    texts: string[],
    userId?: number,
  ): Promise<{ translations: Record<string, string> }> {
    const translations: Record<string, string> = {};
    const misses: string[] = [];
    const seen = new Set<string>();

    for (const raw of texts) {
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      if (shouldSkipAutoTranslate(trimmed)) continue;

      const cacheKey = `${target}\u0000${trimmed}`;
      const hit = this.getCached(cacheKey);
      if (hit !== undefined) {
        translations[trimmed] = hit;
      } else {
        misses.push(trimmed);
      }
    }

    const now = Date.now();
    if (misses.length === 0 || now < this.cooldownUntil || (userId && (this.userCooldownUntil.get(userId) ?? 0) > now)) {
      return { translations };
    }

    let cursor = 0;
    const workerCount = Math.min(UPSTREAM_CONCURRENCY, misses.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < misses.length) {
        const index = cursor;
        cursor += 1;
        const item = misses[index];
        if (!item) continue;
        const translated = await this.translateOneWithDedup(item, target, userId);
        if (translated) {
          translations[item] = translated;
        }
      }
    });

    await Promise.all(workers);
    return { translations };
  }
}

