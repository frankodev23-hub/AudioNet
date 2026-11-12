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

  // Detectar el idioma al cargar la aplicación.
  useEffect(() => {
    setLocaleState(detectLocale());
  }, []);

  // Cambiar y guardar el idioma seleccionado.
  const setLocale = useCallback((next: Locale) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // La preferencia se mantiene en memoria.
    }

    setLocaleState(next);
  }, []);

  // Traducir textos según el idioma activo.
  const t = useCallback(
    (text: string): string => {
      return translations[locale][text] || text;
    },
    [locale]
  );

  // Actualizar el idioma del documento.
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
    </LanguageContext.Provider>
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