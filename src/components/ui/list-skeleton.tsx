import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useClinicFeatureFlag } from "@/hooks/use-clinic-feature-flag";

/**
 * Skeleton de lista para estados de carregamento. Lê a flag de clínica
 * `ux_melhorias` internamente: com ela desligada renderiza o `fallback`
 * (o "Carregando…" original da tela), então clínicas fora do piloto não
 * mudam em nada e o call site vira uma troca de uma linha.
 */
export function ListSkeleton({ rows = 6, fallback }: { rows?: number; fallback: ReactNode }) {
  const { enabled } = useClinicFeatureFlag("ux_melhorias");
  if (!enabled) return <>{fallback}</>;
  return (
    <div className="space-y-2 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-md border border-border bg-card p-3"
        >
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}
