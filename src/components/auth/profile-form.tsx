"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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

type Props = {
  user: { id: string; name: string; email: string; role: string; createdAt: Date | string };
};

export function ProfileForm({ user }: Props) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);

  const dirty = name.trim() !== user.name;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const res = await fetch("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not update your profile.");
      return;
    }

    toast.success("Profile updated.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account details</CardTitle>
        <CardDescription>Your name is shown on your attempts and results.</CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              value={name}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={user.email} disabled />
            <p className="text-xs text-muted-foreground">
              Email is used to log in and can&apos;t be changed here.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant={user.role === "ADMIN" ? "warning" : "outline"}>{user.role}</Badge>
            <span className="text-xs text-muted-foreground">
              Joined{" "}
              {new Date(user.createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
        </CardContent>

        <CardFooter className="justify-end gap-2 border-t border-border pt-6">
          {dirty && (
            <Button type="button" variant="ghost" onClick={() => setName(user.name)}>
              Reset
            </Button>
          )}
          <Button type="submit" loading={saving} disabled={!dirty || !name.trim()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
