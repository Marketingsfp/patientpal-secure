import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { pedidoEscritaSchema, MODELO_ESCRITA } from "./assistente-escrita";

export const gerarSugestaoEscrita = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => pedidoEscritaSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { assistenteEscritaCore, comLimiteEscrita } = await import("./assistente-escrita.server");
    return comLimiteEscrita(context.userId, () =>
      assistenteEscritaCore(context.supabase, context.userId, data, {
        lerFonte: async (clinicaId) => {
          const { lerFonteOperacional } = await import("@/lib/nina/fonte-operacional.server");
          return lerFonteOperacional(clinicaId);
        },
        gerar: async (messages) => {
          // Reutiliza transporte/credencial do projeto; não executa o fluxo nem altera o modelo da Nina.
          const { chamarModeloGemini } = await import("@/lib/nina/adapters/gemini-adapter.server");
          const r = await chamarModeloGemini({
            modelo: MODELO_ESCRITA,
            messages,
            reasoning: "low",
            maxTokens: 2500,
            timeoutMs: 20000,
          });
          if (!r.ok)
            throw Error(
              r.status === 402
                ? "Créditos de IA esgotados."
                : r.status === 429
                  ? "Limite de IA atingido. Tente novamente em instantes."
                  : "A IA não respondeu no prazo ou está indisponível. Seu rascunho foi preservado.",
            );
          if (r.toolCalls.length || !r.conteudo)
            throw Error("A IA não devolveu uma sugestão de texto. Tente novamente.");
          return r.conteudo;
        },
      }),
    );
  });
