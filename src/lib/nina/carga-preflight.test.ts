import { describe, expect, it } from "bun:test";
import {
  LOTE_PREFLIGHT,
  MENSAGEM_FALHA_PREFLIGHT,
  baselineLead,
  descreverFalhaPreflight,
  descreverPreparacaoParcial,
  leadsParticipantes,
  pendentesPreflight,
  prepararLeads,
} from "@/lib/nina/carga-preflight";

const lead = (indice: number) => ({ id: `lead-${indice}`, indice });
const dez = Array.from({ length: 10 }, (_, i) => lead(i + 1));

describe("preflight do teste de carga", () => {
  it("só prepara os leads que vão participar da execução", () => {
    expect(leadsParticipantes(dez, 4).map((l) => l.indice)).toEqual([1, 2, 3, 4]);
    expect(leadsParticipantes(dez, 10)).toHaveLength(10);
    expect(leadsParticipantes(dez, 99)).toHaveLength(10);
  });

  // TESTE A — lead com conversa e memória anteriores
  it("reseta o lead sujo e só o marca READY depois do reset terminar", async () => {
    const ordem: string[] = [];
    const resumo = await prepararLeads({
      leads: [lead(1)],
      resetar: async () => {
        ordem.push("reset");
        await new Promise((r) => setTimeout(r, 5));
        ordem.push("persistido");
        return { jaResolvida: false };
      },
    });
    expect(ordem).toEqual(["reset", "persistido"]);
    expect(resumo.pronto).toBe(true);
    expect(resumo.resultados[0]!.situacao).toBe("READY");
    expect(resumo.resultados[0]!.jaLimpo).toBe(false);
  });

  // TESTE B — idempotência
  it("é idempotente: lead já limpo continua READY, sem erro nem evento extra", async () => {
    let chamadas = 0;
    const executar = () =>
      prepararLeads({
        leads: [lead(1)],
        resetar: async () => {
          chamadas += 1;
          return { jaResolvida: true };
        },
      });
    const primeira = await executar();
    const segunda = await executar();
    expect(primeira.pronto).toBe(true);
    expect(segunda.pronto).toBe(true);
    expect(segunda.resultados[0]!.jaLimpo).toBe(true);
    expect(chamadas).toBe(2);
  });

  // TESTE C — 10 leads ficam READY antes do primeiro disparo
  it("prepara os 10 leads com paralelismo limitado e todos ficam READY", async () => {
    let simultaneos = 0;
    let pico = 0;
    const resumo = await prepararLeads({
      leads: dez,
      paralelismo: 4,
      resetar: async () => {
        simultaneos += 1;
        pico = Math.max(pico, simultaneos);
        await new Promise((r) => setTimeout(r, 2));
        simultaneos -= 1;
        return { jaResolvida: false };
      },
    });
    expect(resumo.total).toBe(10);
    expect(resumo.prontos).toBe(10);
    expect(resumo.pronto).toBe(true);
    expect(pico).toBeLessThanOrEqual(4);
  });

  // TESTE D — falha em um lead impede o início do teste
  it("um lead com falha derruba o gate e informa qual falhou", async () => {
    const resumo = await prepararLeads({
      leads: dez.slice(0, 8),
      resetar: async (l) => {
        if (l.indice === 6) throw new Error("reset não confirmado");
        return { jaResolvida: false };
      },
    });
    expect(resumo.pronto).toBe(false);
    expect(resumo.prontos).toBe(7);
    expect(resumo.falhas.map((f) => f.indice)).toEqual([6]);
    const texto = descreverFalhaPreflight(resumo);
    expect(texto).toContain(MENSAGEM_FALHA_PREFLIGHT);
    expect(texto).toContain("Lead 06");
    expect(texto).toContain("reset não confirmado");
  });

  it("todos os leads são avaliados mesmo quando um falha no meio do lote", async () => {
    const vistos: number[] = [];
    const resumo = await prepararLeads({
      leads: dez,
      paralelismo: 3,
      resetar: async (l) => {
        vistos.push(l.indice);
        if (l.indice === 2) throw new Error("erro");
        return { jaResolvida: false };
      },
    });
    expect(vistos.sort((a, b) => a - b)).toEqual(dez.map((l) => l.indice));
    expect(resumo.resultados).toHaveLength(10);
    expect(resumo.pronto).toBe(false);
  });
});

// FASE 3 — progresso, baseline por lead e idempotência entre lotes.
describe("preparação em lotes com progresso (fase 3)", () => {
  it("grava baseline mínimo do lead depois do reset", () => {
    const baseline = baselineLead({
      runId: "run-1",
      resultado: { leadId: "lead-3", indice: 3, situacao: "READY", jaLimpo: false },
      agora: new Date("2026-09-11T12:00:00Z"),
    });
    expect(baseline).toEqual({
      runId: "run-1",
      leadId: "lead-3",
      leadIndice: 3,
      preparedAt: "2026-09-11T12:00:00.000Z",
      memoryReset: true,
      previousCycleResolved: true,
      ready: true,
      jaLimpo: false,
    });
  });

  it("não repete leads já preparados no mesmo run", () => {
    const pendentes = pendentesPreflight(dez, [{ leadId: "lead-1" }, { leadId: "lead-2" }]);
    expect(pendentes.map((l) => l.indice)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    expect(pendentesPreflight(dez, dez.map((l) => ({ leadId: l.id })))).toHaveLength(0);
  });

  it("prepara em lotes até completar todos os participantes", () => {
    let baselines: { leadId: string }[] = [];
    let voltas = 0;
    while (pendentesPreflight(dez, baselines).length) {
      voltas += 1;
      const lote = pendentesPreflight(dez, baselines).slice(0, LOTE_PREFLIGHT);
      baselines = [...baselines, ...lote.map((l) => ({ leadId: l.id }))];
    }
    expect(baselines).toHaveLength(10);
    expect(voltas).toBe(Math.ceil(10 / LOTE_PREFLIGHT));
  });

  it("descreve a preparação parcial para o operador", () => {
    expect(descreverPreparacaoParcial(9, 10)).toBe(
      "9 de 10 Leads foram preparados. O teste não foi iniciado porque 1 lead não pôde ser resetado.",
    );
    expect(descreverPreparacaoParcial(7, 10)).toContain("3 leads não puderam ser resetados");
  });
});
