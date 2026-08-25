"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Save shell for one group of home-page settings.
 *
 * Each card PATCHes only the keys it was handed, which is why the settings endpoint takes a
 * partial body: an admin editing the hero shouldn't be able to overwrite the FAQ heading
 * with a stale value from when the tab was opened.
 *
 * Fields are supplied as a render prop rather than a descriptor list so each tab spells out
 * its own inputs — the labels, help text, and grouping differ enough per section that a
 * generic field renderer would be harder to read than the markup it replaced.
 */
export function HomeSettingsCard<T extends Record<string, unknown>>({
  title,
  description,
  initial,
  children,
}: {
  title: string;
  description?: string;
  initial: T;
  children: (helpers: {
    values: T;
    set: <K extends keyof T>(key: K, value: T[K]) => void;
  }) => React.ReactNode;
}) {
  const router = useRouter();

  // Serialising the server values gives a dependency that is stable across renders (the
  // parent rebuilds `initial` every time), so the form re-syncs after a refresh brings new
  // data without looping on its own setState.
  const snapshot = React.useMemo(() => JSON.stringify(initial), [initial]);

  const [values, setValues] = React.useState<T>(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setValues(JSON.parse(snapshot) as T);
    setError(null);
  }, [snapshot]);

  function set<K extends keyof T>(key: K, value: T[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const dirty = JSON.stringify(values) !== snapshot;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const res = await fetch("/api/admin/home", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Could not save these changes.");
      return;
    }

    toast.success("Home page updated.");
    router.refresh();
  }

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {children({ values, set })}
        </CardContent>

        <CardFooter className="justify-end gap-2 border-t border-border pt-6">
          <Button
            type="button"
            variant="ghost"
            disabled={!dirty || saving}
            onClick={() => setValues(JSON.parse(snapshot) as T)}
          >
            Discard
          </Button>
          <Button type="submit" loading={saving} disabled={!dirty}>
            Save changes
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
