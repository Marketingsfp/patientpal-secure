import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { periodoDashboardSchema } from "./dashboard-oszap-periodos";

export const consultarResumoDashboardOsZap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), periodo: periodoDashboardSchema }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { carregarResumoDashboardOsZap } = await import("./dashboard-oszap.server");
    return carregarResumoDashboardOsZap(
      context.supabase,
      context.userId,
      data.clinicaId,
      data.periodo,
    );
  });

/**
 * Texto de análise do período por IA. Recalcula os números no servidor (com a
 * mesma permissão de gestão) em vez de confiar no que a tela envia. Nada é salvo.
 */
export const analisarDashboardOsZapIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), periodo: periodoDashboardSchema }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { carregarResumoDashboardOsZap } = await import("./dashboard-oszap.server");
    const resumo = await carregarResumoDashboardOsZap(
      context.supabase,
      context.userId,
      data.clinicaId,
      data.periodo,
    );
    const { dadosParaAnaliseDashboard, INSTRUCOES_ANALISE_DASHBOARD, MODELO_ANALISE_DASHBOARD } =
      await import("./dashboard-oszap-analise");
    const { chamarModeloGemini } = await import("@/lib/nina/adapters/gemini-adapter.server");
    const r = await chamarModeloGemini({
      modelo: MODELO_ANALISE_DASHBOARD,
      messages: [
        { role: "system", content: INSTRUCOES_ANALISE_DASHBOARD },
        { role: "user", content: JSON.stringify(dadosParaAnaliseDashboard(resumo as never)) },
      ],
      maxTokens: 2000,
      temperature: 0.2,
      timeoutMs: 45_000,
    });
    if (!r.ok || !r.conteudo.trim()) {
      if (r.status === 402 || r.status === 429) throw new Error(r.erro);
      throw new Error("A IA não conseguiu analisar agora. Tente de novo em instantes.");
    }
    return {
      texto: r.conteudo.trim(),
      modelo: MODELO_ANALISE_DASHBOARD,
      periodo: resumo.periodo,
      geradoEm: new Date().toISOString(),
      tokens: { entrada: r.uso?.entrada ?? null, saida: r.uso?.saida ?? null },
    };
  });
