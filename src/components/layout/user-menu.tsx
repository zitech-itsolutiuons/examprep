"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogOut, Settings2, ShieldCheck, User as UserIcon, UserPlus } from "lucide-react";

import { Avatar, AvatarFallback, initialsOf } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type UserMenuProps = {
  name: string;
  email: string;
  role: "STUDENT" | "ADMIN" | "GUEST";
  /** Which shell the menu is rendered in — drives the cross-link target. */
  context: "student" | "admin" | "guest";
};

export function UserMenu({ name, email, role, context }: UserMenuProps) {
  const isGuest = role === "GUEST";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 gap-2 pl-1 pr-2"
          aria-label="Open account menu"
        >
          <Avatar className="h-7 w-7">
            <AvatarFallback>{initialsOf(name)}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:inline">
            {name}
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
          <span className="truncate text-sm font-semibold">{name}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {isGuest ? "Guest — no account" : email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* A guest has no account to edit, so the profile link is replaced by the upgrade
            path — the one action that turns a temporary session into a lasting one. */}
        {isGuest ? (
          <DropdownMenuItem asChild>
            <Link href="/register">
              <UserPlus />
              Create an account
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <Link href="/profile">
              <UserIcon />
              Profile
            </Link>
          </DropdownMenuItem>
        )}

        {role === "ADMIN" && (
          <DropdownMenuItem asChild>
            {context === "admin" ? (
              <Link href="/dashboard">
                <Settings2 />
                Student view
              </Link>
            ) : (
              <Link href="/admin/dashboard">
                <ShieldCheck />
                Admin panel
              </Link>
            )}
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          onSelect={() => signOut({ callbackUrl: isGuest ? "/" : "/login" })}
        >
          <LogOut />
          {isGuest ? "End guest session" : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
