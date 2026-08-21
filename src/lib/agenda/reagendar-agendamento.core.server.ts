// Núcleo (server-only) do REAGENDAMENTO.
//
// Extraído sem alteração de comportamento de
// `reagendar-agendamento.functions.ts`, que hoje só embrulha esta função com a
// autenticação do funcionário. A API de integração externa usa o mesmo núcleo.
//
// Move UMA sessão de horário (e opcionalmente de médico) preservando o mesmo
// `agendamento.id`. As validações (agenda aberta, slot livre cobrindo o
// intervalo, exclusão do próprio id) são as mesmas da criação.
//
// NÃO altera: paciente_id, paciente_nome, procedimento, status, pacote_id,
// orcamento_id, data_pagamento, fluxo_etapa, fluxo_atualizado_em,
// executado_por, executado_em.

import { assertEscopoRegistro, type CtxAgenda } from "./ator.server";
import type { PgErrorLike } from "./criar-agendamento.types";

const TMP_MARKER = "DISPONÍVEL_REAGENDADO_TMP";

const normalizar = (s: string) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const isSlotLivre = (pacienteNome: string | null | undefined) => {
  const nome = normalizar(pacienteNome ?? "").trim();
  return nome === "disponivel" || nome === "bloqueio";
};

export type ReagendarAgendamentoCoreInput = {
  clinica_id: string;
  agendamento_id: string;
  novo_inicio: string;
  novo_fim: string;
  novo_medico_id?: string | null;
};

export type ReagendarAgendamentoResult =
  | { ok: true; id: string }
  | { ok: false; validation_error: { message: string; toast_duration?: number } }
  | { ok: false; pg_error: PgErrorLike };

function toPgErrorLike(err: unknown): PgErrorLike {
  const e = (err ?? {}) as { message?: string; details?: string; hint?: string; code?: string };
  return {
    message: e.message ?? "Erro desconhecido",
    details: e.details ?? null,
    hint: e.hint ?? null,
    code: e.code ?? null,
  };
}

export async function reagendarAgendamentoCore(
  ctx: CtxAgenda,
  data: ReagendarAgendamentoCoreInput,
): Promise<ReagendarAgendamentoResult> {
  const supabase = ctx.db;
  const { clinica_id, agendamento_id, novo_inicio, novo_fim } = data;

  // ---------- 0. Carrega origem ----------
  const { data: origem, error: e0 } = await supabase
    .from("agendamentos")
    .select(
      "id,clinica_id,inicio,fim,medico_id,agenda_id,status,paciente_nome,observacoes,origem_integracao",
    )
    .eq("id", agendamento_id)
    .maybeSingle();
  if (e0) return { ok: false, pg_error: toPgErrorLike(e0) };
  if (!origem) return { ok: false, validation_error: { message: "Agendamento não encontrado." } };
  if (origem.clinica_id !== clinica_id) {
    return { ok: false, validation_error: { message: "Agendamento pertence a outra clínica." } };
  }
  // Escopo obrigatório sob service role (no-op para funcionário logado).
  assertEscopoRegistro(ctx.ator, origem as { clinica_id: string; origem_integracao: string | null });

  // Guard de status — paridade com o reagendar clássico.
  if (
    origem.status === "realizado" ||
    origem.status === "cancelado" ||
    origem.status === "faltou"
  ) {
    return {
      ok: false,
      validation_error: {
        message: "Este agendamento não pode ser reagendado (status " + origem.status + ").",
      },
    };
  }

  const novoMedicoId = data.novo_medico_id ?? origem.medico_id;
  if (!novoMedicoId) {
    return {
      ok: false,
      validation_error: { message: "Selecione um médico para o reagendamento." },
    };
  }

  // Guard "mesmo horário".
  if (novoMedicoId === origem.medico_id && novo_inicio === origem.inicio) {
    return { ok: false, validation_error: { message: "Esse já é o horário atual." } };
  }

  // ---------- 1. Regras A/B/C (mesmas da criação) ----------
  const di = new Date(novo_inicio);
  const df = new Date(novo_fim);
  if (Number.isNaN(di.getTime()) || Number.isNaN(df.getTime()) || df.getTime() <= di.getTime()) {
    return { ok: false, validation_error: { message: "Novo horário inválido." } };
  }
  const inicioDia = new Date(di.getFullYear(), di.getMonth(), di.getDate(), 0, 0, 0).toISOString();
  const fimDia = new Date(di.getFullYear(), di.getMonth(), di.getDate(), 23, 59, 59).toISOString();
  const { data: slotsDia, error: eSlots } = await supabase
    .from("agendamentos")
    .select("id,paciente_nome,inicio,fim,agenda_id")
    .eq("clinica_id", clinica_id)
    .eq("medico_id", novoMedicoId)
    .gte("inicio", inicioDia)
    .lte("inicio", fimDia)
    .limit(500);
  if (eSlots) return { ok: false, pg_error: toPgErrorLike(eSlots) };
  const lista = (slotsDia ?? []) as {
    id: string;
    paciente_nome: string;
    inicio: string;
    fim: string;
    agenda_id: string | null;
  }[];
  // Regra C — excluir o próprio id (equivalente ao excludingEditing).
  const outros = lista.filter((x) => x.id !== agendamento_id);
  if (outros.length === 0) {
    return {
      ok: false,
      validation_error: {
        message:
          "Este médico não tem agenda aberta nessa data. Gere os horários em Disponibilidades antes de agendar.",
      },
    };
  }
  const inicioMs = di.getTime();
  const fimMs = df.getTime();
  const destSlot = outros.find((s) => {
    if (!isSlotLivre(s.paciente_nome)) return false;
    const sIni = new Date(s.inicio).getTime();
    const sFim = new Date(s.fim).getTime();
    return sIni <= inicioMs && sFim >= fimMs;
  });
  if (!destSlot) {
    return {
      ok: false,
      validation_error: {
        message:
          "Não há horário livre desse médico cobrindo o intervalo escolhido. Escolha um slot DISPONÍVEL na agenda ou gere mais horários em Disponibilidades.",
      },
    };
  }

  // ---------- 2. Swap preservando o id da origem ----------
  const antigo = {
    inicio: origem.inicio,
    fim: origem.fim,
    medico_id: origem.medico_id,
    agenda_id: (origem as { agenda_id: string | null }).agenda_id,
  };
  const { error: e3 } = await supabase
    .from("agendamentos")
    .update({
      paciente_nome: TMP_MARKER,
      inicio: antigo.inicio,
      fim: antigo.fim,
      medico_id: antigo.medico_id,
      agenda_id: antigo.agenda_id,
    } as never)
    .eq("id", destSlot.id);
  if (e3) return { ok: false, pg_error: toPgErrorLike(e3) };

  try {
    // Passo 4 — origem assume o novo intervalo/médico.
    const trilha = `[Reagendado em ${new Date().toLocaleString("pt-BR")}] de ${new Date(antigo.inicio).toLocaleString("pt-BR")} para ${new Date(novo_inicio).toLocaleString("pt-BR")}`;
    const novasObs = origem.observacoes ? `${origem.observacoes}\n${trilha}` : trilha;
    const { error: e4 } = await supabase
      .from("agendamentos")
      .update({
        inicio: novo_inicio,
        fim: novo_fim,
        medico_id: novoMedicoId,
        agenda_id: destSlot.agenda_id,
        observacoes: novasObs,
      } as never)
      .eq("id", agendamento_id);
    if (e4) return { ok: false, pg_error: toPgErrorLike(e4) };
  } finally {
    // Passo 5 — dest_slot vira DISPONÍVEL no horário antigo (limpa TMP).
    await supabase
      .from("agendamentos")
      .update({ paciente_nome: "DISPONÍVEL" } as never)
      .eq("id", destSlot.id);
  }

  return { ok: true, id: agendamento_id };
}
