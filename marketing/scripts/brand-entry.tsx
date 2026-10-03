// SSR entry for scripts/build-brand.mjs: Zel's face for every mood as standalone
// SVG, from the same component the landing renders.
import { renderToStaticMarkup } from "react-dom/server";
import { moods, ZelFace } from "../src/components/ZelFace";

export function faces(): Record<string, string> {
  return Object.fromEntries(moods.map((mood) => [
    mood,
    renderToStaticMarkup(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1254 1254" width="1254" height="1254"><ZelFace mood={mood} /></svg>,
    ),
  ]));
}
