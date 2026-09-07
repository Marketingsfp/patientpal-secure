/**
 * FASE 4 — Handoff como fim de cenário nos testes automatizados.
 *
 * Módulo puro (sem rede e sem banco). Define o desfecho de um cenário
 * automatizado e a regra de PASS/FAIL quando a Nina transfere para atendimento
 * humano. Handoff NÃO é erro por si só: depende do que o cenário esperava.
 */

import type { Criterio, CriterioAvaliado, ResultadoItem } from "./cenarios";
import type { MotivoFimCiclo } from "./ciclo-teste";

export type DesfechoCenario =
  | "handoff"
  | "concluido"
  | "limite_turnos"
  | "erro"
  | "interrompido";

export const ROTULO_DESFECHO: Record<DesfechoCenario, string> = {
  handoff: "Transferido para humano",
  concluido: "Concluído pela Nina",
  limite_turnos: "Limite de mensagens",
  erro: "Erro técnico",
  interrompido: "Interrompido",
};

/** Motivo de encerramento do ciclo de teste correspondente ao desfecho. */
export const MOTIVO_CICLO_POR_DESFECHO: Record<DesfechoCenario, MotivoFimCiclo> = {
  handoff: "handoff_humano",
  concluido: "cenario_concluido",
  limite_turnos: "cenario_concluido",
  erro: "falha_tecnica",
  interrompido: "cancelado_usuario",
};

/**
 * Handoff esperado do cenário:
 * - campo explícito `handoff_esperado` quando definido;
 * - senão, derivado dos critérios (`transferiu` → true, `nao_transferiu` → false);
 * - senão, `null` (indiferente).
 */
export function handoffEsperado(cenario: {
  handoff_esperado?: boolean | null;
  criterios?: Criterio[] | null;
}): boolean | null {
  if (typeof cenario?.handoff_esperado === "boolean") return cenario.handoff_esperado;
  const criterios = cenario?.criterios ?? [];
  if (criterios.some((c) => c?.tipo === "transferiu")) return true;
  if (criterios.some((c) => c?.tipo === "nao_transferiu")) return false;
  return null;
}

/** Desfecho observado ao fim de um item de execução. */
export function desfechoDoItem(fatos: {
  transferida: boolean;
  erro?: string | null;
  interrompido?: boolean;
  turnosUsados?: number;
  maxTurnos?: number;
}): DesfechoCenario {
  if (fatos.erro) return "erro";
  if (fatos.transferida) return "handoff";
  if (fatos.interrompido) return "interrompido";
  if (
    typeof fatos.turnosUsados === "number" &&
    typeof fatos.maxTurnos === "number" &&
    fatos.maxTurnos > 0 &&
    fatos.turnosUsados >= fatos.maxTurnos
  ) {
    return "limite_turnos";
  }
  return "concluido";
}

/**
 * Aplica a regra de handoff sobre o resultado determinístico do cenário.
 * Acrescenta um critério avaliado explicando a decisão, sem apagar os demais.
 */
export function aplicarRegraHandoff(
  base: { resultado: ResultadoItem; avaliados: CriterioAvaliado[] },
  ctx: { desfecho: DesfechoCenario; esperado: boolean | null },
): { resultado: ResultadoItem; avaliados: CriterioAvaliado[] } {
  const houveHandoff = ctx.desfecho === "handoff";
  if (ctx.esperado === null) {
    // Cenário indiferente ao handoff: nada muda.
    return base;
  }

  const ok = houveHandoff === ctx.esperado;
  const criterio: CriterioAvaliado = {
    tipo: ctx.esperado ? "transferiu" : "nao_transferiu",
    ok,
    detalhe: ctx.esperado
      ? houveHandoff
        ? "Handoff esperado e realizado."
        : "Handoff era esperado e não aconteceu."
      : houveHandoff
        ? "Houve handoff em um cenário que não esperava transferência."
        : "Sem handoff, como o cenário esperava.",
  };

  // Evita duplicar quando o mesmo critério já foi avaliado na lista original.
  const jaAvaliado = base.avaliados.some(
    (a) => a.tipo === "transferiu" || a.tipo === "nao_transferiu",
  );
  const avaliados = jaAvaliado ? base.avaliados : [...base.avaliados, criterio];

  if (base.resultado === "inconclusivo") return { resultado: base.resultado, avaliados };
  return { resultado: avaliados.every((a) => a.ok) ? "aprovado" : "reprovado", avaliados };
}
