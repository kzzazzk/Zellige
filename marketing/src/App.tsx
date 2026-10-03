import { useReducedMotion, useReveals } from "@/hooks/motion";
import { ceramic } from "@/components/brand";
import { Footer } from "@/components/Footer";
import { Guide } from "@/components/Guide";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { Band, Branches, Panorama, Project } from "@/components/Sections";
import { Story } from "@/components/Story";
import { useT } from "@/i18n";

export function App() {
  const t = useT();
  const reduced = useReducedMotion();
  useReveals(reduced);
  return (
    <>
      <a className="fixed top-2.5 left-2.5 z-20 -translate-y-[200%] bg-surface p-3.5 focus:translate-y-0" href="#contenido">{t.skip}</a>
      <svg className="absolute size-0 overflow-hidden" aria-hidden="true" focusable="false">
        <defs>
          <pattern id="ceramic" patternUnits="userSpaceOnUse" width="280" height="280">
            <image href={ceramic} width="280" height="280" />
          </pattern>
        </defs>
      </svg>
      <Header />
      <main id="contenido">
        <Hero reduced={reduced} />
        <Band />
        <Story reduced={reduced} />
        <Panorama reduced={reduced} />
        <Branches />
        <Band tall />
        <Project />
      </main>
      <Footer />
      <Guide />
    </>
  );
}
