import { describe, expect, it } from "bun:test";
import { SEM_FATURAMENTO_ROTULO, ehSemFaturamento, rotuloSemFaturamento } from "./sem-faturamento";

describe("ehSemFaturamento", () => {
  it("reconhece o atendimento marcado (caso do Toxicológico)", () => {
    expect(ehSemFaturamento({ sem_faturamento: true })).toBe(true);
  });

  it("não confunde ausência de marcação com marcação", () => {
    // A coluna nasceu `false` para todos os agendamentos já gravados, e linhas
    // vindas de telas antigas podem nem trazer o campo. Nos dois casos o
    // atendimento é cobrado normalmente.
    expect(ehSemFaturamento({ sem_faturamento: false })).toBe(false);
    expect(ehSemFaturamento({})).toBe(false);
    expect(ehSemFaturamento(null)).toBe(false);
    expect(ehSemFaturamento(undefined)).toBe(false);
  });
});

describe("rotuloSemFaturamento", () => {
  it("é vazio quando o atendimento não está marcado", () => {
    expect(rotuloSemFaturamento({ sem_faturamento: false })).toBe("");
  });

  it("diz quem marcou e quando, para a recepção saber a quem perguntar", () => {
    const txt = rotuloSemFaturamento({
      sem_faturamento: true,
      sem_faturamento_em: "2026-09-03T14:30:00.000Z",
      sem_faturamento_por_nome: "MAYARA",
    });
    expect(txt).toContain("paga direto ao parceiro");
    expect(txt).toContain("MAYARA");
  });

  it("ainda explica a marcação quando a data está ausente ou inválida", () => {
    // Marcações gravadas por caminhos que não preenchem a data (importação,
    // correção manual no banco) não podem deixar o balãozinho mudo.
    expect(rotuloSemFaturamento({ sem_faturamento: true })).toContain("parceiro");
    expect(rotuloSemFaturamento({ sem_faturamento: true, sem_faturamento_em: "xxx" })).toContain(
      "parceiro",
    );
  });
});

describe("tarja da guia", () => {
  it("nunca imprime CORTESIA num atendimento sem faturamento", () => {
    // A distinção importa para o paciente: cortesia é a clínica abrindo mão de
    // um valor devido; sem faturamento é cobrança de outra empresa.
    expect(SEM_FATURAMENTO_ROTULO).toBe("SEM FATURAMENTO");
  });
});
