import { describe, expect, it } from "bun:test";
import {
  listaDePapeis,
  podeAutorizar,
  rolesDoEscopo,
  temAlcadaNominal,
} from "./autorizacao-supervisor";

/** Atalho: pessoa com a permissão individual concedida pela diretoria. */
const marcado = true;

describe("alçada por escopo", () => {
  it("o financeiro autoriza desconto e cortesia, mas não isenta a cobrança", () => {
    // A distinção é a razão de existir de dois escopos: desconto reduz um
    // valor e o financeiro participa disso todo dia; sem faturamento apaga a
    // cobrança inteira e some com o atendimento do caixa, o que é decisão de
    // supervisão.
    expect(podeAutorizar("desconto", "financeiro", marcado)).toBe(true);
    expect(podeAutorizar("sem_faturamento", "financeiro", marcado)).toBe(false);
  });

  it("o supervisor isenta a cobrança, mas não é quem aplica desconto", () => {
    expect(podeAutorizar("sem_faturamento", "supervisor", marcado)).toBe(true);
    expect(podeAutorizar("desconto", "supervisor", marcado)).toBe(false);
  });

  it("administrador e gestor autorizam as duas coisas", () => {
    for (const escopo of ["desconto", "sem_faturamento"] as const) {
      expect(podeAutorizar(escopo, "admin", marcado)).toBe(true);
      expect(podeAutorizar(escopo, "gestor", marcado)).toBe(true);
    }
  });

  it("quem opera o balcão não autoriza nada sozinho", () => {
    for (const escopo of ["desconto", "sem_faturamento"] as const) {
      expect(podeAutorizar(escopo, "recepcao", marcado)).toBe(false);
      expect(podeAutorizar(escopo, "caixa", marcado)).toBe(false);
      expect(podeAutorizar(escopo, "medico", marcado)).toBe(false);
      expect(podeAutorizar(escopo, null, marcado)).toBe(false);
      expect(podeAutorizar(escopo, undefined, marcado)).toBe(false);
    }
  });

  it("a lista de papéis do escopo é a mesma consultada pela tela", () => {
    expect([...rolesDoEscopo("sem_faturamento")]).toEqual(["admin", "gestor", "supervisor"]);
    expect([...rolesDoEscopo("desconto")]).toEqual(["admin", "gestor", "financeiro"]);
    expect([...rolesDoEscopo("liberar_debito")]).toEqual(["admin", "gestor", "financeiro"]);
  });

  it("ninguém libera atendimento com débito com a própria senha de recepção", () => {
    // A tela de pendências pedia "a senha do gestor" e conferia a senha de
    // quem estava logado — a recepcionista liberava sozinha o que a tela
    // dizia depender de um gestor.
    expect(podeAutorizar("liberar_debito", "recepcao", marcado)).toBe(false);
    expect(podeAutorizar("liberar_debito", "caixa", marcado)).toBe(false);
    expect(podeAutorizar("liberar_debito", "financeiro", marcado)).toBe(true);
  });
});

describe("permissão individual de autorizar", () => {
  it("perfil com alçada mas SEM a permissão individual não autoriza", () => {
    // O caso que motivou a permissão: são 30 pessoas com perfil de
    // administrador nesta clínica, porque é o perfil que dá acesso às telas
    // administrativas. Quem autoriza isenção é escolhido nome a nome.
    for (const escopo of ["desconto", "sem_faturamento", "liberar_debito"] as const) {
      expect(podeAutorizar(escopo, "admin", false)).toBe(false);
      expect(podeAutorizar(escopo, "admin", null)).toBe(false);
      expect(podeAutorizar(escopo, "admin", undefined)).toBe(false);
    }
  });

  it("são as duas condições juntas, nunca uma só", () => {
    expect(podeAutorizar("desconto", "admin", true)).toBe(true);
    expect(podeAutorizar("desconto", "recepcao", true)).toBe(false);
    expect(podeAutorizar("desconto", "admin", false)).toBe(false);
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

// A liberação NOMINAL existe para quem precisa de um poder que o cargo não dá,
// sem ser promovida de cargo (o que arrastaria acesso a dinheiro) e sem que o
// cargo inteiro passe a ter o poder. O caso real: uma recepcionista autorizada
// pela diretoria a isentar toxicológico sozinha, em 18/09/2026.
describe("alçada nominal (liberação por pessoa)", () => {
  it("libera a pessoa mesmo quando o cargo dela não autoriza", () => {
    expect(podeAutorizar("sem_faturamento", "recepcao", false)).toBe(false);
    expect(podeAutorizar("sem_faturamento", "recepcao", false, ["sem_faturamento"])).toBe(true);
  });

  it("não precisa da marcação de gestão para valer", () => {
    // É o ponto do desenho: a marcação de gestão é dada por outras pessoas,
    // depois, e não pode ser condição para uma liberação nominal já concedida.
    expect(podeAutorizar("sem_faturamento", "recepcao", null, ["sem_faturamento"])).toBe(true);
  });

  it("vale só para o escopo liberado, e não para os outros", () => {
    const so = ["sem_faturamento"];
    expect(podeAutorizar("desconto", "recepcao", false, so)).toBe(false);
    expect(podeAutorizar("liberar_debito", "recepcao", false, so)).toBe(false);
    expect(podeAutorizar("alerta_critico", "recepcao", false, so)).toBe(false);
  });

  it("não muda nada para quem não tem liberação nominal", () => {
    // A colega de mesmo cargo, inclusive marcada como gestão, continua fora.
    expect(podeAutorizar("sem_faturamento", "recepcao", true, [])).toBe(false);
    expect(podeAutorizar("sem_faturamento", "recepcao", true, null)).toBe(false);
    expect(podeAutorizar("sem_faturamento", "recepcao", true)).toBe(false);
  });

  it("quem já autoriza pelo cargo continua autorizando", () => {
    expect(podeAutorizar("sem_faturamento", "admin", true)).toBe(true);
    expect(podeAutorizar("sem_faturamento", "gestor", true, [])).toBe(true);
  });

  it("temAlcadaNominal responde só pelo escopo pedido", () => {
    expect(temAlcadaNominal("sem_faturamento", ["sem_faturamento"])).toBe(true);
    expect(temAlcadaNominal("desconto", ["sem_faturamento"])).toBe(false);
    expect(temAlcadaNominal("desconto", undefined)).toBe(false);
  });

  it("o mesmo poder de sempre continua fora do alcance da recepção sem liberação", () => {
    // Trava do pedido de 18/09/2026: nenhuma outra recepcionista pode herdar
    // o poder automaticamente, nem ganhando a marcação de gestão depois.
    for (const escopo of [
      "sem_faturamento",
      "desconto",
      "liberar_debito",
      "alerta_critico",
    ] as const) {
      expect(podeAutorizar(escopo, "recepcao", true)).toBe(false);
    }
  });
});
