import { mock } from "bun:test";
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
const caso = process.argv[2];
process.env.LOVABLE_API_KEY = "chave-ficticia-sem-rede";
if (caso === "sem_chave") delete process.env.LOVABLE_API_KEY;
let requisicao: any;
globalThis.fetch = Object.assign(
  async (url: unknown, opcoes: any) => {
    requisicao = {
      url,
      ...JSON.parse(opcoes.body),
      temTimeout: opcoes.signal instanceof AbortSignal,
    };
    if (caso === "indisponivel") return new Response("indisponível", { status: 503 });
    if (caso === "timeout") throw new DOMException("Tempo esgotado", "TimeoutError");
    const content = ["legivel", "truncada", "recusa", "sem_texto", "sem_motivo"].includes(caso)
      ? '{"tipo":"pedido_medico","itens":["ECG"]}'
      : caso === "um_marcado"
        ? '{"tipo":"pedido_medico","itens":["Doppler de Carótidas e Vértebrais"]}'
        : caso === "varios_marcados"
          ? '{"tipo":"pedido_medico","itens":["Doppler de Carótidas e Vértebrais","ECG"]}'
          : caso === "marcacao_incerta"
            ? '{"tipo":"marcacao_incerta","itens":[]}'
            : caso === "ilegivel"
              ? '{"tipo":"ilegivel","itens":[]}'
              : "resposta inválida";
    return Response.json({
      content: [
        { type: "thinking", thinking: "raciocínio não é transcrição" },
        ...(caso === "sem_texto" ? [] : [{ type: "text", text: content }]),
      ],
      stop_reason:
        caso === "truncada"
          ? "max_tokens"
          : caso === "recusa"
            ? "refusal"
            : caso === "sem_motivo"
              ? null
              : "end_turn",
      usage: { input_tokens: 123, output_tokens: 45 },
    });
  },
  { preconnect: () => {} },
) as typeof fetch;
const { lerPedidoNaImagem } = await import("../../../whatsapp-midia.server");
const auditoria: unknown[] = [];
const resultado = await lerPedidoNaImagem("AQID", "image/jpeg", (c) => {
  auditoria.push(c);
});
console.log("FOTO=" + JSON.stringify({ resultado, requisicao, auditoria }));
