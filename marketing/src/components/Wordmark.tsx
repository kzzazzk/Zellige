import { cn } from "@/lib/utils";
import { wordmark, wordmarkNight } from "./brand";

/** The moodboard wordmark; the night version lifts the navy glaze to cobalt so it reads on dark. */
export function Wordmark({ className, alt = "", lazy }: { className?: string; alt?: string; lazy?: boolean }) {
  const loading = lazy ? "lazy" : undefined;
  return (
    <>
      <img src={wordmark} width="1480" height="730" alt={alt} loading={loading} className={cn("dark:hidden", className)} />
      <img src={wordmarkNight} width="1480" height="730" alt={alt} loading={loading} className={cn("hidden dark:block", className)} />
    </>
  );
}
