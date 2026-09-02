import { describe, expect, it } from "bun:test";
import {
  parsePlanilha,
  validarRegistros,
  detectarConflitos,
  expandirTermos,
} from "../kb-parser";

/** Planilha simplificada no formato real da TAP: seção, herança e vazios. */
const ABA = {
  nome: "TAP",
  matriz: [
    ["ESPECIALIDADE", "MÉDICO", "DIA", "HORÁRIO", "DINHEIRO/PIX", "CARTÃO", "PREPARO"],
    ["CARDIOLOGIA", "", "", "", "", "", ""],
    ["Consulta", "Dr. Marcilio", "Segunda", "08:00 às 12:00", "R$ 120,00", "R$ 145,00", ""],
    ["", "", "Quarta", "14:00 as 18:00", "", "", ""],
    ["ULTRASSONOGRAFIA", "", "", "", "", "", ""],
    ["USG de tireoide", "Dra. Rosangela", "Terça", "09:00", "180", "200", "Jejum de 4h"],
  ],
};

const resultado = parsePlanilha([ABA]);
const registros = resultado.registros;

describe("parser da Base de Conhecimentos", () => {
  it("herda contexto em células vazias", () => {
    const quarta = registros.find((r) => (r.dia ?? "").includes("Quarta"));
    expect(quarta?.procedimento).toBe("Consulta");
    expect(quarta?.medico).toBe("Dr. Marcilio");
  });

  it("normaliza preço e horário sem perder o valor bruto", () => {
    const consulta = registros.find((r) => (r.dia ?? "").includes("Segunda"))!;
    expect(consulta.preco_dinheiro).toBe(120);
    expect(consulta.preco_cartao).toBe(145);
    expect(consulta.horario).toContain("08:00");
    expect(consulta.bruto).toBeTruthy();
    expect(consulta.linha_origem).toBeGreaterThan(0);
    expect(consulta.aba_origem).toBe("TAP");
  });

  it("mantém preparo do exame", () => {
    const usg = registros.find((r) => (r.procedimento ?? "").includes("tireoide"))!;
    expect(usg.preparo).toContain("Jejum");
    expect(usg.preco_dinheiro).toBe(180);
  });

  it("valida que existem registros úteis", () => {
    expect(validarRegistros(resultado).ok).toBe(true);
  });

  it("rejeita planilha sem registros úteis", () => {
    const vazio = parsePlanilha([{ nome: "X", matriz: [["ESPECIALIDADE", "PREÇO"]] }]);
    expect(validarRegistros(vazio).ok).toBe(false);
  });

  it("aponta conflito de preço para o mesmo procedimento", () => {
    const conflitos = detectarConflitos([
      ...registros,
      { ...registros[0]!, preco_dinheiro: 999, linha_origem: 99 },
    ]);
    expect(conflitos.length).toBeGreaterThan(0);
  });

  it("expande termos com sinônimos seguros", () => {
    const termos = expandirTermos("ultrassom de tireoide").join(" ");
    expect(termos).toMatch(/ultrassonografia|usg|ultrassom/);
  });
});

/* ------------------------------------------------------------------ */
/* Regressão: célula com MÚLTIPLOS dias (bug "SEG / QUA" -> só quarta)  */
/* ------------------------------------------------------------------ */

import { interpretarDias, relacionarDiasHorarios, normalizarDia } from "../kb-parser";

describe("interpretação de múltiplos dias", () => {
  const casos: Array<[string, string[]]> = [
    ["SEG / QUA", ["Segunda-feira", "Quarta-feira"]],
    ["TER / QUI / SEX", ["Terça-feira", "Quinta-feira", "Sexta-feira"]],
    ["SEG/TER/SEX", ["Segunda-feira", "Terça-feira", "Sexta-feira"]],
    [
      "SEG À SEX",
      ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"],
    ],
    [
      "SEG À SAB",
      [
        "Segunda-feira",
        "Terça-feira",
        "Quarta-feira",
        "Quinta-feira",
        "Sexta-feira",
        "Sábado",
      ],
    ],
    ["TER/QUA/SAB", ["Terça-feira", "Quarta-feira", "Sábado"]],
    ["SEG DE 15 EM 15 DIAS / QUI", ["Segunda-feira", "Quinta-feira"]],
    ["SEG, QUA", ["Segunda-feira", "Quarta-feira"]],
    ["SEG E QUA", ["Segunda-feira", "Quarta-feira"]],
    ["2ª e 4ª", ["Segunda-feira", "Quarta-feira"]],
  ];

  for (const [entrada, esperado] of casos) {
    it(`interpreta "${entrada}"`, () => {
      const r = interpretarDias(entrada);
      expect(r.dias.map((d) => d.dia)).toEqual(esperado);
      expect(r.dias_original).toBe(entrada);
    });
  }

  it("preserva a regra adicional do dia", () => {
    const r = interpretarDias("SEG DE 15 EM 15 DIAS / QUI");
    expect(r.dias[0]!.regra).toBe("de 15 em 15 dias");
    expect(r.dias[1]!.regra).toBeNull();
  });

  it("mantém a relação posicional dia ↔ horário", () => {
    const dias = relacionarDiasHorarios(interpretarDias("SEG / QUI").dias, "2ª 13:00 / 5ª 07:00");
    expect(dias.find((d) => d.dia === "Segunda-feira")?.horario).toBe("13:00");
    expect(dias.find((d) => d.dia === "Quinta-feira")?.horario).toBe("07:00");
  });

  it("bug do caso real: médico com SEG / QUA guarda os DOIS dias", () => {
    const parsed = parsePlanilha([
      {
        nome: "TAP",
        matriz: [
          ["ESPECIALIDADE", "MÉDICO", "DIA", "HORÁRIO", "DINHEIRO/PIX", "CARTÃO"],
          ["CLINICO GERAL", "ANDRE LUIS LIMA DA SILVA", "SEG / QUA", "07:00", "120", "145"],
        ],
      },
    ]);
    const reg = parsed.registros.find((r) => (r.medico ?? "").includes("ANDRE"))!;
    const dias = (reg.extras as any).dias.map((d: any) => d.dia);
    expect(dias).toContain("Segunda-feira");
    expect(dias).toContain("Quarta-feira");
    expect(reg.dia).toContain("Segunda-feira");
    expect(reg.dia).toContain("Quarta-feira");
    expect((reg.extras as any).dia_original).toBe("SEG / QUA");
    expect(normalizarDia("SEG / QUA")).toBe("Segunda-feira e Quarta-feira");
  });
});
