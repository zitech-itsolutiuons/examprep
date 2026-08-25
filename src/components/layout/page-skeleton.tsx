import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Generic in-shell loading placeholder: page header + a few content blocks. */
export function PageSkeleton({ tiles = 4 }: { tiles?: number }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: tiles }).map((_, i) => (
          <Card key={i} className="space-y-3 p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-32" />
          </Card>
        ))}
      </div>
      <Card className="space-y-4 p-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </Card>
    </div>
  );
}
