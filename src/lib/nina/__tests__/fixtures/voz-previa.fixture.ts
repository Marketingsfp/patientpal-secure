import { mock } from "bun:test";
import { VOZ_PADRAO } from "../../voz-config";
const caso = process.argv[2];
const gravacoes: any[] = [];
const chamadas: any[] = [];
const db = {
  from(tabela: string) {
    const q: any = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: { id: "membro" }, error: null }),
      insert: (v: any) => {
        gravacoes.push({ tabela, valor: v });
        return q;
      },
      then: (resolve: any) =>
        Promise.resolve({
          data:
            tabela === "user_roles"
              ? [{ role: caso === "sem_acesso" ? "telefonia" : "admin" }]
              : [],
          error: null,
        }).then(resolve),
    };
    return q;
  },
};
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));
process.env.LOVABLE_API_KEY = "chave-ficticia";
globalThis.fetch = Object.assign(
  async (_url: any, init: any) => {
    chamadas.push(JSON.parse(init.body));
    if (caso === "falha") return new Response("indisponível", { status: 503 });
    return new Response(new Uint8Array([73, 68, 51, 1]), {
      headers: { "content-type": "audio/mpeg" },
    });
  },
  { preconnect: () => {} },
) as typeof fetch;
const { gerenciarVozNina } = await import("../../voz-config.server");
let resultado = null,
  erro = null;
try {
  resultado = await gerenciarVozNina({ supabase: db, userId: "admin", ip: "127.0.0.1" }, db).previa(
    "clinica",
    { ...VOZ_PADRAO, voz: "cedar", velocidade: 1.2, estilo: "profissional" },
    "Olá! Sou a atendente virtual.",
  );
} catch (e) {
  erro = (e as Error).message;
}
console.log("PREVIA=" + JSON.stringify({ resultado, erro, chamadas, gravacoes }));
