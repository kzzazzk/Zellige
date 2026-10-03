import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import layerCentre from "@/assets/layer-centre.webp";
import layerCobalt from "@/assets/layer-cobalt.webp";
import layerCrown from "@/assets/layer-crown.webp";
import layerPoints from "@/assets/layer-points.webp";

export type Mood = "hello" | "look" | "thinking" | "excited" | "curious" | "focused" | "wink" | "content";

/*
 * Zel is the standard emblem itself, with an obsidian face on its centre star.
 * The body is the emblem's four colour layers (scripts/build-layers.mjs), stacked
 * so they can also be shown one by one; the face is SVG, so Zel can change
 * expression, blink and look around. Face coordinates are drawn at the original
 * mascot's scale (oval at 622, 634; eyes at x 521 / 723) and scaled onto the star.
 * Positions are set only through CSS custom properties from JS, never inline
 * style attributes, to stay within the landing's CSP.
 */
export type Layer = "centre" | "crown" | "cobalt" | "points";
export const layers: { name: Layer; src: string }[] = [
  { name: "points", src: layerPoints },
  { name: "cobalt", src: layerCobalt },
  { name: "crown", src: layerCrown },
  { name: "centre", src: layerCentre },
];
const EYE_L = 521;
const EYE_R = 723;
const EYE_Y = 622;

function Arc({ x, up = true }: { x: number; up?: boolean }) {
  // ∩ for a smile-squint, ∪ for closed, relaxed eyes.
  const d = up ? `M${x - 44} ${EYE_Y + 22}Q${x} ${EYE_Y - 44} ${x + 44} ${EYE_Y + 22}` : `M${x - 42} ${EYE_Y - 8}Q${x} ${EYE_Y + 44} ${x + 42} ${EYE_Y - 8}`;
  return <path d={d} fill="none" stroke="#f8f6ef" strokeWidth="24" strokeLinecap="round" />;
}

function Open({ x, squint = false }: { x: number; squint?: boolean }) {
  return (
    <g className="companion-eye">
      <ellipse cx={x} cy={EYE_Y} rx="30" ry={squint ? 13 : 40} fill="#f8f6ef" />
      {!squint && <circle cx={x - 9} cy={EYE_Y - 14} r="8" fill="#0b1d29" opacity=".18" />}
    </g>
  );
}

function Eyes({ mood }: { mood: Mood }) {
  switch (mood) {
    case "hello":
      return <><Arc x={EYE_L} /><Arc x={EYE_R} /></>;
    case "content":
      return <><Arc x={EYE_L} up={false} /><Arc x={EYE_R} up={false} /></>;
    case "wink":
      return <><Arc x={EYE_L} /><g className="companion-look"><Open x={EYE_R} /></g></>;
    case "excited":
      return (
        <g fill="none" stroke="#f8f6ef" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round">
          <path d={`M${EYE_L - 34} ${EYE_Y - 36}L${EYE_L + 30} ${EYE_Y}L${EYE_L - 34} ${EYE_Y + 36}`} />
          <path d={`M${EYE_R + 34} ${EYE_Y - 36}L${EYE_R - 30} ${EYE_Y}L${EYE_R + 34} ${EYE_Y + 36}`} />
        </g>
      );
    case "focused":
      return <g className="companion-look"><Open x={EYE_L} squint /><Open x={EYE_R} squint /></g>;
    case "thinking":
      return (
        <>
          <path d={`M${EYE_L - 40} ${EYE_Y + 4}H${EYE_L + 38}`} stroke="#f8f6ef" strokeWidth="22" strokeLinecap="round" />
          <g transform="translate(14 -22)"><Open x={EYE_R} /></g>
        </>
      );
    case "curious":
      return (
        <g className="companion-look">
          <Open x={EYE_L} />
          <g transform={`rotate(-8 ${EYE_R} ${EYE_Y})`}><ellipse cx={EYE_R} cy={EYE_Y} rx="34" ry="46" fill="#f8f6ef" className="companion-eye" /></g>
        </g>
      );
    default:
      return <g className="companion-look"><Open x={EYE_L} /><Open x={EYE_R} /></g>;
  }
}

export function Companion({
  mood,
  className,
  alt = "",
  follow = false,
}: {
  mood: Mood;
  className?: string;
  alt?: string;
  /** Let the open eyes follow the pointer. */
  follow?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = root.current;
    if (!follow || !node || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    function look(event: PointerEvent) {
      const rect = node!.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height * 0.5);
      const length = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, length / 400);
      node!.style.setProperty("--look-x", `${((dx / length) * reach * 22).toFixed(1)}px`);
      node!.style.setProperty("--look-y", `${((dy / length) * reach * 16).toFixed(1)}px`);
    }
    addEventListener("pointermove", look, { passive: true });
    return () => removeEventListener("pointermove", look);
  }, [follow]);
  return (
    <div ref={root} className={cn("relative", className)} role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>
      {/* Square box holding the stacked emblem layers. */}
      <div className="relative aspect-square w-full">
        {layers.map(({ name, src }) => (
          <img key={name} src={src} width="960" height="960" alt="" draggable={false} className={`zel-layer layer-${name} absolute inset-0 size-full`} />
        ))}
      </div>
      <svg viewBox="0 0 1254 1254" className="absolute inset-0 size-full" aria-hidden="true">
        <defs>
          <radialGradient id="companion-face" cx="40%" cy="30%" r="75%">
            <stop offset="0" stopColor="#1a2433" />
            <stop offset=".55" stopColor="#05080d" />
            <stop offset="1" stopColor="#000" />
          </radialGradient>
        </defs>
        {/* The obsidian face, set on the centre star with a thin brass rim, then this mood's eyes. */}
        <g className="zel-face" transform="translate(627 627) scale(0.62) translate(-622 -634)">
          <ellipse cx="622" cy="634" rx="206" ry="168" fill="#c9a962" />
          <ellipse cx="622" cy="634" rx="196" ry="158" fill="url(#companion-face)" />
          <path d="M480 540Q540 488 640 486" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="16" strokeLinecap="round" />
          <ellipse cx="760" cy="740" rx="40" ry="10" fill="#fff" opacity=".08" transform="rotate(-25 760 740)" />
          <Eyes mood={mood} />
        </g>
      </svg>
    </div>
  );
}
