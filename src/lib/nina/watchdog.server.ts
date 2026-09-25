import { contextoWatchdog } from "./watchdog-contexto.server";
/** Coordenação durável da fila existente. Nunca envia credenciais ao navegador. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ErroReservaTurnoPerdida } from "./reserva-turno";
import { manterLockConversa, liberarLockConversa, type LockConversa } from "./lock-conversa.server";
import { montarTurnoPaciente } from "./burst";
import { POLITICA_WATCHDOG, esperaRetryWatchdog } from "./watchdog";
import type { TurnoNina } from "./burst.server";
import { causaFalhaNina, repetirPreparacaoNina } from "./watchdog-falha";
import { conversaResolvida } from "../atendimento/ciclo-responsabilidade";

async function rpc(nome: string, args: Record<string, unknown>) {
  const { data, error } = await (supabaseAdmin as any).rpc(nome, args);
  if (error) throw new Error(`${nome}: ${error.code ?? "RPC_FAILED"}`);
  return data;
}

type AuditoriaSnapshot = {
  execucaoId?: string | null;
  traceId?: string | null;
  resultado?: import("./resposta/contrato").ResultadoRespostaNina;
  decisaoId?: string | null;
  textoFinalHash?: string | null;
};
type TextoFinalizado = { texto: string; encerrarConversaId: string | null };
export type SnapshotRespostaNina = {
  texto: string;
  auditoria: AuditoriaSnapshot;
  finalizada?: TextoFinalizado;
};
export type ControleWatchdogNina = {
  batchId: string;
  maxTentativas?: number;
  lock: LockConversa;
  snapshot: SnapshotRespostaNina | null;
  checkpoint: (etapa: string, snapshot?: SnapshotRespostaNina) => Promise<void>;
  evento: (nome: string, dados?: Record<string, unknown>) => Promise<void>;
  finalizar: (
    estado: "completed" | "failed" | "handoff" | "retry_pending",
    motivo?: string,
  ) => Promise<void>;
};

/** A migration desativada não rastreia lotes legados. Erro de banco não autoriza efeitos. */
export async function carregarControleWatchdog(
  turno: TurnoNina | null,
): Promise<ControleWatchdogNina | null> {
  if (!turno?.batchId) return null;
  const { data: lote, error } = await (supabaseAdmin as any)
    .from("nina_message_batches")
    .select("watchdog_state")
    .eq("id", turno.batchId)
    .maybeSingle();
  // Compatibilidade durante rollout: a versão anterior do banco não tem a coluna.
  if (error?.code === "42703" || error?.code === "PGRST204") return null;
  if (error) throw new Error("WATCHDOG_STATE_UNAVAILABLE");
  if (!lote?.watchdog_state) return null;
  const dados = await rpc("nina_watchdog_iniciar", {
    _batch: turno.batchId,
    _token: turno.lock.token,
  });
  if (!dados) throw new ErroReservaTurnoPerdida();
  const controle: ControleWatchdogNina = {
    batchId: turno.batchId,
    maxTentativas: dados.maxAttempts,
    lock: turno.lock,
    snapshot: dados.snapshot ?? null,
    async checkpoint(etapa, snapshot) {
      if (
        !(await rpc("nina_watchdog_checkpoint", {
          _batch: turno.batchId,
          _token: turno.lock.token,
          _etapa: etapa,
          _snapshot: snapshot ?? null,
        }))
      )
        throw new ErroReservaTurnoPerdida();
      if (snapshot) controle.snapshot = snapshot;
    },
    async evento(nome, dados) {
      await rpc("nina_watchdog_evento", {
        _batch: turno.batchId,
        _evento: nome,
        _dados: dados ?? {},
      });
    },
    async finalizar(estado, motivo) {
      const ok = await rpc("nina_watchdog_finalizar", {
        _batch: turno.batchId,
        _token: turno.lock.token,
        _estado: estado,
        _erro: motivo ?? null,
      });
      if (!ok) throw new ErroReservaTurnoPerdida();
    },
  };
  return controle;
}

/** A resposta completa é salva; uma retomada não repete modelo, ferramentas ou handoff. */
export async function gerarComCheckpointNina(
  controle: ControleWatchdogNina | null,
  auditoria: AuditoriaSnapshot,
  gerar: () => Promise<string>,
): Promise<string> {
  if (!controle) return gerar();
  if (controle.snapshot) {
    Object.assign(auditoria, controle.snapshot.auditoria);
    await controle.evento("GENERATION_REUSED");
    return controle.snapshot.texto;
  }
  // Modelo e ferramentas avançam para generating ANTES de executar. Uma falha
  // de importação/leitura anterior a eles tem resultado conhecido: nada foi enviado.
  await controle.checkpoint("preparing");
  await controle.evento("GENERATION_STARTED");
  const texto = await contextoWatchdog.run(controle, gerar);
  // Whitelist: callbacks de avaliação, prompts e segredos nunca entram no checkpoint.
  const snapshot: SnapshotRespostaNina = {
    texto,
    auditoria: {
      execucaoId: auditoria.execucaoId,
      traceId: auditoria.traceId,
      resultado: auditoria.resultado,
      decisaoId: auditoria.decisaoId,
      textoFinalHash: auditoria.textoFinalHash,
    },
  };
  await controle.checkpoint("generated", snapshot);
  await controle.evento("GENERATION_FINISHED");
  return texto;
}

/** Retoma exatamente o texto já finalizado, sem reavaliar encerramento ou gerar outro candidato. */
export async function finalizarTextoComCheckpointNina(
  controle: ControleWatchdogNina | null,
  finalizar: () => Promise<TextoFinalizado>,
): Promise<TextoFinalizado> {
  if (!controle) return finalizar();
  await controle.checkpoint("generated");
  if (controle.snapshot?.finalizada) return controle.snapshot.finalizada;
  const finalizada = await finalizar();
  if (!controle.snapshot) throw new Error("GENERATION_SNAPSHOT_MISSING");
  await controle.checkpoint("generated", { ...controle.snapshot, finalizada });
  return finalizada;
}

/** Só conclui saída preexistente quando o banco comprova conversa, canal e entrega. */
export async function vincularSaidaWatchdogNina(
  entradaId: string,
  saidaId: string | null | undefined,
  controle?: ControleWatchdogNina | null,
): Promise<boolean> {
  if (!saidaId) return false;
  const { data, error } = await (supabaseAdmin as any).rpc("nina_watchdog_vincular_saida", {
    _entrada: entradaId,
    _saida: saidaId,
    _batch: controle?.batchId ?? null,
    _token: controle?.lock.token ?? null,
  });
  if (["PGRST202", "42883"].includes(error?.code)) return false;
  if (error) throw new Error("DELIVERY_PROOF_UNAVAILABLE");
  return data === true;
}

export type PayloadEntregaNina = {
  texto: string;
  tipo: "text" | "audio";
  canal: "whatsapp" | "test-console";
  from: string | null;
  mediaId?: string;
  mime?: string;
  execucaoId?: string | null;
  transcricao?: string;
  integral?: boolean;
};

export class ErroEntregaWatchdog extends Error {
  readonly codigo = "NINA_ENTREGA_WATCHDOG";
  constructor(
    readonly recuperavel: boolean,
    readonly incerta: boolean,
  ) {
    super(
      incerta
        ? "DELIVERY_OUTCOME_UNKNOWN"
        : recuperavel
          ? "DELIVERY_RETRY_PENDING"
          : "DELIVERY_FAILED",
    );
  }
}

/** O POST é cercado por um checkpoint atômico. Timeout de rede NÃO significa não enviado. */
export async function entregarComCheckpointNina(
  controle: ControleWatchdogNina,
  payload: PayloadEntregaNina,
  enviar: () => Promise<{ wa_message_id: string | null }>,
): Promise<{ wa_message_id: string | null; mensagemId: string }> {
  try {
    const parte = payload.tipo === "audio" ? "audio" : "texto";
    await controle.checkpoint("delivery");
    const preparada = await rpc("nina_watchdog_entrega_preparar", {
      _batch: controle.batchId,
      _token: controle.lock.token,
      _parte: parte,
      _payload: payload,
    });
    if (preparada.estado === "confirmed") {
      await controle.evento("DUPLICATE_PREVENTED");
      return { wa_message_id: preparada.transporte_id, mensagemId: preparada.mensagem_id };
    }
    const claim = await rpc("nina_watchdog_entrega_claim", {
      _batch: controle.batchId,
      _token: controle.lock.token,
      _parte: parte,
    });
    if (!claim) throw new ErroEntregaWatchdog(false, true);
    let transporteId: string | null = null;
    if (payload.canal === "whatsapp") {
      try {
        ({ wa_message_id: transporteId } = await enviar());
        if (!transporteId) throw new Error("DELIVERY_MISSING_RECEIPT");
      } catch (e) {
        // Somente rejeição explícita permite reenvio; rede/timeout/5xx são incertos.
        const status = Number((e as { status?: number })?.status);
        const rejeitada = status >= 400 && status < 500;
        const recuperavel = status === 429;
        await rpc("nina_watchdog_entrega_resultado", {
          _batch: controle.batchId,
          _token: controle.lock.token,
          _parte: parte,
          _estado: recuperavel ? "retry_pending" : rejeitada ? "failed" : "uncertain",
          _transporte_id: null,
          _erro: recuperavel
            ? "PROVIDER_RATE_LIMIT"
            : rejeitada
              ? "PROVIDER_REJECTED"
              : "DELIVERY_OUTCOME_UNKNOWN",
          _retry_ms: esperaRetryWatchdog(Number(claim.attempt_count ?? 1)),
        });
        throw new ErroEntregaWatchdog(recuperavel, !rejeitada);
      }
    }
    // Se esta gravação falhar, não reenviar: o checkpoint sending continua incerto.
    const ok = await rpc("nina_watchdog_entrega_resultado", {
      _batch: controle.batchId,
      _token: controle.lock.token,
      _parte: parte,
      _estado: "confirmed",
      _transporte_id: transporteId,
      _erro: null,
      _retry_ms: 0,
    });
    if (!ok) throw new ErroEntregaWatchdog(false, true);
    return { wa_message_id: transporteId, mensagemId: preparada.mensagem_id };
  } catch (e) {
    if (e instanceof ErroEntregaWatchdog || e instanceof ErroReservaTurnoPerdida) throw e;
    // Inclusive falha ao salvar o ACK: o transporte não pode cair para outro envio.
    throw new ErroEntregaWatchdog(false, true);
  }
}

export async function finalizarWatchdogNina(controle: ControleWatchdogNina | null, erro?: unknown) {
  if (!controle) return;
  if (
    erro instanceof ErroReservaTurnoPerdida ||
    (erro as { codigo?: string })?.codigo === "NINA_RESERVA_TURNO_PERDIDA"
  )
    return;
  const { data: lote, error } = await (supabaseAdmin as any)
    .from("nina_message_batches")
    .select(
      "watchdog_state,watchdog_stage,watchdog_token,watchdog_revision,attempt_count,response_snapshot,conversa_id,clinica_id,telefone,created_at",
    )
    .eq("id", controle.batchId)
    .single();
  if (error) throw new Error("WATCHDOG_STATE_UNAVAILABLE");
  if (["completed", "failed", "handoff", "retry_pending"].includes(lote.watchdog_state)) return;
  if (lote.watchdog_token !== controle.lock.token) throw new ErroReservaTurnoPerdida();
  const causa = erro ? causaFalhaNina(erro) : null;
  if (causa) await controle.evento("PROCESSING_ERROR", { erro: causa, etapa: lote.watchdog_stage });
  const aviso = controle.snapshot?.auditoria.resultado?.avisoExistente;
  if (aviso?.estado === "confirmado" && aviso.mensagemId) {
    const { data: item, error: ei } = await (supabaseAdmin as any)
      .from("nina_message_batch_itens")
      .select("mensagem_id")
      .eq("batch_id", controle.batchId)
      .limit(1)
      .maybeSingle();
    if (ei) throw new Error("BATCH_ENTRIES_UNAVAILABLE");
    if (item) await vincularSaidaWatchdogNina(item.mensagem_id, aviso.mensagemId, controle);
  }
  const { data: entregas, error: e } = await (supabaseAdmin as any)
    .from("nina_batch_entregas")
    .select("estado,parte,payload")
    .eq("batch_id", controle.batchId);
  if (e) throw new Error("DELIVERY_STATE_UNAVAILABLE");
  if (
    entregas?.some((x: any) => x.parte === "texto" || x.payload?.integral === true) &&
    entregas.every((x: any) => x.estado === "confirmed")
  ) {
    await controle.finalizar("completed");
  } else if (
    erro instanceof ErroEntregaWatchdog &&
    erro.recuperavel &&
    entregas.some((x: any) => x.estado === "retry_pending")
  ) {
    await controle.finalizar("retry_pending", erro.message);
  } else {
    const { data: conversa, error: ec } = await (supabaseAdmin as any)
      .from("atend_conversas")
      .select("owner_type,atribuida_user_id,ai_enabled,status,ultima_msg_em,nina_fluxo_estado")
      .eq("id", lote.conversa_id)
      .eq("clinica_id", lote.clinica_id)
      .maybeSingle();
    if (ec) throw new Error("WATCHDOG_STATE_UNAVAILABLE");
    // Um erro antigo não pode reabrir uma conversa resolvida ou atingir sessão nova.
    if (
      !conversa ||
      conversaResolvida(conversa) ||
      Date.parse(conversa.nina_fluxo_estado?.session_started_at ?? "") > Date.parse(lote.created_at)
    ) {
      await controle.finalizar("failed", "CONVERSATION_CLOSED_OR_CHANGED");
      return;
    }
    if (["HUMAN", "NONE"].includes(conversa?.owner_type) || conversa?.atribuida_user_id) {
      await controle.finalizar(
        "handoff",
        causa ? `PROCESSING_ERROR: ${causa}` : "HUMAN_OWNER_CONFIRMED",
      );
      return;
    }
    // Entrega incerta também encaminha (regra da clínica, 25/09/2026): melhor o paciente receber a
    // frase de encaminhamento em dobro do que ficar sem retorno. Entrega recusada não entra aqui.
    if (
      erro &&
      (!(erro instanceof ErroEntregaWatchdog) || erro.incerta) &&
      conversa.owner_type === "AI" &&
      conversa.ai_enabled &&
      conversa.ultima_msg_em
    ) {
      const revisao = Number(
        await rpc("nina_revisao_atual", {
          _clinica_id: lote.clinica_id,
          _telefone: lote.telefone,
        }),
      );
      if (!lote.watchdog_revision || revisao !== Number(lote.watchdog_revision)) {
        await controle.finalizar("failed", "SUPERSEDED_BY_NEW_MESSAGE");
        return;
      }
      if (
        repetirPreparacaoNina({
          erro,
          etapa: lote.watchdog_stage,
          snapshot: lote.response_snapshot,
          entregas: entregas?.length ?? 0,
          tentativa: lote.attempt_count,
          maxTentativas: controle.maxTentativas,
        })
      ) {
        await controle.evento("PREPARATION_RETRY", { erro: causa });
        await controle.finalizar("retry_pending", `PREPARATION_FAILED: ${causa}`);
        return;
      }
      // Falha definitiva ou efeitos já iniciados: não repetir operações. O handoff
      // canônico avisa o paciente e distribui; em teste ele só simula a atribuição.
      await controle.checkpoint(lote.watchdog_stage);
      const { encaminharParaHumano } = await import("../atendimento/handoff.server");
      const encaminhamento = await encaminharParaHumano({
        clinicaId: lote.clinica_id,
        conversaId: lote.conversa_id,
        motivo: "NINA_PROCESSING_FAILED: falha técnica ao preparar ou gerar a resposta",
        resumo:
          "A Nina não conseguiu concluir este turno. A equipe deve revisar o histórico e eventuais operações registradas antes de continuar o atendimento.",
        solicitadoPor: "SISTEMA",
        somenteSeNina: {
          ultimaMsgEm: conversa.ultima_msg_em,
          sessaoId: conversa.nina_fluxo_estado?.session_id ?? null,
        },
      });
      await controle.evento(
        encaminhamento.ok ? "PROCESSING_ERROR_HANDOFF" : "PROCESSING_ERROR_HANDOFF_FAILED",
        {
          erro: causa,
          encaminhado: encaminhamento.ok,
          aviso_confirmado: encaminhamento.aviso?.entregue === true,
          mensagem_id: encaminhamento.aviso?.mensagemId ?? null,
        },
      );
      if (encaminhamento.ok) {
        await controle.finalizar("handoff", `PROCESSING_ERROR: ${causa}`);
        return;
      }
    }
    await controle.finalizar(
      "failed",
      erro instanceof ErroEntregaWatchdog
        ? erro.message
        : causa
          ? `PROCESSING_ERROR: ${causa}`
          : "RESPONSE_NOT_CONFIRMED",
    );
  }
}

/** Recuperação chama os mesmos transportes, com entradas persistidas e reserva reclamada. */
export async function executarWatchdogNina(limite = POLITICA_WATCHDOG.paralelismo) {
  const lotes = (await rpc("nina_watchdog_reivindicar", {
    _limite: Math.max(1, Math.min(POLITICA_WATCHDOG.paralelismo, Math.floor(limite) || 1)),
  })) as any[];
  const resultados = await Promise.allSettled(
    lotes.map(async (lote) => {
      const lock = { chave: `${lote.clinica_id}:${lote.telefone}`, token: lote.watchdog_token };
      manterLockConversa(lock);
      let controleRecuperacao: ControleWatchdogNina | null = null;
      try {
        const { data: itens, error: ei } = await (supabaseAdmin as any)
          .from("nina_message_batch_itens")
          .select("mensagem_id,ordem")
          .eq("batch_id", lote.id)
          .order("ordem");
        if (ei || !itens?.length) throw new Error("BATCH_ENTRIES_UNAVAILABLE");
        const { data: entradas, error: em } = await (supabaseAdmin as any)
          .from("whatsapp_mensagens")
          .select("id,body,transcricao,tipo,is_teste,canal,conversa_id,wa_message_id,created_at")
          .eq("clinica_id", lote.clinica_id)
          .eq("direction", "in")
          .in(
            "id",
            itens.map((i: any) => i.mensagem_id),
          )
          .order("created_at")
          .order("id");
        if (em || entradas?.length !== itens.length) throw new Error("BATCH_ENTRIES_UNAVAILABLE");
        const primeira = entradas[0];
        const revisaoAtual = Number(
          await rpc("nina_revisao_atual", {
            _clinica_id: lote.clinica_id,
            _telefone: lote.telefone,
          }),
        );
        const revisao = lote.response_snapshot ? Number(lote.watchdog_revision) : revisaoAtual;
        const turno: TurnoNina = {
          batchId: lote.id,
          lock,
          revisao,
          mensagens: entradas.map((m: any) => m.id),
          texto: montarTurnoPaciente(
            entradas.map((m: any) => (m.tipo === "audio" ? m.transcricao : m.body)),
          ),
        };
        controleRecuperacao = await carregarControleWatchdog(turno);
        // Desistência da varredura (Erro Crítico 01): nada é gerado de novo; o encaminhamento
        // canônico avisa o paciente com a mesma frase de sempre e coloca a conversa na fila humana.
        const desistencia = /^HANDOFF_REQUIRED: (.+)$/.exec(String(lote.erro_tecnico ?? ""))?.[1];
        if (desistencia) {
          await finalizarWatchdogNina(controleRecuperacao, new Error(`WATCHDOG_${desistencia}`));
          return;
        }
        const { estadoConversaPorId, ninaPodeResponder } =
          await import("../atendimento/handoff.server");
        const estado = await estadoConversaPorId(lote.clinica_id, lote.conversa_id);
        const { ninaDesativadaNaClinica } = await import("../nina-desligada.server");
        if (!ninaPodeResponder(estado) || (await ninaDesativadaNaClinica(lote.clinica_id))) {
          await rpc("nina_watchdog_finalizar", {
            _batch: lote.id,
            _token: lock.token,
            _estado: "handoff",
            _erro: "NINA_NOT_OWNER",
          });
          return;
        }
        if (primeira.is_teste || primeira.canal === "test-console") {
          const { data: lead, error } = await (supabaseAdmin as any)
            .from("nina_teste_leads")
            .select("id,ciclo_id,conversa_id")
            .eq("clinica_id", lote.clinica_id)
            .eq("conversa_id", lote.conversa_id)
            .maybeSingle();
          if (error || !lead?.ciclo_id) throw new Error("TEST_SESSION_CHANGED");
          const { processarMensagemTeste } = await import("./teste-console.server");
          await processarMensagemTeste(
            {
              clinicaId: lote.clinica_id,
              leadId: lead.id,
              tipo: primeira.tipo,
              texto: primeira.tipo === "audio" ? primeira.transcricao : primeira.body,
              chave: primeira.wa_message_id,
            },
            null,
            { turno, mensagem: primeira, cicloId: lead.ciclo_id },
          );
        } else {
          const { loadWhatsAppConfig } = await import("../whatsapp.server");
          const cfg = await loadWhatsAppConfig(lote.clinica_id);
          if (!cfg?.access_token) throw new Error("WHATSAPP_NOT_CONFIGURED");
          const { processarRespostaWhatsappNina } = await import("./whatsapp-processamento.server");
          await processarRespostaWhatsappNina({
            clinicaId: lote.clinica_id,
            cfg: { ...cfg, access_token: cfg.access_token },
            phoneNumberId: cfg.phone_number_id,
            displayPhoneNumber: cfg.display_phone_number,
            from: lote.telefone,
            fromDigits: lote.telefone,
            convId: lote.conversa_id,
            msgInserida: primeira,
            textoPaciente: turno.texto,
            tipo: primeira.tipo,
            ehAudio: primeira.tipo === "audio",
            audioFalhou: false,
            retomada: turno,
          });
        }
        // Retornos antecipados por sessão/atribuição também precisam de desfecho.
        await finalizarWatchdogNina(controleRecuperacao);
      } catch (e) {
        // A retomada obedece ao mesmo limite e handoff do webhook/console.
        if (controleRecuperacao) await finalizarWatchdogNina(controleRecuperacao, e);
        else
          await rpc("nina_watchdog_finalizar", {
            _batch: lote.id,
            _token: lock.token,
            _estado: "failed",
            _erro: `RECOVERY_FAILED: ${causaFalhaNina(e)}`,
          });
        throw e;
      } finally {
        await liberarLockConversa(lock);
      }
    }),
  );
  if (!lotes.length)
    return { assumidos: 0, completed: 0, failed: 0, handoff: 0, retrying: 0, pendentes: 0 };
  const { data: atuais, error } = await (supabaseAdmin as any)
    .from("nina_message_batches")
    .select("watchdog_state")
    .in(
      "id",
      lotes.map((b) => b.id),
    );
  if (error) throw new Error("WATCHDOG_RESULT_UNAVAILABLE");
  const contar = (estado: string) => atuais.filter((b: any) => b.watchdog_state === estado).length;
  return {
    assumidos: lotes.length,
    completed: contar("completed"),
    failed: contar("failed"),
    handoff: contar("handoff"),
    retrying: contar("retry_pending"),
    pendentes: contar("processing") + contar("queued"),
    erros_worker: resultados.filter((r) => r.status === "rejected").length,
  };
}
