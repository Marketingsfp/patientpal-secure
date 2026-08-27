import { describe, expect, it } from "bun:test";
import { ehTabelaAusente } from "./api";

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
