"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the digest in the browser console so it can be matched to server logs.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        The page failed to load. Try again — if it keeps happening, the error was logged on the
        server.
      </p>
      {error.digest && (
        <code className="mt-4 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
          {error.digest}
        </code>
      )}
      <Button className="mt-7" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
