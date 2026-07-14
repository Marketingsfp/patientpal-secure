import { cn } from "@/lib/utils";

interface TableSkeletonProps {
  rows?: number;
  className?: string;
}

export function TableSkeleton({ rows = 8, className }: TableSkeletonProps) {
  return (
    <div className={cn("divide-y divide-border", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="h-4 w-10 rounded bg-muted animate-pulse" />
          <div className="h-4 w-16 rounded bg-muted animate-pulse" />
          <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
          <div className="flex-1 h-4 rounded bg-muted animate-pulse" />
          <div className="h-4 w-28 rounded bg-muted animate-pulse" />
          <div className="h-5 w-20 rounded-full bg-muted animate-pulse" />
          <div className="h-8 w-24 rounded bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  );
}