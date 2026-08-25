"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Starts (or resumes) an attempt, then hands control to the exam runner.
 *
 * The attempt row is created by the server, which also decides the attempt number, so
 * a retake can't overwrite an earlier one from here.
 */
export function StartExamButton({
  subjectId,
  mode,
  className,
}: {
  subjectId: string;
  mode: "start" | "resume" | "retake";
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function start() {
    setLoading(true);

    const res = await fetch("/api/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectId }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setLoading(false);
      toast.error(data.error ?? "Could not start this exam.");
      return;
    }

    if (data.resumed) toast.info("Picking up where you left off.");
    // Leave the button disabled through the transition so it can't be double-fired.
    router.push(`/exam/${data.attemptId}`);
  }

  return (
    <Button
      className={className}
      variant={mode === "resume" ? "success" : "default"}
      size="lg"
      loading={loading}
      onClick={start}
    >
      {!loading && (mode === "retake" ? <RotateCcw /> : <Play />)}
      {mode === "resume" ? "Resume exam" : mode === "retake" ? "Retake exam" : "Start exam"}
    </Button>
  );
}
