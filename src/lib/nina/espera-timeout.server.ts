/**
 * FASE 3 — Timeout de espera do paciente → atendimento humano.
 *
 * Quando a Nina fez uma pergunta necessária e o paciente não respondeu dentro
 * do prazo, a conversa sai da Nina e vai para a equipe, usando EXATAMENTE a
 * transferência e a distribuição que já existem (`encaminharParaHumano`).
 *
 * Timeout não resolve nem fecha a conversa: ela continua ativa, só troca de
 * responsável.
 *
 * Concorrência: a "reserva" do vencimento é um UPDATE condicionado ao mesmo
 * prazo que foi lido (`patient_response_deadline = <lido>`). Dois jobs
 * simultâneos disputam essa linha e só um consegue — o outro não encontra
 * nada e não transfere. Se o paciente respondeu no meio do caminho, o prazo já
 * foi apagado e o UPDATE não casa.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  STATUS_ENCERRADOS,
  encaminharParaHumano,
  registrarEvento,
} from "@/lib/atendimento/handoff.server";
import { timeoutRespostaPacienteMinutos } from "./espera-paciente";
import { MOTIVO_TIMEOUT_PACIENTE, textoInternoTimeout } from "./espera-timeout-motivo";
import { normalizarEstado } from "./fluxo-estado-normalizar";
import { encerrarEstadosTransacionais } from "./sessao";
import { informacoesEstado, pendenciasTimeout, rotuloEtapa } from "./timeout-resumo";

export { MOTIVO_TIMEOUT_PACIENTE };

/** Lote máximo por execução — o job nunca processa a fila inteira de uma vez. */
export const LOTE_TIMEOUT_PADRAO = 25;

export type ResultadoTimeoutLote = {
  avaliadas: number;
  transferidas: number;
  ignoradas: number;
  erros: number;
};

type LinhaConversa = {
  id: string;
  clinica_id: string;
  status: string | null;
  owner_type: string | null;
  ai_enabled: boolean | null;
  atribuida_user_id: string | null;
  patient_response_deadline: string | null;
};

export async function processarTimeoutsEsperaPaciente(args?: {
  clinicaId?: string | null;
  limite?: number;
  agora?: Date;
}): Promise<ResultadoTimeoutLote> {
  const agora = args?.agora ?? new Date();
  const limite = Math.max(1, Math.min(args?.limite ?? LOTE_TIMEOUT_PADRAO, 100));
  const resultado: ResultadoTimeoutLote = {
    avaliadas: 0,
    transferidas: 0,
    ignoradas: 0,
    erros: 0,
  };

  let consulta = supabaseAdmin
    .from("atend_conversas")
    .select("id, clinica_id, status, owner_type, ai_enabled, atribuida_user_id, patient_response_deadline")
    .not("patient_response_deadline", "is", null)
    .lte("patient_response_deadline", agora.toISOString())
    .order("patient_response_deadline", { ascending: true })
    .limit(limite);
  if (args?.clinicaId) consulta = consulta.eq("clinica_id", args.clinicaId);

  const { data, error } = await consulta;
  if (error) {
    console.error("[nina-timeout] falha ao listar conversas vencidas", error.message);
    return { ...resultado, erros: 1 };
  }

  const linhas = (data ?? []) as unknown as LinhaConversa[];
  resultado.avaliadas = linhas.length;

  for (const linha of linhas) {
    // Revalidação: conversa ativa, ainda com a Nina, ainda sem atendente.
    const encerrada = STATUS_ENCERRADOS.includes(String(linha.status ?? "").toLowerCase());
    const jaHumana =
      linha.owner_type === "HUMAN" || linha.ai_enabled === false || !!linha.atribuida_user_id;
    if (encerrada || jaHumana || !linha.patient_response_deadline) {
      await liberarEspera(linha);
      resultado.ignoradas += 1;
      continue;
    }

    // Reserva atômica do vencimento: só um job leva.
    const { data: reservadas, error: eReserva } = await supabaseAdmin
      .from("atend_conversas")
      .update({ awaiting_patient_since: null, patient_response_deadline: null } as never)
      .eq("id", linha.id)
      .eq("clinica_id", linha.clinica_id)
      .eq("patient_response_deadline", linha.patient_response_deadline)
      .select("id");
    if (eReserva) {
      console.error("[nina-timeout] falha ao reservar vencimento", eReserva.message);
      resultado.erros += 1;
      continue;
    }
    if (!reservadas || reservadas.length === 0) {
      // Paciente respondeu ou outra execução já cuidou disto.
      resultado.ignoradas += 1;
      continue;
    }

    try {
      const minutos = timeoutRespostaPacienteMinutos();
      const r = await encaminharParaHumano({
        clinicaId: linha.clinica_id,
        conversaId: linha.id,
        motivo: MOTIVO_TIMEOUT_PACIENTE,
        resumo: textoInternoTimeout(minutos),
        urgencia: "normal",
        solicitadoPor: "SISTEMA",
      });
      if (r.ok) {
        resultado.transferidas += 1;
        // Marcação interna na linha do tempo (nunca enviada ao paciente).
        await registrarEvento({
          clinicaId: linha.clinica_id,
          conversaId: linha.id,
          evento: "TIMEOUT_NINA",
          motivo: textoInternoTimeout(minutos),
          detalhes: { minutos, motivo: MOTIVO_TIMEOUT_PACIENTE },
        });
        await finalizarContextoTimeout(linha);
      } else resultado.erros += 1;
    } catch (e) {
      console.error("[nina-timeout] falha no handoff automático", e);
      resultado.erros += 1;
    }
  }

  return resultado;
}

/** Conversa que não deveria mais ter prazo: apenas limpa, sem transferir. */
async function liberarEspera(linha: LinhaConversa): Promise<void> {
  try {
    await supabaseAdmin
      .from("atend_conversas")
      .update({ awaiting_patient_since: null, patient_response_deadline: null } as never)
      .eq("id", linha.id)
      .eq("clinica_id", linha.clinica_id);
  } catch (e) {
    console.error("[nina-timeout] falha ao limpar prazo obsoleto", e);
  }
}

/**
 * Depois da transferência por inatividade:
 *  1. encerra os estados transacionais (escolha de vaga, confirmação final,
 *     criação de agendamento) — um "Sim" que chegue depois NÃO pode executar
 *     o agendamento antigo; a equipe revalida a disponibilidade;
 *  2. gera o Resumo da Nina com o contexto real do fluxo.
 *
 * Nada é apagado: mensagens, CRM, eventos, resumos e agendamentos já
 * confirmados permanecem. Só a operação pendente é invalidada.
 */
async function finalizarContextoTimeout(linha: LinhaConversa): Promise<void> {
  let ultimaPergunta: string | null = null;
  let etapaInterrompida: string | null = null;
  let pendencias: string[] = [];
  let informacoes: string[] = [];

  try {
    const { data } = await supabaseAdmin
      .from("atend_conversas")
      .select("nina_fluxo_estado")
      .eq("id", linha.id)
      .eq("clinica_id", linha.clinica_id)
      .maybeSingle();
    const estado = normalizarEstado((data as { nina_fluxo_estado?: unknown } | null)?.nina_fluxo_estado ?? null);
    etapaInterrompida = rotuloEtapa(estado.flow?.stage ?? null);
    pendencias = pendenciasTimeout(estado);
    informacoes = informacoesEstado(estado);

    const encerrado = encerrarEstadosTransacionais(estado);
    await supabaseAdmin
      .from("atend_conversas")
      .update({
        nina_fluxo_estado: {
          ...encerrado,
          flow: { stage: "HANDOFF" },
          updated_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", linha.id)
      .eq("clinica_id", linha.clinica_id);
  } catch (e) {
    console.error("[nina-timeout] falha ao encerrar estados transacionais", e);
  }

  try {
    const { data } = await supabaseAdmin
      .from("whatsapp_mensagens")
      .select("body")
      .eq("clinica_id", linha.clinica_id)
      .eq("conversa_id", linha.id)
      .eq("direction", "out")
      .order("recebida_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    const corpo = String((data as { body?: string } | null)?.body ?? "").trim();
    if (corpo) ultimaPergunta = corpo.slice(0, 300);
  } catch (e) {
    console.error("[nina-timeout] falha ao ler última pergunta", e);
  }

  try {
    const { garantirResumoHandoff } = await import("@/lib/atendimento/handoff-resumo.server");
    await garantirResumoHandoff({
      clinicaId: linha.clinica_id,
      conversaId: linha.id,
      extras: {
        ultimaPergunta,
        etapaInterrompida,
        pendenciasExtras: pendencias,
        informacoesExtras: informacoes,
      },
    });
  } catch (e) {
    console.error("[nina-timeout] falha ao gerar resumo do timeout", e);
  }
}
