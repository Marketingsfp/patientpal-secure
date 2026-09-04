import { describe, expect, it } from "bun:test";
import { listaDePapeis, podeAutorizar, rolesDoEscopo } from "./autorizacao-supervisor";

describe("alçada por escopo", () => {
  it("o financeiro autoriza desconto e cortesia, mas não isenta a cobrança", () => {
    // A distinção é a razão de existir de dois escopos: desconto reduz um
    // valor e o financeiro participa disso todo dia; sem faturamento apaga a
    // cobrança inteira e some com o atendimento do caixa, o que é decisão de
    // supervisão.
    expect(podeAutorizar("desconto", "financeiro")).toBe(true);
    expect(podeAutorizar("sem_faturamento", "financeiro")).toBe(false);
  });

  it("o supervisor isenta a cobrança, mas não é quem aplica desconto", () => {
    expect(podeAutorizar("sem_faturamento", "supervisor")).toBe(true);
    expect(podeAutorizar("desconto", "supervisor")).toBe(false);
  });

  it("administrador e gestor autorizam as duas coisas", () => {
    for (const escopo of ["desconto", "sem_faturamento"] as const) {
      expect(podeAutorizar(escopo, "admin")).toBe(true);
      expect(podeAutorizar(escopo, "gestor")).toBe(true);
    }
  });

  it("quem opera o balcão não autoriza nada sozinho", () => {
    for (const escopo of ["desconto", "sem_faturamento"] as const) {
      expect(podeAutorizar(escopo, "recepcao")).toBe(false);
      expect(podeAutorizar(escopo, "caixa")).toBe(false);
      expect(podeAutorizar(escopo, "medico")).toBe(false);
      expect(podeAutorizar(escopo, null)).toBe(false);
      expect(podeAutorizar(escopo, undefined)).toBe(false);
    }
  });

  it("a lista de papéis do escopo é a mesma consultada pela tela", () => {
    expect([...rolesDoEscopo("sem_faturamento")]).toEqual(["admin", "gestor", "supervisor"]);
    expect([...rolesDoEscopo("desconto")]).toEqual(["admin", "gestor", "financeiro"]);
  });
});

describe("listaDePapeis", () => {
  it("escreve a frase que a funcionária lê para saber a quem chamar", () => {
    // O texto era fixo em "admin, gestor ou financeiro" em todos os diálogos e
    // mandava chamar exatamente quem o sistema ia recusar no sem faturamento.
    expect(listaDePapeis("sem_faturamento")).toBe("administrador, gestor ou supervisor");
    expect(listaDePapeis("desconto")).toBe("administrador, gestor ou financeiro");
  });
});
