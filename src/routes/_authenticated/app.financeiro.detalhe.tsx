import { createFileRoute } from "@tanstack/react-router";
import { PaginaDetalhe } from "@/components/financeiro/pagina-detalhe";

/**
 * Detalhamento de um card do Financeiro → Dashboard, aberto em nova aba.
 * O Movimento de Caixa tem endereço próprio (`movimento-detalhe`) para herdar
 * a permissão do Movimento, e não a do Financeiro inteiro.
 */
export const Route = createFileRoute("/_authenticated/app/financeiro/detalhe")({
  validateSearch: (s: Record<string, unknown>): { id: string } => ({
    id: typeof s.id === "string" ? s.id : "",
  }),
  component: Pagina,
  head: () => ({ meta: [{ title: "Detalhamento — Financeiro" }] }),
});

function Pagina() {
  const { id } = Route.useSearch();
  return <PaginaDetalhe id={id} voltarPara="/app/financeiro" nomeTela="Dashboard do Financeiro" />;
}
