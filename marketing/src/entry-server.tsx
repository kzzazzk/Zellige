import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { App } from "./App";
import { LocaleProvider, localePath, locales, type Locale } from "./i18n";

export { localePath, locales };

export function render(locale: Locale) {
  return renderToString(<StrictMode><LocaleProvider locale={locale}><App /></LocaleProvider></StrictMode>);
}
