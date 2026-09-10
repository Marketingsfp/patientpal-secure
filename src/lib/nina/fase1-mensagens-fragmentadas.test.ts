/**
 * FASE 1 — AUDITORIA (reprodução controlada).
 *
 * Este teste NÃO altera o sistema. Ele reproduz, em memória, as regras REAIS
 * hoje presentes no caminho de recebimento do WhatsApp
 * (`src/routes/api/public/whatsapp.$clinicaId.ts`) para documentar o
 * comportamento atual quando o paciente escreve uma mesma ideia em várias
 * mensagens seguidas.
 *
 * Regras reproduzidas (todas verificadas no código atual):
 *  - cada mensagem recebida no webhook dispara uma execução da Nina
 *    (`gerarRespostaNina`), sem debounce, sem fila e sem trava por conversa;
 *  - a janela de entrada de cada execução é "mensagens do paciente após a
 *    última mensagem enviada pela clínica";
 *  - o estado da conversa é lido no início e gravado no fim da execução.
 *
 * Nenhum dado clínico, nome, telefone ou conteúdo sensível é registrado aqui.
 */
import { describe, expect, it } from "bun:test";

type Msg = { id: string; direcao: "in" | "out"; em: number };

type Execucao = {
  executionId: string;
  messageId: string;
  entradas: string[];
  processingStartedAt: number;
  processingFinishedAt: number;
  estadoLidoEm: number;
  estadoGravadoEm: number;
  resposta: string;
};

/** Simulador fiel ao caminho atual: 1 mensagem recebida = 1 execução. */
function simularWebhookAtual(opcoes: {
  chegadas: Array<{ id: string; em: number }>;
  /** Duração total da execução (inclui a chamada ao modelo). */
  duracaoExecucaoMs: number;
}): Execucao[] {
  const armazem: Msg[] = [];
  const execucoes: Execucao[] = [];

  for (const chegada of opcoes.chegadas) {
    // 1) persistência idempotente da mensagem recebida
    armazem.push({ id: chegada.id, direcao: "in", em: chegada.em });

    // 2) disparo imediato da Nina (sem lock, sem espera)
    const inicio = chegada.em;
    const ultimaSaida = armazem
      .filter((m) => m.direcao === "out" && m.em <= inicio)
      .reduce<number | null>((acc, m) => (acc === null || m.em > acc ? m.em : acc), null);
    const entradas = armazem
      .filter((m) => m.direcao === "in" && m.em <= inicio && (ultimaSaida === null || m.em > ultimaSaida))
      .map((m) => m.id);

    const fim = inicio + opcoes.duracaoExecucaoMs;
    execucoes.push({
      executionId: `exec-${execucoes.length + 1}`,
      messageId: chegada.id,
      entradas,
      processingStartedAt: inicio,
      processingFinishedAt: fim,
      // estado é lido no começo e gravado no fim da MESMA execução
      estadoLidoEm: inicio,
      estadoGravadoEm: fim,
      resposta: `resposta-${execucoes.length + 1}`,
    });
    // 3) resposta enviada ao paciente ao final da execução
    armazem.push({ id: `out-${execucoes.length}`, direcao: "out", em: fim });
  }
  return execucoes;
}

function paresSimultaneos(execs: Execucao[]): Array<[string, string]> {
  const pares: Array<[string, string]> = [];
  for (let i = 0; i < execs.length; i += 1) {
    for (let j = i + 1; j < execs.length; j += 1) {
      const a = execs[i]!;
      const b = execs[j]!;
      if (a.processingStartedAt < b.processingFinishedAt && b.processingStartedAt < a.processingFinishedAt) {
        pares.push([a.executionId, b.executionId]);
      }
    }
  }
  return pares;
}

describe("FASE 1 — mensagens fragmentadas do paciente (estado atual)", () => {
  // "Olá" → 300ms → "Gostaria de marcar uma consulta" → 300ms → "De neurologista"
  const chegadas = [
    { id: "msg-1", em: 0 },
    { id: "msg-2", em: 300 },
    { id: "msg-3", em: 600 },
  ];

  it("cada mensagem recebida inicia uma execução independente da Nina", () => {
    const execs = simularWebhookAtual({ chegadas, duracaoExecucaoMs: 2500 });
    expect(execs).toHaveLength(3);
    expect(execs.map((e) => e.messageId)).toEqual(["msg-1", "msg-2", "msg-3"]);
  });

  it("execuções da MESMA conversa ficam ativas ao mesmo tempo", () => {
    const execs = simularWebhookAtual({ chegadas, duracaoExecucaoMs: 2500 });
    const pares = paresSimultaneos(execs);
    expect(pares.length).toBeGreaterThan(0);
    expect(pares).toContainEqual(["exec-1", "exec-2"]);
    expect(pares).toContainEqual(["exec-1", "exec-3"]);
  });

  it("cada execução enxerga um recorte diferente e incompleto da ideia do paciente", () => {
    const execs = simularWebhookAtual({ chegadas, duracaoExecucaoMs: 2500 });
    expect(execs[0]!.entradas).toEqual(["msg-1"]);
    expect(execs[1]!.entradas).toEqual(["msg-1", "msg-2"]);
    expect(execs[2]!.entradas).toEqual(["msg-1", "msg-2", "msg-3"]);
    // A primeira execução responde só "Olá": contexto incompleto.
    expect(execs[0]!.entradas).not.toContain("msg-3");
  });

  it("o paciente recebe uma resposta por mensagem enviada (3 respostas para 1 intenção)", () => {
    const execs = simularWebhookAtual({ chegadas, duracaoExecucaoMs: 2500 });
    expect(new Set(execs.map((e) => e.resposta)).size).toBe(3);
  });

  it("a gravação do estado de uma execução ocorre depois da leitura de outra (janela de corrida)", () => {
    const execs = simularWebhookAtual({ chegadas, duracaoExecucaoMs: 2500 });
    const a = execs[0]!;
    const b = execs[1]!;
    expect(b.estadoLidoEm).toBeLessThan(a.estadoGravadoEm);
  });

  it("execução mais lenta que o intervalo entre mensagens é condição suficiente para sobreposição", () => {
    const rapido = simularWebhookAtual({ chegadas, duracaoExecucaoMs: 100 });
    expect(paresSimultaneos(rapido)).toHaveLength(0);
    const lento = simularWebhookAtual({ chegadas, duracaoExecucaoMs: 1200 });
    expect(paresSimultaneos(lento).length).toBeGreaterThan(0);
  });

  it("telemetria da auditoria não carrega conteúdo da conversa", () => {
    const execs = simularWebhookAtual({ chegadas, duracaoExecucaoMs: 2500 });
    const campos = Object.keys(execs[0]!);
    expect(campos).toEqual([
      "executionId",
      "messageId",
      "entradas",
      "processingStartedAt",
      "processingFinishedAt",
      "estadoLidoEm",
      "estadoGravadoEm",
      "resposta",
    ]);
    expect(JSON.stringify(execs)).not.toContain("neurologista");
  });
});
