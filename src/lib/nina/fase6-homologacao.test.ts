/**
 * FASE 6 — Homologação do agrupamento de mensagens quebradas.
 *
 * Cenários 1 a 8 do gate, medição de latência e métricas antes/depois.
 * Tudo em relógio virtual: nenhum WhatsApp real, nenhum dado de produção.
 */
import { describe, expect, it } from "bun:test";
import { MAX_BURST_WINDOW_MS, QUIET_WINDOW_MS } from "@/lib/nina/burst";
import { simularConversas, type MensagemSimulada } from "@/lib/nina/fase6-homologacao";

const msg = (conversa: string, id: string, texto: string, emMs: number): MensagemSimulada => ({
  conversa,
  id,
  texto,
  emMs,
});

describe("FASE 6 — cenário 1: caso real (3 mensagens em 300ms)", () => {
  const r = simularConversas([
    msg("A", "m1", "Olá", 0),
    msg("A", "m2", "Gostaria de marcar uma consulta", 300),
    msg("A", "m3", "De neurologista", 600),
  ]);

  it("1 batch, 1 execução, 1 resposta", () => {
    expect(r.batches).toBe(1);
    expect(r.execucoes).toHaveLength(1);
    expect(r.enviadas).toHaveLength(1);
  });

  it("as 3 mensagens físicas continuam separadas e completas no turno", () => {
    expect(r.execucoes[0]!.mensagens).toEqual(["m1", "m2", "m3"]);
    expect(r.execucoes[0]!.texto).toContain("1. Olá");
    expect(r.execucoes[0]!.texto).toContain("3. De neurologista");
  });

  it("a resposta considera neurologia e não repete apresentação", () => {
    expect(r.execucoes[0]!.texto).toContain("neurologista");
    // Uma única execução ⇒ impossível saudar duas vezes.
    expect(r.enviadas).toHaveLength(1);
  });

  it("latência do agrupador fica dentro da quiet window", () => {
    expect(r.metricas.latenciaAgrupadorMs.max).toBeLessThanOrEqual(QUIET_WINDOW_MS);
  });
});

describe("FASE 6 — cenário 2: frase em 5 partes", () => {
  const r = simularConversas([
    msg("A", "m1", "Oi", 0),
    msg("A", "m2", "queria saber", 250),
    msg("A", "m3", "se tem", 500),
    msg("A", "m4", "cardiologista", 750),
    msg("A", "m5", "sábado", 1000),
  ]);

  it("a rajada inteira vira um único turno", () => {
    expect(r.execucoes).toHaveLength(1);
    expect(r.execucoes[0]!.mensagens).toHaveLength(5);
    expect(r.execucoes[0]!.texto).toContain("cardiologista");
    expect(r.execucoes[0]!.texto).toContain("sábado");
  });

  it("4 chamadas ao modelo evitadas frente ao comportamento antigo", () => {
    expect(r.metricas.chamadasModeloEvitadas).toBe(4);
  });
});

describe("FASE 6 — cenário 3: mensagens realmente separadas", () => {
  const r = simularConversas([
    msg("A", "m1", "Quero marcar neurologista", 0),
    msg("A", "m2", "Também queria saber o valor da endoscopia", 5000),
  ]);

  it("dois turnos independentes", () => {
    expect(r.batches).toBe(2);
    expect(r.enviadas).toHaveLength(2);
    expect(r.enviadas[0]!.mensagens).toEqual(["m1"]);
    expect(r.enviadas[1]!.mensagens).toEqual(["m2"]);
  });
});

describe("FASE 6 — cenário 4: nova mensagem durante a geração", () => {
  const r = simularConversas(
    [
      msg("A", "m1", "Quero marcar neurologista", 0),
      // Chega enquanto o modelo trabalha (geração de 1000ms a 1800ms).
      msg("A", "m2", "Mas somente sábado", 1200),
    ],
    { geracaoMs: 800, ferramentaPorConversa: () => "criar_agendamento" },
  );

  it("a resposta antiga não é enviada", () => {
    expect(r.execucoes[0]!.enviada).toBe(false);
    expect(r.execucoes[0]!.motivoDescarte).toBe("SUPERSEDED");
    expect(r.execucoes[0]!.statusLote).toBe("SUPERSEDED");
  });

  it("ação crítica é bloqueada na geração obsoleta", () => {
    expect(r.execucoes[0]!.ferramenta).toBeNull();
    expect(r.execucoes[0]!.ferramentaBloqueada).toBe("criar_agendamento");
  });

  it("a nova geração usa a restrição de sábado e é a única enviada", () => {
    expect(r.enviadas).toHaveLength(1);
    expect(r.enviadas[0]!.texto).toContain("somente sábado");
    expect(r.metricas.respostasStaleBloqueadas).toBe(1);
    expect(r.metricas.ferramentasCriticasExecutadas).toBe(1);
  });
});

describe("FASE 6 — cenário 5: alta velocidade (10 fragmentos)", () => {
  const entradas = Array.from({ length: 10 }, (_, i) =>
    msg("A", `m${i + 1}`, `parte ${i + 1}`, i * 200),
  );
  const r = simularConversas(entradas);

  it("nenhuma mensagem perdida e nenhuma duplicada", () => {
    const ids = r.execucoes.flatMap((e) => e.mensagens);
    expect(new Set(ids).size).toBe(10);
    expect(ids).toHaveLength(10);
  });

  it("respeita o teto de burst (nada espera além do máximo)", () => {
    for (const e of r.execucoes) {
      expect(e.inicioMs - e.mensagens.length * 0).toBeLessThanOrEqual(
        entradas[0]!.emMs + MAX_BURST_WINDOW_MS + 1000,
      );
    }
  });

  it("execuções em ordem e sem sobreposição na mesma conversa", () => {
    for (let i = 1; i < r.execucoes.length; i++) {
      expect(r.execucoes[i]!.inicioMs).toBeGreaterThanOrEqual(r.execucoes[i - 1]!.fimMs);
    }
    expect(r.metricas.execucoes).toBeLessThan(10);
  });
});

describe("FASE 6 — cenário 6: duas conversas", () => {
  const r = simularConversas([
    msg("A", "a1", "Oi", 0),
    msg("B", "b1", "Boa tarde", 50),
    msg("A", "a2", "quero neurologista", 250),
    msg("B", "b2", "quero cardiologista", 300),
  ]);

  it("batches separados, sem mistura de contexto", () => {
    expect(r.batches).toBe(2);
    expect(r.execucoes).toHaveLength(2);
    const a = r.execucoes.find((e) => e.conversa === "A")!;
    const b = r.execucoes.find((e) => e.conversa === "B")!;
    expect(a.mensagens).toEqual(["a1", "a2"]);
    expect(b.mensagens).toEqual(["b1", "b2"]);
    expect(a.texto).not.toContain("cardiologista");
    expect(b.texto).not.toContain("neurologista");
  });

  it("conversas diferentes processam em paralelo", () => {
    const a = r.execucoes.find((e) => e.conversa === "A")!;
    const b = r.execucoes.find((e) => e.conversa === "B")!;
    const sobrepoe = a.inicioMs < b.fimMs && b.inicioMs < a.fimMs;
    expect(sobrepoe).toBe(true);
  });
});

describe("FASE 6 — cenário 7: handoff", () => {
  const r = simularConversas(
    [
      msg("A", "m1", "Preciso falar", 0),
      msg("A", "m2", "com um atendente", 200),
      msg("A", "m3", "é urgente", 400),
    ],
    { ferramentaPorConversa: () => "solicitar_atendente_humano" },
  );

  it("apenas um handoff para a rajada inteira", () => {
    expect(r.execucoes).toHaveLength(1);
    expect(r.metricas.ferramentasCriticasExecutadas).toBe(1);
    expect(r.execucoes[0]!.ferramenta).toBe("solicitar_atendente_humano");
  });
});

describe("FASE 6 — cenário 8: agendamento", () => {
  const completo = (t: string) =>
    t.includes("neurologista") && t.includes("amanhã") && t.includes("de manhã");
  const r = simularConversas(
    [
      msg("A", "m1", "quero marcar", 0),
      msg("A", "m2", "neurologista", 200),
      msg("A", "m3", "amanhã", 400),
      msg("A", "m4", "de manhã", 600),
    ],
    { ferramentaPorConversa: (t) => (completo(t) ? "criar_agendamento" : null) },
  );

  it("uma única interpretação consolidada", () => {
    expect(r.execucoes).toHaveLength(1);
    expect(r.execucoes[0]!.mensagens).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("nenhuma tentativa prematura após apenas 'quero marcar'", () => {
    const prematura = r.execucoes.some(
      (e) => e.ferramenta === "criar_agendamento" && !completo(e.texto),
    );
    expect(prematura).toBe(false);
    expect(r.metricas.ferramentasCriticasExecutadas).toBe(1);
  });
});

describe("FASE 6 — latência e métricas", () => {
  const entradas = [
    msg("A", "m1", "Olá", 0),
    msg("A", "m2", "Gostaria de marcar uma consulta", 300),
    msg("A", "m3", "De neurologista", 600),
  ];
  const r = simularConversas(entradas, { geracaoMs: 800 });

  it("antes 3 execuções → depois 1 execução", () => {
    expect(r.metricas.mensagensFisicas).toBe(3);
    expect(r.metricas.execucoes).toBe(1);
    expect(r.metricas.chamadasModeloEvitadas).toBe(2);
    expect(r.metricas.mediaMensagensPorBatch).toBe(3);
  });

  it("latência adicional do agrupador ≤ quiet window", () => {
    expect(r.metricas.latenciaAgrupadorMs.p95).toBeLessThanOrEqual(QUIET_WINDOW_MS);
    expect(r.metricas.latenciaRespostaMs.p95).toBeLessThanOrEqual(QUIET_WINDOW_MS + 800);
  });

  it("janelas homologadas mantidas sem ajuste arbitrário", () => {
    expect(QUIET_WINDOW_MS).toBe(1000);
    expect(MAX_BURST_WINDOW_MS).toBe(2500);
  });

  it("quiet window menor reduz latência mas quebra a rajada (evidência do trade-off)", () => {
    const rapida = simularConversas(entradas, { quietMs: 250, geracaoMs: 800 });
    expect(rapida.metricas.latenciaAgrupadorMs.max).toBeLessThan(
      r.metricas.latenciaAgrupadorMs.max,
    );
    expect(rapida.metricas.execucoes).toBeGreaterThan(r.metricas.execucoes);
  });
});
