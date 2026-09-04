import { describe, expect, it } from "bun:test";
import { motivoFinal } from "./motivo-final";

const USUARIO = { tipo: "usuario" } as const;
const PARCEIRO = { tipo: "integracao", origem_integracao: "policardmed" } as const;

describe("motivoFinal", () => {
  it("preserva o que a recepção escreveu", () => {
    expect(motivoFinal("Paciente desmarcou", USUARIO, "cancelamento")).toBe("Paciente desmarcou");
    expect(motivoFinal("Médico ausente", USUARIO, "reagendamento")).toBe("Médico ausente");
  });

  it("limpa espaços em volta antes de gravar", () => {
    // Sem isso, um motivo composto só de espaços passaria pela validação de
    // tamanho da tela e chegaria ao banco como justificativa vazia.
    expect(motivoFinal("  Imprevisto pessoal  ", USUARIO, "cancelamento")).toBe(
      "Imprevisto pessoal",
    );
    expect(motivoFinal("   ", USUARIO, "cancelamento")).toBeNull();
  });

  it("identifica a origem quando a ação vem de uma integração externa", () => {
    // O parceiro não tem como abrir o modal da recepção, mas o histórico não
    // pode ficar sem explicar de onde veio o cancelamento.
    expect(motivoFinal(null, PARCEIRO, "cancelamento")).toBe(
      "Cancelado pela integração policardmed",
    );
    expect(motivoFinal("", PARCEIRO, "reagendamento")).toBe(
      "Reagendado pela integração policardmed",
    );
  });

  it("deixa o motivo do parceiro passar por cima do automático", () => {
    expect(motivoFinal("Paciente ligou para a central", PARCEIRO, "cancelamento")).toBe(
      "Paciente ligou para a central",
    );
  });

  it("devolve nulo para caminhos internos sem motivo", () => {
    // Cancelamento em cascata de pacote e correção de manutenção chegam sem
    // justificativa e continuam válidos — a obrigatoriedade é da tela.
    expect(motivoFinal(null, USUARIO, "cancelamento")).toBeNull();
    expect(motivoFinal(undefined, USUARIO, "reagendamento")).toBeNull();
  });
});
