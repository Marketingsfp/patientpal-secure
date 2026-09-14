/** Gera uma proposta em memória. Não cria carga, leads ou mensagens. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { garantirPapel } from "./papeis-modelos";
import {
  configPlanejamentoSchema,
  LIMITES_PLANEJAMENTO,
  produzirPlanoCarga,
  type montarRequisicaoPlanejamento,
} from "./carga-planejamento";

async function solicitar(body: ReturnType<typeof montarRequisicaoPlanejamento>): Promise<unknown> {
  const chave = process.env["LOVABLE_API_KEY"];
  if (!chave)
    throw new Error("Planejamento indisponível: chave do provedor de IA não configurada.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIMITES_PLANEJAMENTO.timeoutMs);
  try {
    const resposta = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": chave,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({ ...body, model: garantirPapel("planejador_carga", body.model) }),
    });
    if (!resposta.ok) {
      const erros: Record<number, string> = {
        401: "Integração de IA não configurada corretamente.",
        402: "Créditos de IA esgotados para o planejamento.",
        403: "Uso de IA bloqueado para esta área de trabalho.",
        429: "Limite de uso do modelo atingido. Tente mais tarde.",
      };
      throw new Error(
        erros[resposta.status] ??
          `Falha do provedor (${resposta.status}). Nenhum plano foi criado.`,
      );
    }
    // O limite também cobre o corpo; não aceite um JSON ilimitado do gateway.
    const reader = resposta.body?.getReader();
    if (!reader) throw new Error("O provedor não devolveu o planejamento.");
    let bruto = "";
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bruto += decoder.decode(value, { stream: true });
      if (bruto.length > LIMITES_PLANEJAMENTO.respostaCaracteres * 3) {
        await reader.cancel();
        throw new Error("A resposta do provedor excedeu o tamanho permitido.");
      }
    }
    bruto += decoder.decode();
    try {
      return JSON.parse(bruto);
    } catch {
      throw new Error("O provedor devolveu uma resposta inválida. Gere o plano novamente.");
    }
  } catch (erro) {
    if (controller.signal.aborted)
      throw new Error(
        "O planejamento excedeu 60 segundos. Nenhum teste foi criado; tente novamente.",
      );
    throw erro;
  } finally {
    clearTimeout(timeout);
  }
}

export const planejarTesteCarga = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        pedido: z.string().trim().min(1).max(LIMITES_PLANEJAMENTO.pedidoCaracteres),
        config: configPlanejamentoSchema,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    produzirPlanoCarga(data, {
      autorizar: async () => {
        const { data: membership, error } = await context.supabase
          .from("clinica_memberships")
          .select("id")
          .eq("user_id", context.userId)
          .eq("clinica_id", data.clinicaId)
          .eq("ativo", true)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!membership) throw new Error("Sem acesso a esta clínica");
      },
      solicitar,
    }),
  );
