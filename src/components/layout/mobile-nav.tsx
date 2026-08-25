"use client";

import * as React from "react";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Brand } from "@/components/layout/brand";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import type { NavContext } from "@/components/layout/nav-items";

/** Hamburger + slide-out nav shown below the `lg` breakpoint. */
export function MobileNav({
  context,
  brandHref,
  brandSuffix,
  footer,
}: {
  context: NavContext;
  brandHref: string;
  brandSuffix?: string;
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex h-14 items-center border-b border-border px-5">
          <Brand href={brandHref} suffix={brandSuffix} />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <SidebarNav context={context} onNavigate={() => setOpen(false)} />
        </div>
        {footer && <div className="border-t border-border p-3">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
