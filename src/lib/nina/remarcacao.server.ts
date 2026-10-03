/**
 * Remarcação pela Maria (Etapa E2) — ferramentas que tocam a agenda.
 * Só executa com a chave `nina_remarcacao_whatsapp` ligada na clínica.
 * A troca usa o MESMO núcleo de reagendamento da Agenda (auditoria igual).
 */
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CtxNinaPaciente, ResultadoFerramenta } from "./paciente-tools.server";
import {
  FLAG_REMARCACAO_WHATSAPP,
  STATUS_NAO_REMARCAVEIS,
  VALIDADE_PROPOSTA_MS,
  antecedenciaSuficiente,
  confirmacaoPermitida,
  motivoRemarcacao,
  resumoRemarcacao,
} from "./remarcacao";

export async function remarcacaoAtiva(clinicaId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("clinica_feature_flags")
    .select("ativo")
    .eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_REMARCACAO_WHATSAPP)
    .maybeSingle();
  // Desligada por padrão: erro ou ausência = a Maria encaminha como antes.
  if (error || !data) return false;
  return data.ativo === true;
}

export const FERRAMENTAS_REMARCACAO = [
  {
    type: "function",
    function: {
      name: "propor_remarcacao",
      description:
        "Prepara a remarcação de um agendamento do paciente (agendamento_id vindo de meus_agendamentos) para um horário livre do MESMO profissional devolvido por consultar_disponibilidade. Não grava nada: devolve o resumo que você deve enviar ao paciente pedindo um “sim”.",
      parameters: {
        type: "object",
        properties: {
          agendamento_id: { type: "string" },
          inicio: { type: "string", description: "ISO 8601 vindo de consultar_disponibilidade" },
          fim: { type: "string", description: "ISO 8601 vindo de consultar_disponibilidade" },
        },
        required: ["agendamento_id", "inicio", "fim"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remarcar_agendamento",
      description:
        "Grava a remarcação preparada por propor_remarcacao, somente depois que o paciente respondeu “sim” ao resumo em outra mensagem. Sem parâmetros.",
      parameters: { type: "object", properties: {} },
    },
  },
] as const;

const falha = (erro: string, mensagem: string, extra?: Record<string, unknown>): ResultadoFerramenta =>
  ({ ok: false, erro, mensagem, ...(extra ?? {}) }) as ResultadoFerramenta;

const RECEPCAO = { encaminhar_recepcao: true };

function dataHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

type Agendamento = {
  id: string;
  clinica_id: string;
  paciente_id: string | null;
  medico_id: string | null;
  inicio: string;
  fim: string;
  status: string | null;
  procedimento: string | null;
  origem_integracao: string | null;
};

/** Carrega e confere: do paciente, da clínica, remarcável, com 2 h de antecedência. */
async function agendamentoDoPaciente(ctx: CtxNinaPaciente, id: string) {
  const { data } = await supabaseAdmin
    .from("agendamentos")
    .select("id, clinica_id, paciente_id, medico_id, inicio, fim, status, procedimento, origem_integracao")
    .eq("id", id)
    .maybeSingle();
  const a = data as Agendamento | null;
  if (!a || a.clinica_id !== ctx.clinicaId || !ctx.pacienteId || a.paciente_id !== ctx.pacienteId)
    return { erro: falha("ACTION_NOT_AUTHORIZED", "Não consegui confirmar esse agendamento. Encaminhe à recepção.", RECEPCAO) };
  // Homologação nunca mexe em agendamento real.
  if (ctx.teste && a.origem_integracao !== "nina_homologacao")
    return { erro: falha("ACTION_NOT_AUTHORIZED", "Na homologação só agendamentos de teste podem ser remarcados.", RECEPCAO) };
  if (STATUS_NAO_REMARCAVEIS.has(a.status ?? ""))
    return { erro: falha("ACTION_NOT_AUTHORIZED", "Esse agendamento não pode ser remarcado. Encaminhe à recepção.", RECEPCAO) };
  if (!antecedenciaSuficiente(a.inicio))
    return { erro: falha("ACTION_NOT_AUTHORIZED", "Faltam menos de 2 horas para o horário marcado: a remarcação é feita pela recepção. Encaminhe.", { ...RECEPCAO, motivo: "MENOS_DE_2_HORAS" }) };
  return { agendamento: a };
}

async function nomeMedico(id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data } = await supabaseAdmin.from("medicos").select("nome").eq("id", id).maybeSingle();
  return (data as { nome: string } | null)?.nome ?? null;
}

const zProposta = z.object({
  agendamento_id: z.string().uuid(),
  inicio: z.string().min(10),
  fim: z.string().min(10),
});

export async function executarRemarcacao(
  ctx: CtxNinaPaciente,
  nome: "propor_remarcacao" | "remarcar_agendamento",
  args: Record<string, unknown>,
): Promise<ResultadoFerramenta> {
  if (ctx.podeRemarcar !== true)
    return falha("PERMISSION_DENIED", "A remarcação pela assistente não está ativa nesta unidade. Encaminhe à recepção.", RECEPCAO);
  if (!ctx.pacienteId || !ctx.conversaId)
    return falha("PATIENT_NOT_VERIFIED", "Preciso identificar o paciente antes (nome completo, data de nascimento e telefone do WhatsApp).");

  if (nome === "propor_remarcacao") {
    const parsed = zProposta.safeParse(args);
    if (!parsed.success) return falha("VALIDATION_ERROR", "Parâmetros inválidos.");
    const p = parsed.data;
    const r = await agendamentoDoPaciente(ctx, p.agendamento_id);
    if (r.erro) return r.erro;
    const a = r.agendamento!;
    const ini = new Date(p.inicio).getTime();
    const fim = new Date(p.fim).getTime();
    if (!Number.isFinite(ini) || !Number.isFinite(fim) || fim <= ini || ini <= Date.now())
      return falha("VALIDATION_ERROR", "Novo horário inválido.");
    if (ini === new Date(a.inicio).getTime()) return falha("VALIDATION_ERROR", "Esse já é o horário atual.");
    // Vaga real e livre do MESMO profissional cobrindo o intervalo.
    const { data: livres } = await supabaseAdmin
      .from("agendamentos")
      .select("id, paciente_nome, inicio, fim")
      .eq("clinica_id", ctx.clinicaId)
      .eq("medico_id", a.medico_id!)
      .lte("inicio", p.inicio)
      .gte("fim", p.fim)
      .limit(20);
    const livre = ((livres ?? []) as Array<{ paciente_nome: string | null }>).some((s) => {
      const n = (s.paciente_nome ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
      return n === "disponivel";
    });
    if (!livre)
      return falha("SLOT_UNAVAILABLE", "Esse horário não está livre para o mesmo profissional. Consulte a agenda de novo e ofereça opções reais. Nada foi alterado.");
    const agora = new Date();
    const { error } = await supabaseAdmin.from("nina_remarcacoes_pendentes").upsert({
      conversa_id: ctx.conversaId,
      clinica_id: ctx.clinicaId,
      paciente_id: ctx.pacienteId,
      agendamento_id: a.id,
      novo_inicio: p.inicio,
      novo_fim: p.fim,
      teste: ctx.teste === true,
      criado_em: agora.toISOString(),
      expira_em: new Date(agora.getTime() + VALIDADE_PROPOSTA_MS).toISOString(),
    } as never, { onConflict: "conversa_id" });
    if (error) return falha("INTERNAL_ERROR", "Não consegui preparar a remarcação. Encaminhe à recepção.", RECEPCAO);
    const resumo = resumoRemarcacao({
      profissional: await nomeMedico(a.medico_id),
      procedimento: a.procedimento,
      antigo: dataHora(a.inicio),
      novo: dataHora(p.inicio),
    });
    return { ok: true, gravado: false, resumo, instrucao: "Envie este resumo exatamente e aguarde o “sim” do paciente. Não diga que já foi remarcado." };
  }

  // remarcar_agendamento
  const { data: pend } = await supabaseAdmin
    .from("nina_remarcacoes_pendentes")
    .select("agendamento_id, novo_inicio, novo_fim, criado_em, expira_em, paciente_id, clinica_id")
    .eq("conversa_id", ctx.conversaId)
    .maybeSingle();
  const proposta = pend as (Record<string, string>) | null;
  if (proposta && (proposta["paciente_id"] !== ctx.pacienteId || proposta["clinica_id"] !== ctx.clinicaId))
    return falha("ACTION_NOT_AUTHORIZED", "Não consegui confirmar a remarcação. Encaminhe à recepção.", RECEPCAO);
  const perm = confirmacaoPermitida(
    proposta ? { agendamento_id: proposta["agendamento_id"]!, novo_inicio: proposta["novo_inicio"]!, novo_fim: proposta["novo_fim"]!, criado_em: proposta["criado_em"]!, expira_em: proposta["expira_em"]! } : null,
    ctx.turnoIniciadoEm,
  );
  if (!perm.ok)
    return falha("ACTION_NOT_AUTHORIZED", perm.motivo === "EXPIRADA"
      ? "A proposta de remarcação expirou. Consulte a agenda de novo e mostre um novo resumo."
      : "Primeiro chame propor_remarcacao, envie o resumo e aguarde o “sim” do paciente em outra mensagem.", { motivos: [perm.motivo], aguardando_paciente: true });
  const r = await agendamentoDoPaciente(ctx, proposta!["agendamento_id"]!);
  if (r.erro) return r.erro;
  const a = r.agendamento!;
  const { reagendarAgendamentoCore } = await import("@/lib/agenda/reagendar-agendamento.core.server");
  const res = await reagendarAgendamentoCore(
    {
      db: supabaseAdmin as never,
      ator: {
        tipo: "integracao",
        api_key_id: "nina-ai",
        clinica_id: ctx.clinicaId,
        origem_integracao: ctx.teste ? "nina_homologacao" : "nina_whatsapp",
        // O agendamento é do próprio paciente (conferido acima), mesmo que
        // tenha sido marcado pela recepção.
        pode_gerenciar_todos: true,
      },
    },
    {
      clinica_id: ctx.clinicaId,
      agendamento_id: a.id,
      novo_inicio: proposta!["novo_inicio"]!,
      novo_fim: proposta!["novo_fim"]!,
      novo_medico_id: a.medico_id,
      motivo: motivoRemarcacao(ctx.teste === true),
    },
  ).catch((e) => ({ ok: false as const, validation_error: { message: String((e as Error)?.message ?? e) } }));
  await supabaseAdmin.from("nina_remarcacoes_pendentes").delete().eq("conversa_id", ctx.conversaId);
  if (!res.ok)
    return falha("SLOT_UNAVAILABLE", "A remarcação não foi feita e o horário antigo continua valendo. Avise o paciente e ofereça consultar outros horários.", { horario_antigo_mantido: true });
  return {
    ok: true,
    remarcado: true,
    agendamento_id: a.id,
    novo_horario: dataHora(proposta!["novo_inicio"]!),
    profissional: await nomeMedico(a.medico_id),
  };
}
