"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";

export type TopicRow = {
  id: string;
  name: string;
  description: string | null;
  questionCount: number;
};

export function TopicManager({
  subjectId,
  topics,
}: {
  subjectId: string;
  topics: TopicRow[];
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<TopicRow | null>(null);
  const [deleting, setDeleting] = React.useState<TopicRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error("Topic name must be at least 2 characters.");
      return;
    }

    setCreating(true);
    const res = await fetch("/api/admin/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectId, name: trimmed }),
    });
    const data = await res.json().catch(() => ({}));
    setCreating(false);

    if (!res.ok) {
      toast.error(data.error ?? "Could not add the topic.");
      return;
    }

    setName("");
    toast.success("Topic added.");
    router.refresh();
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    const res = await fetch(`/api/admin/topics/${deleting.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      toast.error(data.error ?? "Could not delete the topic.");
      return;
    }

    toast.success("Topic deleted.");
    setDeleting(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="New topic name, e.g. Comprehension"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
        />
        <Button type="submit" variant="outline" loading={creating} className="sm:w-auto">
          <Plus />
          Add topic
        </Button>
      </form>

      {topics.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No topics yet"
          description="Topics are optional — they let you group questions and filter them later."
          className="py-10"
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {topics.map((topic) => (
            <li key={topic.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{topic.name}</p>
                {topic.description && (
                  <p className="truncate text-xs text-muted-foreground">{topic.description}</p>
                )}
              </div>
              <Badge variant="secondary">
                {topic.questionCount} {topic.questionCount === 1 ? "question" : "questions"}
              </Badge>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit ${topic.name}`}
                onClick={() => setEditing(topic)}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${topic.name}`}
                onClick={() => setDeleting(topic)}
              >
                <Trash2 className="text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <TopicEditDialog
        topic={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description="The topic is removed, but its questions stay in the subject and simply become untagged."
        confirmLabel="Delete topic"
        loading={busy}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function TopicEditDialog({
  topic,
  onClose,
  onSaved,
}: {
  topic: TopicRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (topic) {
      setName(topic.name);
      setDescription(topic.description ?? "");
    }
  }, [topic]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic) return;

    setSaving(true);
    const res = await fetch(`/api/admin/topics/${topic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      toast.error(data.error ?? "Could not update the topic.");
      return;
    }

    toast.success("Topic updated.");
    onSaved();
  }

  return (
    <Dialog open={!!topic} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit topic</DialogTitle>
          <DialogDescription>
            Renaming a topic keeps every question that is already tagged with it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="topic-name">Name</Label>
            <Input
              id="topic-name"
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="topic-description">Description</Label>
            <Textarea
              id="topic-description"
              rows={2}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
