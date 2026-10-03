import { ArrowDown, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Wordmark } from "./Wordmark";
import { Trio } from "./Trio";
import { useT } from "@/i18n";

/** A quiet brass doorway behind the tile: the arch stays, but only as an outline. */
function Doorway() {
  return (
    <svg viewBox="-30 -30 460 620" aria-hidden="true" className="absolute top-1/2 left-1/2 h-[118%] -translate-x-1/2 -translate-y-1/2 overflow-visible opacity-60">
      <rect className="fill-none stroke-brass/50 [stroke-width:1]" x="-22" y="-22" width="444" height="604" />
      <path className="fill-surface/60 stroke-brass [stroke-width:1.2]" d="M10 560V289A208 208 0 1 1 390 289V560Z" />
    </svg>
  );
}

export function Hero() {
  const t = useT();
  return (
    <section
      id="inicio"
      aria-labelledby="hero-title"
      className="lattice relative isolate grid grid-cols-1 items-center gap-10 overflow-hidden bg-background px-6 pt-[104px] pb-16 after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:-z-10 after:h-2/5 after:bg-linear-to-b after:from-transparent after:to-background sm:min-h-[max(820px,100svh)] sm:grid-cols-[minmax(0,1.05fr)_minmax(280px,1fr)] sm:gap-[4vw] sm:px-[clamp(24px,4.5vw,80px)] sm:pt-[130px] sm:pb-[72px] min-[1800px]:mx-auto min-[1800px]:max-w-[1800px]"
    >
      <div className="relative z-[1] motion-safe:animate-arrive">
        <h1 id="hero-title" className="leading-none">
          <Wordmark alt="zellige" className="w-full drop-shadow-[0_18px_24px_#0f3b6e2e] sm:w-[clamp(300px,38vw,680px)]" />
        </h1>
        {/* A dictionary entry: where the name comes from. */}
        <dl className="mt-6 max-w-[46ch] border-l-2 border-brass pl-4 sm:mt-8">
          <dt className="flex flex-wrap items-baseline gap-x-2.5 text-sm">
            <span className="font-semibold">zel·li·ge</span>
            <span className="text-muted-foreground">/zɛˈliːʒ/</span>
            <span lang="ar" dir="rtl" className="text-muted-foreground">الزليج</span>
          </dt>
          <dd className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
            {t.hero.definition}
          </dd>
        </dl>
        <p className="mt-8 text-[28px] leading-[1.12] tracking-[-0.045em] sm:text-[clamp(28px,2.7vw,42px)]">
          {t.hero.headline.lead}<br /><em className="text-accent">{t.hero.headline.turn}</em>
        </p>
        <p className="mt-5 mb-9 max-w-[48ch] text-[15px] leading-[1.7] text-muted-foreground sm:text-base">
          {t.hero.body}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <a className={cn(buttonVariants({ variant: "cta", size: "cta" }))} href="#piezas">
            <Sparkles aria-hidden="true" /> {t.hero.primary}
          </a>
          <a className={cn(buttonVariants({ variant: "cta-secondary", size: "cta" }))} href="#proyecto">
            {t.hero.secondary} <ArrowDown aria-hidden="true" />
          </a>
        </div>
      </div>
      <div className="relative mx-auto mb-16 w-[min(72vw,420px)] sm:mb-0 sm:w-[min(84%,480px)]">
        <Doorway />
        <Trio mood="hello" mode="intro" greeting className="relative" />
      </div>
    </section>
  );
}
