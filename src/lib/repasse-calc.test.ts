import { describe, expect, it } from "bun:test";
import {
  calcRepasseFull,
  resolverRepasse,
  valorCelulaRepasse,
  type RepasseConvenio,
  type RepasseCtx,
  type RepasseMedico,
} from "./repasse-calc";

// Cenario real da clinica: medico com Repasse Padrao de R$ 55,00 e a grade de
// repasse individual preenchida so na coluna Particular.
const MEDICO: RepasseMedico = {
  id: "med-1",
  tipo_repasse: "valor",
  valor_repasse_padrao: 55,
  percentual_repasse_padrao: 0,
  aceita_cartao_beneficios: true,
  cb_tipo_repasse: "valor",
  cb_valor_repasse: null,
  cb_percentual_repasse: null,
};

const LINHA_SO_PARTICULAR: RepasseConvenio = {
  medico_id: "med-1",
  nome: "ACUPUNTURA (4 SESSOES)",
  tipo_repasse: "valor",
  valor: 150,
  percentual: null,
  convenio_tipo_repasse: null,
  convenio_percentual: null,
  convenio_valor: null,
  cartao_consulta_valor: null,
  cartao_desconto_valor: null,
};

describe("valorCelulaRepasse", () => {
  it("trata celula vazia como nao configurada", () => {
    expect(valorCelulaRepasse(null)).toBeNull();
    expect(valorCelulaRepasse(undefined)).toBeNull();
    expect(valorCelulaRepasse("")).toBeNull();
    expect(valorCelulaRepasse("   ")).toBeNull();
  });

  it("trata o texto 'padrao' como nao configurada", () => {
    expect(valorCelulaRepasse("padrão")).toBeNull();
    expect(valorCelulaRepasse("padrao")).toBeNull();
    expect(valorCelulaRepasse("PADRÃO")).toBeNull();
  });

  it("aceita numero, inclusive zero digitado de proposito", () => {
    expect(valorCelulaRepasse(0)).toBe(0);
    expect(valorCelulaRepasse("0")).toBe(0);
    expect(valorCelulaRepasse("150.00")).toBe(150);
    expect(valorCelulaRepasse(150)).toBe(150);
  });
});

describe("heranca do Repasse Padrao", () => {
  it("coluna Convenio em branco herda o padrao do medico", () => {
    const r = resolverRepasse({
      linha: LINHA_SO_PARTICULAR,
      med: MEDICO,
      base: 200,
      forma: "convenio",
    });
    expect(r.repasse).toBe(55);
  });

  it("coluna Cartao Consulta em branco herda o padrao do medico", () => {
    const r = resolverRepasse({
      linha: LINHA_SO_PARTICULAR,
      med: MEDICO,
      base: 200,
      forma: "cartao_consulta",
    });
    expect(r.repasse).toBe(55);
  });

  it("coluna Cartao Desconto em branco herda o padrao do medico", () => {
    const r = resolverRepasse({
      linha: LINHA_SO_PARTICULAR,
      med: MEDICO,
      base: 200,
      forma: "cartao_desconto",
    });
    expect(r.repasse).toBe(55);
  });

  it("coluna Particular em branco herda o padrao do medico", () => {
    const semParticular: RepasseConvenio = { ...LINHA_SO_PARTICULAR, valor: null };
    const r = resolverRepasse({
      linha: semParticular,
      med: MEDICO,
      base: 200,
      forma: "particular",
    });
    expect(r.repasse).toBe(55);
  });

  it("cartao beneficio com valor em branco no medico nao zera o repasse", () => {
    // Era o caso que a clinica reportava: R$ 0,00 gravado no campo vazio de
    // "Repasse cartoes beneficios" derrubava o repasse do atendimento inteiro.
    const r = resolverRepasse({
      linha: null,
      med: MEDICO,
      base: 120,
      forma: "cartao_consulta",
    });
    expect(r.repasse).toBe(55);
  });
});

describe("valores configurados continuam mandando", () => {
  it("coluna Particular preenchida vale no atendimento particular", () => {
    const r = resolverRepasse({
      linha: LINHA_SO_PARTICULAR,
      med: MEDICO,
      base: 200,
      forma: "particular",
    });
    expect(r.repasse).toBe(150);
  });

  it("coluna Convenio preenchida prevalece sobre o padrao", () => {
    const linha: RepasseConvenio = {
      ...LINHA_SO_PARTICULAR,
      convenio_tipo_repasse: "percentual",
      convenio_percentual: 30,
    };
    const r = resolverRepasse({ linha, med: MEDICO, base: 200, forma: "convenio" });
    expect(r.repasse).toBe(60);
  });

  it("Cartao Consulta preenchido prevalece sobre o cartao beneficio do medico", () => {
    const linha: RepasseConvenio = { ...LINHA_SO_PARTICULAR, cartao_consulta_valor: 35 };
    const med: RepasseMedico = { ...MEDICO, cb_valor_repasse: 190 };
    const r = resolverRepasse({ linha, med, base: 9.99, forma: "cartao_consulta" });
    expect(r.repasse).toBe(35);
  });

  it("cartao beneficio do medico vale quando a linha do servico esta em branco", () => {
    const med: RepasseMedico = { ...MEDICO, cb_valor_repasse: 190 };
    const r = resolverRepasse({
      linha: LINHA_SO_PARTICULAR,
      med,
      base: 9.99,
      forma: "cartao_consulta",
    });
    expect(r.repasse).toBe(190);
  });

  it("zero digitado de proposito zera o repasse", () => {
    const linha: RepasseConvenio = {
      ...LINHA_SO_PARTICULAR,
      convenio_tipo_repasse: "valor",
      convenio_valor: 0,
    };
    const r = resolverRepasse({ linha, med: MEDICO, base: 200, forma: "convenio" });
    expect(r.repasse).toBe(0);
  });

  it("zero digitado na coluna Particular zera o repasse", () => {
    const linha: RepasseConvenio = { ...LINHA_SO_PARTICULAR, valor: 0 };
    const r = resolverRepasse({ linha, med: MEDICO, base: 200, forma: "particular" });
    expect(r.repasse).toBe(0);
  });
});

describe("calcRepasseFull encontra a linha do servico", () => {
  const ctx: RepasseCtx = {
    medicos: [MEDICO],
    convenios: [LINHA_SO_PARTICULAR],
    procTipos: new Map([["acupuntura (4 sessoes)", "PROCEDIMENTO"]]),
  };

  it("usa a coluna Particular no atendimento sem convenio", () => {
    const r = calcRepasseFull(ctx, "med-1", 200, "ACUPUNTURA (4 SESSOES)", null, null);
    expect(r.repasse).toBe(150);
  });

  it("cai no Repasse Padrao quando o atendimento e por convenio", () => {
    const r = calcRepasseFull(ctx, "med-1", 200, "ACUPUNTURA (4 SESSOES)", null, "cartao_consulta");
    expect(r.repasse).toBe(55);
  });

  it("servico sem linha cadastrada usa o Repasse Padrao", () => {
    const r = calcRepasseFull(ctx, "med-1", 200, "CONSULTA", null, null);
    expect(r.repasse).toBe(55);
  });

  it("repasse fixo nunca passa do valor recebido", () => {
    const r = calcRepasseFull(ctx, "med-1", 40, "CONSULTA", null, null);
    expect(r.repasse).toBe(40);
  });
});
