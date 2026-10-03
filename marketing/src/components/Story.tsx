import { useEffect, useRef, useState } from "react";
import { useMotionValueEvent, useScroll } from "motion/react";
import { cn } from "@/lib/utils";
import type { Mood } from "./Companion";
import { LayerGlyph, Trio, type Piece } from "./Trio";
import { useT } from "@/i18n";

const steps: { layer?: Piece; key: Piece | "tile"; mood: Mood }[] = [
  { layer: "crown", key: "crown", mood: "curious" },
  { layer: "cobalt", key: "cobalt", mood: "thinking" },
  { layer: "points", key: "points", mood: "excited" },
  { key: "tile", mood: "hello" },
];

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Scroll story: each kind of AI use arrives as a layer of the emblem until the tile is complete. */
export function Story({ reduced }: { reduced: boolean }) {
  const t = useT();
  const section = useRef<HTMLElement>(null);
  const [active, setActive] = useState<number>();
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (t) => {
    const node = section.current;
    // With reduced motion the tile simply stays assembled and the steps read as a list.
    if (!node || reduced) return;
    // Each layer lands just before its step starts.
    node.style.setProperty("--p1", clamp(t / 0.1).toFixed(3));
    node.style.setProperty("--p2", clamp((t - 0.19) / 0.09).toFixed(3));
    node.style.setProperty("--p3", clamp((t - 0.45) / 0.09).toFixed(3));
    // No step until the first layer has landed.
    setActive(t < 0.1 ? undefined : t < 0.28 ? 0 : t < 0.54 ? 1 : t < 0.8 ? 2 : 3);
  });
  // The story only runs with motion allowed; otherwise (and before hydration) it is a plain list.
  const live = !reduced;
  const stage = live ? active ?? 0 : null;
  const focus = live && active !== undefined ? steps[active].layer : undefined;
  useEffect(() => {
    const node = section.current;
    if (!node) return;
    for (const name of ["--p1", "--p2", "--p3"]) {
      if (live) node.style.setProperty(name, "0");
      else node.style.removeProperty(name);
    }
  }, [live]);

  return (
    <section ref={section} id="piezas" aria-labelledby="piezas-title" className={cn("relative", live && "h-[340vh]")}>
      <div className={cn("grid items-center gap-10 px-6 py-20 sm:px-[clamp(24px,4.5vw,80px)] lg:grid-cols-[1fr_1fr] lg:gap-[6vw] min-[1800px]:mx-auto min-[1800px]:max-w-[1800px]", live && "sticky top-0 min-h-svh py-10 lg:py-16")}>
        <div>
          <p className="eyebrow"><span className="section-number">01</span> {t.story.eyebrow}</p>
          <h2 id="piezas-title" className="mt-4 text-[clamp(38px,9vw,52px)] leading-[1.02] sm:text-[clamp(44px,4.6vw,76px)]">
            {t.story.headline.lead}<br /><em className="text-accent">{t.story.headline.turn}</em>
          </h2>
          {/* A dictionary entry: where the name, and the metaphor, come from. */}
          <dl className="mt-6 max-w-[52ch] border-l-2 border-brass pl-4">
            <dt className="flex flex-wrap items-baseline gap-x-2.5 text-sm">
              <span className="font-semibold">zel·li·ge</span>
              <span className="text-muted-foreground">/zɛˈliːʒ/</span>
              <span lang="ar" dir="rtl" className="text-muted-foreground">الزليج</span>
            </dt>
            <dd className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{t.story.definition}</dd>
          </dl>
          <ol className="mt-8 grid gap-1 sm:mt-10">
            {steps.map((step, index) => {
              const current = stage === index;
              const copy = t.story.steps[step.key];
              return (
                <li
                  key={step.key}
                  className={cn(
                    "rounded-2xl border border-transparent p-4 transition-[opacity,background-color,border-color] duration-500 sm:p-5",
                    live && !current && "opacity-35 max-lg:hidden",
                    current && "border-brass/60 bg-popover/80 shadow-[0_14px_34px_-22px_rgb(20_43_53/0.45)]",
                  )}
                >
                  <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-base sm:text-lg">
                    {step.layer ? <LayerGlyph layer={step.layer} className="size-7" /> : <span aria-hidden="true" className="size-2.5 rotate-45 bg-brass" />}
                    <strong className="font-semibold">{copy.title}</strong>
                    {step.layer && <span className="rounded-full bg-surface px-2.5 py-0.5 text-[13px] text-muted-foreground">{t.layers[step.layer].use}</span>}
                  </p>
                  <p className="mt-2 max-w-[52ch] text-[15px] leading-[1.7] text-muted-foreground sm:text-base">{copy.body}</p>
                </li>
              );
            })}
          </ol>
        </div>
        <Trio mood={steps[stage ?? 3].mood} focus={focus} mode="scroll" className="mx-auto w-[min(64vw,300px)] max-lg:order-first sm:w-[min(84%,460px)]" />
      </div>
    </section>
  );
}
