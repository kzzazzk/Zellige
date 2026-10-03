import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { Companion, layers, type Layer, type Mood } from "./Companion";

/*
 * Zel is the standard emblem; the tile assembles around its centre one colour
 * layer at a time, each layer a way of using AI:
 *   crown  (ivory kites, closest to Zel)      → chat
 *   cobalt (blue corners and top point)       → chat managers and meta-harnesses
 *   points (outer teal points, reaching out)  → personal agents
 * Motion is CSS only: the intro plays once; the scroll story drives --p1..--p3 from
 * JS. Without JS or with reduced motion, the emblem is simply whole.
 */
export type Piece = Exclude<Layer, "centre">;
export const pieces: Piece[] = ["crown", "cobalt", "points"];

const labelPlacement: Record<Piece, string> = {
  crown: "-left-[2%] bottom-[2%] sm:-left-[10%] sm:bottom-[6%]",
  cobalt: "left-[0%] -top-[4%] sm:-left-[8%] sm:top-[2%]",
  points: "-right-[2%] top-[12%] sm:-right-[12%] sm:top-[66%]",
};

/** One layer of the emblem, small, to name it in labels and lists. */
export function LayerGlyph({ layer, className }: { layer: Piece; className?: string }) {
  const { src } = layers.find(({ name }) => name === layer)!;
  return <img src={src} alt="" width="960" height="960" className={cn("size-5 shrink-0", className)} draggable={false} />;
}

export function Trio({
  mood,
  mode,
  focus,
  greeting,
  className,
}: {
  mood: Mood;
  /** intro: assembles once on load; scroll: follows --p1..--p3 set on an ancestor. */
  mode: "intro" | "scroll";
  /** The layer being explained: it glows while the others step back. */
  focus?: Piece;
  /** Zel introduces itself in a bubble once the tile is complete. */
  greeting?: boolean;
  className?: string;
}) {
  const t = useT();
  return (
    <div className={cn("tile relative aspect-square", mode === "intro" ? "tile-intro" : "tile-scroll", focus && `focus-${focus}`, className)}>
      <Companion mood={mood} follow alt={t.zel.alt} className="size-full drop-shadow-[0_22px_28px_rgb(11_29_41/0.3)]" />
      {pieces.map((piece) => (
        <span
          key={piece}
          className={cn(
            `tile-label label-${piece} absolute flex items-center gap-2 rounded-full border border-border bg-popover/95 py-1.5 pr-3 pl-2 text-xs whitespace-nowrap text-foreground shadow-[0_10px_24px_-14px_rgb(20_43_53/0.45)] transition-[border-color,box-shadow] sm:text-[13px] ${labelPlacement[piece]}`,
            focus === piece && "border-brass shadow-[0_0_0_3px_rgb(176_138_74/0.25)]",
          )}
        >
          <LayerGlyph layer={piece} className="size-4" />
          <span><strong className="hidden font-semibold sm:inline">{t.layers[piece].name} · </strong>{t.layers[piece].use}</span>
        </span>
      ))}
      {greeting && (
        <p className="tile-greeting absolute -bottom-[30%] left-1/2 w-max max-w-[240px] -translate-x-1/2 rounded-2xl border border-border bg-popover px-3 py-2 text-xs leading-snug text-foreground shadow-[0_12px_30px_-14px_rgb(20_43_53/0.4)] sm:top-[4%] sm:right-[-16%] sm:bottom-auto sm:left-auto sm:w-auto sm:max-w-[200px] sm:translate-x-0 sm:rounded-bl-sm sm:px-3.5 sm:py-2.5 sm:text-sm">
          <strong className="font-semibold">{t.zel.hello}</strong>
          <br />
          {t.zel.helloLine}
        </p>
      )}
    </div>
  );
}
