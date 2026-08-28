import { describe, expect, it } from "bun:test";
import { ehTabelaAusente, quemEhNoMovimento } from "./api";

describe("ehTabelaAusente", () => {
  it("reconhece a mensagem do PostgREST, que é a que aparece no app", () => {
    // Mensagem real vista na tela em 27/08/2026, antes de o SQL ser aplicado.
    expect(
      ehTabelaAusente({
        message: "Could not find the table 'public.estacionamento_movimentos' in the schema cache",
      }),
    ).toBe(true);
  });

  it("reconhece também a mensagem crua do Postgres", () => {
    expect(
      ehTabelaAusente({
        message: 'relation "public.estacionamento_movimentos" does not exist',
      }),
    ).toBe(true);
  });

  it("reconhece a mensagem em português", () => {
    expect(
      ehTabelaAusente({
        message: 'relação "public.estacionamento_movimentos" não existe',
      }),
    ).toBe(true);
  });

  it("não confunde com erro de permissão na mesma tabela", () => {
    // Aqui a tabela existe; o problema é outro e merece o erro de verdade.
    expect(
      ehTabelaAusente({
        message: "new row violates row-level security policy for table estacionamento_movimentos",
      }),
    ).toBe(false);
  });

  it("não engole erro de outra tabela", () => {
    expect(
      ehTabelaAusente({
        message: "Could not find the table 'public.outra_coisa' in the schema cache",
      }),
    ).toBe(false);
  });

  it("erro vazio ou ausente não é tabela faltando", () => {
    expect(ehTabelaAusente(null)).toBe(false);
    expect(ehTabelaAusente(undefined)).toBe(false);
    expect(ehTabelaAusente({})).toBe(false);
  });
});

describe("quemEhNoMovimento", () => {
  it("com nome e placa, mostra os dois", () => {
    expect(quemEhNoMovimento({ nome: "JOAO DA SILVA", placa: "ABC1D23" })).toBe(
      "JOAO DA SILVA (ABC1D23)",
    );
  });

  it("só com placa, mostra a placa", () => {
    expect(quemEhNoMovimento({ nome: null, placa: "LSB5699" })).toBe("LSB5699");
  });

  it("só com nome, mostra o nome", () => {
    expect(quemEhNoMovimento({ nome: "MARIA", placa: null })).toBe("MARIA");
  });

  it("campo em branco conta como ausente", () => {
    // O banco normaliza para NULL, mas um registro antigo pode ter espaços.
    expect(quemEhNoMovimento({ nome: "   ", placa: "ABC1D23" })).toBe("ABC1D23");
    expect(quemEhNoMovimento({ nome: "MARIA", placa: "  " })).toBe("MARIA");
  });

  it("sem nenhum dos dois, a linha ainda se identifica", () => {
    expect(quemEhNoMovimento({ nome: null, placa: null })).toBe("—");
    expect(quemEhNoMovimento({})).toBe("—");
  });

  it("tira espaços das pontas", () => {
    expect(quemEhNoMovimento({ nome: "  MARIA  ", placa: "  ABC1D23  " })).toBe("MARIA (ABC1D23)");
  });
});
