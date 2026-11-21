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
import { AUTH_EXPIRED_EVENT, AUTH_LOGOUT_EVENT } from "@/lib/api-client";
import {
  applyDomTranslation,
  observeDomTranslation,
  setActiveDomLang,
  type PortalLang,
} from "./i18n-engine";

export type { PortalLang };

const STORAGE_KEY = "puc-portal-lang";

type ZhModule = typeof import("./i18n-zh");
type EnModule = typeof import("./i18n-en");

let cachedZhModule: ZhModule | null = null;
let inflightZhModule: Promise<ZhModule> | null = null;
let cachedEnModule: EnModule | null = null;
let inflightEnModule: Promise<EnModule> | null = null;

function loadZhModule(): Promise<ZhModule> {
  if (cachedZhModule) return Promise.resolve(cachedZhModule);
  inflightZhModule ??= import("./i18n-zh").then((mod) => {
    cachedZhModule = mod;
    return mod;
  });
  return inflightZhModule;
}

function loadEnModule(): Promise<EnModule> {
  if (cachedEnModule) return Promise.resolve(cachedEnModule);
  inflightEnModule ??= import("./i18n-en").then((mod) => {
    cachedEnModule = mod;
    return mod;
  });
  return inflightEnModule;
}

function readInitialLang(): PortalLang {
  if (typeof window === "undefined") return "vi";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "zh" || stored === "en") return stored;
    return "vi";
  } catch {
    return "vi";
  }
}

interface PortalLangContextValue {
  lang: PortalLang;
  setLang: (next: PortalLang) => void;
  isZh: boolean;
  isEn: boolean;
  t: (vi: string, zh?: string, en?: string) => string;
}

const PortalLangContext = createContext<PortalLangContextValue>({
  lang: "vi",
  setLang: () => {},
  isZh: false,
  isEn: false,
  t: (vi) => vi,
});

export function usePortalLang() {
  return useContext(PortalLangContext);
}

export function PortalLangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<PortalLang>(readInitialLang);
  const [zhMod, setZhMod] = useState<ZhModule | null>(() => cachedZhModule);
  const [enMod, setEnMod] = useState<EnModule | null>(() => cachedEnModule);
  const hasTranslatedNonViRef = useRef(false);

  const setLang = useCallback((next: PortalLang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const resetPortalLang = () => {
      setLangState("vi");
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }
    };
    window.addEventListener(AUTH_LOGOUT_EVENT, resetPortalLang);
    window.addEventListener(AUTH_EXPIRED_EVENT, resetPortalLang);
    return () => {
      window.removeEventListener(AUTH_LOGOUT_EVENT, resetPortalLang);
      window.removeEventListener(AUTH_EXPIRED_EVENT, resetPortalLang);
    };
  }, []);

  const t = useCallback(
    (vi: string, zh?: string, en?: string) => {
      if (lang === "vi") return vi;
      if (lang === "zh") {
        if (zh) return zh;
        return zhMod ? zhMod.translateViToZh(vi) : vi;
      }
      if (en) return en;
      return enMod ? enMod.translateViToEn(vi) : vi;
    },
    [lang, zhMod, enMod],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang === "en" ? "en" : "vi";
    setActiveDomLang(lang);

    if (lang === "vi") {
      if (hasTranslatedNonViRef.current && document.body) {
        applyDomTranslation(document.body, "vi");
      }
      return;
    }

    let cancelled = false;
    let stopObserving: (() => void) | null = null;

    if (lang === "zh") {
      void loadZhModule().then((mod) => {
        if (cancelled) return;
        setZhMod(mod);
        hasTranslatedNonViRef.current = true;
        if (document.body) {
          applyDomTranslation(document.body, "zh");
        }
        stopObserving = observeDomTranslation("zh");
      });
    } else {
      void loadEnModule().then((mod) => {
        if (cancelled) return;
        setEnMod(mod);
        hasTranslatedNonViRef.current = true;
        if (document.body) {
          applyDomTranslation(document.body, "en");
        }
        stopObserving = observeDomTranslation("en");
      });
    }

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
      isEn: lang === "en",
      t,
    }),
    [lang, setLang, t],
  );

  return <PortalLangContext.Provider value={value}>{children}</PortalLangContext.Provider>;
}
