import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { translations, type Language } from "@/lib/i18n";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function getStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem("language");
    if (stored === "en" || stored === "sk") return stored;
  } catch {}
  return "sk";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getStoredLanguage);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try { localStorage.setItem("language", lang); } catch {}
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === "sk" ? "en" : "sk");
  }, [language, setLanguage]);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    let val = translations[language][key] || translations.en[key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        val = val.replace(`{${k}}`, String(v));
      });
    }
    return val;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
