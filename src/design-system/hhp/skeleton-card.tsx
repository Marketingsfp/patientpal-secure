import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { HhpDensity } from "./tokens";

/** Skeleton de card no ritmo do Health Hub Pro (altura por densidade). */
export function HhpSkeletonCard({ density = "confortavel", className }: { density?: HhpDensity; className?: string }) {
  const h = density === "compacto" ? "h-14" : density === "foco" ? "h-28" : "h-24";
  const r = density === "compacto" ? "rounded-2xl" : "rounded-3xl";
  return <Skeleton className={cn(h, "w-full", r, className)} />;
}

/** Lista de skeletons — usar como fallback enquanto uma query carrega. */
export function HhpSkeletonList({ count = 6, density = "confortavel" }: { count?: number; density?: HhpDensity }) {
  return (
    <div className={cn("space-y-2", density === "foco" && "space-y-4")}>
      {Array.from({ length: count }).map((_, i) => (
        <HhpSkeletonCard key={i} density={density} />
      ))}
    </div>
  );
}