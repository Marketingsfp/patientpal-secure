import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { useClinicFeatureFlag } from "@/hooks/use-clinic-feature-flag";

/**
 * Linhas de skeleton para tabelas em carregamento — substitui o texto
 * "Carregando…" mantendo o formato do conteúdo final (reduz percepção de
 * espera). Lê a flag de clínica `ux_melhorias` internamente: desligada,
 * renderiza o `fallback` (o "Carregando…" original), então clínicas fora
 * do piloto não mudam em nada.
 */
export function TableSkeletonRows({
  rows = 8,
  cols,
  fallback,
}: {
  rows?: number;
  cols: number;
  fallback: ReactNode;
}) {
  const { enabled } = useClinicFeatureFlag("ux_melhorias");
  if (!enabled) return <>{fallback}</>;
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full max-w-[10rem]" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
