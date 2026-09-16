import { mock } from "bun:test";
import assert from "node:assert/strict";

const chamadas: string[] = [];
let falhaRecuperacao = false,
  falhaEspera = false;
mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => config,
}));
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: { token: "segredo-apenas-do-teste" }, error: null }),
      };
      return q;
    },
  },
}));
mock.module("../../espera-timeout.server", () => ({
  processarTimeoutsEsperaPaciente: async () => {
    chamadas.push("espera");
    if (falhaEspera) throw Error("falha simulada");
    return { avaliadas: 1, transferidas: 1, ignoradas: 0, erros: 0 };
  },
}));
mock.module("../../watchdog.server", () => ({
  executarWatchdogNina: async () => {
    chamadas.push("recuperacao");
    if (falhaRecuperacao) throw Error("falha simulada");
    return { assumidos: 0 };
  },
}));
mock.module("../../carga-job.server", () => ({
  continuarCargaPendenteNina: async () => {
    chamadas.push("carga");
    return null;
  },
}));
mock.module("../../teste-console.server", () => ({ processarMensagemTeste: async () => {} }));
const { executarJobWatchdog } = await import("../../../../routes/api/public/nina.watchdog");
const requisicao = (token?: string) =>
  new Request("https://teste.local/api/public/nina/watchdog", {
    method: "POST",
    headers: token ? { "x-job-token": token } : {},
  });
for (const token of [undefined, "incorreto"]) {
  assert.equal((await executarJobWatchdog(requisicao(token))).status, 401);
  assert.equal(chamadas.length, 0);
}
const sucesso = await executarJobWatchdog(requisicao("segredo-apenas-do-teste"));
assert.equal(sucesso.status, 200);
assert.equal((await sucesso.json()).espera.transferidas, 1);
assert.deepEqual(chamadas, ["espera", "recuperacao", "carga"]);
chamadas.length = 0;
falhaRecuperacao = true;
const erro = await executarJobWatchdog(requisicao("segredo-apenas-do-teste"));
assert.equal(erro.status, 503);
assert.equal((await erro.json()).espera.transferidas, 1);
assert.deepEqual(chamadas, ["espera", "recuperacao"]);
chamadas.length = 0;
falhaRecuperacao = false;
falhaEspera = true;
const isolada = await executarJobWatchdog(requisicao("segredo-apenas-do-teste"));
assert.equal(isolada.status, 200);
assert.equal((await isolada.json()).espera.erros, 1);
assert.deepEqual(chamadas, ["espera", "recuperacao", "carga"]);
console.log("ESPERA_JOB_OK");
