// Sprint 3 · S3-C — Reagendamento isolado da Agenda V2.
//
// Move UMA sessão de horário (e opcionalmente de médico) preservando o
// mesmo `agendamento.id`. Não altera `criarAgendamento` nem a Agenda
// clássica. As 3 validações abaixo (agenda aberta, slot livre cobrindo
// intervalo, exclusão do próprio id) são cópia LITERAL de
// `criar-agendamento.functions.ts:134-172` — nenhuma regra nova.
//
// Estratégia (mantém o modelo de slots pré-gerados sem quebrar id):
//   1. SELECT slot destino DISPONÍVEL do médico-destino cobrindo o
//      novo intervalo.
//   2. SELECT origem por id.
//   3. UPDATE dest_slot → assume o horário/médico antigos com marker
//      TMP (recicla o buraco que a origem deixa).
//   4. UPDATE origem → novo inicio/fim/medico_id + trilha em observações.
//   5. UPDATE dest_slot → limpa o marker (vira DISPONÍVEL no horário antigo).
//   Passo 5 roda no `finally` de um try/catch para não deixar TMP residual
//   caso Passo 4 falhe.
//
// NÃO altera: paciente_id, paciente_nome, procedimento, status, pacote_id,
// orcamento_id, data_pagamento, fluxo_etapa,
// fluxo_atualizado_em, executado_por, executado_em.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TMP_MARKER = "DISPONÍVEL_REAGENDADO_TMP";

const normalizar = (s: string) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const isSlotLivre = (pacienteNome: string | null | undefined) => {
  const nome = normalizar(pacienteNome ?? "").trim();
  return nome === "disponivel" || nome === "bloqueio";
};

const schema = z.object({
  clinica_id: z.string().uuid(),
  agendamento_id: z.string().uuid(),
  novo_inicio: z.string().min(1),
  novo_fim: z.string().min(1),
  novo_medico_id: z.string().uuid().nullable().optional(),
});

export type ReagendarAgendamentoInput = z.infer<typeof schema>;

export type PgErrorLike = {
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
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

export const reagendarAgendamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data, context }): Promise<ReagendarAgendamentoResult> => {
    const { supabase } = context;
    const { clinica_id, agendamento_id, novo_inicio, novo_fim } = data;

    // ---------- 0. Carrega origem ----------
    const { data: origem, error: e0 } = await supabase
      .from("agendamentos")
      .select("id,clinica_id,inicio,fim,medico_id,status,paciente_nome,observacoes")
      .eq("id", agendamento_id)
      .maybeSingle();
    if (e0) return { ok: false, pg_error: toPgErrorLike(e0) };
    if (!origem) return { ok: false, validation_error: { message: "Agendamento não encontrado." } };
    if (origem.clinica_id !== clinica_id) {
      return { ok: false, validation_error: { message: "Agendamento pertence a outra clínica." } };
    }

    // Guard de status — paridade com o reagendar clássico (app.agenda.tsx:820).
    if (origem.status === "realizado" || origem.status === "cancelado" || origem.status === "faltou") {
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

    // Guard "mesmo horário" — paridade com clássica linha 831.
    if (novoMedicoId === origem.medico_id && novo_inicio === origem.inicio) {
      return { ok: false, validation_error: { message: "Esse já é o horário atual." } };
    }

    // ---------- 1. Regras A/B/C copiadas de criar-agendamento.functions.ts:134-172 ----------
    const di = new Date(novo_inicio);
    const df = new Date(novo_fim);
    if (Number.isNaN(di.getTime()) || Number.isNaN(df.getTime()) || df.getTime() <= di.getTime()) {
      return { ok: false, validation_error: { message: "Novo horário inválido." } };
    }
    const inicioDia = new Date(di.getFullYear(), di.getMonth(), di.getDate(), 0, 0, 0).toISOString();
    const fimDia = new Date(di.getFullYear(), di.getMonth(), di.getDate(), 23, 59, 59).toISOString();
    const { data: slotsDia, error: eSlots } = await supabase
      .from("agendamentos")
      .select("id,paciente_nome,inicio,fim")
      .eq("clinica_id", clinica_id)
      .eq("medico_id", novoMedicoId)
      .gte("inicio", inicioDia)
      .lte("inicio", fimDia)
      .limit(500);
    if (eSlots) return { ok: false, pg_error: toPgErrorLike(eSlots) };
    const lista = (slotsDia ?? []) as { id: string; paciente_nome: string; inicio: string; fim: string }[];
    // Regra C — excluir o próprio id (equivalente ao excludingEditing).
    const outros = lista.filter((x) => x.id !== agendamento_id);
    if (outros.length === 0) {
      return {
        ok: false,
        validation_error: {
          message: "Este médico não tem agenda aberta nessa data. Gere os horários em Disponibilidades antes de agendar.",
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
          message: "Não há horário livre desse médico cobrindo o intervalo escolhido. Escolha um slot DISPONÍVEL na agenda ou gere mais horários em Disponibilidades.",
        },
      };
    }

    // ---------- 2. Swap preservando o id da origem ----------
    // Passo 3 — dest_slot assume o intervalo/médico antigos + marker TMP.
    const antigo = { inicio: origem.inicio, fim: origem.fim, medico_id: origem.medico_id };
    const { error: e3 } = await supabase
      .from("agendamentos")
      .update({
        paciente_nome: TMP_MARKER,
        inicio: antigo.inicio,
        fim: antigo.fim,
        medico_id: antigo.medico_id,
      } as never)
      .eq("id", destSlot.id);
    if (e3) return { ok: false, pg_error: toPgErrorLike(e3) };

    try {
      // Passo 4 — origem assume o novo intervalo/médico. Só toca 3 campos +
      // trilha em observações; nenhum outro campo é alterado.
      const trilha = `[Reagendado em ${new Date().toLocaleString("pt-BR")}] de ${new Date(antigo.inicio).toLocaleString("pt-BR")} para ${new Date(novo_inicio).toLocaleString("pt-BR")}`;
      const novasObs = origem.observacoes ? `${origem.observacoes}\n${trilha}` : trilha;
      const { error: e4 } = await supabase
        .from("agendamentos")
        .update({
          inicio: novo_inicio,
          fim: novo_fim,
          medico_id: novoMedicoId,
          observacoes: novasObs,
        } as never)
        .eq("id", agendamento_id);
      if (e4) return { ok: false, pg_error: toPgErrorLike(e4) };
    } finally {
      // Passo 5 — dest_slot vira DISPONÍVEL no horário antigo (limpa TMP).
      // Roda mesmo em caso de erro no passo 4 para evitar marker residual.
      await supabase
        .from("agendamentos")
        .update({ paciente_nome: "DISPONÍVEL" } as never)
        .eq("id", destSlot.id);
    }

    return { ok: true, id: agendamento_id };
  });
