"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";

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

export type SubjectFormValues = {
  id?: string;
  title: string;
  description: string;
  imageUrl: string;
  durationMin: number;
  passMark: number;
  isActive: boolean;
};

const BLANK: SubjectFormValues = {
  title: "",
  description: "",
  imageUrl: "",
  durationMin: 30,
  passMark: 50,
  isActive: true,
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to create; pass a subject to edit it. */
  subject?: SubjectFormValues;
};

export function SubjectFormDialog({ open, onOpenChange, subject }: Props) {
  const router = useRouter();
  const editing = !!subject?.id;

  const [values, setValues] = React.useState<SubjectFormValues>(subject ?? BLANK);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Reset the fields each time the dialog is opened for a different subject.
  React.useEffect(() => {
    if (open) {
      setValues(subject ?? BLANK);
      setError(null);
    }
  }, [open, subject]);

  function set<K extends keyof SubjectFormValues>(key: K, value: SubjectFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const res = await fetch(
      editing ? `/api/admin/subjects/${subject!.id}` : "/api/admin/subjects",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: values.title,
          description: values.description,
          imageUrl: values.imageUrl,
          durationMin: values.durationMin,
          passMark: values.passMark,
          isActive: values.isActive,
        }),
      }
    );

    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Could not save the subject.");
      return;
    }

    toast.success(editing ? "Subject updated." : "Subject created.");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit subject" : "New subject"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Changes apply immediately. The URL slug stays fixed so existing links keep working."
              : "Create the subject first, then add questions before publishing it."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              required
              minLength={3}
              placeholder="e.g. Use of English"
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={3}
              placeholder="What this subject covers, and who it's for."
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="durationMin">Duration (minutes)</Label>
              <Input
                id="durationMin"
                type="number"
                min={1}
                max={600}
                required
                value={values.durationMin}
                onChange={(e) => set("durationMin", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="passMark">Pass mark (%)</Label>
              <Input
                id="passMark"
                type="number"
                min={1}
                max={100}
                required
                value={values.passMark}
                onChange={(e) => set("passMark", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="imageUrl">Cover image URL</Label>
            <Input
              id="imageUrl"
              type="url"
              placeholder="https://…  (optional)"
              value={values.imageUrl}
              onChange={(e) => set("imageUrl", e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5 pr-4">
              <Label htmlFor="isActive">Active</Label>
              <p className="text-xs text-muted-foreground">
                Inactive subjects are hidden from students even when published.
              </p>
            </div>
            <Switch
              id="isActive"
              checked={values.isActive}
              onCheckedChange={(checked) => set("isActive", checked)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? "Save changes" : "Create subject"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
