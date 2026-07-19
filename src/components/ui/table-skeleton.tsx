import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";

/**
 * Linhas de skeleton para tabelas em carregamento — substitui o texto
 * "Carregando…" mantendo o formato do conteúdo final (reduz percepção de
 * espera). Uso: `<TableSkeletonRows cols={8} />` dentro do <TableBody>.
 */
export function TableSkeletonRows({ rows = 8, cols }: { rows?: number; cols: number }) {
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
