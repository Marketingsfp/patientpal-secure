import type { EstadoFiltrosInbox } from "./filtros-inbox";

export type FiltroAtendente = "ativas" | "pendentes" | "fechadas";

export const OPCOES_FILTRO_ATENDENTE = [
  { valor: "ativas", rotulo: "Ativas" },
  { valor: "pendentes", rotulo: "Pendentes" },
  { valor: "fechadas", rotulo: "Fechadas" },
] as const;

/**
 * Pendentes = as conversas da própria pessoa em que o paciente aguarda resposta.
 * É a visualização "Maior espera" (métrica canônica) sobre "Minhas conversas":
 * a conversa continua também em Ativas, sai daqui ao responder e volta quando o
 * paciente escreve de novo.
 */
export function filtroAtendenteAtual(
  estado: Pick<EstadoFiltrosInbox, "visualizacao">,
): FiltroAtendente {
  if (estado.visualizacao === "resolvidas") return "fechadas";
  return estado.visualizacao === "espera" ? "pendentes" : "ativas";
}

/** Cada opção define a consulta inteira, sem herdar filtros ocultos antigos. */
export function estadoFiltroAtendente(
  filtro: FiltroAtendente,
): Pick<EstadoFiltrosInbox, "base" | "atendenteId" | "visualizacao" | "naoAtribuidas"> {
  return {
    base: "minhas",
    atendenteId: null,
    visualizacao:
      filtro === "fechadas" ? "resolvidas" : filtro === "pendentes" ? "espera" : "recentes",
    // A fila global sem responsável é só da gestão; atendente nunca a consulta.
    naoAtribuidas: false,
  };
}
