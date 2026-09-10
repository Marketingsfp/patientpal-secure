/**
 * FASE 2 — Message Burst Aggregation (estado persistente).
 *
 * O lote NÃO vive em memória: fica em `nina_message_batches` /
 * `nina_message_batch_itens`, com reserva atômica no banco. Isso mantém um
 * único turno da Nina mesmo com várias invocações, instâncias ou reinícios.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decidirEspera, montarTurnoPaciente } from "@/lib/nina/burst";
import {
  adquirirLockConversa,
  liberarLockConversa,
  recuperarLotesTravados,
  type LockConversa,
} from "@/lib/nina/lock-conversa.server";
import { revisaoAtualConversa } from "@/lib/nina/revisao-conversa.server";

export type TurnoNina = {
  batchId: string;
  /** IDs reais das mensagens do lote, em ordem de chegada. */
  mensagens: string[];
  /** Texto do turno lógico (uma ou várias mensagens, sempre separadas). */
  texto: string;
  /**
   * FASE 3 — trava da conversa mantida durante TODO o turno (modelo,
   * ferramentas, memória, estado, Confidence Engine, handoff e envio).
   */
  lock: LockConversa | null;
  /**
   * FASE 4 — revisão da conversa usada por esta geração. Antes de enviar,
   * compara-se com a revisão atual: se mudou, a resposta é obsoleta.
   */
  revisao: number;
};

const dormir = (ms: number) =>
  ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve();

/**
 * Registra a mensagem no lote da conversa, aguarda a quiet window e tenta
 * assumir o turno. Retorna `null` quando outra invocação (mensagem mais nova)
 * é a responsável por processar — esta simplesmente se encerra.
 *
 * Não atrasa persistência, Realtime nem a exibição para atendentes: é chamado
 * DEPOIS de tudo isso, só antes da decisão da Nina.
 */
export async function aguardarTurnoNina(input: {
  clinicaId: string;
  telefone: string;
  conversaId?: string | null;
  mensagemId?: string | null;
  textoAtual: string;
  /** Fallback quando o lote não pôde ser registrado. */
  mensagensFallback?: string[];
}): Promise<TurnoNina | null> {
  const fallback = async (): Promise<TurnoNina | null> => {
    // Mesmo sem lote, o turno só roda com a conversa travada.
    const lock = await adquirirLockConversa({
      clinicaId: input.clinicaId,
      telefone: input.telefone,
      conversaId: input.conversaId ?? null,
    });
    if (!lock) return null;
    return {
      batchId: "",
      mensagens: input.mensagensFallback ?? (input.mensagemId ? [input.mensagemId] : []),
      texto: input.textoAtual,
      lock,
      revisao: await revisaoAtualConversa(input.clinicaId, input.telefone),
    };
  };

  if (!input.mensagemId || !input.telefone) return fallback();

  // Recuperação: lote reservado por uma execução que falhou volta a ficar
  // disponível, para a conversa não travar para sempre.
  await recuperarLotesTravados(input.clinicaId, input.telefone);

  let batchId = "";
  let revision = 0;
  let primeiraMs = Date.now();
  try {
    const { data, error } = await supabaseAdmin.rpc("nina_batch_registrar", {
      _clinica_id: input.clinicaId,
      _telefone: input.telefone,
      _conversa_id: (input.conversaId ?? undefined) as string,
      _mensagem_id: input.mensagemId,
    });
    if (error) throw error;
    const linha = (Array.isArray(data) ? data[0] : data) as
      | { batch_id?: string; revision?: number; first_message_at?: string }
      | null;
    if (!linha?.batch_id) return fallback();
    batchId = linha.batch_id;
    revision = linha.revision ?? 0;
    primeiraMs = linha.first_message_at ? Date.parse(linha.first_message_at) : Date.now();
  } catch (e) {
    console.error("[nina] burst: registro do lote falhou", e);
    return fallback();
  }

  const { esperaMs, forcar } = decidirEspera(Date.now(), primeiraMs);
  await dormir(esperaMs);

  // Serialização por conversa ANTES de qualquer decisão/ferramenta.
  const lock = await adquirirLockConversa({
    clinicaId: input.clinicaId,
    telefone: input.telefone,
    conversaId: input.conversaId ?? null,
    batchId,
  });
  if (!lock) {
    console.warn("[nina] lock: conversa ocupada, turno adiado", { batchId });
    return null;
  }

  try {
    const { data, error } = await supabaseAdmin.rpc("nina_batch_reivindicar", {
      _batch_id: batchId,
      _revision: revision,
      _forcar: forcar,
    });
    if (error) throw error;
    const linha = (Array.isArray(data) ? data[0] : data) as
      | { reivindicado?: boolean; mensagens?: string[] }
      | null;
    if (!linha?.reivindicado) {
      // Mensagem mais nova assume o turno: solta a trava e encerra.
      await liberarLockConversa(lock);
      return null;
    }
    const ids = linha.mensagens ?? [];
    return {
      batchId,
      mensagens: ids.length ? ids : [input.mensagemId],
      texto: await montarTextoDoLote(ids, input.textoAtual),
      lock,
      // Revisão congelada no momento do claim: tudo que chegar depois torna
      // esta geração obsoleta.
      revisao: await revisaoAtualConversa(input.clinicaId, input.telefone),
    };
  } catch (e) {
    console.error("[nina] burst: reivindicação falhou", e);
    await liberarLockConversa(lock);
    return null;
  }
}

async function montarTextoDoLote(ids: string[], textoAtual: string): Promise<string> {
  if (ids.length <= 1) return textoAtual;
  try {
    const { data } = await supabaseAdmin
      .from("whatsapp_mensagens")
      .select("id, body, created_at")
      .in("id", ids)
      .order("created_at", { ascending: true });
    const linhas = (data ?? []) as { id: string; body: string | null }[];
    const porId = new Map(linhas.map((m) => [m.id, m.body ?? ""]));
    const textos = ids.map((id) => porId.get(id) ?? "").filter((t) => t.trim().length > 0);
    const turno = montarTurnoPaciente(textos);
    return turno || textoAtual;
  } catch (e) {
    console.error("[nina] burst: leitura das mensagens do lote falhou", e);
    return textoAtual;
  }
}

/** Fecha o lote e solta a trava da conversa (mesmo em caso de falha). */
export async function concluirTurnoNina(
  batchId: string,
  execucaoId?: string | null,
  lock?: LockConversa | null,
  status: "PROCESSED" | "SUPERSEDED" = "PROCESSED",
): Promise<void> {
  if (!batchId) {
    await liberarLockConversa(lock ?? null);
    return;
  }
  try {
    await supabaseAdmin.rpc("nina_batch_concluir", {
      _batch_id: batchId,
      _execucao_id: (execucaoId ?? undefined) as string,
      _status: status,
    });
  } catch (e) {
    console.error("[nina] burst: conclusão do lote falhou", e);
  } finally {
    await liberarLockConversa(lock ?? null);
  }
}
