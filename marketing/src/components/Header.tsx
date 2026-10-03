import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { emblem } from "./brand";
import { Wordmark } from "./Wordmark";

export function Header() {
  const t = useT();
  // The wordmark appears once: the header's brand shows only after the hero's has scrolled away.
  const [heroMark, setHeroMark] = useState(true);
  useEffect(() => {
    const mark = document.getElementById("hero-title");
    if (!mark) return;
    const observer = new IntersectionObserver(([entry]) => setHeroMark(entry.isIntersecting));
    observer.observe(mark);
    return () => observer.disconnect();
  }, []);
  // The section in view gets the mosaic strip under its link.
  const [current, setCurrent] = useState<string>();
  useEffect(() => {
    const ids = ["piezas", "ramas", "proyecto"];
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) setCurrent(`#${entry.target.id}`);
        else setCurrent((value) => (value === `#${entry.target.id}` ? undefined : value));
      }
    }, { rootMargin: "-45% 0px -50% 0px" });
    for (const id of ids) {
      const node = document.getElementById(id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, []);
  const links = [
    ["#piezas", t.header.links.idea],
    ["#ramas", t.header.links.branches],
    ["#proyecto", t.header.links.project],
  ];
  return (
    <header className={cn("fixed inset-x-0 top-0 z-10 flex items-center gap-4 px-[22px] py-3 transition-[background-color,border-color] duration-300 sm:gap-8 sm:px-[30px] sm:py-4", heroMark ? "border-b border-transparent" : "border-b border-border/70 bg-background/85 backdrop-blur-md")}>
      <a className={cn("inline-flex items-center gap-2.5 transition-[opacity,translate] duration-300", heroMark && "pointer-events-none -translate-y-1 opacity-0")} href="#inicio" aria-label={t.header.home} tabIndex={heroMark ? -1 : undefined}>
        <img src={emblem} width="38" height="38" alt="" className="w-[34px] sm:w-[38px]" />
        <span className="hidden sm:block"><Wordmark className="h-9 w-auto" /></span>
      </a>
      <nav aria-label={t.header.nav} className="ml-auto flex gap-[18px] sm:gap-[30px]">
        {links.map(([href, label]) => (
          <a
            key={href}
            href={href}
            aria-current={current === href ? "location" : undefined}
            className="py-[15px] text-xs whitespace-nowrap text-foreground/70 decoration-brass decoration-1 underline-offset-[6px] transition-colors hover:text-foreground hover:underline aria-[current]:text-foreground aria-[current]:underline sm:text-[13px]"
          >
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
