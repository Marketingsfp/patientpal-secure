import { mock } from "bun:test";
import { VOZ_PADRAO } from "../../voz-config";
const caso = process.argv[2]!;
const chamadas: any[] = [];
const arquivos: any[] = [];
const vinculos: any[] = [];
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (tabela: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data: {
            ativo: caso === "desativado",
            config: {
              voz_nina: {
                ...VOZ_PADRAO,
                ...(caso === "personalizada" || caso === "prefere_texto"
                  ? {
                      voz: "coral",
                      velocidade: 0.85,
                      estilo: "acolhedor",
                      orientacoes: "Pronuncie ECG letra por letra.",
                    }
                  : {}),
                ...(caso === "longa_texto" ? { respostasLongas: "somente_texto" } : {}),
                ...(caso === "limite_personalizado" ? { limiteResumo: 100 } : {}),
                ...(caso === "expansao_fala" ? { limiteResumo: 3000 } : {}),
              },
            },
          },
          error: caso === "falha_leitura" ? { message: "falha simulada" } : null,
        }),
        update: (valor: any) => {
          vinculos.push({ tabela, valor });
          return q;
        },
        then: (resolve: any) => Promise.resolve({ error: null }).then(resolve),
      };
      return q;
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (caminho: string, bytes: Uint8Array, opcoes: any) => {
          arquivos.push({ bucket, caminho, tamanho: bytes.length, ...opcoes });
          return { error: null };
        },
      }),
    },
  },
}));
process.env.LOVABLE_API_KEY = "chave-ficticia-de-teste";
globalThis.fetch = Object.assign(
  async (_url: any, init: any) => {
    chamadas.push(JSON.parse(init.body));
    if (caso === "falha") return new Response("indisponível", { status: 503 });
    if (caso === "json") return Response.json({ erro: "Não é áudio" });
    return new Response(new Uint8Array([79, 103, 103, 83]), {
      headers: { "content-type": "audio/ogg" },
    });
  },
  { preconnect: () => {} },
) as typeof fetch;
const { prepararAudioResposta, guardarAudioMensagem, avaliarFala } =
  await import("../../../nina-audio.server");
const resposta =
  caso === "expansao_fala"
    ? "12:00 ".repeat(450)
    : ["longa", "longa_texto"].includes(caso)
      ? "Confira as informações. " + "Detalhes da consulta. ".repeat(40)
      : caso === "limite_personalizado"
        ? "Confira as informações. " + "Detalhes da consulta. ".repeat(6)
        : "Podemos consultar os horários.";
const auditoria: unknown[] = [];
const audio = await prepararAudioResposta(
  "clinica",
  resposta,
  {
    recebeuAudio: ["recebido", "prefere_texto"].includes(caso),
    mensagem:
      caso === "prefere_texto" ? "Prefiro texto" : caso === "texto" ? "Olá" : "Responda em áudio",
  },
  (c) => {
    auditoria.push(c);
  },
);
let avaliacao = null;
if (audio) {
  await guardarAudioMensagem("clinica", "mensagem", audio);
  avaliacao = await avaliarFala(audio, { textoFinalHash: "outro-hash", decisaoId: "nao-herdar" });
}
console.log(
  "AUDIO=" +
    JSON.stringify({
      audio: audio ? { texto: audio.texto, longa: audio.longa } : null,
      chamadas,
      auditoria,
      arquivos,
      vinculos,
      avaliacao,
    }),
);
