import { describe, expect, it } from "bun:test";
import { resolverRecorte } from "@/lib/nina/metricas-filtros";
import {
  consolidarTaxaErro,
  diaDaSemana,
  mediaPorDia,
  mediaPorHora,
  resolverFaixa,
  resumirCobertura,
} from "@/lib/nina/metricas-analise";

const FUSO = "America/Sao_Paulo";

describe("cobertura do recorte", () => {
  it("conta dias, sábados e horas efetivamente incluídos", () => {
    // Agosto/2025: 01 a 31, faixa 07:00–12:00, apenas sábados (dow 6).
    const recorte = resolverRecorte({
      de: "2025-08-01",
      ate: "2025-08-31",
      diaInteiro: false,
      horaInicio: "07:00",
      horaFim: "12:00",
      fuso: FUSO,
    });
    const r = resumirCobertura(recorte, [6], new Date("2025-09-30T12:00:00Z"));
    expect(r.dias).toBe(5); // 02, 09, 16, 23 e 30 de agosto
    expect(r.porDiaSemana[6]).toBe(5);
    expect(r.horas).toBe(25); // 5 dias × 5 horas
    expect(r.parcial).toBe(false);
    expect(r.diasFuturos).toBe(0);
  });

  it("marca mês em andamento como parcial e não conta dia futuro como zero", () => {
    const recorte = resolverRecorte({
      de: "2025-09-01",
      ate: "2025-09-30",
      diaInteiro: true,
      fuso: FUSO,
    });
    const r = resumirCobertura(recorte, null, new Date("2025-09-10T15:00:00Z"));
    expect(r.parcial).toBe(true);
    expect(r.diasFuturos).toBe(21); // de 10 a 30 de setembro
    expect(r.dias).toBe(30);
  });

  it("dia da semana usa o calendário local", () => {
    expect(diaDaSemana("2025-08-02")).toBe(6);
    expect(diaDaSemana("2025-08-03")).toBe(0);
  });
});

describe("taxa de erro", () => {
  it("soma numeradores e denominadores antes de dividir", () => {
    const r = consolidarTaxaErro([
      { numerador: 3, denominador: 200 },
      { numerador: 0, denominador: 100 },
    ]);
    expect(r.numerador).toBe(3);
    expect(r.denominador).toBe(300);
    expect(r.valor).toBeCloseTo(1, 6);
    // Média simples das porcentagens daria 0,75% — errado.
    expect(r.valor).not.toBeCloseTo(0.75, 6);
  });

  it("preserva a fórmula das fases anteriores", () => {
    const r = consolidarTaxaErro([{ numerador: 3, denominador: 200 }]);
    expect(r.valor).toBeCloseTo(1.5, 6);
    expect(r.formula).toContain("mensagens totais do sistema");
  });

  it("com denominador zero devolve indisponível, não 0%", () => {
    expect(consolidarTaxaErro([{ numerador: 0, denominador: 0 }]).valor).toBeNull();
  });
});

describe("médias", () => {
  it("usa apenas dias e horas efetivamente incluídos", () => {
    expect(mediaPorDia(100, 5)).toBe(20);
    expect(mediaPorHora(100, 25)).toBe(4);
    expect(mediaPorDia(100, 0)).toBeNull();
    expect(mediaPorHora(100, 0)).toBeNull();
  });
});

describe("faixas de horário", () => {
  const faixas = [
    { chave: "manha", nome: "Manhã", horaInicio: "08:00", horaFim: "12:00" },
    { chave: "tarde", nome: "Tarde", horaInicio: "13:00", horaFim: "18:00" },
  ];

  it("resolve pela chave e pelo nome, com ou sem acento", () => {
    expect(resolverFaixa("manhã", faixas)?.horaInicio).toBe("08:00");
    expect(resolverFaixa("Tarde", faixas)?.horaFim).toBe("18:00");
  });

  it("sem configuração não presume 07:00–12:00", () => {
    expect(resolverFaixa("manhã", [])).toBeNull();
    expect(resolverFaixa("noite", faixas)).toBeNull();
  });
});
