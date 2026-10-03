import { ArrowUp } from "lucide-react";
import { Wordmark } from "./Wordmark";
import { Companion } from "./Companion";
import { useT } from "@/i18n";

export function Footer() {
  const t = useT();
  return (
    <footer className="overflow-hidden px-6 pt-[46px] pb-6 sm:px-[clamp(24px,4.5vw,80px)] sm:pt-20 sm:pb-5">
      <div className="mb-8 flex items-start justify-between gap-5 border-b border-border pb-6 sm:mb-[38px] sm:items-center">
        <p className="max-w-[170px] text-xs leading-[1.6] text-muted-foreground sm:max-w-none sm:text-[13px]">{t.footer.tagline}</p>
        <a className="inline-flex items-center gap-2.5 text-xs text-muted-foreground decoration-brass underline-offset-[6px] hover:underline sm:gap-5 sm:py-3 sm:text-[13px]" href="#inicio">
          {t.footer.top} <ArrowUp aria-hidden="true" strokeWidth={1.3} className="size-[18px]" />
        </a>
      </div>
      <a className="flex items-center justify-between gap-[4vw]" href="#inicio" aria-label={t.footer.home}>
        <span className="w-[78%] max-w-[1200px]"><Wordmark lazy className="w-full drop-shadow-[0_18px_24px_#0f3b6e2e]" /></span>
        <span className="relative w-[18vw] max-w-[220px] shrink-0 sm:w-[clamp(84px,15vw,220px)]">
          <span className="absolute -top-[18%] right-[78%] hidden rounded-2xl rounded-br-sm border border-border bg-popover px-3.5 py-2 text-sm whitespace-nowrap text-foreground shadow-[0_12px_30px_-14px_rgb(20_43_53/0.4)] sm:block">
            {t.zel.bye} <span className="text-muted-foreground">— Zel</span>
          </span>
          <Companion mood="wink" follow className="w-full drop-shadow-[0_18px_22px_rgb(11_29_41/0.35)]" />
        </span>
      </a>
    </footer>
  );
}
