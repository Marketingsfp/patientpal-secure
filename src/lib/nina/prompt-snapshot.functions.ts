/**
 * FASE 5 — leitura do snapshot IMUTÁVEL do prompt de uma execução.
 *
 * Usa a sessão do usuário (RLS): só quem tem gestão na clínica enxerga o
 * conteúdo técnico. Sem snapshot, devolvemos `null` — o prompt atual NUNCA
 * é usado para representar uma mensagem antiga.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type SnapshotPromptView = {
  versao: number | null;
  publicadoEm: string | null;
  origem: string | null;
  hash: string | null;
  promptUtilizado: string | null;
  conteudoEnviado: string | null;
  envelope: string | null;
  contextoDinamico: string | null;
  ferramentas: string | null;
  modelo: string | null;
  parametros: string | null;
};

export const snapshotDoPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), execucaoId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<SnapshotPromptView | null> => {
    const { data: row } = await context.supabase
      .from("nina_prompt_snapshots")
      .select(
        "prompt_versao, prompt_publicado_em, prompt_origem, behavior_prompt_hash, behavior_prompt_rendered, request_final, envelope_tecnico, runtime_context, tool_schemas, model, model_parameters",
      )
      .eq("clinica_id", data.clinicaId)
      .eq("execucao_id", data.execucaoId)
      .maybeSingle();
    if (!row) return null;
    const r = row as Record<string, unknown>;
    return {
      versao: (r["prompt_versao"] as number | null) ?? null,
      publicadoEm: (r["prompt_publicado_em"] as string | null) ?? null,
      origem: (r["prompt_origem"] as string | null) ?? null,
      hash: (r["behavior_prompt_hash"] as string | null) ?? null,
      promptUtilizado: (r["behavior_prompt_rendered"] as string | null) ?? null,
      conteudoEnviado: (r["request_final"] as string | null) ?? null,
      envelope: (r["envelope_tecnico"] as string | null) ?? null,
      contextoDinamico: json(r["runtime_context"]),
      ferramentas: json(r["tool_schemas"]),
      modelo: (r["model"] as string | null) ?? null,
      parametros: json(r["model_parameters"]),
    };
  });

/** JSON legível para exibição somente leitura. */
function json(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  try {
    return JSON.stringify(valor, null, 2);
  } catch {
    return null;
  }
}
