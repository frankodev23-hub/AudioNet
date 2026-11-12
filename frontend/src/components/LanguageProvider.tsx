"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { translations, type Locale } from "@/i18n/translations";

const STORAGE_KEY = "audionet_locale";

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (text: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved === "es" || saved === "en") {
      return saved;
    }

    return navigator.language.toLowerCase().startsWith("es")
      ? "es"
      : "en";
  } catch {
    return "es";
  }
}

export function LanguageProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>("es");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLocaleState(detectLocale());
    setReady(true);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // La preferencia se mantiene en memoria.
    }

    setLocaleState(next);
  }, []);

  const t = useCallback(
    (text: string): string => {
      return translations[locale][text] || text;
    },
    [locale]
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
    }),
    [locale, setLocale, t]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}

      {ready && (
        <LanguageSwitcher
          locale={locale}
          setLocale={setLocale}
        />
      )}
    </LanguageContext.Provider>
  );
}

function LanguageSwitcher({
  locale,
  setLocale,
}: {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}) {
  return (
    <label className="fixed bottom-4 right-4 z-[100] flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow-lg backdrop-blur">
      <span aria-hidden="true">🌐</span>

      <span className="sr-only">Language</span>

      <select
        aria-label="Language"
        value={locale}
        onChange={(event) =>
          setLocale(event.target.value as Locale)
        }
        className="cursor-pointer bg-transparent outline-none"
      >
        <option value="es">Español</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error(
      "useLanguage must be used inside LanguageProvider"
    );
  }

  return context;
}