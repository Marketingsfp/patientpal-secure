/**
 * FASE 2 — coleta e gravação das evidências da execução (server-only).
 *
 * O coletor vive no escopo da requisição (AsyncLocalStorage), então cada
 * atendimento registra apenas as próprias evidências, mesmo com várias
 * conversas ao mesmo tempo.
 *
 * Gravação é best-effort: auditoria NUNCA pode derrubar um atendimento.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  criarColetor,
  type Coletor,
  type Etapa,
  type PromptDaExecucao,
  type SnapshotPrompt,
} from "./evidencias";


const escopo = new AsyncLocalStorage<Coletor>();

/** Executa `fn` com um coletor próprio e devolve o resultado + o pacote. */
export async function comColetor<T>(fn: (coletor: Coletor) => Promise<T>): Promise<{
  resultado: T;
  coletor: Coletor;
}> {
  const coletor = criarColetor();
  const resultado = await escopo.run(coletor, () => fn(coletor));
  return { resultado, coletor };
}

/** Coletor da requisição atual, quando houver. Fora do escopo devolve `null`. */
export function coletorAtual(): Coletor | null {
  return escopo.getStore() ?? null;
}

/**
 * FASE 6 — registra, na execução em curso, QUAL versão das Instruções da Nina
 * foi carregada. Só a referência: o texto do prompt não é duplicado.
 */
export function registrarPromptDaExecucao(ref: PromptDaExecucao): void {
  try {
    coletorAtual()?.promptVersao(ref);
  } catch {
    /* rastreabilidade nunca interrompe o atendimento */
  }
}

/**
 * FASE 5 — registra o SNAPSHOT IMUTÁVEL do conteúdo enviado ao modelo.
 * Deve ser chamado imediatamente ANTES da chamada, nunca depois da resposta.
 */
export function registrarSnapshotPrompt(snap: SnapshotPrompt): void {
  try {
    coletorAtual()?.promptSnapshot(snap);
  } catch {
    /* auditoria nunca interrompe o atendimento */
  }
}



/** Atalho seguro: registra a etapa só se existir um coletor no escopo. */
export function registrarEtapa(etapa: Omit<Etapa, "em"> & { em?: string }): void {
  try {
    coletorAtual()?.etapa(etapa);
  } catch {
    /* auditoria nunca interrompe o atendimento */
  }
}

/**
 * Grava as evidências da execução. O snapshot é histórico: alterações
 * posteriores no catálogo não reescrevem o que está aqui.
 */
export async function gravarEvidencias(
  execucaoId: string | null,
  clinicaId: string | null,
  coletor: Coletor,
): Promise<void> {
  if (!execucaoId) return;
  try {
    const pacote = coletor.pacote();
    const { error } = await supabaseAdmin
      .from("nina_execucao_evidencias")
      .upsert(
        {
          execucao_id: execucaoId,
          clinica_id: clinicaId,
          etapas: pacote.etapas as never,
          lacunas: pacote.lacunas,
        } as never,
        { onConflict: "execucao_id" },
      );
    if (error) console.warn("[nina-evidencias] falha ao gravar:", error.message);

    // FASE 6 — referência imutável da versão do prompt usada nesta execução.
    if (pacote.prompt) {
      const { error: e3 } = await supabaseAdmin
        .from("nina_execucoes")
        .update({
          prompt_versao_id: pacote.prompt.versaoId,
          prompt_versao: pacote.prompt.versao,
          prompt_publicado_em: pacote.prompt.publicadoEm,
          prompt_origem: pacote.prompt.origem,
          prompt_modulos: pacote.modulos,
        } as never)
        .eq("id", execucaoId);
      if (e3) console.warn("[nina-evidencias] falha ao vincular versão do prompt:", e3.message);
      await registrarTracePrompt(execucaoId, clinicaId, pacote.prompt, pacote.modulos);
    }

    if (pacote.mensagensEntrada.length) {
      const { error: e2 } = await supabaseAdmin
        .from("nina_execucoes")
        .update({ mensagens_entrada: pacote.mensagensEntrada } as never)
        .eq("id", execucaoId);
      if (e2) console.warn("[nina-evidencias] falha ao vincular entradas:", e2.message);
    }
  } catch (e) {
    console.warn("[nina-evidencias] erro inesperado:", e instanceof Error ? e.message : e);
  }
}

/**
 * FASE 6 — evento de rastreio da montagem do prompt, para a aba
 * Nina → Arquitetura → Execução mostrar a versão HISTÓRICA daquela mensagem.
 * Best-effort: qualquer falha aqui é apenas logada.
 */
async function registrarTracePrompt(
  execucaoId: string,
  clinicaId: string | null,
  prompt: PromptDaExecucao,
  modulos: string[],
): Promise<void> {
  try {
    const agora = new Date().toISOString();
    const metadata = {
      prompt_versao: prompt.versao ? `v${prompt.versao}` : "texto do código",
      prompt_versao_id: prompt.versaoId,
      publicado_em: prompt.publicadoEm,
      prompt_status:
        prompt.origem === "publicada"
          ? "sucesso"
          : prompt.origem === "cache"
            ? "sucesso (última versão válida conhecida)"
            : "sem versão publicada — texto do código",
      prompt_origem: prompt.origem,
      modulos,
    };
    const base = {
      clinica_id: clinicaId,
      trace_id: execucaoId,
      execution_id: execucaoId,
      conversation_id: prompt.conversaId ?? null,
      message_id: null,
      cycle_id: 1,
      event_type: "completed",
      started_at: agora,
      finished_at: agora,
      duration_ms: null,
      status: "ok",
      metadata,
    };
    const { error } = await supabaseAdmin
      .from("nina_trace_eventos")
      .insert([
        { ...base, node_id: "instructions.published" },
        { ...base, node_id: "prompt.compose" },
      ] as never);
    if (error) console.warn("[nina-evidencias] falha ao gravar rastro do prompt:", error.message);
  } catch (e) {
    console.warn("[nina-evidencias] rastro do prompt:", e instanceof Error ? e.message : e);
  }
}
