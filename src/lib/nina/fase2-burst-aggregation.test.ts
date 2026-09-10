/**
 * FASE 2 — Message Burst Aggregation.
 *
 * Os testes reproduzem a semântica do estado persistente (lote por conversa,
 * revisão e reserva atômica) para validar que mensagens rápidas formam UM
 * turno da Nina, sem alterar a exibição das mensagens.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_BURST_WINDOW_MS,
  QUIET_WINDOW_MS,
  decidirEspera,
  montarTurnoPaciente,
} from "@/lib/nina/burst";

// ---- Fake do banco: mesma semântica das RPCs nina_batch_* ----
type Lote = {
  id: string;
  chave: string;
  status: "COLLECTING" | "PROCESSING" | "PROCESSED" | "SUPERSEDED";
  revision: number;
  firstMs: number;
  mensagens: string[];
};

class StorePersistente {
  private lotes: Lote[] = [];
  private seq = 0;

  registrar(chave: string, mensagemId: string, agoraMs: number) {
    let lote = this.lotes.find((l) => l.chave === chave && l.status === "COLLECTING");
    if (!lote) {
      lote = {
        id: `batch-${++this.seq}`,
        chave,
        status: "COLLECTING",
        revision: 0,
        firstMs: agoraMs,
        mensagens: [],
      };
      this.lotes.push(lote);
    }
    lote.revision += 1;
    if (!lote.mensagens.includes(mensagemId)) lote.mensagens.push(mensagemId);
    return { batchId: lote.id, revision: lote.revision, firstMs: lote.firstMs };
  }

  reivindicar(batchId: string, revision: number, forcar: boolean) {
    const lote = this.lotes.find((l) => l.id === batchId);
    if (!lote || lote.status !== "COLLECTING" || (!forcar && lote.revision !== revision)) {
      return { reivindicado: false, mensagens: [] as string[] };
    }
    lote.status = "PROCESSING";
    return { reivindicado: true, mensagens: [...lote.mensagens] };
  }

  concluir(batchId: string) {
    const lote = this.lotes.find((l) => l.id === batchId);
    if (lote) lote.status = "PROCESSED";
  }

  get total() {
    return this.lotes.length;
  }
}

/** Simulador: mensagens com horários definidos, sem timers reais. */
function simular(entradas: Array<{ chave: string; id: string; texto: string; emMs: number }>) {
  const store = new StorePersistente();
  const execucoes: Array<{ batchId: string; mensagens: string[]; texto: string }> = [];
  const textos = new Map(entradas.map((e) => [e.id, e.texto]));

  const invocacoes = entradas.map((e) => {
    const { batchId, revision, firstMs } = store.registrar(e.chave, e.id, e.emMs);
    const { esperaMs, forcar } = decidirEspera(e.emMs, firstMs);
    return { ...e, batchId, revision, forcar, acordaEm: e.emMs + esperaMs };
  });

  // Ordena pelo instante em que cada invocação acorda (relógio simulado).
  for (const inv of [...invocacoes].sort((a, b) => a.acordaEm - b.acordaEm)) {
    const r = store.reivindicar(inv.batchId, inv.revision, inv.forcar);
    if (!r.reivindicado) continue;
    execucoes.push({
      batchId: inv.batchId,
      mensagens: r.mensagens,
      texto: montarTurnoPaciente(r.mensagens.map((id) => textos.get(id) ?? "")),
    });
    store.concluir(inv.batchId);
  }
  return { execucoes, lotes: store.total };
}

describe("FASE 2 — burst aggregation", () => {
  it("TESTE A: 3 mensagens em 300ms viram 1 lote e 1 execução", () => {
    const { execucoes, lotes } = simular([
      { chave: "A", id: "m1", texto: "Olá", emMs: 0 },
      { chave: "A", id: "m2", texto: "Gostaria de marcar uma consulta", emMs: 300 },
      { chave: "A", id: "m3", texto: "De neurologista", emMs: 600 },
    ]);
    expect(lotes).toBe(1);
    expect(execucoes).toHaveLength(1);
    expect(execucoes[0]!.mensagens).toEqual(["m1", "m2", "m3"]);
    expect(execucoes[0]!.texto).toContain("1. Olá");
    expect(execucoes[0]!.texto).toContain("3. De neurologista");
  });

  it("TESTE B: mensagem isolada gera 1 lote e 1 execução após a quiet window", () => {
    const { execucoes, lotes } = simular([
      { chave: "A", id: "m1", texto: "Bom dia", emMs: 0 },
    ]);
    expect(lotes).toBe(1);
    expect(execucoes).toHaveLength(1);
    expect(execucoes[0]!.texto).toBe("Bom dia");
    expect(decidirEspera(0, 0).esperaMs).toBe(QUIET_WINDOW_MS);
  });

  it("TESTE C: mensagens separadas por 5s formam turnos diferentes", () => {
    const { execucoes, lotes } = simular([
      { chave: "A", id: "m1", texto: "Olá", emMs: 0 },
      { chave: "A", id: "m2", texto: "Ainda está aí?", emMs: 5000 },
    ]);
    expect(lotes).toBe(2);
    expect(execucoes).toHaveLength(2);
    expect(execucoes[0]!.mensagens).toEqual(["m1"]);
    expect(execucoes[1]!.mensagens).toEqual(["m2"]);
  });

  it("TESTE D: conversas diferentes têm lotes independentes", () => {
    const { execucoes, lotes } = simular([
      { chave: "A", id: "a1", texto: "Oi", emMs: 0 },
      { chave: "B", id: "b1", texto: "Boa tarde", emMs: 100 },
      { chave: "A", id: "a2", texto: "quero remarcar", emMs: 200 },
    ]);
    expect(lotes).toBe(2);
    expect(execucoes).toHaveLength(2);
    const porLote = execucoes.map((e) => e.mensagens.sort().join(","));
    expect(porLote).toContain("a1,a2");
    expect(porLote).toContain("b1");
  });

  it("teto de burst evita espera indefinida", () => {
    const dec = decidirEspera(MAX_BURST_WINDOW_MS - 200, 0);
    expect(dec.forcar).toBe(true);
    expect(dec.esperaMs).toBe(200);
  });

  it("mensagens distintas nunca são coladas entre si", () => {
    const t = montarTurnoPaciente(["quero", "marcar"]);
    expect(t).not.toContain("queromarcar");
    expect(t.split("\n")).toHaveLength(3);
  });
});
