import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useMotionValueEvent, useScroll } from "motion/react";
import { ArrowDown, ChevronDown, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { Companion, type Mood } from "./Companion";
import { LayerGlyph, pieces, type Piece } from "./Trio";
import { Wordmark } from "./Wordmark";

/*
 * Centred and symmetric, like the emblem: wordmark, Zel, one line, one button.
 * The emblem's layers fly in from beyond the screen and lock around Zel (CSS);
 * pointing at a layer lifts it and names it; scrolling away lets the layers fall
 * toward the story below, where they assemble again step by step.
 */

/** Which layer the pointer is over, from its position relative to the emblem centre. */
function layerAt(x: number, y: number): Piece | undefined {
  const r = Math.hypot(x, y);
  if (r < 0.2 || r > 0.98) return undefined; // Zel's face, or outside the emblem
  if (Math.abs(x) > 0.2 && Math.abs(y) > 0.2 && Math.abs(Math.abs(x) - Math.abs(y)) < 0.28) {
    return r < 0.4 ? "crown" : "cobalt"; // the diagonals: kites near the centre, corner squares beyond
  }
  return r < 0.46 ? "crown" : "points";
}

/*
 * Zel wakes up once the centre lands: eyes closed, open, a look left and right
 * at the new page, a blink, then the usual smile. [delay ms, mood, gaze x in face units]
 */
const wake: [number, Mood, number][] = [
  [1700, "look", 0],
  [2150, "look", -70],
  [2650, "look", 70],
  [3100, "look", 0],
  [3350, "content", 0],
  [3500, "look", 0],
  [3900, "hello", 0],
];

function Emblem({ reduced }: { reduced: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [intro, setIntro] = useState<Mood>();
  useEffect(() => {
    if (reduced) return;
    const node = root.current;
    const timers = [window.setTimeout(() => setIntro("content"), 0)];
    for (const [delay, mood, gaze] of wake) {
      timers.push(window.setTimeout(() => {
        setIntro(mood === "hello" ? undefined : mood);
        node?.style.setProperty("--look-x", `${gaze}px`);
      }, delay));
    }
    return () => timers.forEach(clearTimeout);
  }, [reduced]);
  const t = useT();
  const [hover, setHover] = useState<Piece>();
  const shown = hover;
  function track(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setHover(layerAt(((event.clientX - rect.left) / rect.width) * 2 - 1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
  }
  return (
    <div
      ref={root}
      className={cn("hero-zel tile relative mx-auto aspect-square w-[min(78vw,clamp(200px,30vh,380px))]", !reduced && "hero-intro", shown && `lift-${shown}`)}
      onPointerMove={track}
      onPointerDown={track}
      onPointerLeave={() => setHover(undefined)}
    >
      <Companion mood={shown ? "look" : intro ?? "hello"} follow alt={t.zel.alt} className="size-full drop-shadow-[0_26px_34px_rgb(11_29_41/0.3)]" />
      {/* The layer under the pointer names itself; screen readers get all three below. */}
      {pieces.map((piece) => (
        <span
          key={piece}
          aria-hidden="true"
          className={cn(
            `hero-label hero-label-${piece} pointer-events-none absolute flex items-center gap-2 rounded-full border border-brass/60 bg-popover/95 py-1.5 pr-3.5 pl-2 text-[13px] whitespace-nowrap text-foreground shadow-[0_12px_28px_-14px_rgb(20_43_53/0.5)] transition-[opacity,translate] duration-300`,
            shown === piece ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
          )}
        >
          <LayerGlyph layer={piece} className="size-4" />
          <span><strong className="font-semibold">{t.layers[piece].name}</strong> · {t.layers[piece].use}</span>
        </span>
      ))}
      <p className="sr-only">{pieces.map((piece) => `${t.layers[piece].name}: ${t.layers[piece].use}.`).join(" ")}</p>
      <p className={cn("hero-greeting absolute transition-opacity duration-300 top-[2%] left-[60%] w-max max-w-[150px] rounded-2xl rounded-bl-sm border border-border bg-popover px-3 py-2 text-left text-[11px] sm:top-[6%] sm:left-[64%] leading-snug text-foreground shadow-[0_12px_30px_-14px_rgb(20_43_53/0.4)] sm:max-w-[220px] sm:px-3.5 sm:py-2.5 sm:text-sm", shown && "opacity-0")}>
        <strong className="font-semibold">{t.zel.hello}</strong>
        <br />
        {t.zel.helloLine}
      </p>
    </div>
  );
}

export function Hero({ reduced }: { reduced: boolean }) {
  const t = useT();
  const section = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end start"] });
  useMotionValueEvent(scrollYProgress, "change", (progress) => {
    if (!reduced) section.current?.style.setProperty("--out", Math.min(1, progress * 1.6).toFixed(3));
  });
  return (
    <section
      ref={section}
      id="inicio"
      aria-labelledby="hero-title"
      className="hero relative isolate flex min-h-svh flex-col items-center justify-center overflow-hidden bg-background px-6 pt-20 pb-14 text-center sm:pt-16"
    >
      <h1 id="hero-title" className="leading-none motion-safe:animate-arrive">
        <Wordmark alt="zellige" className="mx-auto h-auto w-[min(62vw,clamp(200px,26vh,280px))] drop-shadow-[0_14px_20px_#0f3b6e26]" />
      </h1>
      {/* Where the name comes from, as a dictionary would put it. */}
      <p className="mt-3 text-[13px] text-muted-foreground motion-safe:animate-arrive sm:text-sm">
        <span className="font-semibold text-foreground">zel·li·ge</span> /zɛˈliːʒ/ · {t.hero.etymology.from} <i>{t.hero.etymology.source}</i>, {t.hero.etymology.meaning}
      </p>
      <div className="mt-3 mb-5 sm:mt-4 sm:mb-6">
        <Emblem reduced={reduced} />
      </div>
      <p className="hero-copy relative z-[2] max-w-[22ch] text-[clamp(26px,3.4vw,42px)] leading-[1.08] tracking-[-0.045em] text-balance">
        {t.hero.title.lead} <em className="text-accent">{t.hero.title.turn}</em>
      </p>
      <p className="hero-copy relative z-[2] mt-4 max-w-[54ch] text-[15px] leading-[1.65] text-muted-foreground sm:text-base">{t.hero.body}</p>
      <div className="hero-copy relative z-[2] mt-6 flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
        <a className={cn(buttonVariants({ variant: "cta", size: "cta" }))} href="#piezas">
          <Sparkles aria-hidden="true" /> {t.hero.primary}
        </a>
        <a className="inline-flex items-center gap-2 text-sm text-muted-foreground decoration-brass underline-offset-[6px] hover:text-foreground hover:underline" href="#proyecto">
          {t.hero.secondary} <ArrowDown aria-hidden="true" className="size-4" />
        </a>
      </div>
      {/* Next section: a quiet cue at the bottom edge. */}
      <a
        href="#piezas"
        aria-label={t.hero.next}
        title={t.hero.next}
        className="hero-copy absolute bottom-4 left-1/2 z-[2] grid size-10 -translate-x-1/2 place-items-center rounded-full border border-border bg-popover/80 text-muted-foreground transition-colors hover:border-brass hover:text-foreground sm:bottom-6"
      >
        <ChevronDown aria-hidden="true" className="size-5 motion-safe:animate-bounce" />
      </a>
    </section>
  );
}
