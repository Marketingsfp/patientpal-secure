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

// REPASSE TRIPLO — exame feito com equipamento de outro médico. Os dois
// percentuais incidem sobre o VALOR TOTAL do atendimento e a clínica fica com
// o que sobra (cenário do pedido: 30% clínica / 40% executante / 30% terceiro).
describe("repasse triplo (terceiro dono do equipamento)", () => {
  const LINHA_EXAME_COM_TERCEIRO: RepasseConvenio = {
    medico_id: "med-1",
    nome: "MAPEAMENTO DE RETINA",
    tipo_repasse: "percentual",
    percentual: 40,
    valor: null,
    convenio_tipo_repasse: null,
    convenio_percentual: null,
    convenio_valor: null,
    cartao_consulta_valor: null,
    cartao_desconto_valor: null,
    terceiro_id: "med-terceiro",
    percentual_terceiro: 30,
  };

  it("divide 100 reais em 40 executante, 30 terceiro e 30 clinica", () => {
    const r = resolverRepasse({
      linha: LINHA_EXAME_COM_TERCEIRO,
      med: MEDICO,
      base: 100,
      forma: "particular",
    });
    expect(r.repasse).toBe(40);
    expect(r.terceiro?.medico_id).toBe("med-terceiro");
    expect(r.terceiro?.valor).toBe(30);
    expect(+(r.total - r.repasse - (r.terceiro?.valor ?? 0)).toFixed(2)).toBe(30);
  });

  it("terceiro recebe mesmo quando o executante cai no Repasse Padrao", () => {
    // Coluna Convenio em branco: o executante herda o padrao (R$ 55), mas o
    // combinado com o dono do equipamento continua valendo.
    const r = resolverRepasse({
      linha: LINHA_EXAME_COM_TERCEIRO,
      med: MEDICO,
      base: 200,
      forma: "convenio",
    });
    expect(r.repasse).toBe(55);
    expect(r.terceiro?.valor).toBe(60);
  });

  it("linha sem terceiro nao gera repasse de terceiro", () => {
    const r = resolverRepasse({
      linha: LINHA_SO_PARTICULAR,
      med: MEDICO,
      base: 200,
      forma: "particular",
    });
    expect(r.terceiro).toBeNull();
  });

  it("terceiro cadastrado com percentual zerado nao gera repasse", () => {
    const linha: RepasseConvenio = { ...LINHA_EXAME_COM_TERCEIRO, percentual_terceiro: 0 };
    const r = resolverRepasse({ linha, med: MEDICO, base: 200, forma: "particular" });
    expect(r.terceiro).toBeNull();
  });

  it("calcRepasseFull devolve a parte do terceiro pelo nome do servico", () => {
    const ctx: RepasseCtx = {
      medicos: [MEDICO],
      convenios: [LINHA_EXAME_COM_TERCEIRO],
      procTipos: new Map([["mapeamento de retina", "EXAME"]]),
    };
    const r = calcRepasseFull(ctx, "med-1", 250, "MAPEAMENTO DE RETINA", null, null);
    expect(r.repasse).toBe(100);
    expect(r.terceiro?.valor).toBe(75);
  });

  it("atendimento sem medico nao tem terceiro", () => {
    const ctx: RepasseCtx = {
      medicos: [MEDICO],
      convenios: [LINHA_EXAME_COM_TERCEIRO],
      procTipos: new Map(),
    };
    const r = calcRepasseFull(ctx, null, 250, "MAPEAMENTO DE RETINA", null, null);
    expect(r.terceiro).toBeNull();
  });

  // Terceiro em VALOR FIXO: recebe exatamente o cadastrado por atendimento; o
  // executante segue a regra dele e a clínica fica com o restante.
  const LINHA_TERCEIRO_FIXO: RepasseConvenio = {
    ...LINHA_EXAME_COM_TERCEIRO,
    tipo_repasse_terceiro: "valor",
    percentual_terceiro: null,
    valor_terceiro: 25,
  };

  it("terceiro em valor fixo recebe o valor exato e a clinica fica com o resto", () => {
    const r = resolverRepasse({
      linha: LINHA_TERCEIRO_FIXO,
      med: MEDICO,
      base: 100,
      forma: "particular",
    });
    expect(r.repasse).toBe(40);
    expect(r.terceiro?.valor).toBe(25);
    expect(r.terceiro?.percentual).toBeNull();
    expect(+(r.total - r.repasse - (r.terceiro?.valor ?? 0)).toFixed(2)).toBe(35);
  });

  it("valor fixo do terceiro nao muda quando o valor do atendimento muda", () => {
    const a = resolverRepasse({
      linha: LINHA_TERCEIRO_FIXO,
      med: MEDICO,
      base: 100,
      forma: "particular",
    });
    const b = resolverRepasse({
      linha: LINHA_TERCEIRO_FIXO,
      med: MEDICO,
      base: 300,
      forma: "particular",
    });
    expect(a.terceiro?.valor).toBe(25);
    expect(b.terceiro?.valor).toBe(25);
  });

  it("valor fixo do terceiro nunca passa do que o paciente pagou", () => {
    const r = resolverRepasse({
      linha: LINHA_TERCEIRO_FIXO,
      med: MEDICO,
      base: 20,
      forma: "particular",
    });
    expect(r.terceiro?.valor).toBe(20);
  });

  it("valor fixo do terceiro e pago integral quando nao houve pagamento no caixa", () => {
    const r = resolverRepasse({
      linha: LINHA_TERCEIRO_FIXO,
      med: MEDICO,
      base: 0,
      forma: "convenio",
    });
    expect(r.terceiro?.valor).toBe(25);
  });

  it("terceiro em valor fixo ignora o percentual antigo que ficou gravado", () => {
    const linha: RepasseConvenio = { ...LINHA_TERCEIRO_FIXO, percentual_terceiro: 30 };
    const r = resolverRepasse({ linha, med: MEDICO, base: 100, forma: "particular" });
    expect(r.terceiro?.valor).toBe(25);
  });

  it("terceiro em valor fixo zerado ou vazio nao gera repasse", () => {
    const zerado: RepasseConvenio = { ...LINHA_TERCEIRO_FIXO, valor_terceiro: 0 };
    const vazio: RepasseConvenio = { ...LINHA_TERCEIRO_FIXO, valor_terceiro: null };
    expect(
      resolverRepasse({ linha: zerado, med: MEDICO, base: 100, forma: "particular" }).terceiro,
    ).toBeNull();
    expect(
      resolverRepasse({ linha: vazio, med: MEDICO, base: 100, forma: "particular" }).terceiro,
    ).toBeNull();
  });

  it("linha antiga sem tipo do terceiro continua em percentual", () => {
    const linha: RepasseConvenio = { ...LINHA_EXAME_COM_TERCEIRO, tipo_repasse_terceiro: null };
    const r = resolverRepasse({ linha, med: MEDICO, base: 100, forma: "particular" });
    expect(r.terceiro?.percentual).toBe(30);
    expect(r.terceiro?.valor).toBe(30);
  });
});
