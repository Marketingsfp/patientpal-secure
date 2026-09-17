import type { EstadoFiltrosInbox } from "./filtros-inbox";

export type FiltroAtendente = "ativas" | "nao_atribuidas" | "fechadas";

export const OPCOES_FILTRO_ATENDENTE = [
  { valor: "ativas", rotulo: "Ativas" },
  { valor: "nao_atribuidas", rotulo: "Não atribuídas" },
  { valor: "fechadas", rotulo: "Fechadas" },
] as const;

export function filtroAtendenteAtual(
  estado: Pick<EstadoFiltrosInbox, "naoAtribuidas" | "visualizacao">,
): FiltroAtendente {
  if (estado.naoAtribuidas) return "nao_atribuidas";
  return estado.visualizacao === "resolvidas" ? "fechadas" : "ativas";
}

/** Cada opção define a consulta inteira, sem herdar filtros ocultos antigos. */
export function estadoFiltroAtendente(filtro: FiltroAtendente): Pick<
  EstadoFiltrosInbox, "base" | "atendenteId" | "visualizacao" | "naoAtribuidas"
> {
  return {
    base: "minhas",
    atendenteId: null,
    visualizacao: filtro === "fechadas" ? "resolvidas" : "recentes",
    naoAtribuidas: filtro === "nao_atribuidas",
  };
}
