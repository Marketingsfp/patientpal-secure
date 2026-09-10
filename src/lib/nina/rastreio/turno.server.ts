/**
 * FASE 1 (Rastreabilidade da execução) — registro do turno (server-only).
 *
 * O registro vive no escopo da requisição (AsyncLocalStorage), do mesmo jeito
 * que o coletor de evidências, então cada atendimento anota só o próprio turno.
 *
 * Gravação: o resumo é gravado com `await` DENTRO da requisição. Nada aqui
 * depende de tarefa em segundo plano que possa ser abandonada quando a
 * requisição termina (o runtime de deploy encerra o worker no fim do handler).
 *
 * Rastreabilidade nunca derruba atendimento: toda falha é apenas logada.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { sanitizarMetadata, type EventoTrace } from "@/lib/nina/arquitetura/tracing";
import { gravarEventosTrace } from "@/lib/nina/arquitetura/tracing.server";
import {
  criarRegistroTurno,
  finalizarRegistroTurno,
  lacunasDoTurno,
  resumoTurnoParaTrace,
  NODE_ENTREGA_TURNO,
  NODE_RESUMO_TURNO,
  type BaseRegistroTurno,
  type ConfiancaDoTurno,
  type EntregaDoTurno,
  type OrigemResposta,
  type RegistroTurno,
  type SelecaoVersaoPrompt,
  type TransformacaoResposta,
} from "./turno";

const escopo = new AsyncLocalStorage<{ registro: RegistroTurno }>();

/** Executa `fn` com um registro de turno próprio e devolve resultado + registro. */
export async function comRegistroTurno<T>(
  base: BaseRegistroTurno,
  fn: (registro: RegistroTurno) => Promise<T>,
): Promise<{ resultado: T; registro: RegistroTurno }> {
  const caixa = { registro: criarRegistroTurno(base) };
  const resultado = await escopo.run(caixa, () => fn(caixa.registro));
  return { resultado, registro: caixa.registro };
}

export function registroTurnoAtual(): RegistroTurno | null {
  return escopo.getStore()?.registro ?? null;
}

function seguro(fn: (r: RegistroTurno) => void): void {
  try {
    const r = registroTurnoAtual();
    if (r) fn(r);
  } catch {
    /* rastreabilidade nunca interrompe o atendimento */
  }
}

/** SELEÇÃO DA VERSÃO — a primeira registrada é a que vale nesta execução. */
export function registrarVersaoPromptDoTurno(sel: SelecaoVersaoPrompt): void {
  seguro((r) => {
    if (!r.prompt) r.prompt = { ...sel };
  });
}

/** Uma rodada do modelo aconteceu (não confundir com "resposta do modelo"). */
export function registrarRodadaModelo(dados: {
  execucaoId?: string | null;
  modelo?: string | null;
}): void {
  seguro((r) => {
    r.modeloChamado = true;
    r.rodadas += 1;
    if (dados.execucaoId) r.execucaoId = dados.execucaoId;
    if (dados.modelo && !r.modelos.includes(dados.modelo)) r.modelos.push(dados.modelo);
  });
}

/** ORIGEM DA RESPOSTA — a última registrada é a que produziu o texto final. */
export function registrarOrigemResposta(origem: OrigemResposta, motivo?: string | null): void {
  seguro((r) => {
    r.origemResposta = origem;
    r.motivoOrigem = motivo ?? null;
  });
}

/** TRANSFORMAÇÃO — quem alterou o texto depois que o modelo respondeu. */
export function registrarTransformacaoResposta(
  t: Omit<TransformacaoResposta, "em"> & { em?: string },
): void {
  seguro((r) => {
    r.transformacoes.push({ ...t, em: t.em ?? new Date().toISOString() });
  });
}

export function registrarConfiancaDoTurno(c: ConfiancaDoTurno): void {
  seguro((r) => {
    r.confianca = { ...c };
  });
}

export function registrarEntregaDoTurno(e: EntregaDoTurno): void {
  seguro((r) => {
    r.entrega = { ...e };
  });
}

export function registrarDiagnosticoAutorizado(ativo: boolean): void {
  seguro((r) => {
    r.diagnostico = ativo;
  });
}

export function registrarConversaDoTurno(conversaId: string | null): void {
  seguro((r) => {
    if (conversaId) r.conversaId = conversaId;
  });
}

/* ------------------------------------------------------------ diagnóstico */

export const FLAG_DIAGNOSTICO_PAYLOAD = "nina_diagnostico_payload";

/**
 * O diagnóstico com payload por rodada só é capturado quando a clínica
 * autorizou explicitamente. Sem linha ou com erro de leitura: DESLIGADO.
 */
export async function diagnosticoAutorizado(clinicaId: string): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("clinica_feature_flags")
      .select("ativo")
      .eq("clinica_id", clinicaId)
      .eq("flag_key", FLAG_DIAGNOSTICO_PAYLOAD)
      .maybeSingle();
    if (error || !data) return false;
    return Boolean((data as { ativo?: boolean }).ativo);
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------- gravação */

function eventoResumo(registro: RegistroTurno): EventoTrace {
  const fechado = finalizarRegistroTurno(registro);
  const em = fechado.encerradoEm ?? new Date().toISOString();
  return {
    trace_id: fechado.turnoId,
    execution_id: fechado.execucaoId ?? fechado.turnoId,
    conversation_id: fechado.conversaId,
    message_id: fechado.mensagensEntrada[0] ?? null,
    cycle_id: Math.max(fechado.rodadas, 1),
    node_id: NODE_RESUMO_TURNO,
    event_type: "completed",
    started_at: fechado.iniciadoEm,
    finished_at: em,
    duration_ms: Math.max(Date.parse(em) - Date.parse(fechado.iniciadoEm), 0) || null,
    status: lacunasDoTurno(fechado).length ? "skipped" : "ok",
    metadata: sanitizarMetadata(resumoTurnoParaTrace(fechado)),
  };
}

/**
 * Grava o resumo do turno. É AGUARDADO pelo chamador: a evidência precisa
 * existir mesmo que o runtime encerre a requisição logo depois.
 */
export async function gravarResumoTurno(registro: RegistroTurno): Promise<void> {
  try {
    await gravarEventosTrace(registro.clinicaId, [eventoResumo(registro)]);
  } catch (e) {
    console.warn("[nina-turno] falha ao gravar resumo:", e instanceof Error ? e.message : e);
  }
}

/**
 * Liga o turno à mensagem REALMENTE entregue. Só pode ser gravado depois do
 * envio, quando existe o id da mensagem de saída.
 */
export async function gravarEntregaDoTurno(dados: {
  clinicaId: string;
  turnoId: string | null;
  execucaoId: string | null;
  conversaId: string | null;
  outgoingMessageId: string | null;
  canal: string;
  textoHash?: string | null;
}): Promise<void> {
  if (!dados.turnoId && !dados.execucaoId) return;
  const agora = new Date().toISOString();
  const evento: EventoTrace = {
    trace_id: dados.turnoId ?? dados.execucaoId!,
    execution_id: dados.execucaoId ?? dados.turnoId!,
    conversation_id: dados.conversaId,
    message_id: dados.outgoingMessageId,
    cycle_id: 1,
    node_id: NODE_ENTREGA_TURNO,
    event_type: "completed",
    started_at: agora,
    finished_at: agora,
    duration_ms: null,
    status: dados.outgoingMessageId ? "ok" : "skipped",
    metadata: sanitizarMetadata({
      turno_id: dados.turnoId,
      execucao_id: dados.execucaoId,
      outgoing_message_id: dados.outgoingMessageId,
      canal: dados.canal,
      texto_hash: dados.textoHash ?? null,
    }),
  };
  try {
    await gravarEventosTrace(dados.clinicaId, [evento]);
  } catch (e) {
    console.warn("[nina-turno] falha ao gravar entrega:", e instanceof Error ? e.message : e);
  }
}

/**
 * Caminho SEM modelo (gate de identificação, verificação de paciente, atendente
 * humano no comando, turno substituído, resposta obsoleta...). Registra o turno
 * com origem própria — nunca inventa uma chamada ao modelo que não houve.
 */
export async function registrarTurnoSemModelo(dados: {
  turnoId?: string;
  clinicaId: string;
  conversaId?: string | null;
  ambiente?: string;
  teste?: boolean;
  mensagensEntrada?: string[];
  batchId?: string | null;
  revisaoConversa?: number | null;
  origem: OrigemResposta;
  motivo: string;
  entrega?: EntregaDoTurno | null;
}): Promise<string> {
  const turnoId = dados.turnoId ?? crypto.randomUUID();
  try {
    const registro = criarRegistroTurno({
      turnoId,
      clinicaId: dados.clinicaId,
      conversaId: dados.conversaId ?? null,
      ambiente: dados.ambiente ?? (dados.teste ? "homologacao" : "producao"),
      teste: dados.teste === true,
      batchId: dados.batchId ?? null,
      mensagensEntrada: dados.mensagensEntrada ?? [],
      revisaoConversa: dados.revisaoConversa ?? null,
    });
    registro.origemResposta = dados.origem;
    registro.motivoOrigem = dados.motivo;
    if (dados.entrega) registro.entrega = dados.entrega;
    await gravarResumoTurno(registro);
  } catch (e) {
    console.warn("[nina-turno] falha no registro sem modelo:", e instanceof Error ? e.message : e);
  }
  return turnoId;
}
