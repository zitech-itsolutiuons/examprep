"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";

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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <Card className="shadow-md">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-success/10">
            <MailCheck className="h-5 w-5 text-success" />
          </div>
          <CardTitle className="text-xl">Check your email</CardTitle>
          <CardDescription>
            If an account exists for <span className="font-medium text-foreground">{email}</span>,
            we&apos;ve sent a link to reset your password. It expires in 1 hour.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center pt-2">
          <Button variant="outline" asChild>
            <Link href="/login">
              <ArrowLeft />
              Back to login
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="text-xl">Reset your password</CardTitle>
        <CardDescription>Enter your email and we&apos;ll send you a reset link.</CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" loading={loading}>
            {loading ? "Sending…" : "Send reset link"}
          </Button>
        </CardContent>
      </form>

      <CardFooter className="justify-center border-t border-border pt-6">
        <Link
          href="/login"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Back to login
        </Link>
      </CardFooter>
    </Card>
  );
}
