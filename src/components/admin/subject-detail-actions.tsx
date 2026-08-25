"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Pencil, Power } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SubjectFormDialog, type SubjectFormValues } from "@/components/admin/subject-form-dialog";

type Props = {
  subject: SubjectFormValues & { id: string };
  isPublished: boolean;
};

/** Publish / activate toggles and the edit dialog for a single subject. */
export function SubjectDetailActions({ subject, isPublished }: Props) {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<"publish" | "active" | null>(null);

  async function patch(field: "isPublished" | "isActive", value: boolean, label: string) {
    setBusy(field === "isPublished" ? "publish" : "active");
    const res = await fetch(`/api/admin/subjects/${subject.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);

    if (!res.ok) {
      toast.error(data.error ?? "Could not update the subject.");
      return;
    }

    toast.success(label);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" onClick={() => setFormOpen(true)}>
        <Pencil />
        Edit details
      </Button>

      <Button
        variant="outline"
        loading={busy === "active"}
        onClick={() =>
          patch(
            "isActive",
            !subject.isActive,
            subject.isActive ? "Subject deactivated." : "Subject activated."
          )
        }
      >
        <Power />
        {subject.isActive ? "Deactivate" : "Activate"}
      </Button>

      <Button
        variant={isPublished ? "outline" : "default"}
        loading={busy === "publish"}
        onClick={() =>
          patch(
            "isPublished",
            !isPublished,
            isPublished ? "Subject unpublished." : "Subject published."
          )
        }
      >
        {isPublished ? <EyeOff /> : <Eye />}
        {isPublished ? "Unpublish" : "Publish"}
      </Button>

      <SubjectFormDialog open={formOpen} onOpenChange={setFormOpen} subject={subject} />
    </>
  );
}
