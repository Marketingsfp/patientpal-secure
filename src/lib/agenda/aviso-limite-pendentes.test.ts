import { describe, expect, it } from "bun:test";
import {
  calcularAvisoLimitePendentes,
  normalizarProcedimento,
} from "./aviso-limite-pendentes";

describe("normalizarProcedimento", () => {
  it("remove acentos, trim e caixa alta", () => {
    expect(normalizarProcedimento("  Consulta Médica  ")).toBe("CONSULTA MEDICA");
    expect(normalizarProcedimento(null)).toBe("");
    expect(normalizarProcedimento(undefined)).toBe("");
  });

  it("trata serviços equivalentes com acento diferente como iguais", () => {
    expect(normalizarProcedimento("Ecocardiograma"))
      .toBe(normalizarProcedimento("ecocardiograma"));
  });
});

describe("calcularAvisoLimitePendentes — gratuidade", () => {
  const beneficio = {
    gratuito: true,
    limite_qtd: 1,
    excedente_modo: "particular" as const,
  };

  it("não avisa quando não há pendentes", () => {
    expect(
      calcularAvisoLimitePendentes({
        beneficio,
        pendentes: [],
        usados: 0,
        procedimentoNome: "Consulta",
      }),
    ).toBeNull();
  });

  it("não avisa quando os pendentes são de serviços DIFERENTES", () => {
    const aviso = calcularAvisoLimitePendentes({
      beneficio,
      pendentes: [{ procedimento: "Ecocardiograma" }, { procedimento: "MAPA" }],
      usados: 0,
      procedimentoNome: "Consulta Médica",
    });
    expect(aviso).toBeNull();
  });

  it("avisa quando existe pendente do MESMO serviço (case/acento insensitive)", () => {
    const aviso = calcularAvisoLimitePendentes({
      beneficio,
      pendentes: [
        { procedimento: "consulta medica" },
        { procedimento: "Ecocardiograma" },
      ],
      usados: 0,
      procedimentoNome: "Consulta Médica",
    });
    expect(aviso).not.toBeNull();
    // apenas 1 pendente do mesmo serviço + o atual = total 2
    expect(aviso).toContain("Existem 2 agendamentos pendentes");
    expect(aviso).toContain("sairão pelo valor particular cheio");
  });

  it("conta apenas pendentes do mesmo serviço no total", () => {
    const aviso = calcularAvisoLimitePendentes({
      beneficio,
      pendentes: [
        { procedimento: "Consulta" },
        { procedimento: "Consulta" },
        { procedimento: "MAPA" },
      ],
      usados: 0,
      procedimentoNome: "consulta",
    });
    expect(aviso).toContain("Existem 3 agendamentos pendentes");
  });
});

describe("calcularAvisoLimitePendentes — demais benefícios", () => {
  const beneficio = {
    gratuito: false,
    limite_qtd: 3,
    excedente_modo: "percentual_particular" as const,
    excedente_percentual: 30,
  };

  it("não avisa quando total ainda cabe na cota (usados+pendentes+1 <= limite)", () => {
    // usados=1, pendentes=1, +1 = 3 → NÃO estoura (== limite)
    expect(
      calcularAvisoLimitePendentes({
        beneficio,
        pendentes: [{ procedimento: "X" }],
        usados: 1,
        procedimentoNome: "qualquer",
      }),
    ).toBeNull();
  });

  it("avisa quando o total esbarra no limite (usados+pendentes+1 > limite)", () => {
    // usados=1, pendentes=2, +1 = 4 > 3
    const aviso = calcularAvisoLimitePendentes({
      beneficio,
      pendentes: [{ procedimento: "X" }, { procedimento: "Y" }],
      usados: 1,
      procedimentoNome: "qualquer",
    });
    expect(aviso).not.toBeNull();
    expect(aviso).toContain("30% de desconto sobre o particular");
  });

  it("ignora o serviço dos pendentes para benefícios não gratuitos", () => {
    // todos de serviços diferentes, mas estouram o limite → deve avisar
    const aviso = calcularAvisoLimitePendentes({
      beneficio,
      pendentes: [
        { procedimento: "A" },
        { procedimento: "B" },
        { procedimento: "C" },
      ],
      usados: 0,
      procedimentoNome: "D",
    });
    expect(aviso).not.toBeNull();
  });

  it("não avisa quando limite_qtd é 0/nulo", () => {
    expect(
      calcularAvisoLimitePendentes({
        beneficio: { ...beneficio, limite_qtd: 0 },
        pendentes: [{ procedimento: "X" }, { procedimento: "Y" }],
        usados: 10,
        procedimentoNome: "X",
      }),
    ).toBeNull();
  });

  it("monta texto correto para excedente_modo=valor_fixo", () => {
    const aviso = calcularAvisoLimitePendentes({
      beneficio: {
        gratuito: false,
        limite_qtd: 1,
        excedente_modo: "valor_fixo",
        excedente_valor: 50,
      },
      pendentes: [{ procedimento: "X" }],
      usados: 0,
      procedimentoNome: "X",
    });
    expect(aviso).toContain("valor fixo excedente de R$ 50.00");
  });

  it("monta texto correto para excedente_modo=bloquear", () => {
    const aviso = calcularAvisoLimitePendentes({
      beneficio: {
        gratuito: false,
        limite_qtd: 1,
        excedente_modo: "bloquear",
      },
      pendentes: [{ procedimento: "X" }],
      usados: 0,
      procedimentoNome: "X",
    });
    expect(aviso).toContain("serão bloqueados pelo convênio");
  });
});