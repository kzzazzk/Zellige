import { useEffect, useState } from "react";

function savedDarkMode() {
  try {
    return localStorage.getItem("zellige-theme") !== "light";
  } catch {
    return true;
  }
}

export function useTheme() {
  const [dark, setDark] = useState(savedDarkMode);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("zellige-theme", dark ? "dark" : "light");
    } catch {
      /* Theme still works without storage. */
    }
  }, [dark]);

  return { dark, toggleTheme: () => setDark(!dark) };
}
