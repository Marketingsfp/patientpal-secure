/**
 * FASE 3 — Timeout de espera do paciente → atendimento humano.
 *
 * Quando a Nina enviou uma mensagem e o paciente não respondeu dentro
 * do prazo, a conversa sai da Nina e vai para a equipe, usando EXATAMENTE a
 * transferência e a distribuição que já existem (`encaminharParaHumano`).
 *
 * Timeout não resolve nem fecha a conversa: ela continua ativa, só troca de
 * responsável.
 *
 * Concorrência: o próprio handoff troca o responsável e limpa o prazo em um
 * único UPDATE condicionado ao prazo, última mensagem e sessão lidos. Falha
 * antes dessa gravação mantém a espera para a próxima execução do job.
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
import { reservaDaSessaoAtual } from "./agendamento-sessao";
import { encerrarEstadosTransacionais } from "./sessao";
import { informacoesEstado, pendenciasTimeout, rotuloEtapa } from "./timeout-resumo";
import {
  limparEsperaPaciente,
  mensagemEnviadaPelaNina,
  ultimaMensagemDaConversa,
} from "./espera-paciente.server";

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
  awaiting_patient_since: string | null;
  ultima_msg_em: string;
  nina_fluxo_estado: unknown;
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
    .select(
      "id,clinica_id,status,owner_type,ai_enabled,atribuida_user_id,patient_response_deadline,awaiting_patient_since,ultima_msg_em,nina_fluxo_estado",
    )
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
    const estado = normalizarEstado(linha.nina_fluxo_estado);
    // Revalidação: conversa ativa, ainda com a Nina, ainda sem atendente.
    const encerrada = STATUS_ENCERRADOS.includes(String(linha.status ?? "").toLowerCase());
    const jaHumana =
      linha.owner_type !== "AI" || linha.ai_enabled !== true || !!linha.atribuida_user_id;
    if (
      encerrada ||
      jaHumana ||
      !linha.patient_response_deadline ||
      reservaDaSessaoAtual(estado) ||
      estado.flow.stage === "HANDOFF"
    ) {
      await liberarEspera(linha);
      resultado.ignoradas += 1;
      continue;
    }

    try {
      const ultima = await ultimaMensagemDaConversa(linha.clinica_id, linha.id);
      // Inclui a mensagem persistida antes de o webhook conseguir limpar o prazo.
      // Saída nova também cancela este vencimento: ela inicia outra contagem.
      if (
        !mensagemEnviadaPelaNina(ultima) ||
        !linha.awaiting_patient_since ||
        Date.parse(ultima!.created_at) > Date.parse(linha.awaiting_patient_since)
      ) {
        await liberarEspera(linha);
        resultado.ignoradas += 1;
        continue;
      }
      if (
        estado.session_started_at &&
        Date.parse(ultima!.created_at) < Date.parse(estado.session_started_at)
      ) {
        await liberarEspera(linha);
        resultado.ignoradas += 1;
        continue;
      }
      const minutos = timeoutRespostaPacienteMinutos();
      const r = await encaminharParaHumano({
        clinicaId: linha.clinica_id,
        conversaId: linha.id,
        motivo: MOTIVO_TIMEOUT_PACIENTE,
        resumo: textoInternoTimeout(minutos),
        urgencia: "normal",
        solicitadoPor: "SISTEMA",
        somenteSeNina: {
          ultimaMsgEm: linha.ultima_msg_em,
          sessaoId: estado.session_id ?? null,
          prazoPaciente: linha.patient_response_deadline,
          estadoFluxoEsperado: linha.nina_fluxo_estado,
          estadoFluxoAposHandoff: {
            ...encerrarEstadosTransacionais(estado),
            flow: { stage: "HANDOFF" },
            updated_at: agora.toISOString(),
          },
        },
      });
      if (r.ok && !r.ja_estava_com_humano) {
        resultado.transferidas += 1;
        // Marcação interna na linha do tempo (nunca enviada ao paciente).
        await registrarEvento({
          clinicaId: linha.clinica_id,
          conversaId: linha.id,
          evento: "TIMEOUT_NINA",
          motivo: textoInternoTimeout(minutos),
          detalhes: {
            minutos,
            motivo: MOTIVO_TIMEOUT_PACIENTE,
            mensagem_nina_id: ultima!.id,
            aguardando_desde: linha.awaiting_patient_since,
            prazo: linha.patient_response_deadline,
          },
        });
        await finalizarContextoTimeout(linha, ultima!.body);
      } else if (
        r.ja_estava_com_humano ||
        r.mensagem === "A conversa mudou antes do encaminhamento."
      ) {
        resultado.ignoradas += 1;
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
  await limparEsperaPaciente(linha.clinica_id, linha.id, {
    ultimaMsgEm: linha.ultima_msg_em,
    estadoFluxo: linha.nina_fluxo_estado,
    deadline: linha.patient_response_deadline,
  });
}

/**
 * Depois da transferência, gera o resumo com o contexto anterior do fluxo.
 * Os estados transacionais já foram invalidados no UPDATE do handoff: um
 * "Sim" tardio não executa o agendamento antigo; a equipe revalida a vaga.
 *
 * Nada é apagado: mensagens, CRM, eventos, resumos e agendamentos já
 * confirmados permanecem. Só a operação pendente é invalidada.
 */
async function finalizarContextoTimeout(
  linha: LinhaConversa,
  ultimaResposta: string | null,
): Promise<void> {
  const ultimaPergunta = ultimaResposta?.trim().slice(0, 300) || null;
  let etapaInterrompida: string | null = null;
  let pendencias: string[] = [];
  let informacoes: string[] = [];

  try {
    // Foto anterior ao handoff: a invalidação ocorreu atomicamente com a troca
    // de responsável. O resumo nunca regrava o estado de uma sessão reaberta.
    const estado = normalizarEstado(linha.nina_fluxo_estado);
    etapaInterrompida = rotuloEtapa(estado.flow?.stage ?? null);
    pendencias = pendenciasTimeout(estado);
    informacoes = informacoesEstado(estado);
  } catch (e) {
    console.error("[nina-timeout] falha ao preparar contexto do resumo", e);
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
