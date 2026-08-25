"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { homeIcon } from "@/lib/home-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import {
  HomeBlockFormDialog,
  type MetricPreview,
} from "@/components/admin/home-block-form-dialog";

export type HomeBlockKindName = "STAT" | "FEATURE" | "STEP" | "FAQ" | "LINK";

export type HomeMetricName =
  | "MANUAL"
  | "STUDENTS"
  | "SUBJECTS"
  | "QUESTIONS"
  | "ATTEMPTS"
  | "PASS_RATE"
  | "AVERAGE_SCORE";

export type HomeBlockRow = {
  id: string;
  title: string;
  body: string | null;
  icon: string | null;
  metric: HomeMetricName;
  value: string | null;
  href: string | null;
  isActive: boolean;
};

const METRIC_LABELS: Record<Exclude<HomeMetricName, "MANUAL">, string> = {
  STUDENTS: "Active students",
  SUBJECTS: "Published subjects",
  QUESTIONS: "Questions available",
  ATTEMPTS: "Exams submitted",
  PASS_RATE: "Pass rate",
  AVERAGE_SCORE: "Average score",
};

const NOUNS: Record<HomeBlockKindName, { one: string; many: string }> = {
  STAT: { one: "stat", many: "stats" },
  FEATURE: { one: "feature", many: "features" },
  STEP: { one: "step", many: "steps" },
  FAQ: { one: "question", many: "questions" },
  LINK: { one: "link", many: "links" },
};

type Props = {
  kind: HomeBlockKindName;
  blocks: HomeBlockRow[];
  metrics: MetricPreview;
  /** Numbers the rows, matching how steps render on the public page. */
  numbered?: boolean;
};

export function HomeBlockManager({ kind, blocks, metrics, numbered = false }: Props) {
  const router = useRouter();
  const noun = NOUNS[kind];

  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<HomeBlockRow | null>(null);
  const [deleting, setDeleting] = React.useState<HomeBlockRow | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [movingId, setMovingId] = React.useState<string | null>(null);

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    const res = await fetch(`/api/admin/home/blocks/${deleting.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      toast.error(data.error ?? `Could not delete the ${noun.one}.`);
      return;
    }

    toast.success("Deleted.");
    setDeleting(null);
    router.refresh();
  }

  async function toggleActive(block: HomeBlockRow) {
    setMovingId(block.id);
    const res = await fetch(`/api/admin/home/blocks/${block.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !block.isActive }),
    });
    const data = await res.json().catch(() => ({}));
    setMovingId(null);

    if (!res.ok) {
      toast.error(data.error ?? "Could not change visibility.");
      return;
    }

    toast.success(block.isActive ? "Hidden from the home page." : "Now visible.");
    router.refresh();
  }

  /** Swaps a row with its neighbour and sends the whole kind's new order. */
  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;

    const ids = blocks.map((block) => block.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];

    setMovingId(blocks[index].id);
    const res = await fetch("/api/admin/home/blocks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, ids }),
    });
    const data = await res.json().catch(() => ({}));
    setMovingId(null);

    if (!res.ok) {
      toast.error(data.error ?? "Could not reorder.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {blocks.length} {blocks.length === 1 ? noun.one : noun.many}
          {blocks.some((block) => !block.isActive) &&
            ` · ${blocks.filter((block) => !block.isActive).length} hidden`}
        </p>
        <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
          <Plus />
          Add {noun.one}
        </Button>
      </div>

      {blocks.length === 0 ? (
        <EmptyState
          icon={Plus}
          title={`No ${noun.many} yet`}
          description={`This section is hidden from the home page until it has at least one ${noun.one}.`}
          className="py-10"
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {blocks.map((block, index) => {
            const Icon = homeIcon(block.icon);
            const disabled = movingId !== null;

            return (
              <li
                key={block.id}
                className={cn(
                  "flex items-start gap-3 px-4 py-3",
                  !block.isActive && "bg-muted/40"
                )}
              >
                <div className="flex shrink-0 flex-col">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-6 w-6"
                    aria-label={`Move ${block.title} up`}
                    disabled={index === 0 || disabled}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-6 w-6"
                    aria-label={`Move ${block.title} down`}
                    disabled={index === blocks.length - 1 || disabled}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown />
                  </Button>
                </div>

                {numbered ? (
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold tabular-nums">
                    {index + 1}
                  </span>
                ) : (
                  (kind === "FEATURE" || kind === "STEP") && (
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <Icon className="h-3.5 w-3.5 text-primary" />
                    </span>
                  )
                )}

                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{block.title}</p>
                    {!block.isActive && <Badge variant="outline">Hidden</Badge>}
                    {kind === "STAT" && (
                      <Badge variant={block.metric === "MANUAL" ? "secondary" : "default"}>
                        {block.metric === "MANUAL"
                          ? block.value || "No figure"
                          : `${METRIC_LABELS[block.metric]} · ${metrics[block.metric] ?? "no data"}`}
                      </Badge>
                    )}
                  </div>
                  {block.body && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{block.body}</p>
                  )}
                  {block.href && (
                    <p className="truncate font-mono text-xs text-muted-foreground">{block.href}</p>
                  )}
                </div>

                <div className="flex shrink-0 items-center">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={block.isActive ? `Hide ${block.title}` : `Show ${block.title}`}
                    disabled={disabled}
                    onClick={() => toggleActive(block)}
                  >
                    <EyeOff className={cn(!block.isActive && "text-warning")} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${block.title}`}
                    onClick={() => setEditing(block)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${block.title}`}
                    onClick={() => setDeleting(block)}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <HomeBlockFormDialog
        open={creating}
        onOpenChange={setCreating}
        kind={kind}
        metrics={metrics}
      />

      <HomeBlockFormDialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        kind={kind}
        block={editing ?? undefined}
        metrics={metrics}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.title}”?`}
        description={`This removes the ${noun.one} from the home page for good. To keep it but hide it, turn its visibility off instead.`}
        confirmLabel="Delete"
        loading={busy}
        onConfirm={handleDelete}
      />
    </div>
  );
}
