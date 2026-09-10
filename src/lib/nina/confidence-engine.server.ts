/**
 * NINA CONFIDENCE DECISION ENGINE — persistência (server-only).
 *
 * Best-effort: auditoria nunca derruba um atendimento. Vale igual para o
 * atendimento real e para a homologação (mesma regra, mesmo registro; muda
 * apenas o campo `ambiente`).
 *
 * FASE 5: além da decisão resumida, grava o registro explicável — validadores,
 * status, códigos de motivo, fontes, ferramentas e bloqueios. Nunca grava
 * rascunho de resposta nem raciocínio interno do modelo.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { DecisaoConfianca } from "./confidence-engine";
import type { RegistroAuditoriaConfianca } from "./confidence/auditoria";
import { VERSAO_MOTOR, VERSAO_POLITICA } from "./confidence/policy";

import type { EstadoEntrega, RepresentacaoSaida } from "./confidence/entrega";

/** Desfecho rastreável de uma gravação de auditoria. */
export type ResultadoRegistro = {
  ok: boolean;
  id: string | null;
  erro: string | null;
};

function falha(contexto: string, erro: unknown): ResultadoRegistro {
  const msg = erro instanceof Error ? erro.message : String(erro);
  console.warn(`[nina-confianca] ${contexto}: ${msg}`);
  return { ok: false, id: null, erro: msg };
}

/**
 * FASE 5 — VÍNCULO DA SAÍDA (append-only).
 *
 * Antes isto era um UPDATE em `nina_confianca_decisoes`, que a trigger de
 * imutabilidade do histórico SEMPRE rejeitava: nenhum snapshot ficava ligado à
 * mensagem enviada. Agora o vínculo é uma linha nova em
 * `nina_confianca_vinculos` — a imutabilidade do resultado é preservada e cada
 * estado da saída (preparada, persistida, envio tentado, confirmada, falhou)
 * vira um registro próprio, por representação (texto, áudio, resumo falado).
 */
export async function registrarEntregaSaida(params: {
  clinicaId: string;
  decisaoId?: string | null;
  execucaoId?: string | null;
  conversaId?: string | null;
  outgoingMessageId?: string | null;
  representacao: RepresentacaoSaida;
  estado: EstadoEntrega;
  textoHash?: string | null;
  /** Identificador devolvido pelo transporte (ex.: wa_message_id). */
  transporteId?: string | null;
  detalhe?: Record<string, unknown> | null;
}): Promise<ResultadoRegistro> {
  try {
    let decisaoId = params.decisaoId ?? null;
    // Sem o id em mãos, procura o snapshot da resposta final desta execução.
    if (!decisaoId && params.execucaoId) {
      const { data, error } = await supabaseAdmin
        .from("nina_confianca_decisoes")
        .select("id")
        .eq("clinica_id", params.clinicaId)
        .eq("execucao_id", params.execucaoId)
        .eq("avaliacao", "answer_confidence")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return falha("busca do snapshot da resposta final", error);
      decisaoId = (data as { id?: string } | null)?.id ?? null;
    }
    const { data, error } = await supabaseAdmin
      .from("nina_confianca_vinculos")
      .insert({
        clinica_id: params.clinicaId,
        decisao_id: decisaoId,
        execucao_id: params.execucaoId ?? null,
        conversation_id: params.conversaId ?? null,
        outgoing_message_id: params.outgoingMessageId ?? null,
        representacao: params.representacao,
        estado: params.estado,
        texto_hash: params.textoHash ?? null,
        transporte_id: params.transporteId ?? null,
        detalhe: params.detalhe ?? null,
      } as never)
      .select("id")
      .maybeSingle();
    // O Supabase devolve o erro no objeto, sem lançar exceção: checar os dois.
    if (error) return falha("registro do vínculo de entrega", error);
    return { ok: true, id: (data as { id?: string } | null)?.id ?? null, erro: null };
  } catch (e) {
    return falha("registro do vínculo de entrega", e);
  }
}

/**
 * Compatibilidade: mesma intenção do vínculo antigo, agora sem UPDATE. Grava a
 * mensagem enviada como saída persistida da representação em texto.
 */
export async function vincularSnapshotMensagemEnviada(params: {
  clinicaId: string;
  execucaoId: string | null | undefined;
  outgoingMessageId: string | null | undefined;
  conversaId?: string | null;
  decisaoId?: string | null;
  representacao?: RepresentacaoSaida;
  estado?: EstadoEntrega;
  textoHash?: string | null;
  transporteId?: string | null;
}): Promise<ResultadoRegistro> {
  if (!params.outgoingMessageId && !params.decisaoId && !params.execucaoId) {
    return { ok: false, id: null, erro: "sem_identificadores" };
  }
  return registrarEntregaSaida({
    clinicaId: params.clinicaId,
    decisaoId: params.decisaoId ?? null,
    execucaoId: params.execucaoId ?? null,
    conversaId: params.conversaId ?? null,
    outgoingMessageId: params.outgoingMessageId ?? null,
    representacao: params.representacao ?? "texto_completo",
    estado: params.estado ?? "persistida",
    textoHash: params.textoHash ?? null,
    transporteId: params.transporteId ?? null,
  });
}


export async function registrarDecisaoConfianca(params: {
  clinicaId: string;
  conversaId: string | null;
  execucaoId: string | null;
  traceId?: string | null;
  teste: boolean;
  /**
   * FASE 4 — ambiente explícito. Quando não informado, cai na regra antiga
   * (teste ⇒ homologação). O Test Runner informa "teste_automatizado" para
   * que métricas reais nunca recebam execuções automatizadas.
   */
  ambiente?: import("./confianca-execucao").AmbienteQA;
  decisao: DecisaoConfianca;
  /** Registro explicável da Fase 5 (opcional para chamadas antigas). */
  auditoria?: RegistroAuditoriaConfianca | null;
  /** Fase 7: "shadow" (só observa) ou "enforce" (decide). */
  modo?: "shadow" | "enforce";
  /** Fase 7: o motor teria liberado a resposta/ação? */
  teriaPermitido?: boolean;
  /** Versão da política usada nesta avaliação (imutável no histórico). */
  policyVersion?: string;
  /**
   * FASE 5 — o que este registro avalia:
   * - `action_safety`: era seguro executar a ação (padrão histórico);
   * - `answer_confidence`: a mensagem final realmente enviada ao paciente.
   */
  avaliacao?: "action_safety" | "answer_confidence";
  /** FASE 5 — impressão digital do texto avaliado (gate de saída). */
  textoFinalHash?: string | null;
  /** FASE 5 — grounding afirmação a afirmação da resposta final. */
  claims?: unknown;
  /** FASE 6 — mensagem da Nina efetivamente enviada (vínculo principal). */
  outgoingMessageId?: string | null;
  /** FASE 6 — sessão da Nina que produziu a resposta. */
  ninaSessionId?: string | null;
  /** FASE 6 — versão do motor de confiança. */
  engineVersion?: string;
  /**
   * FASE 5 — telemetria da política de handoff (sem dado sensível):
   * o que foi decidido, por quê, e se o turno virou transferência.
   */
  handoffDecision?: string | null;
  handoffReason?: string | null;
  handoffOcorreu?: boolean | null;
  /**
   * FASE 5 — contexto ao qual esta nota pertence. Sem estes campos, uma nota
   * poderia ser reaproveitada só porque o texto tem o mesmo hash.
   */
  revisaoConversa?: number | null;
  evidenciasHash?: string | null;
  /** De onde veio o texto: modelo, gate, handoff, mídia, erro, encerramento. */
  origemResposta?: string | null;
  /** Quantas rodadas de modelo o turno consumiu (0 = caminho sem modelo). */
  rodadas?: number | null;
  /** Representação avaliada: texto completo, áudio integral ou resumo falado. */
  representacao?: RepresentacaoSaida | null;
  /**
   * FASE 6 — identidade da CONFIGURAÇÃO efetiva (diferente da versão do
   * algoritmo), de onde ela veio e etapa de ativação da clínica no turno.
   */
  configId?: string | null;
  configOrigem?: string | null;
  etapaAtivacao?: string | null;
}): Promise<ResultadoRegistro> {
  try {
    const a = params.auditoria ?? null;
    const { data, error } = await supabaseAdmin.from("nina_confianca_decisoes").insert({
      revisao_conversa: params.revisaoConversa ?? a?.conversationRevision ?? null,
      evidencias_hash: params.evidenciasHash ?? null,
      origem_resposta: params.origemResposta ?? null,
      rodadas: params.rodadas ?? null,
      representacao: params.representacao ?? "texto_completo",
      config_id: params.configId ?? null,
      config_origem: params.configOrigem ?? null,
      etapa_ativacao: params.etapaAtivacao ?? null,


      clinica_id: params.clinicaId,
      conversation_id: params.conversaId ?? a?.conversationId ?? null,
      execucao_id: params.execucaoId,
      trace_id: params.traceId ?? null,
      ambiente: params.ambiente ?? (params.teste ? "homologacao" : "producao"),
      score: params.decisao.score,
      acao: params.decisao.acao,
      bloqueio: params.decisao.bloqueio,
      categorias: params.decisao.categorias,
      motivos: params.decisao.motivos,
      modo: params.modo ?? "shadow",
      teria_permitido: params.teriaPermitido ?? null,
      policy_version: params.policyVersion ?? VERSAO_POLITICA,
      engine_version: params.engineVersion ?? VERSAO_MOTOR,
      outgoing_message_id: params.outgoingMessageId ?? a?.outgoingMessageId ?? null,
      nina_session_id: params.ninaSessionId ?? a?.ninaSessionId ?? null,
      avaliacao: params.avaliacao ?? "action_safety",
      texto_final_hash: params.textoFinalHash ?? null,
      handoff_decision: params.handoffDecision ?? null,
      handoff_reason: params.handoffReason ?? null,
      handoff_ocorreu: params.handoffOcorreu ?? null,
      claims: params.claims ?? null,
      ...(a
        ? {
            message_id: a.messageId,
            intencao: a.intencao,
            acao_solicitada: a.acaoSolicitada,
            // FASE 3 — o tipo do turno explica QUAIS critérios se aplicavam.
            turn_type: a.tipoTurno ?? null,

            nivel: a.nivel,
            decisao: a.decisao,
            validadores: a.validadores,
            reason_codes: a.reasonCodes,
            fontes: a.fontes,
            ferramentas: a.ferramentas,
            bloqueadores: a.bloqueadores,
            resultado_final: a.resultadoFinal,
            // FASE 6 — cobertura e conflitos auditáveis junto do snapshot.
            evidence_coverage: a.evidenceCoverage ?? null,
            conflitos: a.validadores.flatMap((v) =>
              (v.conflitos ?? []).map((c) => ({ validator: v.validator, ...c })),
            ),
          }
        : {}),
    } as never).select("id").maybeSingle();
    // Erro do Supabase vem no objeto: sem checar, a gravação "some" em silêncio.
    if (error) return falha("registro da decisão de confiança", error);
    return { ok: true, id: (data as { id?: string } | null)?.id ?? null, erro: null };
  } catch (e) {
    return falha("registro da decisão de confiança", e);
  }
}
