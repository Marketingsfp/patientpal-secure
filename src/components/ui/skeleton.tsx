import { cn } from "@/lib/utils";

/**
 * Barra de carregamento.
 *
 * No tema claro o tom institucional suave (`bg-primary/10`) já funciona sobre
 * o card branco. No escuro ele desaparecia: a cor da clínica a 10% sobre a
 * superfície #1E293B fica quase invisível, e a tela parecia travada em
 * branco enquanto os dados não chegavam. Por isso o escuro usa `--muted`,
 * que lê tanto sobre o fundo da página (#0F172A) quanto sobre o card.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-primary/10 dark:bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
