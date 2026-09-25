/**
 * Prevenção do Erro Crítico 01 (24/09/2026 22:57, Lead Teste 01): `proxima_vaga` começou e não
 * terminou; o turno parou sem erro registrado e o paciente ficou sem resposta.
 *
 * Os testes descrevem o comportamento esperado depois das correções do relatório
 * `artifacts/erro-critico-01-causa-inicial-2026-09-25.md`: prazo nas consultas, renovação da
 * reserva que não trava e desistência da varredura que vira o encaminhamento padrão.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { criarToolBroker } from "../tool-broker.server";
import { criarRenovacaoReserva } from "../renovacao-reserva";
import { contextoWatchdog } from "../watchdog-contexto.server";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const esvaziarFila = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
const fixture = (nome: string) => fileURLToPath(new URL(`./fixtures/${nome}`, import.meta.url));

/** Roda um fixture em processo isolado e devolve o JSON impresso após `prefixo`. */
async function rodarFixture<T>(nome: string, prefixo: string, args: string[] = []): Promise<T> {
  const p = Bun.spawn([process.execPath, fixture(nome), ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, codigo] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  const linha = stdout.split(/\r?\n/).find((l) => l.startsWith(prefixo));
  if (codigo || !linha) throw new Error(stdout + stderr);
  return JSON.parse(linha.slice(prefixo.length)) as T;
}

function controleWatchdog(eventos: string[]) {
  return {
    batchId: "lote-teste",
    lock: { chave: "c", token: "t" },
    snapshot: null,
    checkpoint: async () => {},
    evento: async (nome: string) => {
      eventos.push(nome);
    },
    finalizar: async () => {},
  };
}

describe("Erro Crítico 01 — 1) chamada ao Supabase sem resposta", () => {
  test("toda requisição do cliente do servidor leva prazo (AbortSignal)", async () => {
    // Processo isolado: o cliente real não pode ser trocado por mocks de outros arquivos.
    const requisicoes = await rodarFixture<Array<{ caminho: string; comPrazo: boolean }>>(
      "prazo-supabase.fixture.ts",
      "PRAZO_SUPABASE=",
    );
    // Leitura de agenda e renovação da reserva: sem prazo, uma conexão presa congela o turno.
    expect(requisicoes.map((r) => r.caminho)).toEqual([
      "/rest/v1/agendamentos",
      "/rest/v1/rpc/nina_lock_renovar",
    ]);
    expect(requisicoes.every((r) => r.comPrazo)).toBe(true);
  }, 20_000);

  test("quando o prazo estoura dentro da ferramenta, o broker registra TOOL_FAILED (já funciona)", async () => {
    const eventos: string[] = [];
    const broker = criarToolBroker({
      ctxPaciente: {} as never,
      ctxHandoff: { clinicaId: "clinica-teste", conversaId: null },
      executarPaciente: async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      },
    });
    const r = await contextoWatchdog.run(controleWatchdog(eventos) as never, () =>
      broker.executar("proxima_vaga", { medico_id: "Profissional Teste", dia_semana: 4 }),
    );
    expect(r.success).toBe(false);
    expect(eventos).toEqual(["TOOL_STARTED", "TOOL_FAILED"]);
  });
});

describe("Erro Crítico 01 — 2) renovação da reserva presa", () => {
  test("uma renovação sem resposta não impede as renovações seguintes", async () => {
    let tick = () => {};
    let chamadas = 0;
    criarRenovacaoReserva(
      async () => {
        chamadas++;
        // A segunda renovação fica sem resposta, como uma conexão presa.
        return chamadas === 2 ? new Promise<boolean>(() => {}) : true;
      },
      {
        agendar: (cb) => {
          tick = cb;
          return 1;
        },
        cancelar: () => {},
      },
    );
    for (let i = 0; i < 4; i++) {
      tick();
      await esvaziarFila();
    }
    // Antes da correção a fila serializada ficava presa atrás da 2ª chamada: 2 renovações em 4 tiques.
    expect(chamadas).toBeGreaterThanOrEqual(3);
  });

  test("liberar a trava não fica esperando para sempre uma renovação sem resposta", async () => {
    let tick = () => {};
    let cancelada = false;
    const reserva = criarRenovacaoReserva(
      async (signal) => {
        signal.addEventListener("abort", () => (cancelada = true));
        return new Promise<boolean>(() => {});
      },
      {
        prazoMs: 100, // produção: PRAZO_RENOVACAO_MS (15 s)
        agendar: (cb) => {
          tick = cb;
          return 1;
        },
        cancelar: () => {},
      },
    );
    tick();
    await esvaziarFila();
    // `liberarLockConversa` aguarda `parar()`; preso aqui, o `finally` do turno também fica preso.
    const desfecho = await Promise.race([
      reserva.parar().then(() => "liberou"),
      dormir(300).then(() => "preso"),
    ]);
    expect(desfecho).toBe("liberou");
    // A requisição presa é cancelada de verdade e a reserva deixa de ser dada como confirmada.
    expect(cancelada).toBe(true);
    expect(reserva.valida()).toBe(false);
  });
});

describe("Erro Crítico 01 — 3) processo encerrado no meio da ferramenta", () => {
  test("nada mais é gravado e o finally não roda: só o watchdog pode socorrer (característica, já passa)", async () => {
    const saida = join(tmpdir(), `nina-processo-encerrado-${process.pid}-${Date.now()}.txt`);
    const filho = Bun.spawn(
      [process.execPath, fixture("processo-encerrado-na-ferramenta.fixture.ts"), saida],
      { stdout: "ignore", stderr: "ignore" },
    );
    try {
      // Espera a ferramenta começar (há heartbeats e TOOL_STARTED gravados).
      for (
        let i = 0;
        i < 100 && !(existsSync(saida) && readFileSync(saida, "utf8").includes("TOOL_STARTED"));
        i++
      )
        await dormir(50);
      await dormir(200);
      filho.kill(9);
      await filho.exited;
      const antes = readFileSync(saida, "utf8");
      await dormir(500); // um processo vivo gravaria novos heartbeats aqui
      const depois = readFileSync(saida, "utf8");
      const eventos = depois.trim().split(/\r?\n/);
      expect(depois).toBe(antes);
      expect(eventos).toContain("TOOL_STARTED");
      expect(eventos).toContain("HEARTBEAT");
      expect(eventos.some((e) => ["TOOL_FINISHED", "TOOL_FAILED", "FINALLY"].includes(e))).toBe(
        false,
      );
    } finally {
      filho.kill(9);
      rmSync(saida, { force: true });
    }
  }, 20_000);
});

describe("Erro Crítico 01 — 4) desistência da varredura vira o encaminhamento padrão", () => {
  type Registro = {
    finalizar: Array<{ estado: string; erro: string | null }>;
    eventos: string[];
    encaminhamentos: Array<{ solicitadoPor?: string; somenteSeNina?: unknown }>;
    geracoes: number;
  };
  const rodar = (cenario: string) =>
    rodarFixture<Registro>("watchdog-encaminha-desistencia.fixture.ts", "DESISTENCIA=", [cenario]);

  test("conversa com a Nina: mesma frase de encaminhamento, fila humana e nenhuma geração nova", async () => {
    const r = await rodar("nina");
    expect(r.geracoes).toBe(0);
    expect(r.encaminhamentos).toHaveLength(1);
    expect(r.encaminhamentos[0]).toMatchObject({ solicitadoPor: "SISTEMA" });
    expect(r.encaminhamentos[0]!.somenteSeNina).toBeDefined();
    expect(r.eventos).toContain("PROCESSING_ERROR_HANDOFF");
    expect(r.finalizar).toEqual([
      { estado: "handoff", erro: "PROCESSING_ERROR: WATCHDOG_GENERATION_OUTCOME_UNKNOWN" },
    ]);
  }, 20_000);

  test("paciente mandou mensagem nova: não encaminha, a mensagem nova é quem responde", async () => {
    const r = await rodar("mensagem-nova");
    expect(r.geracoes).toBe(0);
    expect(r.encaminhamentos).toHaveLength(0);
    expect(r.finalizar).toEqual([{ estado: "failed", erro: "SUPERSEDED_BY_NEW_MESSAGE" }]);
  }, 20_000);

  test("conversa já com atendente: fecha como encaminhada sem mandar a frase de novo", async () => {
    const r = await rodar("ja-humano");
    expect(r.geracoes).toBe(0);
    expect(r.encaminhamentos).toHaveLength(0);
    expect(r.finalizar.map((f) => f.estado)).toEqual(["handoff"]);
  }, 20_000);
});

describe("Erro Crítico 01 — 5) entrega incerta com o processo vivo", () => {
  test("sem saber se a resposta chegou, a Nina encaminha em vez de falhar calada", async () => {
    const r = await rodarFixture<{
      finalizar: Array<{ estado: string; erro: string | null }>;
      encaminhamentos: unknown[];
      geracoes: number;
    }>("watchdog-encaminha-desistencia.fixture.ts", "DESISTENCIA=", ["entrega-incerta-viva"]);
    expect(r.encaminhamentos).toHaveLength(1);
    expect(r.finalizar).toEqual([
      { estado: "handoff", erro: "PROCESSING_ERROR: DELIVERY_OUTCOME_UNKNOWN" },
    ]);
  }, 20_000);
});
