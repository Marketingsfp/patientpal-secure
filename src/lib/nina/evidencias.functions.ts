/**
 * FASE 2 — leitura das evidências de uma execução da Nina.
 *
 * Somente LEITURA do que já foi registrado no momento da resposta. Abrir um
 * erro nunca executa a Nina de novo nem repete ferramentas, e nada é
 * completado por IA: o que não foi capturado aparece como lacuna.
 *
 * Escopo por clínica: a consulta usa a sessão do usuário (RLS), não o
 * administrador do banco.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { lacunas, ordenarEtapas, perguntaDaExecucao, type Etapa } from "./evidencias";

/**
 * Leitura crua das evidências já registradas. Reutilizada pela análise
 * assistida (Fase 4) — nunca executa a Nina de novo.
 */
export async function carregarEvidenciasExecucao(
  supabaseCliente: unknown,
  clinicaId: string,
  execucaoId: string,
) {
  {
    const supabase = supabaseCliente as never as {
      from: (t: string) => any;
    };
    const data = { clinicaId, execucaoId };


    const { data: execucao, error: e1 } = await supabase
      .from("nina_execucoes")
      .select(
        "id, clinica_id, conversation_id, model, thinking_level, route_reason, latency_ms, knowledge_status, tool_calls, success, error_category, handoff, input_tokens, output_tokens, retries, created_at, mensagens_entrada",
      )
      .eq("id", data.execucaoId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!execucao) {
      return {
        disponivel: false as const,
        motivo: "Registro técnico desta resposta não está mais disponível.",
      };
    }

    const { data: evid } = await supabase
      .from("nina_execucao_evidencias")
      .select("etapas, lacunas, created_at")
      .eq("execucao_id", data.execucaoId)
      .maybeSingle();

    const etapas = ordenarEtapas((evid?.etapas ?? []) as Etapa[]);

    const ids: string[] = (execucao.mensagens_entrada ?? []) as string[];
    let entradas: { id: string; texto: string | null; em: string | null }[] = [];
    if (ids.length) {
      const { data: msgs } = await supabase
        .from("whatsapp_mensagens")
        .select("id, body, created_at")
        .in("id", ids)
        .eq("clinica_id", data.clinicaId);
      entradas = (msgs ?? []).map((m: { id: string; body: string | null; created_at: string }) => ({
        id: m.id,
        texto: m.body,
        em: m.created_at,
      }));
    }
    const pergunta = perguntaDaExecucao(entradas);

    return {
      disponivel: true as const,
      execucao,
      etapas,
      pergunta,
      lacunas: (evid?.lacunas as string[] | undefined) ?? lacunas(etapas, ids),
      evidenciaEm: (evid?.created_at as string | undefined) ?? null,
    };
  }
}

export const lerEvidenciasExecucaoNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), execucaoId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    // Conteúdo técnico sensível: exige permissão de revisão também no backend.
    const { data: pode, error: ePerm } = await (context.supabase as any).rpc(
      "nina_fb_pode_revisar",
      { _user_id: context.userId, _clinica_id: data.clinicaId },
    );
    if (ePerm) throw new Error(ePerm.message);
    if (!pode) throw new Error("Sem permissão para ver a auditoria técnica.");

    return await carregarEvidenciasExecucao(context.supabase, data.clinicaId, data.execucaoId);
  });
