"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, KeyRound, RotateCcw, Trash2 } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";

export type GuestAccessRow = {
  isEnabled: boolean;
  code: string;
  issuedAt: string;
  expiresAt: string;
  generation: number;
  redemptions: number;
  maxRedemptions: number | null;
  lastPurgeAt: string | null;
  activeGuests: number;
  lapsedGuests: number;
  guestAttempts: number;
};

function remainingLabel(expiresAt: number, now: number) {
  const ms = expiresAt - now;
  if (ms <= 0) return "rolling on next visit";
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes}m left`;
  return `${hours}h ${rest}m left`;
}

export function GuestAccessManager({ summary }: { summary: GuestAccessRow }) {
  const router = useRouter();

  const [busy, setBusy] = React.useState<string | null>(null);
  const [resetting, setResetting] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [cap, setCap] = React.useState(
    summary.maxRedemptions === null ? "" : String(summary.maxRedemptions)
  );

  // Ticks so the "left" label stays honest without a reload.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const expiresAt = new Date(summary.expiresAt).getTime();

  async function act(action: string, extra: Record<string, unknown> = {}, label = "Saved.") {
    setBusy(action);
    const res = await fetch("/api/admin/guest-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);

    if (!res.ok) {
      toast.error(data.error ?? "That didn't work.");
      return null;
    }

    toast.success(label);
    router.refresh();
    return data;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(summary.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the code and copy it manually.");
    }
  }

  const capChanged =
    (cap.trim() === "" ? null : Number(cap)) !== summary.maxRedemptions &&
    (cap.trim() === "" || Number.isFinite(Number(cap)));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>Current code</CardTitle>
              <CardDescription>
                Share this with anyone who should practise without registering.
              </CardDescription>
            </div>
            <Badge variant={summary.isEnabled ? "success" : "outline"}>
              {summary.isEnabled ? "Guest access on" : "Guest access off"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="font-mono text-3xl font-semibold tracking-[0.2em]">{summary.code}</p>
              <p className="text-xs text-muted-foreground">
                {remainingLabel(expiresAt, now)} &middot; rolls automatically every 12 hours
              </p>
            </div>
            <Button variant="outline" onClick={copy} className="shrink-0">
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy code"}
            </Button>
          </div>

          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Redeemed" value={`${summary.redemptions}${summary.maxRedemptions !== null ? ` / ${summary.maxRedemptions}` : ""}`} />
            <Stat label="Guests online" value={summary.activeGuests} />
            <Stat label="Guest attempts" value={summary.guestAttempts} />
            <Stat label="Revocations" value={summary.generation - 1} />
          </dl>

          <Alert>
            <KeyRound />
            <AlertDescription>
              The automatic 12-hour roll issues a new code but lets anyone already practising
              finish. <span className="font-medium text-foreground">Reset &amp; revoke</span> also
              signs every guest out immediately &mdash; use it if a code has leaked.
            </AlertDescription>
          </Alert>
        </CardContent>

        <CardFooter className="justify-end border-t border-border pt-6">
          <Button
            variant="destructive"
            loading={busy === "reset"}
            onClick={() => setResetting(true)}
          >
            <RotateCcw />
            Reset &amp; revoke
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Turn account-free access off entirely, or cap how many people one code can admit.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5 pr-4">
              <Label htmlFor="guest-enabled">Offer guest access</Label>
              <p className="text-xs text-muted-foreground">
                When off, the code stops working and current guest sessions end. The
                &ldquo;Have a code?&rdquo; link disappears from the home page.
              </p>
            </div>
            <Switch
              id="guest-enabled"
              checked={summary.isEnabled}
              disabled={busy !== null}
              onCheckedChange={(checked) =>
                act(
                  "toggle",
                  { isEnabled: checked },
                  checked ? "Guest access enabled." : "Guest access disabled."
                )
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="guest-cap">Redemption limit per code</Label>
            <div className="flex gap-2">
              <Input
                id="guest-cap"
                type="number"
                min={1}
                max={100000}
                placeholder="No limit"
                value={cap}
                onChange={(e) => setCap(e.target.value)}
              />
              <Button
                variant="outline"
                className="shrink-0"
                disabled={!capChanged || busy !== null}
                loading={busy === "cap"}
                onClick={() =>
                  act(
                    "cap",
                    { maxRedemptions: cap.trim() === "" ? null : Number(cap) },
                    "Limit updated."
                  )
                }
              >
                Save limit
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Counts redemptions of the current code and resets when it rolls. Leave blank for
              no limit &mdash; a cap is what stops a leaked code creating unlimited sessions.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Retention</CardTitle>
          <CardDescription>
            Guest records are deleted 30 days after their session ends, along with their
            attempts. The sweep normally runs with the 12-hour roll, so there is no scheduled job.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            <Stat label="Lapsed guests retained" value={summary.lapsedGuests} />
            <Stat
              label="Last sweep"
              value={
                summary.lastPurgeAt
                  ? new Date(summary.lastPurgeAt).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Not yet run"
              }
            />
          </dl>
        </CardContent>

        <CardFooter className="justify-end border-t border-border pt-6">
          <Button
            variant="outline"
            loading={busy === "purge"}
            disabled={busy !== null}
            onClick={() => act("purge", {}, "Retention sweep finished.")}
          >
            <Trash2 />
            Run sweep now
          </Button>
        </CardFooter>
      </Card>

      <ConfirmDialog
        open={resetting}
        onOpenChange={setResetting}
        title="Reset the access code?"
        description={
          summary.activeGuests > 0
            ? `A new code is issued and all ${summary.activeGuests} guest${
                summary.activeGuests === 1 ? "" : "s"
              } currently practising are signed out at once. Anyone mid-exam loses that attempt. Their past results stay in the attempts browser.`
            : "A new code is issued and every guest session is invalidated. No one is practising right now, so nothing in progress is lost."
        }
        confirmLabel="Reset & revoke"
        loading={busy === "reset"}
        onConfirm={async () => {
          const ok = await act("reset", {}, "New code issued. All guest sessions revoked.");
          if (ok) setResetting(false);
        }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
      <dt className="mt-0.5 text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}
