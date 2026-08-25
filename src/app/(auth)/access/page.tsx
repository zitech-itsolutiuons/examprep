"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, KeyRound } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

/** Why the visitor was sent here, when they didn't arrive under their own steam. */
const NOTICES: Record<string, string> = {
  "1": "Your guest session has ended. Enter a current code to carry on.",
  account: "That page needs a registered account. Guest sessions can browse subjects and sit exams.",
};

function AccessForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const notice = NOTICES[searchParams.get("expired") ?? ""] ?? NOTICES[searchParams.get("from") ?? ""];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Checked first so the user gets a specific reason — sign-in can only say yes or no.
    const check = await fetch("/api/guest/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await check.json().catch(() => ({}));

    if (!check.ok) {
      setError(data.error ?? "That code isn't right, or it has expired.");
      setLoading(false);
      return;
    }

    const res = await signIn("access-code", { code, name, redirect: false });

    if (res?.error) {
      setError("That code was just used up or rotated. Try again with a current one.");
      setLoading(false);
      return;
    }

    router.push("/subjects");
    router.refresh();
  }

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="text-xl">Practise without an account</CardTitle>
        <CardDescription>
          Enter the access code you were given. It works for 12 hours, then a new one is issued.
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {notice && !error && (
            <Alert>
              <KeyRound />
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="code">Access code</Label>
            <Input
              id="code"
              required
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder="ABCD-1234"
              // Uppercased as you type; the server also folds case, spaces, and the hyphen.
              className="font-mono uppercase tracking-widest placeholder:tracking-widest placeholder:normal-case"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              maxLength={60}
              autoComplete="name"
              placeholder="So your results are labelled"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Optional. Shown on your result and to whoever gave you the code.
            </p>
          </div>

          <Button type="submit" className="w-full" loading={loading}>
            {loading ? "Checking…" : "Start practising"}
          </Button>

          <p className="text-xs text-muted-foreground">
            You can only reach your results while this session lasts. Create an account to keep
            your history and track progress across attempts.
          </p>
        </CardContent>
      </form>

      <CardFooter className="flex-col gap-2 border-t border-border pt-6 text-sm text-muted-foreground">
        <span>
          Have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </span>
        <span>
          Want to keep your progress?{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Register free
          </Link>
        </span>
      </CardFooter>
    </Card>
  );
}

export default function AccessPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[34rem] w-full rounded-xl" />}>
      <AccessForm />
    </Suspense>
  );
}
