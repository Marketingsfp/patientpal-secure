import { describe, expect, it } from "bun:test";
import {
  diferencasCadastro,
  idadeEm,
  mascaraFalsa,
  mascararEmail,
  motivoNaoCancela,
  motivoRecusaPedido,
  podeConfirmar,
  sessaoValida,
} from "./regras";

const agora = new Date("2026-10-16T12:00:00Z");

describe("mascaramento", () => {
  it("mostra só o começo do e-mail", () => {
    expect(mascararEmail("Paciente.Teste@gmail.com")).toBe("pa***@g***.com");
  });
  it("máscara falsa tem o mesmo formato e é estável", () => {
    const m = mascaraFalsa("a1b2c3");
    expect(m).toMatch(/^[a-v]{2}\*\*\*@[a-v]\*\*\*\.com(\.br)?$/);
    expect(mascaraFalsa("a1b2c3")).toBe(m);
  });
});

describe("limite de pedidos de código", () => {
  const base = { cpf15min: 0, cpfDia: 0, ip15min: 0, bloqueiosRecentes: 0 };
  it("libera o primeiro pedido", () => expect(motivoRecusaPedido(base)).toBeNull());
  it("3 pedidos em 15 min por CPF travam o 4º", () =>
    expect(motivoRecusaPedido({ ...base, cpf15min: 3 })).toBe("limite_cpf_15min"));
  it("10 pedidos no dia travam", () =>
    expect(motivoRecusaPedido({ ...base, cpfDia: 10 })).toBe("limite_cpf_dia"));
  it("10 pedidos do mesmo IP em 15 min travam", () =>
    expect(motivoRecusaPedido({ ...base, ip15min: 10 })).toBe("limite_ip"));
  it("3 códigos queimados por erro bloqueiam o CPF", () =>
    expect(motivoRecusaPedido({ ...base, bloqueiosRecentes: 3 })).toBe("cpf_bloqueado"));
});

describe("sessão", () => {
  it("expira após 30 min sem uso", () => {
    expect(
      sessaoValida(
        { ultimo_uso_em: "2026-10-16T11:31:00Z", expira_max_em: "2026-10-16T18:00:00Z", encerrada_em: null },
        agora,
      ),
    ).toBe(true);
    expect(
      sessaoValida(
        { ultimo_uso_em: "2026-10-16T11:30:00Z", expira_max_em: "2026-10-16T18:00:00Z", encerrada_em: null },
        agora,
      ),
    ).toBe(false);
  });
  it("expira no máximo de 8 h e após sair", () => {
    expect(
      sessaoValida(
        { ultimo_uso_em: "2026-10-16T11:59:00Z", expira_max_em: "2026-10-16T12:00:00Z", encerrada_em: null },
        agora,
      ),
    ).toBe(false);
    expect(
      sessaoValida(
        { ultimo_uso_em: "2026-10-16T11:59:00Z", expira_max_em: "2026-10-16T18:00:00Z", encerrada_em: "x" },
        agora,
      ),
    ).toBe(false);
  });
});

describe("menor de idade", () => {
  it("17 anos é menor; 18 completos não", () => {
    expect(idadeEm("2008-10-17", agora)).toBe(17);
    expect(idadeEm("2008-10-16", agora)).toBe(18);
  });
});

describe("confirmar e cancelar", () => {
  const ag = { inicio: "2026-10-16T15:00:00Z", status: "agendado", pago: false, pacote: false };
  it("confirma só agendado futuro", () => {
    expect(podeConfirmar(ag, agora)).toBe(true);
    expect(podeConfirmar({ ...ag, status: "confirmado" }, agora)).toBe(false);
  });
  it("cancela até 2 h antes", () => {
    expect(motivoNaoCancela(ag, agora, 2)).toBeNull();
    expect(motivoNaoCancela({ ...ag, inicio: "2026-10-16T13:59:00Z" }, agora, 2)).not.toBeNull();
  });
  it("consulta paga ou de pacote vai para a recepção", () => {
    expect(motivoNaoCancela({ ...ag, pago: true }, agora, 2)).toContain("recepção");
    expect(motivoNaoCancela({ ...ag, pacote: true }, agora, 2)).toContain("recepção");
  });
});

describe("solicitação de cadastro", () => {
  it("só leva o que mudou", () => {
    expect(
      diferencasCadastro(
        { telefone: "(48) 99999-0000", email: "a@b.com", cidade: "Tubarão" },
        { telefone: "48999990000", email: "NOVO@b.com", cidade: "tubarão" },
      ),
    ).toEqual({ email: "novo@b.com" });
  });
});
