"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { HOME_ICON_NAMES, homeIcon } from "@/lib/home-icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { HomeBlockRow, HomeBlockKindName, HomeMetricName } from "@/components/admin/home-block-manager";

export type MetricPreview = Record<Exclude<HomeMetricName, "MANUAL">, string | null>;

type FormValues = {
  title: string;
  body: string;
  icon: string;
  metric: HomeMetricName;
  value: string;
  href: string;
  isActive: boolean;
};

const BLANK: FormValues = {
  title: "",
  body: "",
  icon: "sparkles",
  metric: "MANUAL",
  value: "",
  href: "",
  isActive: true,
};

/** Per-kind wording, so one dialog reads naturally for a stat, an FAQ entry, and a link. */
const COPY: Record<
  HomeBlockKindName,
  {
    noun: string;
    titleLabel: string;
    titlePlaceholder: string;
    bodyLabel?: string;
    bodyPlaceholder?: string;
    hint: string;
  }
> = {
  STAT: {
    noun: "stat",
    titleLabel: "Label",
    titlePlaceholder: "e.g. Exams sat",
    hint: "Shown in the band under the hero. Pick a live metric to count it from the database, or enter a fixed figure.",
  },
  FEATURE: {
    noun: "feature",
    titleLabel: "Title",
    titlePlaceholder: "e.g. Graded on the server",
    bodyLabel: "Description",
    bodyPlaceholder: "One or two sentences on what this gives the student.",
    hint: "Feature cards appear in a three-column grid.",
  },
  STEP: {
    noun: "step",
    titleLabel: "Title",
    titlePlaceholder: "e.g. Sit the exam",
    bodyLabel: "Description",
    bodyPlaceholder: "What the student does at this step.",
    hint: "Steps are numbered automatically in the order they appear here.",
  },
  FAQ: {
    noun: "question",
    titleLabel: "Question",
    titlePlaceholder: "e.g. Can I retake an exam?",
    bodyLabel: "Answer",
    bodyPlaceholder: "The answer, in plain language.",
    hint: "Answers are in the page source even while collapsed, so search engines can read them.",
  },
  LINK: {
    noun: "link",
    titleLabel: "Link text",
    titlePlaceholder: "e.g. Contact us",
    hint: "Shown on the right-hand side of the footer.",
  },
};

const METRIC_LABELS: Record<HomeMetricName, string> = {
  MANUAL: "Fixed text",
  STUDENTS: "Active students",
  SUBJECTS: "Published subjects",
  QUESTIONS: "Questions available",
  ATTEMPTS: "Exams submitted",
  PASS_RATE: "Pass rate",
  AVERAGE_SCORE: "Average score",
};

const METRIC_ORDER: HomeMetricName[] = [
  "MANUAL",
  "STUDENTS",
  "SUBJECTS",
  "QUESTIONS",
  "ATTEMPTS",
  "PASS_RATE",
  "AVERAGE_SCORE",
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: HomeBlockKindName;
  /** Omit to create; pass a block to edit it. */
  block?: HomeBlockRow;
  metrics: MetricPreview;
};

export function HomeBlockFormDialog({ open, onOpenChange, kind, block, metrics }: Props) {
  const router = useRouter();
  const editing = !!block;
  const copy = COPY[kind];

  const [values, setValues] = React.useState<FormValues>(BLANK);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setValues(
      block
        ? {
            title: block.title,
            body: block.body ?? "",
            icon: block.icon ?? "sparkles",
            metric: block.metric,
            value: block.value ?? "",
            href: block.href ?? "",
            isActive: block.isActive,
          }
        : BLANK
    );
    setError(null);
  }, [open, block]);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * Only the columns this kind actually uses are sent — the update schema is strict, and a
   * stat has no business writing an `href`.
   */
  function payload() {
    const base = { title: values.title.trim(), isActive: values.isActive };

    switch (kind) {
      case "STAT":
        return { ...base, metric: values.metric, value: values.value.trim() };
      case "FEATURE":
      case "STEP":
        return { ...base, body: values.body.trim(), icon: values.icon };
      case "FAQ":
        return { ...base, body: values.body.trim() };
      case "LINK":
        return { ...base, href: values.href.trim() };
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const res = await fetch(
      editing ? `/api/admin/home/blocks/${block!.id}` : "/api/admin/home/blocks",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? payload() : { kind, ...payload() }),
      }
    );

    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? `Could not save the ${copy.noun}.`);
      return;
    }

    toast.success(editing ? "Saved." : `${copy.noun[0].toUpperCase()}${copy.noun.slice(1)} added.`);
    onOpenChange(false);
    router.refresh();
  }

  const showIcon = kind === "FEATURE" || kind === "STEP";
  const showBody = !!copy.bodyLabel;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Edit ${copy.noun}` : `New ${copy.noun}`}
          </DialogTitle>
          <DialogDescription>{copy.hint}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="block-title">{copy.titleLabel}</Label>
            <Input
              id="block-title"
              required
              maxLength={160}
              placeholder={copy.titlePlaceholder}
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>

          {showBody && (
            <div className="space-y-1.5">
              <Label htmlFor="block-body">{copy.bodyLabel}</Label>
              <Textarea
                id="block-body"
                rows={3}
                maxLength={600}
                required={kind === "FAQ"}
                placeholder={copy.bodyPlaceholder}
                value={values.body}
                onChange={(e) => set("body", e.target.value)}
              />
            </div>
          )}

          {kind === "STAT" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="block-metric">Source</Label>
                <Select
                  value={values.metric}
                  onValueChange={(next) => set("metric", next as HomeMetricName)}
                >
                  <SelectTrigger id="block-metric">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METRIC_ORDER.map((metric) => {
                      const live = metric === "MANUAL" ? null : metrics[metric];
                      return (
                        <SelectItem key={metric} value={metric}>
                          {METRIC_LABELS[metric]}
                          {live ? ` — ${live}` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="block-value">
                  Figure{values.metric === "MANUAL" ? "" : " (fallback)"}
                </Label>
                <Input
                  id="block-value"
                  maxLength={24}
                  required={values.metric === "MANUAL"}
                  placeholder={values.metric === "MANUAL" ? "e.g. 1,200+" : "Shown if there's no data yet"}
                  value={values.value}
                  onChange={(e) => set("value", e.target.value)}
                />
              </div>
            </div>
          )}

          {kind === "LINK" && (
            <div className="space-y-1.5">
              <Label htmlFor="block-href">Destination</Label>
              <Input
                id="block-href"
                required
                maxLength={500}
                placeholder="/register or https://…"
                value={values.href}
                onChange={(e) => set("href", e.target.value)}
              />
            </div>
          )}

          {showIcon && (
            <div className="space-y-1.5">
              <Label>Icon</Label>
              <IconPicker value={values.icon} onChange={(next) => set("icon", next)} />
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5 pr-4">
              <Label htmlFor="block-active">Visible</Label>
              <p className="text-xs text-muted-foreground">
                Turn off to hide this {copy.noun} from the home page without deleting it.
              </p>
            </div>
            <Switch
              id="block-active"
              checked={values.isActive}
              onCheckedChange={(checked) => set("isActive", checked)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? "Save changes" : `Add ${copy.noun}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A grid of the allowed icons — quicker to scan than a dropdown of names. */
function IconPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1.5 rounded-lg border border-border p-2 sm:grid-cols-10">
      {HOME_ICON_NAMES.map((name) => {
        const Icon = homeIcon(name);
        const selected = value === name;

        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            aria-label={name}
            aria-pressed={selected}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
