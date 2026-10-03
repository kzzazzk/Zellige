import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Companion, type Mood } from "./Companion";
import { useT } from "@/i18n";

// What the companion says as each part of the page comes into view.
const stops: { id: "panorama" | "ramas" | "proyecto"; mood: Mood }[] = [
  { id: "panorama", mood: "excited" },
  { id: "ramas", mood: "curious" },
  { id: "proyecto", mood: "focused" },
];

/** A small companion that follows the reader between the hero and the footer. */
export function Guide() {
  const t = useT();
  const [stop, setStop] = useState(-1);
  const [visible, setVisible] = useState(false);
  const [talking, setTalking] = useState(false);
  const quiet = useRef(0);

  useEffect(() => {
    const hero = document.getElementById("inicio");
    const story = document.getElementById("piezas");
    const footer = document.querySelector("footer");
    const shown = { hero: true, story: false, footer: false };
    // Speak up briefly whenever a new part of the page arrives.
    function speak() {
      setTalking(true);
      clearTimeout(quiet.current);
      quiet.current = window.setTimeout(() => setTalking(false), 3800);
    }
    const edges = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === hero) shown.hero = entry.isIntersecting;
        else if (entry.target === story) shown.story = entry.isIntersecting;
        else shown.footer = entry.isIntersecting;
      }
      setVisible(!shown.hero && !shown.story && !shown.footer);
    }, { threshold: 0.02 });
    if (hero) edges.observe(hero);
    if (story) edges.observe(story);
    if (footer) edges.observe(footer);
    const sections = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        setStop(stops.findIndex(({ id }) => id === entry.target.id));
        if (!shown.hero && !shown.story && !shown.footer) speak();
      }
    }, { rootMargin: "-45% 0px -45% 0px" });
    for (const { id } of stops) {
      const node = document.getElementById(id);
      if (node) sections.observe(node);
    }
    return () => {
      clearTimeout(quiet.current);
      edges.disconnect();
      sections.disconnect();
    };
  }, []);

  const current = stops[Math.max(stop, 0)];
  return (
    <div
      aria-hidden="true"
      onPointerEnter={() => setTalking(true)}
      onPointerLeave={() => setTalking(false)}
      className={cn(
        "fixed right-4 bottom-4 z-30 flex items-end gap-2 transition-[opacity,translate] duration-500 sm:right-6 sm:bottom-6",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0",
      )}
    >
      <p
        className={cn(
          "mb-10 max-w-[200px] origin-bottom-right rounded-2xl rounded-br-sm border border-border bg-popover px-3.5 py-2.5 text-[13px] leading-snug text-foreground shadow-[0_12px_30px_-14px_rgb(20_43_53/0.4)] transition-[opacity,scale] duration-300 sm:max-w-[240px] sm:text-sm",
          talking ? "scale-100 opacity-100" : "scale-90 opacity-0",
        )}
      >
        {t.guide[current.id]}
      </p>
      <Companion key={current.mood} mood={current.mood} follow className="w-16 shrink-0 drop-shadow-[0_14px_16px_rgb(11_29_41/0.35)] motion-safe:animate-float sm:w-24" />
    </div>
  );
}
