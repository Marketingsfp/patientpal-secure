// Executar isoladamente: intercepta HTTP e dependências do gateway real.
import { afterAll, expect, mock, test } from "bun:test";
let temperatura: number | null = 0.4;
let leituras = 0;
const evidencias: any[] = [];
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => {
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => {
          leituras++;
          return {
            data:
              temperatura === null
                ? null
                : { ativo: true, config: { temperatura }, updated_at: "v1" },
            error: null,
          };
        },
      };
      return q;
    },
  },
}));
mock.module("../telemetria.server", () => ({ registrarExecucao: async () => "execucao" }));
mock.module("../evidencias.server", () => ({
  registrarEtapa: (etapa: any) => evidencias.push(etapa),
}));
const { ninaAIGateway } = await import("../ai-gateway.server");
const { chamarModeloGemini, chamarModeloGeminiStream } =
  await import("../adapters/gemini-adapter.server");
const fetchOriginal = globalThis.fetch;
const chaveAnterior = process.env.LOVABLE_API_KEY;
process.env.LOVABLE_API_KEY = "teste-sem-provedor";
afterAll(() => {
  globalThis.fetch = fetchOriginal;
  if (chaveAnterior === undefined) delete process.env.LOVABLE_API_KEY;
  else process.env.LOVABLE_API_KEY = chaveAnterior;
});
const envios: any[] = [];
globalThis.fetch = (async (_url: unknown, opcoes: RequestInit) => {
  envios.push(JSON.parse(String(opcoes.body)));
  return Response.json({
    choices: [
      {
        message: {
          content: "Resposta de teste",
          tool_calls: [{ id: "c", function: { name: "consultar_cadastro", arguments: "{}" } }],
        },
      },
    ],
  });
}) as typeof fetch;

test("homologação e real usam configuração central; evidência registra o valor enviado", async () => {
  for (const conversaId of ["homologacao", "whatsapp-real"]) {
    const r = await ninaAIGateway({
      clinicaId: "a",
      conversaId,
      perfil: "whatsapp",
      messages: [{ role: "user", content: "Tem cardiologista?" }],
      tools: [{ type: "function", function: { name: "consultar_cadastro" } }],
    });
    expect(r.ok).toBe(true);
    expect(r.toolCalls[0].function?.name).toBe("consultar_cadastro");
    expect(envios.at(-1).temperature).toBe(0.4);
  }
  expect(evidencias.filter((e) => e.tipo === "modelo_parametros").at(-1).dados).toMatchObject({
    temperature: 0.4,
    temperatura_origem: "configurada",
    temperatura_revisao: "v1",
  });
  temperatura = null;
  await ninaAIGateway({
    clinicaId: "a",
    perfil: "whatsapp",
    messages: [{ role: "user", content: "Olá" }],
  });
  expect(envios.at(-1).temperature).toBe(1);
});
test("outros perfis não consultam nem recebem a configuração do WhatsApp", async () => {
  const antes = leituras;
  await ninaAIGateway({
    clinicaId: "a",
    perfil: "texto",
    messages: [{ role: "user", content: "Olá" }],
  });
  expect(leituras).toBe(antes);
  expect(envios.at(-1)).not.toHaveProperty("temperature");
});
test.each([0, 1, 2])(
  "adapter envia %s também no streaming, sem perder zero",
  async (temperature) => {
    const opcoes = {
      modelo: "google/gemini-3.8-flash",
      temperature,
      messages: [{ role: "user", content: "Olá" }],
    };
    expect((await chamarModeloGemini(opcoes)).ok).toBe(true);
    expect(envios.at(-1).temperature).toBe(temperature);
    expect((await chamarModeloGeminiStream(opcoes)).ok).toBe(true);
    expect(envios.at(-1)).toMatchObject({ temperature, stream: true });
  },
);
