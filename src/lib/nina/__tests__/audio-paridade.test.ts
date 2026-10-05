import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

it("arquivo de homologação é transcrito e guardado uma vez, sem aceitar links na transcrição", () => {
  const p = Bun.spawnSync([process.execPath, fileURLToPath(new URL("./fixtures/teste-console-mj53.fixture.ts", import.meta.url)), "audio-arquivo"],
    { stdout: "pipe", stderr: "pipe", timeout: 15000 });
  expect(p.exitCode, p.stderr.toString()).toBe(0);
  const r = JSON.parse(p.stdout.toString().split(/\r?\n/).find(l => l.startsWith("MJ53_RESULTADO="))!.slice(15));
  expect(r.transcricoes).toBe(1);
  expect(r.chamadasModelo).toBe(1);
  expect(r.entradas).toHaveLength(1);
  expect(r.saidas).toHaveLength(1);
  expect(r.entradas[0].media_url).toBe(r.arquivos[0]);
  expect(r.entradas[0].transcricao).toBe("Quero cardiologista. [link bloqueado]");
  expect(r.entradasGerador[0].texto).toBe(r.entradas[0].transcricao);
});

for (const cenario of ["audio-recebido", "audio-pedido", "audio-falha"]) {
  it(`${cenario}: real e homologação entregam formato e transcrição equivalentes`, () => {
    const executar = (arquivo: string, prefixo: string) => {
      const p = Bun.spawnSync([process.execPath, fileURLToPath(new URL(`./fixtures/${arquivo}`, import.meta.url)), cenario],
        { stdout: "pipe", stderr: "pipe", timeout: 15000 });
      expect(p.exitCode, p.stderr.toString()).toBe(0);
      const linha = p.stdout.toString().split(/\r?\n/).find(l => l.startsWith(prefixo));
      return JSON.parse(linha!.slice(prefixo.length));
    };
    const real = executar("webhook-agrupamento.fixture.ts", "WEBHOOK_RESULTADO=");
    const teste = executar("teste-console-mj53.fixture.ts", "MJ53_RESULTADO=");
    expect(real.rede).toBe(0);
    expect(teste.chamadasRede).toBe(0);
    // A fixture real reapresenta o webhook: não pode haver áudio/envio duplicado.
    expect(real.tts).toBe(1);
    expect(real.transporte).toBe(1);
    expect(teste.chamadasAudio).toBe(1);
    expect(real.saidas).toHaveLength(1);
    expect(teste.saidas).toHaveLength(1);
    const tipo = cenario === "audio-falha" ? "text" : "audio";
    expect(real.saidas[0].tipo).toBe(tipo);
    expect(teste.saidas[0].tipo).toBe(tipo);
    expect(teste.saidas[0].body).toBe(real.saidas[0].body);
    if (tipo === "audio") {
      expect(real.saidas[0].transcricao).toBe(real.saidas[0].body);
      expect(teste.saidas[0].transcricao).toBe(real.saidas[0].transcricao);
      expect(teste.entregas[0].estado).toBe("persistida");
    }
  });
}
