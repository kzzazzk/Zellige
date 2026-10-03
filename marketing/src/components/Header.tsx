import { Moon, Sun } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { emblem } from "./brand";
import { Wordmark } from "./Wordmark";

export function Header() {
  const t = useT();
  const links = [
    ["#piezas", t.header.links.idea],
    ["#ramas", t.header.links.branches],
    ["#proyecto", t.header.links.project],
  ];
  return (
    <header className="absolute inset-x-0 top-0 z-10 flex items-center gap-4 px-[22px] py-5 sm:gap-8 sm:px-[30px] sm:py-6">
      <a className="inline-flex items-center gap-2.5" href="#inicio" aria-label={t.header.home}>
        <img src={emblem} width="38" height="38" alt="" className="w-[34px] sm:w-[38px]" />
        <span className="hidden sm:block"><Wordmark className="h-9 w-auto" /></span>
      </a>
      <nav aria-label={t.header.nav} className="ml-auto flex gap-[18px] sm:gap-[30px]">
        {links.map(([href, label]) => (
          <a key={href} href={href} className="py-[15px] text-xs decoration-brass underline-offset-[6px] hover:underline sm:text-[13px]">
            {label}
          </a>
        ))}
      </nav>
      <button
        type="button"
        aria-label={t.header.theme}
        title={t.header.themeTitle}
        className={cn(buttonVariants({ variant: "cta-secondary", size: "lg" }), "size-10 p-0")}
        onClick={() => {
          const dark = document.documentElement.classList.toggle("dark");
          try { localStorage.setItem("zellige-theme", dark ? "dark" : "light"); } catch { /* private mode: keep it for this visit */ }
        }}
      >
        <Moon aria-hidden="true" className="dark:hidden" />
        <Sun aria-hidden="true" className="hidden dark:block" />
      </button>
    </header>
  );
}
