import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetTitle } from "../components/ui/sheet";

interface Props {
  sidebar: ReactNode;
  mobileNav: boolean;
  onMobileNavChange: (open: boolean) => void;
  children: ReactNode;
  overlays: ReactNode;
}

export function WorkspaceLayout({ sidebar, mobileNav, onMobileNavChange, children, overlays }: Props) {
  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-64 shrink-0 border-r border-seam-soft md:block">
        {sidebar}
      </aside>
      <Sheet open={mobileNav} onOpenChange={onMobileNavChange}>
        <SheetContent side="left" className="w-72 p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Conversaciones</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>
      <main className="flex min-w-0 flex-1 flex-col">
        {children}
      </main>
      {overlays}
    </div>
  );
}
