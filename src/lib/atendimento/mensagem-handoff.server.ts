/**
 * FASE 2 (server) — produz o texto contextual do encaminhamento.
 *
 * A redação é feita pelo modelo, mas o conteúdo obrigatório (protocolo real,
 * equipe humana, mesmo canal, sem setor inventado, sem detalhe técnico) é
 * garantido por validação. Se o modelo falhar ou escorregar, cai no texto de
 * contingência — nunca fica sem mensagem e nunca vaza erro técnico.
 */
import {
  montarMensagemHandoffFallback,
  promptMensagemHandoff,
  validarMensagemHandoff,
  type ContextoMensagemHandoff,
} from "./mensagem-handoff";

const MODELO = "google/gemini-2.5-flash";

export async function gerarMensagemHandoff(
  ctx: ContextoMensagemHandoff,
): Promise<{ texto: string; origem: "modelo" | "contingencia" }> {
  const contingencia = montarMensagemHandoffFallback(ctx);
  try {
    const { chamarModeloGemini } = await import("@/lib/nina/adapters/gemini-adapter.server");
    const r = await chamarModeloGemini({
      modelo: MODELO,
      maxTokens: 200,
      messages: [
        { role: "system", content: promptMensagemHandoff(ctx) },
        { role: "user", content: "Escreva a mensagem agora." },
      ],
    });
    const texto = (r.conteudo ?? "").trim();
    if (r.ok && texto) {
      const v = validarMensagemHandoff(texto, { protocolo: ctx.protocolo, setor: ctx.setor });
      if (v.ok) return { texto, origem: "modelo" };
      console.warn("[handoff-msg] texto do modelo rejeitado:", v.problemas.join("; "));
    }
  } catch (e) {
    console.error("[handoff-msg] falha ao gerar mensagem contextual", e);
  }
  return { texto: contingencia, origem: "contingencia" };
}
