// Cartões do Dashboard operacional — qual ficha entra em qual cartão.
//
// O número do cartão e a lista que abre ao clicar nele saem da MESMA regra
// (`separarPorCartao`). Se cada um tivesse o seu filtro, bastava alguém ajustar
// um deles para o cartão dizer 12 e a lista mostrar 11.

import type { LinhaMarcacoes } from "@/lib/relatorios/marcacoes-por-atendente";

export type CartaoDia =
  | "agendados"
  | "checkins"
  | "aguardando"
  | "naFila"
  | "emAtend"
  | "concluidos";

export const TITULO_CARTAO: Record<CartaoDia, string> = {
  agendados: "Agendados hoje",
  checkins: "Check-ins feitos",
  aguardando: "Aguardando chegada",
  naFila: "Na fila",
  emAtend: "Em atendimento",
  concluidos: "Concluídos",
};

type FichaMin = { status: string; fluxo_etapa: string | null };

export function separarPorCartao<T extends FichaMin>(ags: readonly T[]): Record<CartaoDia, T[]> {
  return {
    agendados: [...ags],
    checkins: ags.filter((a) => a.fluxo_etapa && a.fluxo_etapa !== "aguardando_recepcao"),
    aguardando: ags.filter((a) => !a.fluxo_etapa || a.fluxo_etapa === "aguardando_recepcao"),
    naFila: ags.filter((a) => ["recepcao", "caixa", "triagem"].includes(a.fluxo_etapa ?? "")),
    emAtend: ags.filter((a) => ["atendimento", "exame"].includes(a.fluxo_etapa ?? "")),
    concluidos: ags.filter((a) => a.status === "realizado" || a.fluxo_etapa === "finalizado"),
  };
}

/** Ficha de BLOQUEIO da grade: conta no cartão, mas ninguém "marcou" um paciente nela. */
export const ehBloqueio = (a: { paciente_nome: string | null; paciente_id?: string | null }) =>
  !a.paciente_id &&
  (a.paciente_nome ?? "").trim().toUpperCase().normalize("NFD").replace(/\p{M}/gu, "") ===
    "BLOQUEIO";

/**
 * Junta o resultado de `rel_marcacoes_por_atendente` de várias unidades
 * (modo "todas as clínicas"): a mesma atendente pode marcar em mais de uma.
 * Linhas sem usuário juntam pelo nome ("Sistema", "(não identificado)"…).
 */
export function somarPorAtendente(
  listas: readonly (readonly LinhaMarcacoes[])[],
): LinhaMarcacoes[] {
  const mapa = new Map<string, LinhaMarcacoes>();
  for (const lista of listas) {
    for (const l of lista) {
      const chave = l.usuario_id ?? `nome:${(l.usuario_nome ?? "").trim().toLowerCase()}`;
      const atual = mapa.get(chave);
      if (atual) atual.qtd += Number(l.qtd ?? 0);
      else mapa.set(chave, { ...l, qtd: Number(l.qtd ?? 0) });
    }
  }
  return [...mapa.values()];
}
