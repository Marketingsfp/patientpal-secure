import { createFileRoute } from "@tanstack/react-router";
import { PaginaDetalhe } from "@/components/financeiro/pagina-detalhe";

/**
 * Detalhamento de um card do Movimento de Caixa, aberto em nova aba.
 *
 * Endereço próprio, e não `/app/financeiro/detalhe`, por causa da permissão:
 * este caminho está mapeado para o módulo do Movimento de Caixa
 * (`financeiro-movcaixa` em `@/lib/permissoes-rotas`), então quem só tem
 * acesso ao Movimento abre o detalhamento dele sem ser mandado embora.
 */
export const Route = createFileRoute("/_authenticated/app/financeiro/movimento-detalhe")({
  validateSearch: (s: Record<string, unknown>): { id: string } => ({
    id: typeof s.id === "string" ? s.id : "",
  }),
  component: Pagina,
  head: () => ({ meta: [{ title: "Detalhamento — Movimento de Caixa" }] }),
});

function Pagina() {
  const { id } = Route.useSearch();
  return (
    <PaginaDetalhe id={id} voltarPara="/app/financeiro/movimento" nomeTela="Movimento de Caixa" />
  );
}
