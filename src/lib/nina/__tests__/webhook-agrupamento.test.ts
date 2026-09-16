import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
const fixture = fileURLToPath(
  new URL("./fixtures/webhook-agrupamento.fixture.ts", import.meta.url),
);
function executar(cenario: string) {
  const proc = Bun.spawnSync([process.execPath, fixture, cenario], {
    cwd: fileURLToPath(new URL("../../../../../", import.meta.url)),
    env: { ...process.env, NODE_ENV: "test" },
    timeout: 15000,
    stdout: "pipe",
    stderr: "pipe",
  });
  const saida = proc.stdout.toString();
  if (proc.exitCode) throw new Error(saida + proc.stderr.toString());
  const linha = saida.split(/\r?\n/).find((s) => s.startsWith("WEBHOOK_RESULTADO="));
  if (!linha) throw new Error(saida + proc.stderr.toString());
  const r = JSON.parse(linha.slice("WEBHOOK_RESULTADO=".length));
  expect(r.rede).toBe(0);
  return r;
}
describe("POST WhatsApp real com serviços simulados", () => {
  for (const cenario of [
    "reserva-perdida-tts",
    "reserva-perdida-upload",
    "reserva-perdida-finalizacao",
  ]) {
    it(`${cenario}: nenhuma entrega tardia de áudio ou fallback de texto`, () => {
      const r = executar(cenario);
      expect([r.primeira, r.segunda]).toEqual([200, 200]);
      expect(r.modelo).toBe(1);
      expect(r.transporte).toBe(0);
      expect(r.saidas).toHaveLength(0);
      expect(r.esperas).toHaveLength(0);
      expect(r.tts).toBe(cenario === "reserva-perdida-finalizacao" ? 0 : 1);
      expect(r.uploads).toBe(cenario === "reserva-perdida-upload" ? 1 : 0);
    });
  }
  it("revisão indisponível antes da reabertura: retry reabre somente fechamento anterior à entrada", () => {
    const r = executar("revisao-conversa-fechada");
    expect([r.primeira, r.segunda]).toEqual([503, 200]);
    expect(r.antesRetry.modelo).toBe(0);
    expect(r.modelo).toBe(1);
    expect(r.transporte).toBe(1);
    expect(r.reaberturas).toBe(1);
    expect(r.revisao).toBe(1);
  });
  it("operador encerrou após entrada: retry não reabre essa sessão nem chama Nina", () => {
    const r = executar("grupo-encerramento-posterior");
    expect([r.primeira, r.segunda]).toEqual([503, 200]);
    expect(r.modelo).toBe(0);
    expect(r.transporte).toBe(0);
    expect(r.reaberturas).toBe(1);
  });
  it("código de verificação em retry continua no caminho de verificação e nunca chega à Nina", () => {
    const r = executar("verificacao-revisao");
    expect([r.primeira, r.segunda]).toEqual([503, 200]);
    expect(r.modelo).toBe(0);
    expect(r.transporte).toBe(1);
    expect(r.reaberturas).toBe(0);
    expect(r.entradas).toHaveLength(1);
    expect(r.entradas[0].tratada_internamente).toBe(true);
  });
  it("sucesso seguido do mesmo evento entrega uma mensagem e não reabre ou gera outra vez", () => {
    const r = executar("sucesso");
    expect([r.primeira, r.segunda]).toEqual([200, 200]);
    expect(r.entradas).toHaveLength(1);
    expect(r.saidas).toHaveLength(1);
    expect(r.modelo).toBe(1);
    expect(r.transporte).toBe(1);
    expect(r.reaberturas).toBe(1);
    expect(r.revisao).toBe(1);
  });
  for (const cenario of ["persistencia", "agrupamento", "revisao", "revisao-resposta-perdida"]) {
    it(`${cenario}: 503 antes de efeitos; retry conserva a entrada e entrega só uma vez`, () => {
      const r = executar(cenario);
      expect([r.primeira, r.segunda]).toEqual([503, 200]);
      expect(r.antesRetry.modelo).toBe(0);
      expect(r.antesRetry.transporte).toBe(0);
      expect(r.entradas).toHaveLength(1);
      expect(r.modelo).toBe(1);
      expect(r.transporte).toBe(1);
      expect(r.revisao).toBe(1);
      expect(r.reaberturas).toBe(cenario.startsWith("revisao") ? 0 : 1);
      expect(r.logs[0]).toMatch(/indisponível/);
    });
  }
  for (const cenario of ["erro-modelo", "reserva-perdida"]) {
    it(`${cenario}: após iniciar nunca responde 503 nem reexecuta o lote no retry`, () => {
      const r = executar(cenario);
      expect([r.primeira, r.segunda]).toEqual([200, 200]);
      expect(r.modelo).toBe(1);
      expect(r.transporte).toBe(0);
      expect(r.saidas).toHaveLength(0);
      expect(r.entradas).toHaveLength(1);
      expect(r.reaberturas).toBe(1);
    });
  }
});
