import {
  AUTH_EXPIRED_EVENT,
  AUTH_LOGOUT_EVENT,
  AUTH_SCOPE_CHANGED_EVENT,
} from "@/lib/api-client";

export type TargetLang = "en" | "zh";
export type PortalLang = "vi" | "en" | "zh";

export interface LangPack {
  exactMap: Record<string, string>;
  lowerMap: Record<string, string>;
  patternRules: Array<[RegExp, (...args: string[]) => string]>;
  compositionalPhrases: Array<[RegExp, string]>;
  compositionalUnits: Array<[RegExp, string]>;
}

const langPacks: Partial<Record<TargetLang, LangPack>> = {};

/** Bảng ánh xạ ngược từ chuỗi đã dịch (EN / ZH) về chuỗi gốc Tiếng Việt để đảo chiều 100% chính xác. */
const reverseToViMap = new Map<string, string>();
const MAX_REVERSE_ENTRIES = 16000;

export function registerReverseTranslation(translated: string, viSource: string): void {
  const t = translated.trim();
  const v = viSource.trim();
  if (!t || !v || t === v) return;
  if (!reverseToViMap.has(t)) {
    if (reverseToViMap.size >= MAX_REVERSE_ENTRIES) {
      const firstKey = reverseToViMap.keys().next().value;
      if (firstKey !== undefined) reverseToViMap.delete(firstKey);
    }
    reverseToViMap.set(t, v);
  }
}

function lookupReverseVi(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const hit = reverseToViMap.get(trimmed);
  if (!hit) return undefined;
  const idx = raw.indexOf(trimmed);
  const lead = raw.slice(0, idx);
  const tail = raw.slice(idx + trimmed.length);
  return `${lead}${hit}${tail}`;
}

export function registerLangPack(target: TargetLang, pack: LangPack): void {
  langPacks[target] = pack;
  for (const [vi, trans] of Object.entries(pack.exactMap)) {
    registerReverseTranslation(trans, vi);
  }
}

export function buildCompositionalPhraseRules(
  phrases: Array<[string, string]>,
): Array<[RegExp, string]> {
  return phrases.map(([viPhrase, targetPhrase]) => {
    const escaped = viPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return [new RegExp(`(^|[^a-zA-ZÀ-ỹ])(${escaped})(?=$|[^a-zA-ZÀ-ỹ])`, "gi"), targetPhrase];
  });
}

// ─── BỘ NHỚ ĐỆM PHIÊN & DỊCH LÔ TỰ ĐỘNG QUA MÁY CHỦ (/api/portal/translate) ───

const DYN_CACHE_STORAGE_KEY = "puc_portal_dyn_i18n_v2";
const LEGACY_ZH_STORAGE_KEY = "puc_portal_dyn_zh_cache_v1";
const MAX_DYN_CACHE_PER_LANG = 1200;
const BATCH_DEBOUNCE_MS = 45;
const MAX_BATCH_SIZE = 40;
const RETRY_COOLDOWN_MS = 3 * 60 * 1000;

const dynamicCache: Record<TargetLang, Map<string, string>> = {
  en: new Map<string, string>(),
  zh: new Map<string, string>(),
};
const pendingSet: Record<TargetLang, Set<string>> = {
  en: new Set<string>(),
  zh: new Set<string>(),
};
const batchQueue: Record<TargetLang, string[]> = {
  en: [],
  zh: [],
};
const failedCooldown: Record<TargetLang, Map<string, number>> = {
  en: new Map<string, number>(),
  zh: new Map<string, number>(),
};

let translationEpoch = 0;
let dynCacheLoaded = false;
let dynSaveTimer: ReturnType<typeof setTimeout> | null = null;
let domRefreshTimer: ReturnType<typeof setTimeout> | null = null;
const batchTimers: Record<TargetLang, ReturnType<typeof setTimeout> | null> = {
  en: null,
  zh: null,
};
const activeRequests: Record<TargetLang, number> = {
  en: 0,
  zh: 0,
};
const MAX_CONCURRENT_BATCHES = 2;

let activeDomLang: PortalLang = "vi";

export function setActiveDomLang(lang: PortalLang): void {
  activeDomLang = lang;
}

export function getActiveDomLang(): PortalLang {
  return activeDomLang;
}

export function clearDynTranslationCache(): void {
  translationEpoch += 1;
  for (const lang of ["en", "zh"] as const) {
    batchQueue[lang].length = 0;
    pendingSet[lang].clear();
    dynamicCache[lang].clear();
    failedCooldown[lang].clear();
    if (batchTimers[lang]) {
      clearTimeout(batchTimers[lang]!);
      batchTimers[lang] = null;
    }
  }
  if (dynSaveTimer) {
    clearTimeout(dynSaveTimer);
    dynSaveTimer = null;
  }
  if (domRefreshTimer) {
    clearTimeout(domRefreshTimer);
    domRefreshTimer = null;
  }
  dynCacheLoaded = false;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(DYN_CACHE_STORAGE_KEY);
      window.sessionStorage.removeItem(LEGACY_ZH_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_ZH_STORAGE_KEY);
    } catch {
      // Ignore storage access errors
    }
  }
}

if (typeof window !== "undefined") {
  window.addEventListener(AUTH_LOGOUT_EVENT, clearDynTranslationCache);
  window.addEventListener(AUTH_EXPIRED_EVENT, clearDynTranslationCache);
  window.addEventListener(AUTH_SCOPE_CHANGED_EVENT, clearDynTranslationCache);
}

function isSafeStorageKey(k: string): boolean {
  return k.length > 0 && k !== "__proto__" && k !== "constructor" && k !== "prototype";
}

function ensureDynCacheLoaded(): void {
  if (dynCacheLoaded || typeof window === "undefined") return;
  dynCacheLoaded = true;
  try {
    window.localStorage.removeItem(LEGACY_ZH_STORAGE_KEY);
    const rawV2 = window.sessionStorage.getItem(DYN_CACHE_STORAGE_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Partial<Record<TargetLang, Record<string, unknown>>>;
      if (parsed && typeof parsed === "object") {
        for (const lang of ["en", "zh"] as const) {
          const bucket = parsed[lang];
          if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) continue;
          for (const [vi, tr] of Object.entries(bucket)) {
            if (typeof vi === "string" && typeof tr === "string" && isSafeStorageKey(vi) && tr.length > 0) {
              dynamicCache[lang].set(vi, tr);
              registerReverseTranslation(tr, vi);
            }
          }
        }
      }
    }
    const rawLegacyZh = window.sessionStorage.getItem(LEGACY_ZH_STORAGE_KEY);
    if (rawLegacyZh) {
      const legacy = JSON.parse(rawLegacyZh) as Record<string, unknown>;
      if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
        for (const [vi, zh] of Object.entries(legacy)) {
          if (typeof vi === "string" && typeof zh === "string" && isSafeStorageKey(vi) && zh.length > 0) {
            if (!dynamicCache.zh.has(vi)) {
              dynamicCache.zh.set(vi, zh);
              registerReverseTranslation(zh, vi);
            }
          }
        }
      }
      window.sessionStorage.removeItem(LEGACY_ZH_STORAGE_KEY);
    }
  } catch {
    // Ignore storage parse errors
  }
}

function scheduleSaveDynCache(): void {
  if (typeof window === "undefined" || dynSaveTimer) return;
  dynSaveTimer = setTimeout(() => {
    dynSaveTimer = null;
    try {
      const payload: Record<TargetLang, Record<string, string>> = { en: {}, zh: {} };
      for (const lang of ["en", "zh"] as const) {
        const entries = Array.from(dynamicCache[lang].entries());
        const sliced =
          entries.length > MAX_DYN_CACHE_PER_LANG
            ? entries.slice(entries.length - MAX_DYN_CACHE_PER_LANG)
            : entries;
        for (const [k, v] of sliced) {
          payload[lang][k] = v;
        }
      }
      window.sessionStorage.setItem(DYN_CACHE_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore quota errors
    }
  }, 350);
}

function scheduleDomRefresh(): void {
  if (typeof document === "undefined" || domRefreshTimer) return;
  domRefreshTimer = setTimeout(() => {
    domRefreshTimer = null;
    if (activeDomLang !== "vi" && document.body) {
      applyDomTranslation(document.body, activeDomLang);
    }
  }, 60);
}

/** Nhận diện dấu Tiếng Việt để chỉ kích hoạt dịch tự động đối với văn bản Tiếng Việt. */
export const VI_DIACRITIC_RE =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗợơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

const VN_SURNAMES = new Set([
  "nguyễn", "trần", "lê", "phạm", "hoàng", "huỳnh", "phan", "vũ", "võ",
  "đặng", "bùi", "đỗ", "hồ", "ngô", "dương", "lý", "đinh", "đoàn", "trương",
  "bạch", "mai", "lâm", "tô", "hà", "lưu", "lương", "châu", "tạ", "phùng",
  "trịnh", "vương", "cao", "đào", "tống", "thái", "kiều", "nông", "vi",
  "lò", "điểu", "ksor", "rơ", "h'", "y", "y'", "ama", "ami",
]);

export function isLikelyPersonName(text: string): boolean {
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

async function postTranslateBatch(
  target: TargetLang,
  texts: string[],
): Promise<Record<string, string> | null> {
  try {
    const signal =
      typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
        ? AbortSignal.timeout(7000)
        : undefined;
    // Gọi trực tiếp endpoint nội bộ '/api/portal/translate' (tuân thủ CSP connect-src 'self'
    // và không kích hoạt sự kiện DATA_MUTATED_EVENT làm tải lại dữ liệu các tab).
    const res = await fetch("/api/portal/translate", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ target, texts }),
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { translations?: Record<string, string> } | null;
    if (data && data.translations && typeof data.translations === "object") {
      return data.translations;
    }
    return null;
  } catch {
    return null;
  }
}

function flushBatchQueue(target: TargetLang): void {
  if (batchTimers[target]) {
    clearTimeout(batchTimers[target]!);
    batchTimers[target] = null;
  }
  while (activeRequests[target] < MAX_CONCURRENT_BATCHES && batchQueue[target].length > 0) {
    const chunk = batchQueue[target].splice(0, MAX_BATCH_SIZE);
    if (chunk.length === 0) break;
    const epoch = translationEpoch;
    activeRequests[target] += 1;

    void postTranslateBatch(target, chunk)
      .then((translations) => {
        if (epoch !== translationEpoch) return;
        let updatedAny = false;
        const now = Date.now();
        for (const item of chunk) {
          const translated = translations?.[item];
          if (typeof translated === "string" && translated.trim() && translated.trim() !== item) {
            const clean = translated.trim();
            dynamicCache[target].set(item, clean);
            registerReverseTranslation(clean, item);
            failedCooldown[target].delete(item);
            updatedAny = true;
          } else {
            failedCooldown[target].set(item, now + RETRY_COOLDOWN_MS);
          }
        }
        if (updatedAny) {
          scheduleSaveDynCache();
          scheduleDomRefresh();
        }
      })
      .catch(() => {
        if (epoch !== translationEpoch) return;
        const retryAt = Date.now() + RETRY_COOLDOWN_MS;
        for (const item of chunk) {
          failedCooldown[target].set(item, retryAt);
        }
      })
      .finally(() => {
        activeRequests[target] = Math.max(0, activeRequests[target] - 1);
        if (epoch === translationEpoch) {
          for (const item of chunk) {
            pendingSet[target].delete(item);
          }
          if (batchQueue[target].length > 0) {
            flushBatchQueue(target);
          }
        }
      });
  }
}

function queueServerAutoTranslate(trimmed: string, target: TargetLang): void {
  if (typeof window === "undefined") return;
  if (pendingSet[target].has(trimmed) || dynamicCache[target].has(trimmed)) return;
  if (!VI_DIACRITIC_RE.test(trimmed) || isLikelyPersonName(trimmed)) return;
  if (trimmed.includes("@") || /^https?:\/\//i.test(trimmed) || /\d{6,}/.test(trimmed)) return;
  if (trimmed.length < 2 || trimmed.length > 580) return;

  const retryAt = failedCooldown[target].get(trimmed);
  if (retryAt !== undefined && Date.now() < retryAt) return;

  pendingSet[target].add(trimmed);
  batchQueue[target].push(trimmed);

  if (batchQueue[target].length >= MAX_BATCH_SIZE) {
    flushBatchQueue(target);
  } else if (!batchTimers[target]) {
    batchTimers[target] = setTimeout(() => {
      flushBatchQueue(target);
    }, BATCH_DEBOUNCE_MS);
  }
}

function translateCompositional(text: string, pack: LangPack): string {
  if (!VI_DIACRITIC_RE.test(text) || isLikelyPersonName(text)) {
    return text;
  }
  let result = text;
  let replacedAny = false;

  for (const [regex, targetPhrase] of pack.compositionalPhrases) {
    regex.lastIndex = 0;
    if (regex.test(result)) {
      regex.lastIndex = 0;
      result = result.replace(regex, (_, prefix: string) => `${prefix}${targetPhrase}`);
      replacedAny = true;
    }
  }

  for (const [uRegex, uReplace] of pack.compositionalUnits) {
    uRegex.lastIndex = 0;
    if (uRegex.test(result)) {
      uRegex.lastIndex = 0;
      result = result.replace(uRegex, uReplace);
      replacedAny = true;
    }
  }

  return replacedAny ? result : text;
}

function translateSingleSegment(trimmed: string, target: TargetLang, pack: LangPack): string {
  if (!trimmed) return trimmed;

  // Tầng 1: Từ điển tĩnh & Biểu thức mẫu (0ms)
  const exact = pack.exactMap[trimmed] ?? pack.lowerMap[trimmed.toLowerCase()];
  if (exact) return exact;

  for (const [regex, replacer] of pack.patternRules) {
    const match = regex.exec(trimmed);
    if (match) {
      const out = replacer(...match);
      registerReverseTranslation(out, trimmed);
      return out;
    }
  }

  if (isLikelyPersonName(trimmed)) {
    return trimmed;
  }

  // Tầng 2: Bộ nhớ đệm dữ liệu động đã dịch trong phiên (0ms)
  ensureDynCacheLoaded();
  const cached = dynamicCache[target].get(trimmed);
  if (cached) return cached;

  // Tầng 3 & 4: Dữ liệu Tiếng Việt mới phát sinh chưa có trong từ điển
  if (VI_DIACRITIC_RE.test(trimmed)) {
    queueServerAutoTranslate(trimmed, target);
    const composed = translateCompositional(trimmed, pack);
    if (!VI_DIACRITIC_RE.test(composed) && composed !== trimmed) {
      registerReverseTranslation(composed, trimmed);
      return composed;
    }
  }

  return trimmed;
}

export function translateText(raw: string, target: TargetLang): string {
  if (!raw) return raw;
  const pack = langPacks[target];
  if (!pack) return raw;

  const trimmed = raw.trim();
  if (!trimmed) return raw;

  const idx = raw.indexOf(trimmed);
  const lead = raw.slice(0, idx);
  const tail = raw.slice(idx + trimmed.length);

  // Ưu tiên khớp toàn chuỗi
  const exactFull = pack.exactMap[trimmed] ?? pack.lowerMap[trimmed.toLowerCase()];
  if (exactFull) {
    registerReverseTranslation(exactFull, trimmed);
    return `${lead}${exactFull}${tail}`;
  }

  // Hỗ trợ chuỗi nhiều vế ngăn cách bởi " - ", " · ", " – ", " — "
  const multiPartSeps: Array<[string, RegExp, string]> = [
    [" - ", /\s+-\s+/, " - "],
    [" · ", /\s*·\s*/, " - "],
    [" – ", /\s*–\s*/, " – "],
    [" — ", /\s*—\s*/, " — "],
  ];
  for (const [sep, splitRe, joinSep] of multiPartSeps) {
    if (trimmed.includes(sep)) {
      const parts = trimmed.split(splitRe);
      let changed = false;
      const translatedParts = parts.map((part) => {
        const tp = translateSingleSegment(part.trim(), target, pack);
        if (tp !== part.trim()) changed = true;
        return tp;
      });
      if (changed) {
        const joined = translatedParts.join(joinSep);
        registerReverseTranslation(joined, trimmed);
        return `${lead}${joined}${tail}`;
      }
    }
  }

  const direct = translateSingleSegment(trimmed, target, pack);
  if (direct !== trimmed) {
    registerReverseTranslation(direct, trimmed);
    return `${lead}${direct}${tail}`;
  }

  return raw;
}

// ─── BỘ DUYỆT DOM 3 CHIỀU HOÀN NGUYÊN TUYỆT ĐỐI (VI <-> EN <-> ZH) ───

interface AppliedStamp {
  lang: PortalLang;
  value: string;
}

const originalViTextMap = new WeakMap<Text, string>();
const appliedTransTextMap = new WeakMap<Text, AppliedStamp>();
const originalViAttrMap = new WeakMap<Element, Map<string, string>>();
const appliedTransAttrMap = new WeakMap<Element, Map<string, AppliedStamp>>();
const TRANSLATABLE_ATTRS = ["placeholder", "title", "aria-label"] as const;

function translateTextNode(textNode: Text, lang: PortalLang): void {
  const parentEl = textNode.parentElement;
  const parentTag = parentEl?.tagName;
  if (
    parentTag === "SCRIPT" ||
    parentTag === "STYLE" ||
    parentTag === "TEXTAREA" ||
    parentTag === "CODE" ||
    parentTag === "PRE" ||
    parentEl?.isContentEditable ||
    parentEl?.closest("[data-no-translate], [translate='no']")
  ) {
    return;
  }

  const currentVal = textNode.nodeValue ?? "";
  if (!currentVal.trim()) return;

  const savedVi = originalViTextMap.get(textNode);
  const lastApplied = appliedTransTextMap.get(textNode);
  const isKnownState =
    savedVi !== undefined && (currentVal === savedVi || currentVal === lastApplied?.value);
  const viSource = isKnownState ? savedVi : (lookupReverseVi(currentVal) ?? currentVal);

  originalViTextMap.set(textNode, viSource);

  const targetVal = lang === "vi" ? viSource : translateText(viSource, lang);
  appliedTransTextMap.set(textNode, { lang, value: targetVal });

  if (currentVal !== targetVal) {
    textNode.nodeValue = targetVal;
  }
}

function translateElementAttrs(el: Element, lang: PortalLang): void {
  if (el.closest("[data-no-translate], [translate='no']")) return;
  for (const attr of TRANSLATABLE_ATTRS) {
    const val = el.getAttribute(attr);
    if (!val || !val.trim()) continue;

    let viStore = originalViAttrMap.get(el);
    let appliedStore = appliedTransAttrMap.get(el);

    const savedVi = viStore?.get(attr);
    const lastApplied = appliedStore?.get(attr);
    const isKnownState =
      savedVi !== undefined && (val === savedVi || val === lastApplied?.value);
    const viSource = isKnownState ? savedVi : (lookupReverseVi(val) ?? val);

    if (!viStore) {
      viStore = new Map();
      originalViAttrMap.set(el, viStore);
    }
    viStore.set(attr, viSource);

    const targetVal = lang === "vi" ? viSource : translateText(viSource, lang);
    if (!appliedStore) {
      appliedStore = new Map();
      appliedTransAttrMap.set(el, appliedStore);
    }
    appliedStore.set(attr, { lang, value: targetVal });

    if (val !== targetVal) {
      el.setAttribute(attr, targetVal);
    }
  }
}

export function applyDomTranslation(root: Node, lang: PortalLang): void {
  setActiveDomLang(lang);
  if (root.nodeType === 3 /* Node.TEXT_NODE */) {
    translateTextNode(root as Text, lang);
    return;
  }
  if (root.nodeType === 1 /* Node.ELEMENT_NODE */) {
    translateElementAttrs(root as Element, lang);
  }
  if (typeof document === "undefined" || typeof document.createTreeWalker !== "function") {
    return;
  }
  const walker = document.createTreeWalker(root, 5 /* SHOW_ELEMENT | SHOW_TEXT */);
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current.nodeType === 3) {
      translateTextNode(current as Text, lang);
    } else if (current.nodeType === 1) {
      translateElementAttrs(current as Element, lang);
    }
    current = walker.nextNode();
  }
}

export function observeDomTranslation(lang: Exclude<PortalLang, "vi">): () => void {
  setActiveDomLang(lang);
  const rafId = requestAnimationFrame(() => {
    if (typeof document !== "undefined" && document.body) {
      applyDomTranslation(document.body, lang);
    }
  });

  const observer = new MutationObserver((mutations) => {
    const currentTargetLang = activeDomLang;
    if (currentTargetLang === "vi") return;

    for (const m of mutations) {
      if (m.type === "childList") {
        m.addedNodes.forEach((node) => applyDomTranslation(node, currentTargetLang));
      } else if (m.type === "characterData" && m.target) {
        const tNode = m.target as Text;
        const last = appliedTransTextMap.get(tNode);
        if (last && last.lang === currentTargetLang && last.value === tNode.nodeValue) {
          continue;
        }
        translateTextNode(tNode, currentTargetLang);
      } else if (m.type === "attributes" && m.target && m.attributeName) {
        const el = m.target as Element;
        const attrName = m.attributeName;
        const last = appliedTransAttrMap.get(el)?.get(attrName);
        if (last && last.lang === currentTargetLang && last.value === el.getAttribute(attrName)) {
          continue;
        }
        translateElementAttrs(el, currentTargetLang);
      }
    }
  });

  if (typeof document !== "undefined" && document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "title", "aria-label"],
    });
  }

  return () => {
    cancelAnimationFrame(rafId);
    observer.disconnect();
  };
}

