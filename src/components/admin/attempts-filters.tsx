"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

type Props = {
  subjects: { id: string; title: string }[];
  filters: { subjectId: string; status: string; userId: string; who: string };
  /** Shown when the list is scoped to one student, so the scope can be cleared. */
  userLabel?: string | null;
};

export function AttemptsFilters({ subjects, filters, userLabel }: Props) {
  const router = useRouter();

  function navigate(next: Partial<Props["filters"]>) {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();
    if (merged.subjectId) params.set("subjectId", merged.subjectId);
    if (merged.status) params.set("status", merged.status);
    if (merged.userId) params.set("userId", merged.userId);
    if (merged.who) params.set("who", merged.who);
    const qs = params.toString();
    router.push(qs ? `/admin/attempts?${qs}` : "/admin/attempts");
  }

  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select
        value={filters.subjectId || ALL}
        onValueChange={(value) => navigate({ subjectId: value === ALL ? "" : value })}
      >
        <SelectTrigger className="sm:w-56">
          <SelectValue placeholder="All subjects" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All subjects</SelectItem>
          {subjects.map((subject) => (
            <SelectItem key={subject.id} value={subject.id}>
              {subject.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.status || ALL}
        onValueChange={(value) => navigate({ status: value === ALL ? "" : value })}
      >
        <SelectTrigger className="sm:w-44">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          <SelectItem value="SUBMITTED">Submitted</SelectItem>
          <SelectItem value="IN_PROGRESS">In progress</SelectItem>
          <SelectItem value="ABANDONED">Abandoned</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.who || ALL}
        onValueChange={(value) => navigate({ who: value === ALL ? "" : value })}
      >
        <SelectTrigger className="sm:w-52">
          <SelectValue placeholder="Everyone" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Everyone</SelectItem>
          <SelectItem value="accounts">Registered accounts</SelectItem>
          <SelectItem value="guests">Guests only</SelectItem>
        </SelectContent>
      </Select>

      {filters.userId && (
        <Button variant="outline" onClick={() => navigate({ userId: "" })}>
          Clear student filter{userLabel ? `: ${userLabel}` : ""}
        </Button>
      )}
    </div>
  );
}
