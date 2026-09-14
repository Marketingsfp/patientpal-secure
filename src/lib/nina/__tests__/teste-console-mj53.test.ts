/** Regressão MJ-53: atravessa processarMensagemTeste real, sem serviços reais. */
import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("./fixtures/teste-console-mj53.fixture.ts", import.meta.url));

function executar(cenario: string) {
  // Mocks em outro processo não substituem módulos das demais suítes Bun.
  const execucao = Bun.spawnSync([process.execPath, fixture, cenario], {
    cwd: fileURLToPath(new URL("../../../../../", import.meta.url)),
    env: { ...process.env, NODE_ENV: "test" },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 15_000,
  });
  const stdout = execucao.stdout.toString();
  if (execucao.exitCode !== 0) throw new Error(stdout + execucao.stderr.toString());
  const linha = stdout.split(/\r?\n/).find((texto) => texto.startsWith("MJ53_RESULTADO="));
  if (!linha) throw new Error(`Fixture não retornou resultado: ${stdout}`);
  const registro = JSON.parse(linha.slice("MJ53_RESULTADO=".length));
  expect(registro.chamadasRede).toBe(0);
  expect(registro.chamadasModelo).toBe(1);
  expect(registro.entradas).toHaveLength(1);
  if (!["erro-real", "reserva-perdida-core"].includes(cenario))
    expect(registro.entradas[0].execucao_id).toBe("execucao-mj53");
  expect(registro.encerramentos).toEqual([
    [
      "lote-mj53",
      "execucao-mj53",
      { token: "trava-mj53" },
      [
        "handoff-reset",
        "handoff-obsoleto",
        "reserva-perdida",
        "reserva-perdida-core",
        "reserva-perdida-tts",
        "reserva-perdida-finalizacao",
      ].includes(cenario)
        ? "SUPERSEDED"
        : "PROCESSED",
    ],
  ]);
  return registro;
}

describe("MJ-53 — finalização real do console de homologação", () => {
  for (const cenario of ["reserva-perdida-tts", "reserva-perdida-finalizacao"]) {
    it(`${cenario}: conteúdo pronto não é persistido depois da perda da reserva`, () => {
      const registro = executar(cenario);
      expect(registro.saidas).toHaveLength(0);
      expect(registro.resultado.processamento).toBe("OBSOLETA");
      expect(registro.resultado.reply).toBeNull();
      expect(registro.chamadasFinalizacao).toBe(1);
      expect(registro.chamadasAudio).toBe(cenario === "reserva-perdida-tts" ? 1 : 0);
    });
  }
  for (const cenario of ["reserva-perdida", "reserva-perdida-core"]) {
    it(`${cenario}: nenhuma contingência é enviada sem reserva válida`, () => {
      const registro = executar(cenario);
      expect(registro.saidas).toHaveLength(0);
      expect(registro.resultado.processamento).toBe("OBSOLETA");
      expect(registro.resultado.reply).toBeNull();
      expect(registro.chamadasFinalizacao).toBe(0);
      expect(registro.chamadasAudio).toBe(0);
    });
  }
  for (const cenario of ["handoff-texto", "handoff-audio"]) {
    it(`${cenario}: aviso já entregue não vira fallback, segunda saída ou áudio`, () => {
      const registro = executar(cenario);
      expect(registro.saidas).toHaveLength(1);
      expect(registro.saidas[0].id).toBe("aviso-mj53");
      expect(registro.resultado.reply).toBeNull();
      expect(registro.resultado.erro).toBeNull();
      expect(registro.resultado.processamento).toBe("RESPONDIDA");
      expect(registro.resultado.semNovaMensagem).toBe(true);
      expect(registro.resultado.avisoEstado).toBe("confirmado");
      expect(registro.resultado.avisoMensagemId).toBe("aviso-mj53");
      expect(registro.resultado.execucaoId).toBe("execucao-mj53");
      expect(registro.resultado.turnoId).toBe("turno-mj53");
      expect(registro.chamadasFinalizacao).toBe(0);
      expect(registro.chamadasAudio).toBe(0);
      expect(registro.entregas).toHaveLength(0);
      expect(registro.rastreios).toHaveLength(0);
    });
  }

  it("aviso pendente de outro responsável não aciona fallback nem confirma entrega", () => {
    const registro = executar("handoff-pendente");
    expect(registro.saidas).toHaveLength(0);
    expect(registro.resultado.reply).toBeNull();
    expect(registro.resultado.processamento).toBe("SEM_RESPOSTA");
    expect(registro.resultado.semNovaMensagem).toBe(true);
    expect(registro.resultado.avisoEstado).toBe("envio_pendente");
    expect(registro.resultado.avisoMensagemId).toBeNull();
    expect(registro.chamadasFinalizacao).toBe(0);
    expect(registro.chamadasAudio).toBe(0);
    expect(registro.entregas).toHaveLength(0);
  });

  for (const cenario of ["handoff-reset", "handoff-obsoleto"]) {
    it(`${cenario}: preserva o descarte por obsolescência e libera o turno`, () => {
      const registro = executar(cenario);
      expect(registro.resultado.processamento).toBe("OBSOLETA");
      expect(registro.resultado.reply).toBeNull();
      expect(registro.saidas).toHaveLength(1);
      expect(registro.saidas[0].conversa_id).toBe("conversa-mj53");
      expect(registro.chamadasFinalizacao).toBe(0);
      expect(registro.chamadasAudio).toBe(0);
    });
  }

  it("vazio genuíno mantém a resposta de contingência", () => {
    const registro = executar("vazio-real");
    expect(registro.saidas).toHaveLength(1);
    expect(registro.saidas[0].body).toContain("Não consegui concluir essa consulta agora");
    expect(registro.chamadasFinalizacao).toBe(1);
    expect(registro.resultado.processamento).toBe("RESPONDIDA");
  });

  it("resposta normal mantém uma saída e vínculo da avaliação correspondente", () => {
    const registro = executar("resposta-normal");
    expect(registro.saidas).toHaveLength(1);
    expect(registro.saidas[0].body).toBe("Olá! Como posso ajudar?");
    expect(registro.saidas[0].execucao_id).toBe("execucao-mj53");
    expect(registro.entregas).toHaveLength(1);
    expect(registro.entregas[0].outgoingMessageId).toBe(registro.saidas[0].id);
    expect(registro.entregas[0].decisaoId).toBe("avaliacao-resposta");
    expect(registro.entregas[0].vincularAvaliacao).toBe(true);
    expect(registro.rastreios).toHaveLength(1);
  });

  it("falha técnica real mantém um aviso de contingência e libera a trava", () => {
    const registro = executar("erro-real");
    expect(registro.saidas).toHaveLength(1);
    expect(registro.saidas[0].body).toContain(
      "Não consegui consultar essa informação neste momento",
    );
    expect(registro.resultado.processamento).toBe("ERRO");
    expect(registro.resultado.erro).toBe("Falha simulada do provedor");
  });
});
