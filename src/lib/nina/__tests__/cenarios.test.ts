import { describe, expect, it } from "bun:test";
import {
  avaliarCenario,
  avaliarCriterio,
  distribuirCenarios,
  filasPorLead,
} from "@/lib/nina/cenarios";

const fatos = {
  respostasNina: ["Temos horários com o Dr. Cardio às 14h"],
  ferramentas: ["buscar_agenda"],
  transferida: false,
  houveErro: false,
  turnos: 2,
};

describe("critérios determinísticos", () => {
  it("aceita texto com acento/caixa diferentes", () => {
    expect(avaliarCriterio({ tipo: "contem_texto", valor: "HORARIOS" }, fatos).ok).toBe(true);
  });

  it("reprova texto ausente", () => {
    expect(avaliarCriterio({ tipo: "contem_texto", valor: "ultrassom" }, fatos).ok).toBe(false);
  });

  it("verifica ferramenta usada e proibida", () => {
    expect(avaliarCriterio({ tipo: "usou_ferramenta", valor: "agenda" }, fatos).ok).toBe(true);
    expect(avaliarCriterio({ tipo: "nao_usou_ferramenta", valor: "agenda" }, fatos).ok).toBe(false);
  });

  it("verifica transferência e erro", () => {
    expect(avaliarCriterio({ tipo: "nao_transferiu" }, fatos).ok).toBe(true);
    expect(avaliarCriterio({ tipo: "transferiu" }, fatos).ok).toBe(false);
    expect(avaliarCriterio({ tipo: "sem_erro" }, { ...fatos, houveErro: true }).ok).toBe(false);
  });
});

describe("resultado do cenário", () => {
  it("aprova quando todos os critérios passam", () => {
    const r = avaliarCenario([{ tipo: "sem_erro" }, { tipo: "nao_transferiu" }], fatos);
    expect(r.resultado).toBe("aprovado");
  });

  it("reprova quando um critério falha", () => {
    const r = avaliarCenario([{ tipo: "transferiu" }], fatos);
    expect(r.resultado).toBe("reprovado");
  });

  it("é inconclusivo sem resposta da Nina", () => {
    const r = avaliarCenario([{ tipo: "sem_erro" }], { ...fatos, respostasNina: [] });
    expect(r.resultado).toBe("inconclusivo");
  });

  it("é inconclusivo sem critérios", () => {
    expect(avaliarCenario([], fatos).resultado).toBe("inconclusivo");
  });
});

describe("distribuição entre os leads", () => {
  const leads = Array.from({ length: 10 }, (_, i) => ({ id: `lead-${i + 1}` }));

  it("usa rodízio entre os 10 leads", () => {
    const cenarios = Array.from({ length: 12 }, (_, i) => ({ id: `c-${i + 1}` }));
    const d = distribuirCenarios(cenarios, leads);
    expect(d[0]!.lead.id).toBe("lead-1");
    expect(d[9]!.lead.id).toBe("lead-10");
    expect(d[10]!.lead.id).toBe("lead-1");
    expect(d).toHaveLength(12);
  });

  it("não distribui sem leads", () => {
    expect(distribuirCenarios([{ id: "c1" }], [])).toEqual([]);
  });

  it("agrupa filas por lead preservando a ordem", () => {
    const cenarios = Array.from({ length: 4 }, (_, i) => ({ id: `c-${i + 1}` }));
    const filas = filasPorLead(distribuirCenarios(cenarios, leads.slice(0, 2)));
    expect(filas).toHaveLength(2);
    expect(filas[0]!.map((i) => i.cenario.id)).toEqual(["c-1", "c-3"]);
  });
});
