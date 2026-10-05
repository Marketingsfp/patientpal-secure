import { mock } from "bun:test";
const caso = process.argv[2]!;
const chamadas: any[] = [];
const arquivos: any[] = [];
const vinculos: any[] = [];
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (tabela: string) => {
    const q: any = { select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: { ativo: caso === "desativado" }, error: null }),
      update: (valor: any) => { vinculos.push({ tabela, valor }); return q; },
      then: (resolve: any) => Promise.resolve({ error: null }).then(resolve) };
    return q;
  },
  storage: { from: (bucket: string) => ({ upload: async (caminho: string, bytes: Uint8Array, opcoes: any) => {
    arquivos.push({ bucket, caminho, tamanho: bytes.length, ...opcoes }); return { error: null };
  } }) },
} }));
process.env.LOVABLE_API_KEY = "chave-ficticia-de-teste";
globalThis.fetch = Object.assign(async (_url: any, init: any) => {
  chamadas.push(JSON.parse(init.body));
  if (caso === "falha") return new Response("indisponível", { status: 503 });
  if (caso === "json") return Response.json({ erro: "Não é áudio" });
  return new Response(new Uint8Array([79, 103, 103, 83]), { headers: { "content-type": "audio/ogg" } });
}, { preconnect: () => {} }) as typeof fetch;
const { prepararAudioResposta, guardarAudioMensagem, avaliarFala } = await import("../../../nina-audio.server");
const resposta = caso === "longa" ? "Confira as informações. " + "Detalhes da consulta. ".repeat(40) : "Podemos consultar os horários.";
const auditoria: unknown[] = [];
const audio = await prepararAudioResposta("clinica", resposta, { recebeuAudio: caso === "recebido", mensagem: caso === "texto" ? "Olá" : "Responda em áudio" }, c => { auditoria.push(c); });
let avaliacao = null;
if (audio) {
  await guardarAudioMensagem("clinica", "mensagem", audio);
  avaliacao = await avaliarFala(audio, { textoFinalHash: "outro-hash", decisaoId: "nao-herdar" });
}
console.log("AUDIO=" + JSON.stringify({ audio: audio ? { texto: audio.texto, longa: audio.longa } : null, chamadas, auditoria, arquivos, vinculos, avaliacao }));
