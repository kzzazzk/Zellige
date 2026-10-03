import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import layerCentre from "@/assets/layer-centre.webp";
import layerCobalt from "@/assets/layer-cobalt.webp";
import layerCrown from "@/assets/layer-crown.webp";
import layerPoints from "@/assets/layer-points.webp";

import { ZelFace, type Mood } from "./ZelFace";

export type { Mood };

/*
 * Zel is the standard emblem itself, with an obsidian face on its centre star.
 * The body is the emblem's four colour layers (scripts/build-layers.mjs), stacked
 * so they can also be shown one by one; the face is SVG, so Zel can change
 * expression, blink and look around (ZelFace.tsx).
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
      node!.style.setProperty("--look-x", `${((dx / length) * reach * 70).toFixed(1)}px`);
      node!.style.setProperty("--look-y", `${((dy / length) * reach * 50).toFixed(1)}px`);
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
      <svg viewBox="0 0 1254 1254" className="zel-face-layer absolute inset-0 size-full" aria-hidden="true">
        <ZelFace mood={mood} />
      </svg>
    </div>
  );
}
