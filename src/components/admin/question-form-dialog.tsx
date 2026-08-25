"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, GripVertical, Plus, Trash2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export type QuestionType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";
export type QuestionDifficulty = "EASY" | "MEDIUM" | "HARD";

export type QuestionOptionValue = {
  id?: string;
  text: string;
  isCorrect: boolean;
};

export type QuestionFormValues = {
  id?: string;
  topicId: string; // "" means no topic
  text: string;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  explanation: string;
  points: number;
  isActive: boolean;
  options: QuestionOptionValue[];
};

const NO_TOPIC = "__none__";

const TYPE_LABELS: Record<QuestionType, string> = {
  SINGLE_CHOICE: "Single choice",
  MULTIPLE_CHOICE: "Multiple answers",
  TRUE_FALSE: "True / false",
};

const DIFFICULTY_LABELS: Record<QuestionDifficulty, string> = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
};

export function blankQuestion(): QuestionFormValues {
  return {
    topicId: "",
    text: "",
    type: "SINGLE_CHOICE",
    difficulty: "MEDIUM",
    explanation: "",
    points: 1,
    isActive: true,
    options: [
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
    ],
  };
}

function trueFalseOptions(previous: QuestionOptionValue[]): QuestionOptionValue[] {
  // Keep whichever side was already marked correct so switching type isn't destructive.
  const trueWasCorrect = previous[0]?.isCorrect ?? true;
  return [
    { text: "True", isCorrect: trueWasCorrect },
    { text: "False", isCorrect: !trueWasCorrect },
  ];
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  topics: { id: string; name: string }[];
  /** Omit to create a new question; pass values to edit an existing one. */
  question?: QuestionFormValues;
};

export function QuestionFormDialog({ open, onOpenChange, subjectId, topics, question }: Props) {
  const router = useRouter();
  const editing = !!question?.id;

  const [values, setValues] = React.useState<QuestionFormValues>(question ?? blankQuestion());
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setValues(question ?? blankQuestion());
      setError(null);
    }
  }, [open, question]);

  function set<K extends keyof QuestionFormValues>(key: K, value: QuestionFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function changeType(type: QuestionType) {
    setValues((prev) => {
      if (type === "TRUE_FALSE") {
        return { ...prev, type, options: trueFalseOptions(prev.options) };
      }

      let options = prev.options;
      if (prev.type === "TRUE_FALSE") {
        // Coming back from true/false — restore an editable four-option set.
        options = [
          { text: "", isCorrect: true },
          { text: "", isCorrect: false },
          { text: "", isCorrect: false },
          { text: "", isCorrect: false },
        ];
      } else if (type === "SINGLE_CHOICE") {
        // Collapse to a single correct answer.
        let seenCorrect = false;
        options = prev.options.map((option) => {
          if (option.isCorrect && !seenCorrect) {
            seenCorrect = true;
            return option;
          }
          return { ...option, isCorrect: false };
        });
      }

      return { ...prev, type, options };
    });
  }

  function setOptionText(index: number, text: string) {
    setValues((prev) => ({
      ...prev,
      options: prev.options.map((option, i) => (i === index ? { ...option, text } : option)),
    }));
  }

  function setSingleCorrect(index: number) {
    setValues((prev) => ({
      ...prev,
      options: prev.options.map((option, i) => ({ ...option, isCorrect: i === index })),
    }));
  }

  function toggleCorrect(index: number, isCorrect: boolean) {
    setValues((prev) => ({
      ...prev,
      options: prev.options.map((option, i) => (i === index ? { ...option, isCorrect } : option)),
    }));
  }

  function addOption() {
    setValues((prev) =>
      prev.options.length >= 8
        ? prev
        : { ...prev, options: [...prev.options, { text: "", isCorrect: false }] }
    );
  }

  function removeOption(index: number) {
    setValues((prev) => {
      if (prev.options.length <= 2) return prev;
      const options = prev.options.filter((_, i) => i !== index);
      // Never leave the question without a correct answer.
      if (!options.some((option) => option.isCorrect)) options[0].isCorrect = true;
      return { ...prev, options };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const filled = values.options.filter((option) => option.text.trim().length > 0);
    if (filled.length < 2) {
      setError("Add at least two options with text.");
      return;
    }
    if (!filled.some((option) => option.isCorrect)) {
      setError("Mark at least one option as correct.");
      return;
    }

    setSaving(true);
    const payload = {
      ...(editing ? {} : { subjectId }),
      topicId: values.topicId || null,
      text: values.text,
      type: values.type,
      difficulty: values.difficulty,
      explanation: values.explanation,
      points: values.points,
      isActive: values.isActive,
      options: filled.map((option) => ({
        ...(option.id ? { id: option.id } : {}),
        text: option.text.trim(),
        isCorrect: option.isCorrect,
      })),
    };

    const res = await fetch(
      editing ? `/api/admin/questions/${question!.id}` : "/api/admin/questions",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Could not save the question.");
      return;
    }

    toast.success(editing ? "Question updated." : "Question added.");
    onOpenChange(false);
    router.refresh();
  }

  const lockedText = values.type === "TRUE_FALSE";
  const multi = values.type === "MULTIPLE_CHOICE";
  const singleCorrectIndex = values.options.findIndex((option) => option.isCorrect);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit question" : "New question"}</DialogTitle>
          <DialogDescription>
            Mark the correct answer and add an explanation — students see it when reviewing
            mistakes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="question-text">Question</Label>
            <Textarea
              id="question-text"
              required
              rows={3}
              minLength={5}
              placeholder="Type the question exactly as students should read it."
              value={values.text}
              onChange={(e) => set("text", e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={values.type} onValueChange={(v) => changeType(v as QuestionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Difficulty</Label>
              <Select
                value={values.difficulty}
                onValueChange={(v) => set("difficulty", v as QuestionDifficulty)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Topic</Label>
              <Select
                value={values.topicId || NO_TOPIC}
                onValueChange={(v) => set("topicId", v === NO_TOPIC ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TOPIC}>No topic</SelectItem>
                  {topics.map((topic) => (
                    <SelectItem key={topic.id} value={topic.id}>
                      {topic.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="question-points">Points</Label>
              <Input
                id="question-points"
                type="number"
                min={1}
                max={100}
                required
                value={values.points}
                onChange={(e) => set("points", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Options</Label>
              <p className="text-xs text-muted-foreground">
                {multi ? "Tick every correct answer" : "Select the one correct answer"}
              </p>
            </div>

            {multi ? (
              <div className="space-y-2">
                {values.options.map((option, index) => (
                  <OptionRow
                    key={index}
                    index={index}
                    option={option}
                    lockedText={lockedText}
                    canRemove={values.options.length > 2 && !lockedText}
                    control={
                      <Checkbox
                        checked={option.isCorrect}
                        onCheckedChange={(checked) => toggleCorrect(index, checked === true)}
                        aria-label={`Option ${index + 1} is correct`}
                      />
                    }
                    onTextChange={(text) => setOptionText(index, text)}
                    onRemove={() => removeOption(index)}
                  />
                ))}
              </div>
            ) : (
              <RadioGroup
                value={singleCorrectIndex >= 0 ? String(singleCorrectIndex) : undefined}
                onValueChange={(v) => setSingleCorrect(Number(v))}
                className="space-y-2"
              >
                {values.options.map((option, index) => (
                  <OptionRow
                    key={index}
                    index={index}
                    option={option}
                    lockedText={lockedText}
                    canRemove={values.options.length > 2 && !lockedText}
                    control={
                      <RadioGroupItem
                        value={String(index)}
                        aria-label={`Option ${index + 1} is correct`}
                      />
                    }
                    onTextChange={(text) => setOptionText(index, text)}
                    onRemove={() => removeOption(index)}
                  />
                ))}
              </RadioGroup>
            )}

            {!lockedText && values.options.length < 8 && (
              <Button type="button" variant="outline" size="sm" onClick={addOption}>
                <Plus />
                Add option
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="question-explanation">Explanation</Label>
            <Textarea
              id="question-explanation"
              rows={3}
              placeholder="Why the correct answer is right. Shown to students who get this wrong."
              value={values.explanation}
              onChange={(e) => set("explanation", e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5 pr-4">
              <Label htmlFor="question-active">Active</Label>
              <p className="text-xs text-muted-foreground">
                Inactive questions stay in past results but are left out of new attempts.
              </p>
            </div>
            <Switch
              id="question-active"
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
              {editing ? "Save changes" : "Add question"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OptionRow({
  index,
  option,
  control,
  lockedText,
  canRemove,
  onTextChange,
  onRemove,
}: {
  index: number;
  option: QuestionOptionValue;
  control: React.ReactNode;
  lockedText: boolean;
  canRemove: boolean;
  onTextChange: (text: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50" />
      {control}
      <Input
        value={option.text}
        readOnly={lockedText}
        placeholder={`Option ${index + 1}`}
        onChange={(e) => onTextChange(e.target.value)}
        className={option.isCorrect ? "border-success/60" : undefined}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={!canRemove}
        aria-label={`Remove option ${index + 1}`}
        onClick={onRemove}
      >
        <Trash2 className="text-destructive" />
      </Button>
    </div>
  );
}
