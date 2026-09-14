/**
 * Adaptadores reais, gerador substituído: verifica a entrada no núcleo e a
 * entrega do resultado. Não pretende executar modelo, catálogo ou handoff.
 * Reutiliza as fixtures de integração existentes, isoladas em subprocessos.
 */
import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

function executar(nome: string, marcador: string) {
  const fixture = fileURLToPath(new URL(`./fixtures/${nome}.fixture.ts`, import.meta.url));
  const processo = Bun.spawnSync([process.execPath, fixture, "paridade-cardiologia"], {
    cwd: fileURLToPath(new URL("../../../../../", import.meta.url)),
    env: { ...process.env, NODE_ENV: "test" },
    timeout: 15_000,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = processo.stdout.toString();
  if (processo.exitCode !== 0) throw new Error(stdout + processo.stderr.toString());
  const linha = stdout.split(/\r?\n/).find((l) => l.startsWith(marcador));
  if (!linha) throw new Error(stdout + processo.stderr.toString());
  return JSON.parse(linha.slice(marcador.length));
}

describe("paridade de entrada e saída dos adaptadores reais", () => {
  it("pedido de cardiologia chega ao mesmo núcleo com texto íntegro, vínculo e guarda de turno", () => {
    const real = executar("webhook-agrupamento", "WEBHOOK_RESULTADO=");
    const teste = executar("teste-console-mj53", "MJ53_RESULTADO=");
    expect(real.rede).toBe(0);
    expect(teste.chamadasRede).toBe(0);
    expect(real.modelo).toBe(1);
    expect(teste.chamadasModelo).toBe(1);
    expect(real.transporte).toBe(1);
    expect(real.primeira).toBe(200);
    expect(real.segunda).toBe(200); // Reentrega do webhook não repete o gerador.
    expect(teste.resultado.processamento).toBe("RESPONDIDA");

    for (const r of [real, teste]) {
      expect(r.entradasGerador).toHaveLength(1);
      expect(r.entradas).toHaveLength(1);
      expect(r.saidas).toHaveLength(1);
      const entrada = r.entradasGerador[0];
      expect(entrada.clinicaId).toBe("clinica");
      expect(entrada.texto).toBe("Vocês tem cardiologista?");
      expect(entrada.temAuditoria).toBe(true);
      expect(entrada.temGuardaReserva).toBe(true);
      expect(entrada.opcoes.mensagensEntrada).toEqual([r.entradas[0].id]);
      expect(entrada.opcoes.lote.batchId).toBeTruthy();
      expect(entrada.opcoes.lote.revisao).toBe(1);
      expect(entrada.opcoes.revisao.telefone).toBe(entrada.telefone);
      expect(entrada.opcoes.revisao.valor).toBe(1);
      // Os adaptadores não sobrepõem prompt, catálogo, modelo ou confiança.
      expect(Object.keys(entrada.opcoes).sort()).toEqual(
        (r === real
          ? ["lote", "mensagensEntrada", "revisao"]
          : ["ambiente", "lote", "mensagensEntrada", "revisao", "teste"]
        ).sort(),
      );
    }
    expect(teste.entradasGerador[0].opcoes.teste).toBe(true);
    expect(teste.entradasGerador[0].opcoes.ambiente).toBe("homologacao");
    expect(real.entradasGerador[0].opcoes.teste).toBeUndefined();
    expect(real.entradasGerador[0].telefone).not.toBe(teste.entradasGerador[0].telefone);
    expect(real.saidas[0].body).toBe(teste.saidas[0].body);
    expect(real.saidas[0].body).toContain("R$ 120,00");
    expect(teste.saidas[0].is_teste).toBe(true);
  });
});
