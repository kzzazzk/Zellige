import { createContext, useContext, type ReactNode } from "react";
import { defaultLocale, locales, type Locale, type Messages } from "./messages";

export { defaultLocale, localePath, locales, type Locale } from "./messages";

const LocaleContext = createContext<Locale>(defaultLocale);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** The current locale's messages. */
export function useT(): Messages {
  return locales[useContext(LocaleContext)];
}

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && value in locales;
}
