import { mock } from "bun:test";
import assert from "node:assert/strict";
mock.module("../../modelo-flag.server", () => ({
  modeloNinaParaClinica: async () => ({ modelo: "teste", origem: "forcado", flagAtiva: false }),
}));
mock.module("../../telemetria.server", () => ({ registrarExecucao: async () => "teste" }));
mock.module("../../evidencias.server", () => ({ registrarEtapa: () => {} }));
const { ninaAIGateway } = await import("../../ai-gateway.server");
const { contextoWatchdog } = await import("../../watchdog-contexto.server");
process.env.LOVABLE_API_KEY = "somente-teste-local";
const eventos: string[] = [];
let chamadas = 0;
globalThis.fetch = (async () => {
  chamadas++;
  if (chamadas < 3) throw new DOMException("Timeout ao consultar o provedor", "TimeoutError");
  return Response.json({ choices: [{ message: { content: "Resposta de teste." } }] });
}) as any;
const controle: any = {
  maxTentativas: 3,
  checkpoint: async () => {},
  evento: async (n: string) => {
    eventos.push(n);
  },
};
const pedido = {
  clinicaId: null,
  perfil: "whatsapp" as const,
  modeloForcado: "teste",
  messages: [{ role: "user" as const, content: "Olá" }],
};
const resposta = await contextoWatchdog.run(controle, () => ninaAIGateway(pedido));
assert.equal(resposta.ok, true);
assert.equal(resposta.tentativas, 3);
assert.equal(chamadas, 3);
assert.equal(eventos.filter((n) => n === "MODEL_RETRY").length, 2);
// Uma rejeição permanente não pode consumir as outras tentativas.
chamadas = 0;
globalThis.fetch = (async () => {
  chamadas++;
  return Response.json({ error: { message: "invalid request" } }, { status: 400 });
}) as any;
const permanente = await contextoWatchdog.run(controle, () => ninaAIGateway(pedido));
assert.equal(permanente.ok, false);
assert.equal(permanente.tentativas, 1);
assert.equal(chamadas, 1);
console.log(
  "WATCHDOG_GATEWAY=" +
    JSON.stringify({
      timeoutAttempts: resposta.tentativas,
      permanentAttempts: permanente.tentativas,
    }),
);
