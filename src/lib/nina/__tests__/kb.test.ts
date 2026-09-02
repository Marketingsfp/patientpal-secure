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
