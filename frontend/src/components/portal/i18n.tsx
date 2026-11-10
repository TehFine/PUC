"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type PortalLang = "vi" | "zh";

const STORAGE_KEY = "puc-portal-lang";

type ZhModule = typeof import("./i18n-zh");

let cachedZhModule: ZhModule | null = null;
let inflightZhModule: Promise<ZhModule> | null = null;

function loadZhModule(): Promise<ZhModule> {
  if (cachedZhModule) return Promise.resolve(cachedZhModule);
  inflightZhModule ??= import("./i18n-zh").then((mod) => {
    cachedZhModule = mod;
    return mod;
  });
  return inflightZhModule;
}

interface PortalLangContextValue {
  lang: PortalLang;
  setLang: (next: PortalLang) => void;
  isZh: boolean;
  t: (vi: string, zh?: string) => string;
}

const PortalLangContext = createContext<PortalLangContextValue>({
  lang: "vi",
  setLang: () => {},
  isZh: false,
  t: (vi) => vi,
});

export function usePortalLang() {
  return useContext(PortalLangContext);
}

export function PortalLangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<PortalLang>(() => {
    if (typeof window === "undefined") return "vi";
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "zh" ? "zh" : "vi";
    } catch {
      return "vi";
    }
  });
  const [zhMod, setZhMod] = useState<ZhModule | null>(() => cachedZhModule);
  const hasTranslatedZhRef = useRef(false);

  const setLang = useCallback((next: PortalLang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const t = useCallback(
    (vi: string, zh?: string) => {
      if (lang === "vi") return vi;
      if (zh) return zh;
      return zhMod ? zhMod.translateViToZh(vi) : vi;
    },
    [lang, zhMod],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "vi";

    // Nếu đang ở Tiếng Việt và chưa từng bật Tiếng Trung thì không cần tải gói từ điển 94KB hay quét DOM (0ms CPU, 0KB RAM thêm)
    if (lang === "vi") {
      if (hasTranslatedZhRef.current && cachedZhModule) {
        cachedZhModule.applyDomTranslation(document.body, "vi");
      }
      return;
    }

    let cancelled = false;
    let stopObserving: (() => void) | null = null;

    void loadZhModule().then((mod) => {
      if (cancelled) return;
      setZhMod(mod);
      hasTranslatedZhRef.current = true;
      mod.applyDomTranslation(document.body, "zh");
      stopObserving = mod.observeDomTranslation();
    });

    return () => {
      cancelled = true;
      stopObserving?.();
    };
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      isZh: lang === "zh",
      t,
    }),
    [lang, setLang, t],
  );

  return <PortalLangContext.Provider value={value}>{children}</PortalLangContext.Provider>;
}
