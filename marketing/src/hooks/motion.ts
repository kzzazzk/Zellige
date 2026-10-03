import { useEffect, useState } from "react";

/** Starts as "reduced" so the prerendered markup and first client render agree. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Content below the fold rises in once; anything already on screen stays put. */
export function useReveals(reduced: boolean) {
  useEffect(() => {
    const elements = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];
    if (reduced || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.remove("reveal-ready");
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.08 });
    for (const element of elements) {
      if (element.getBoundingClientRect().top < innerHeight) continue;
      element.classList.add("reveal-ready");
      observer.observe(element);
    }
    return () => {
      observer.disconnect();
      elements.forEach((element) => element.classList.remove("reveal-ready"));
    };
  }, [reduced]);
}
