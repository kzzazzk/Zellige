import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { emblem } from "./brand";
import { useT } from "@/i18n";

/** A breathing strip between sections: a narrow band of the ceramic mosaic set in brass. */
export function Band({ tall = false }: { tall?: boolean }) {
  return (
    <div aria-hidden="true" className="px-6 py-14 sm:px-[clamp(24px,4.5vw,80px)] sm:py-20">
      <div className={`ceramic mosaic-band ${tall ? "h-20 sm:h-28" : "h-10 sm:h-14"}`} />
    </div>
  );
}

// Deterministic scatter so every visit assembles the same way.
function scatter(index: number) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

type Piece = { key: number; vars: Record<string, string> };

/** Loose ceramic pieces fall into one continuous surface as the panorama scrolls in. */
export function Panorama({ reduced }: { reduced: boolean }) {
  const t = useT();
  const surface = useRef<HTMLDivElement>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    const element = surface.current;
    if (!element || reduced) return;
    let width = 0;
    let tileSize = 0;
    let frame = 0;
    const update = () => {
      frame = 0;
      // Measure the current position, including layout changes in the story above.
      // Spread assembly over most of the viewport instead of snapping together
      // as soon as the first row enters it.
      const progress = Math.min(1, Math.max(0,
        (innerHeight * 0.95 - element.getBoundingClientRect().top) / (innerHeight * 0.7),
      ));
      const eased = progress * progress * (3 - 2 * progress);
      element.style.setProperty("--assembly", eased.toFixed(5));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const resize = () => {
      cancelAnimationFrame(frame);
      update();
      const tile = parseFloat(getComputedStyle(element.parentElement!).getPropertyValue("--tile"));
      if (element.clientWidth === width && tile === tileSize) return;
      width = element.clientWidth;
      tileSize = tile;
      const columns = Math.ceil(width / tile);
      const next: Piece[] = [];
      for (let row = 0; row < 3; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const index = row * columns + column;
          next.push({
            key: index,
            vars: {
              left: `${column * tile}px`,
              top: `${row * tile}px`,
              width: `${Math.min(tile, width - column * tile)}px`,
              "--bx": `${-column * tile}px`,
              "--by": `${-row * tile}px`,
              "--dx": `${Math.round(scatter(index) * 90)}px`,
              "--dy": `${Math.round(scatter(index + 97) * 70 + (row - 1) * 30)}px`,
              "--r": `${Math.round(scatter(index + 31) * 24)}deg`,
            },
          });
        }
      }
      setPieces(next);
    };
    // Set the initial progress before replacing the static fallback with pieces.
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    observer.observe(document.documentElement);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, [reduced]);

  const animatedPieces = reduced ? [] : pieces;

  return (
    <figure id="panorama" className="mosaic-panorama relative mx-4 sm:mx-[30px]" aria-label={t.panorama.label}>
      <div
        ref={surface}
        aria-hidden="true"
        className={`ceramic mosaic-surface relative h-[calc(var(--tile)*3)] outline outline-offset-[6px] outline-brass ${animatedPieces.length ? "is-assembling overflow-visible" : "overflow-hidden"}`}
      >
        {animatedPieces.map((piece) => (
          <div key={piece.key} className="mosaic-piece" ref={(node) => {
            if (node) for (const [name, value] of Object.entries(piece.vars)) node.style.setProperty(name, value);
          }} />
        ))}
      </div>
      <figcaption className="flex items-baseline gap-[22px] px-1.5 pt-[30px] text-sm leading-normal text-muted-foreground sm:text-[15px]">
        <span className="section-number">02</span>
        <span>{t.panorama.caption.lead}<br /><em className="text-[1.35em] text-foreground">{t.panorama.caption.turn}</em></span>
      </figcaption>
    </figure>
  );
}

export function Branches() {
  const t = useT();
  return (
    <section id="ramas" aria-labelledby="pieces-title" className="grid items-center gap-14 px-[clamp(24px,4.5vw,80px)] py-[88px] sm:gap-[72px] sm:py-[104px] min-[1050px]:grid-cols-2 min-[1050px]:gap-[9%] min-[1050px]:pt-[150px] min-[1050px]:pb-[140px] min-[1800px]:mx-auto min-[1800px]:max-w-[1800px]">
      <figure className="max-w-[560px] min-w-0 min-[1050px]:max-w-none" aria-label={t.branches.label}>
        <svg viewBox="0 0 480 320" aria-hidden="true" className="block h-auto w-full overflow-visible">
          <defs><filter id="lift" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="1" dy="5" stdDeviation="5" floodColor="#142b35" floodOpacity=".22" /></filter></defs>
          <path className="fill-none stroke-brass [stroke-width:1.5]" d="M36 84H444" />
          <path className="fill-none stroke-brass [stroke-width:1.5] [stroke-dasharray:5_5]" d="M166 120V180Q166 224 210 224H444" />
          <g filter="url(#lift)">
            {[[0, 48], [130, 48], [260, 48], [390, 48], [260, 188], [390, 188]].map(([x, y]) => (
              <rect key={`${x}-${y}`} className="branch-tile" x={x} y={y} width="72" height="72" rx="5" />
            ))}
          </g>
          <g className="fill-foreground text-[13px] font-semibold tracking-[0.16em] uppercase sm:text-[11px]">
            <text x="0" y="24">{t.branches.original}</text>
            <text x="260" y="296">{t.branches.branch}</text>
          </g>
        </svg>
        <figcaption className="mt-7 max-w-[30ch] text-[15px] leading-[1.6] text-muted-foreground">
          {t.branches.caption.lead} <em className="block text-[1.5em] text-foreground">{t.branches.caption.turn}</em>
        </figcaption>
      </figure>
      <div data-reveal>
        <p className="eyebrow"><span className="section-number">03</span> {t.branches.eyebrow}</p>
        <h2 id="pieces-title" className="mt-6 text-[44px] leading-[1.02] sm:text-[clamp(44px,4.3vw,68px)]">
          {t.branches.headline.lead}<br /><em className="text-accent">{t.branches.headline.turn}</em>
        </h2>
        {/* Native disclosures: they open and close without JavaScript. */}
        <div className="mt-9 border-t border-border">
          {t.branches.principles.map(([summary, body], index) => (
            <details key={summary} open={index === 0} className="group border-b border-border open:border-brass">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-[22px] text-base leading-normal hover:text-accent [&::-webkit-details-marker]:hidden">
                {summary}
                <Plus aria-hidden="true" strokeWidth={1.4} className="size-4 shrink-0 text-gold transition-transform duration-300 group-open:rotate-45" />
              </summary>
              <p className="max-w-[52ch] pb-6 text-[15px] leading-[1.75] text-muted-foreground">{body}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Project() {
  const t = useT();
  return (
    <section id="proyecto" aria-labelledby="project-title" className="lattice relative mx-3 bg-night px-[26px] pt-[76px] pb-14 text-night-foreground sm:mx-[30px] sm:px-10 sm:pt-[120px] sm:pb-[104px] min-[1050px]:px-[clamp(24px,4.5vw,80px)]">
      <div aria-hidden="true" className="ceramic absolute inset-x-0 top-0 h-[34px] border-b border-brass bg-[length:136px_136px] bg-repeat-x" />
      <div data-reveal className="grid items-start sm:grid-cols-[1fr_2fr] sm:gap-x-[10%]">
        <img src={emblem} width="260" height="260" alt="" loading="lazy" decoding="async" className="mb-8 w-[82px] drop-shadow-[0_18px_30px_#0008] sm:row-span-4 sm:mb-0 sm:w-[min(100%,260px)] sm:self-center sm:justify-self-center" />
        <p className="eyebrow text-night-gold"><span className="section-number text-night-gold">04</span> {t.project.eyebrow}</p>
        <h2 id="project-title" className="mt-6 text-[49px] leading-[1.02] sm:text-[clamp(46px,5.5vw,84px)]">
          {t.project.headline.lead}<br /><em className="text-night-gold">{t.project.headline.turn}</em>
        </h2>
        <ol className="mt-10 grid max-w-[520px] list-none gap-3.5 p-0 text-[15px] leading-normal text-night-muted sm:text-base">
          {t.project.progress.map(([label, done]) => (
            <li key={label} data-done={done || undefined} className="progress-item flex items-center gap-4 border-b border-white/12 pb-3.5 data-[done]:text-night-foreground">
              <span>{label}</span>
            </li>
          ))}
        </ol>
        <span className="mt-8 font-serif text-[28px] text-night-gold italic sm:col-start-2">{t.project.signature}</span>
      </div>
    </section>
  );
}
