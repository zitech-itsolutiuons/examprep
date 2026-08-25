import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-muted/40">
      {/* Soft radial wash so the card reads as a raised surface. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.12),transparent_70%)]"
      />

      <header className="relative flex h-14 items-center justify-between px-4 sm:px-6">
        <Brand href="/" />
        <ThemeToggle />
      </header>

      <div className="relative flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">{children}</div>
      </div>

      <footer className="relative py-6 text-center text-xs text-muted-foreground">
        Practice with confidence. Every attempt is saved.
      </footer>
    </div>
  );
}
