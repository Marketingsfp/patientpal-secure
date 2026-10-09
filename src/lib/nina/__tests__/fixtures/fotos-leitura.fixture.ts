import { mock } from "bun:test";
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
const caso = process.argv[2];
process.env.LOVABLE_API_KEY = "chave-ficticia-sem-rede";
let requisicao: any;
globalThis.fetch = Object.assign(async (_url: unknown, opcoes: any) => {
  requisicao = { ...JSON.parse(opcoes.body), temTimeout: opcoes.signal instanceof AbortSignal };
  if (caso === "indisponivel") return new Response("indisponível", { status: 503 });
  if (caso === "timeout") throw new DOMException("Tempo esgotado", "TimeoutError");
  const content = caso === "legivel" ? '{"tipo":"pedido_medico","itens":["ECG"]}'
    : caso === "um_marcado" ? '{"tipo":"pedido_medico","itens":["Doppler de Carótidas e Vértebrais"]}'
    : caso === "varios_marcados" ? '{"tipo":"pedido_medico","itens":["Doppler de Carótidas e Vértebrais","ECG"]}'
    : caso === "marcacao_incerta" ? '{"tipo":"marcacao_incerta","itens":[]}'
    : caso === "ilegivel" ? '{"tipo":"ilegivel","itens":[]}' : "resposta inválida";
  return Response.json({ choices: [{ message: { content } }] });
}, { preconnect: () => {} }) as typeof fetch;
const { lerPedidoNaImagem } = await import("../../../whatsapp-midia.server");
const auditoria: unknown[] = [];
const resultado = await lerPedidoNaImagem("AQID", "image/jpeg", c => { auditoria.push(c); });
console.log("FOTO=" + JSON.stringify({ resultado, requisicao, auditoria }));
