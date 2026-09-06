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
import { criarColetor, type Coletor, type Etapa } from "./evidencias";

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
