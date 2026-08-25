"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CSV_TEMPLATE } from "@/server/services/question-import";

type RowError = { line: number; message: string };
type SkippedRow = { line: number; text: string };

type ImportResult = {
  imported: number;
  skipped: SkippedRow[];
  topicsCreated: number;
};

export function CsvImportDialog({
  open,
  onOpenChange,
  subjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [rowErrors, setRowErrors] = React.useState<RowError[]>([]);
  const [result, setResult] = React.useState<ImportResult | null>(null);

  React.useEffect(() => {
    if (open) {
      setFile(null);
      setError(null);
      setRowErrors([]);
      setResult(null);
    }
  }, [open]);

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "examprep-questions-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleUpload() {
    if (!file) return;

    setUploading(true);
    setError(null);
    setRowErrors([]);
    setResult(null);

    const form = new FormData();
    form.append("file", file);

    const res = await fetch(`/api/admin/subjects/${subjectId}/questions/import`, {
      method: "POST",
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    setUploading(false);

    if (!res.ok) {
      setError(data.error ?? "The import failed.");
      setRowErrors(Array.isArray(data.rowErrors) ? data.rowErrors : []);
      return;
    }

    setResult(data as ImportResult);
    if (data.imported > 0) {
      toast.success(`Imported ${data.imported} question${data.imported === 1 ? "" : "s"}.`);
      router.refresh();
    } else {
      toast.info("Nothing new to import — every row already exists.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>Import questions from CSV</DialogTitle>
          <DialogDescription>
            Every row becomes one question. Nothing is saved unless all rows are valid.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <p className="font-medium">Expected columns</p>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              <li>
                <code className="text-foreground">question</code> — the question text (required)
              </li>
              <li>
                <code className="text-foreground">optionA…optionH</code> — answer options, at least
                two (required)
              </li>
              <li>
                <code className="text-foreground">correct</code> — a letter, a position, or the
                option text. Separate several with <code className="text-foreground">|</code>{" "}
                (required)
              </li>
              <li>
                <code className="text-foreground">explanation</code>,{" "}
                <code className="text-foreground">topic</code>,{" "}
                <code className="text-foreground">difficulty</code>,{" "}
                <code className="text-foreground">points</code>,{" "}
                <code className="text-foreground">type</code> — optional
              </li>
            </ul>
            <Button variant="outline" size="sm" className="mt-3" onClick={downloadTemplate}>
              <Download />
              Download template
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="csv-file">CSV file</Label>
            <input
              ref={inputRef}
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              className="block w-full cursor-pointer rounded-md border border-input bg-background text-sm shadow-sm file:mr-3 file:cursor-pointer file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
                setRowErrors([]);
                setResult(null);
              }}
            />
            {file && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                {file.name} · {(file.size / 1024).toFixed(1)} KB
              </p>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Import rejected</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {rowErrors.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-destructive/40 scrollbar-thin">
              <ul className="divide-y divide-border text-sm">
                {rowErrors.map((rowError) => (
                  <li key={`${rowError.line}-${rowError.message}`} className="flex gap-3 px-3 py-2">
                    <span className="shrink-0 font-medium tabular-nums text-muted-foreground">
                      Line {rowError.line}
                    </span>
                    <span>{rowError.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result && (
            <Alert variant={result.imported > 0 ? "success" : "info"}>
              <CheckCircle2 />
              <AlertTitle>
                {result.imported} question{result.imported === 1 ? "" : "s"} imported
              </AlertTitle>
              <AlertDescription>
                {result.topicsCreated > 0 && (
                  <span>
                    Created {result.topicsCreated} new topic
                    {result.topicsCreated === 1 ? "" : "s"}.{" "}
                  </span>
                )}
                {result.skipped.length > 0
                  ? `Skipped ${result.skipped.length} row${
                      result.skipped.length === 1 ? "" : "s"
                    } already in this subject (lines ${result.skipped
                      .slice(0, 10)
                      .map((row) => row.line)
                      .join(", ")}${result.skipped.length > 10 ? "…" : ""}).`
                  : "No duplicates were found."}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            {result ? "Done" : "Cancel"}
          </Button>
          <Button onClick={handleUpload} disabled={!file} loading={uploading}>
            <Upload />
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
