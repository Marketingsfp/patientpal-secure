/**
 * FASE 4 — Handoff como fim de cenário nos testes automatizados.
 * Testes puros da regra de desfecho e PASS/FAIL.
 */
import { describe, expect, it } from "bun:test";
import { avaliarCenario } from "@/lib/nina/cenarios";
import {
  aplicarRegraHandoff,
  desfechoDoItem,
  handoffEsperado,
  MOTIVO_CICLO_POR_DESFECHO,
} from "@/lib/nina/cenario-desfecho";

const fatosBase = {
  respostasNina: ["Vou te encaminhar para a equipe."],
  ferramentas: ["solicitar_atendente_humano"],
  houveErro: false,
  turnos: 2,
};

describe("handoffEsperado", () => {
  it("usa o campo explícito quando definido", () => {
    expect(handoffEsperado({ handoff_esperado: true, criterios: [{ tipo: "nao_transferiu" }] })).toBe(true);
    expect(handoffEsperado({ handoff_esperado: false })).toBe(false);
  });

  it("deriva dos critérios quando não há campo explícito", () => {
    expect(handoffEsperado({ criterios: [{ tipo: "transferiu" }] })).toBe(true);
    expect(handoffEsperado({ criterios: [{ tipo: "nao_transferiu" }] })).toBe(false);
    expect(handoffEsperado({ criterios: [{ tipo: "sem_erro" }] })).toBeNull();
    expect(handoffEsperado({})).toBeNull();
  });
});

describe("desfechoDoItem", () => {
  it("erro tem prioridade sobre handoff", () => {
    expect(desfechoDoItem({ transferida: true, erro: "falhou" })).toBe("erro");
  });
  it("handoff encerra o cenário", () => {
    expect(desfechoDoItem({ transferida: true })).toBe("handoff");
  });
  it("interrompido quando o operador parou a execução", () => {
    expect(desfechoDoItem({ transferida: false, interrompido: true })).toBe("interrompido");
  });
  it("limite de turnos quando esgotou as mensagens", () => {
    expect(desfechoDoItem({ transferida: false, turnosUsados: 6, maxTurnos: 6 })).toBe("limite_turnos");
  });
  it("concluído no caso normal", () => {
    expect(desfechoDoItem({ transferida: false, turnosUsados: 2, maxTurnos: 6 })).toBe("concluido");
  });
});

describe("aplicarRegraHandoff", () => {
  it("handoff esperado e realizado → aprovado", () => {
    const base = avaliarCenario([{ tipo: "sem_erro" }], { ...fatosBase, transferida: true });
    const r = aplicarRegraHandoff(base, { desfecho: "handoff", esperado: true });
    expect(r.resultado).toBe("aprovado");
  });

  it("handoff não esperado → reprovado", () => {
    const base = avaliarCenario([{ tipo: "sem_erro" }], { ...fatosBase, transferida: true });
    const r = aplicarRegraHandoff(base, { desfecho: "handoff", esperado: false });
    expect(r.resultado).toBe("reprovado");
  });

  it("handoff esperado que não aconteceu → reprovado", () => {
    const base = avaliarCenario([{ tipo: "sem_erro" }], { ...fatosBase, transferida: false });
    const r = aplicarRegraHandoff(base, { desfecho: "concluido", esperado: true });
    expect(r.resultado).toBe("reprovado");
  });

  it("cenário indiferente ao handoff não é penalizado", () => {
    const base = avaliarCenario([{ tipo: "sem_erro" }], { ...fatosBase, transferida: true });
    const r = aplicarRegraHandoff(base, { desfecho: "handoff", esperado: null });
    expect(r.resultado).toBe("aprovado");
    expect(r.avaliados).toHaveLength(1);
  });

  it("não duplica o critério de transferência já avaliado", () => {
    const base = avaliarCenario([{ tipo: "transferiu" }], { ...fatosBase, transferida: true });
    const r = aplicarRegraHandoff(base, { desfecho: "handoff", esperado: true });
    expect(r.avaliados).toHaveLength(1);
    expect(r.resultado).toBe("aprovado");
  });

  it("inconclusivo continua inconclusivo", () => {
    const base = avaliarCenario([], { ...fatosBase, respostasNina: [], transferida: true });
    const r = aplicarRegraHandoff(base, { desfecho: "handoff", esperado: true });
    expect(r.resultado).toBe("inconclusivo");
  });
});

describe("cleanup do ciclo por desfecho", () => {
  it("cada desfecho tem um motivo válido de encerramento de ciclo", () => {
    expect(MOTIVO_CICLO_POR_DESFECHO.handoff).toBe("handoff_humano");
    expect(MOTIVO_CICLO_POR_DESFECHO.concluido).toBe("cenario_concluido");
    expect(MOTIVO_CICLO_POR_DESFECHO.limite_turnos).toBe("cenario_concluido");
    expect(MOTIVO_CICLO_POR_DESFECHO.erro).toBe("falha_tecnica");
    expect(MOTIVO_CICLO_POR_DESFECHO.interrompido).toBe("cancelado_usuario");
  });
});
