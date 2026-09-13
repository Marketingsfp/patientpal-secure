/**
 * FASE 5 — Ajustes de pesos e limiares como PROPOSTA revisável.
 *
 * Camada pura. Nenhum ajuste é aplicado automaticamente: o que sai daqui é uma
 * proposta com impacto medido em conjunto independente do que motivou o ajuste.
 *
 * REGRAS DURAS:
 *  - poucos reportes não autorizam mudança;
 *  - ausência de reclamação não é evidência de acerto;
 *  - bloqueadores essenciais e a regra "todo LOW final é encaminhado" são
 *    protegidos: proposta que os toque é recusada.
 */
import { calcularIndicadores } from "./fase5-indicadores";
import type { ItemAmostra } from "./fase5-revisao-amostra";

export const VERSAO_PROPOSTAS = "propostas-5";

/** Nada aqui pode ser afrouxado por calibração. */
export const ALVOS_PROTEGIDOS = [
  "bloqueadores_essenciais",
  "afirmacao_sem_fonte",
  "identidade_incorreta",
  "operacao_sem_confirmacao",
  "todo_low_encaminha",
  "encaminhamento_obrigatorio_low",
] as const;

/** Mínimo de casos com confirmação humana para sequer considerar um ajuste. */
export const MINIMO_CONFIRMACOES = 30;

export type Ajuste = {
  alvo: string;
  de: number;
  para: number;
  justificativa: string;
};

export type Proposta = {
  versao: string;
  ajuste: Ajuste;
  status: "PROPOSTA" | "RECUSADA";
  protegido: boolean;
  motivo: string;
  /** Medição no conjunto que motivou o ajuste (não decide sozinho). */
  impactoConjuntoDeEscolha: ReturnType<typeof calcularIndicadores> | null;
  /** Medição no conjunto independente. É o que vale para aprovar. */
  impactoConjuntoIndependente: ReturnType<typeof calcularIndicadores> | null;
  /** Aprovação é sempre humana. */
  aprovacao: "pendente";
};

export function alvoProtegido(alvo: string): boolean {
  const a = alvo.toLowerCase();
  return ALVOS_PROTEGIDOS.some((p) => a.includes(p));
}

export function avaliarProposta(e: {
  ajuste: Ajuste;
  /** Amostra que motivou o ajuste. */
  conjuntoDeEscolha: ItemAmostra[];
  /** Amostra independente, não usada para escolher o ajuste. */
  conjuntoIndependente: ItemAmostra[];
  /** Confirmações humanas disponíveis no conjunto independente. */
  confirmacoesHumanas: number;
  minimoConfirmacoes?: number;
}): Proposta {
  const base = {
    versao: VERSAO_PROPOSTAS,
    ajuste: e.ajuste,
    aprovacao: "pendente" as const,
  };

  if (alvoProtegido(e.ajuste.alvo)) {
    return {
      ...base,
      status: "RECUSADA",
      protegido: true,
      motivo:
        "Alvo protegido: bloqueadores essenciais e o encaminhamento de toda resposta de baixa confiança não são calibráveis.",
      impactoConjuntoDeEscolha: null,
      impactoConjuntoIndependente: null,
    };
  }

  const minimo = e.minimoConfirmacoes ?? MINIMO_CONFIRMACOES;
  if (e.confirmacoesHumanas < minimo) {
    return {
      ...base,
      status: "RECUSADA",
      protegido: false,
      motivo: `Evidência insuficiente: ${e.confirmacoesHumanas} de ${minimo} casos com confirmação humana. Poucos reportes (ou nenhum) não autorizam ajuste.`,
      impactoConjuntoDeEscolha: null,
      impactoConjuntoIndependente: null,
    };
  }

  const mesmos = new Set(e.conjuntoDeEscolha.map((i) => i.id));
  const contaminados = e.conjuntoIndependente.filter((i) => mesmos.has(i.id)).length;
  if (contaminados > 0) {
    return {
      ...base,
      status: "RECUSADA",
      protegido: false,
      motivo: `Conjuntos sobrepostos em ${contaminados} caso(s): o impacto precisa ser medido em amostra independente.`,
      impactoConjuntoDeEscolha: null,
      impactoConjuntoIndependente: null,
    };
  }

  return {
    ...base,
    status: "PROPOSTA",
    protegido: false,
    motivo: "Proposta registrada para revisão humana. Nada foi aplicado automaticamente.",
    impactoConjuntoDeEscolha: calcularIndicadores({ itens: e.conjuntoDeEscolha }),
    impactoConjuntoIndependente: calcularIndicadores({ itens: e.conjuntoIndependente }),
  };
}
