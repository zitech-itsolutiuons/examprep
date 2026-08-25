"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";

/** Standalone log-out control. The topbar uses <UserMenu> instead. */
export function SignOutButton({ variant = "ghost", size, className }: Partial<ButtonProps>) {
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      <LogOut />
      Log out
    </Button>
  );
}
