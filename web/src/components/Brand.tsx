import { cn } from "../lib/utils";

type BrandImageProps = { className?: string; alt?: string };

/** Decorative by default when paired with the app name. */
export function BrandEmblem({ className, alt = "" }: BrandImageProps) {
  return (
    <img
      src="/brand/zellige-emblem.png"
      alt={alt}
      width={1254}
      height={1254}
      className={cn("size-9 shrink-0 object-contain", className)}
      draggable={false}
      decoding="async"
    />
  );
}

/** The moodboard wordmark; on dark surfaces it switches to ivory and gold. */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0", className)} role="img" aria-label="zellige">
      <img src="/brand/zellige-wordmark.svg" alt="" width={1480} height={730} className="h-full w-auto dark:hidden" draggable={false} />
      <img src="/brand/zellige-wordmark-night.svg" alt="" width={1480} height={730} className="hidden h-full w-auto dark:block" draggable={false} />
    </span>
  );
}

/** Reusable static greeting; never represents a running agent. */
export function BrandCompanion({ className, alt = "Zel, la mascota de Zellige" }: BrandImageProps) {
  return (
    <img
      src="/brand/zellige-companion-hello.png"
      alt={alt}
      width={1254}
      height={1254}
      className={cn("size-44 object-contain sm:size-52", className)}
      draggable={false}
      decoding="async"
    />
  );
}

/** Zel on the empty chat: the mascot alone, floating, introducing itself. */
export function BrandGreeting({ className }: { className?: string }) {
  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      <p className="relative mb-3 rounded-2xl border bg-popover px-4 py-2 text-sm text-foreground shadow-[0_12px_30px_-16px_rgb(0_0_0/0.45)] after:absolute after:-bottom-[7px] after:left-1/2 after:size-3 after:-translate-x-1/2 after:rotate-45 after:border-r after:border-b after:bg-popover">
        <strong className="font-semibold">¡Hola! Soy Zel.</strong> ¿Por dónde empezamos?
      </p>
      <BrandCompanion alt="Zel, la mascota de Zellige" className="zel-float size-40 drop-shadow-[0_18px_22px_rgb(0_0_0/0.3)] sm:size-48" />
      <div aria-hidden="true" className="-mt-3 h-3 w-24 rounded-[50%] bg-black/15 blur-md dark:bg-black/40" />
    </div>
  );
}

/** Eight-point zellige star drawn like a Lucide icon, so it sits beside them. */
export function StarGlyph({ className, filled = false }: { className?: string; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
      className={cn("size-4 shrink-0", className)}
    >
      <path d="M12 2.5 14.8 6.2 19.4 4.6 17.8 9.2 21.5 12 17.8 14.8 19.4 19.4 14.8 17.8 12 21.5 9.2 17.8 4.6 19.4 6.2 14.8 2.5 12 6.2 9.2 4.6 4.6 9.2 6.2Z" />
    </svg>
  );
}
