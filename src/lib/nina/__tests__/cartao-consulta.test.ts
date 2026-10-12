import { describe, expect, it } from "bun:test";
import {
  cartaoConsultaPeloJev,
  mencionaCartaoConsulta,
  perguntaCartaoConsulta,
  MOTIVO_CARTAO_CONSULTA,
  REGRA_CARTAO_CONSULTA,
} from "../cartao-consulta";

describe("cartão consulta vai para a equipe humana", () => {
  it.each([
    "Quero fazer o cartão consulta",
    "quanto custa a consulta com cartao de consulta?",
    "Como renovo meu Cartão Consulta?",
    "a mensalidade do cartão de benefícios venceu",
    "vcs tem cartao de desconto?",
    "Quero colocar minha filha no cartão de consultas",
    "não tenho cartão consulta, quanto fica?",
    "sou associada, qual o valor do ultrassom?",
    "como faço pra virar associado?",
  ])("detecta: %s", (mensagem) => {
    expect(mencionaCartaoConsulta(mensagem)).toBe(true);
  });

  it.each([
    "Aceita cartão?",
    "Posso pagar no cartão de crédito?",
    "quanto fica no cartão de débito",
    "O valor no cartão é diferente do pix?",
    "Quero agendar uma consulta",
    "",
  ])("não confunde com pagamento ou outro assunto: %s", (mensagem) => {
    expect(mencionaCartaoConsulta(mensagem)).toBe(false);
  });

  it("motivo e regra seguem o contrato de encaminhamento", () => {
    expect(MOTIVO_CARTAO_CONSULTA).toStartWith("CARTAO_CONSULTA:");
    expect(REGRA_CARTAO_CONSULTA).toContain("solicitar_atendente_humano");
    expect(REGRA_CARTAO_CONSULTA).toContain("CARTAO_CONSULTA");
    expect(REGRA_CARTAO_CONSULTA).toContain("sem informar valores");
    expect(REGRA_CARTAO_CONSULTA).toContain("cartão de crédito ou débito não é cartão consulta");
  });
});

describe("Jev identifica menções indiretas ao cartão consulta", () => {
  it("pergunta separa cartão consulta de pagamento com cartão e convênio", () => {
    const p = perguntaCartaoConsulta().cartao_consulta!;
    expect(p.type).toBe("choice");
    expect(Object.keys(p.criteria as Record<string, unknown>)).toEqual([
      "cartao_consulta",
      "nenhum",
    ]);
    expect(String(p.instructions)).toContain("crédito ou débito");
    expect(String(p.instructions)).toContain("convênio");
  });

  it("só encaminha com escolha cartao_consulta e confiança mínima de 0,8", () => {
    expect(cartaoConsultaPeloJev({ choice: "cartao_consulta", confidence: 0.8 })).toBe(true);
    expect(cartaoConsultaPeloJev({ choice: "cartao_consulta", confidence: 0.95 })).toBe(true);
    expect(cartaoConsultaPeloJev({ choice: "cartao_consulta", confidence: 0.79 })).toBe(false);
    expect(cartaoConsultaPeloJev({ choice: "nenhum", confidence: 0.99 })).toBe(false);
    expect(cartaoConsultaPeloJev({ choice: "cartao_consulta" })).toBe(false);
    expect(cartaoConsultaPeloJev(undefined)).toBe(false);
  });
});
