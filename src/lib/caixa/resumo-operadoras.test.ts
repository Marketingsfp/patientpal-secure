import { describe, expect, it } from "bun:test";
import { resumoOperadoras, type MovOperadora, type SessaoOperadora } from "./resumo-operadoras";

const sessao = (
  p: Partial<SessaoOperadora> & { id: string; user_id: string },
): SessaoOperadora => ({
  user_nome: null,
  status: "fechado",
  valor_abertura: 0,
  valor_fechamento_calculado: null,
  diferenca: 0,
  ...p,
});
const mov = (sessao_id: string, tipo: string, valor: number, forma: string | null = null) =>
  ({ sessao_id, tipo, valor, forma_pagamento: forma }) as MovOperadora;

describe("resumoOperadoras", () => {
  it("separa o Calculado da modal (todas as formas) do dinheiro da gaveta", () => {
    // Amanda, 16/09/2026: R$ 662 em dinheiro, o resto em cartão/PIX, R$ 120 de estorno.
    const s = [
      sessao({
        id: "a",
        user_id: "u1",
        user_nome: "AMANDA",
        valor_fechamento_calculado: "2484",
      }),
    ];
    const m = [
      mov("a", "recebimento", 662, "dinheiro"),
      mov("a", "recebimento", 1942, "cartao_credito"),
      mov("a", "estorno", 120, "cartao_debito"),
    ];
    const { linhas } = resumoOperadoras(s, m);
    expect(linhas[0].calculado).toBe(2484);
    expect(linhas[0].recebidoDinheiro).toBe(662);
    expect(linhas[0].gaveta).toBe(662);
  });

  it("desconta sangria e estorno em dinheiro da gaveta", () => {
    // Suellen, 15/09/2026: R$ 8.492 em dinheiro, R$ 8.242 de sangria, R$ 250 estornados.
    const s = [sessao({ id: "s", user_id: "u2", user_nome: "SUELLEN" })];
    const m = [
      mov("s", "recebimento", 8492, "dinheiro"),
      mov("s", "sangria", 8242),
      mov("s", "estorno", 250, "dinheiro"),
    ];
    const l = resumoOperadoras(s, m).linhas[0];
    expect(l.sangrias).toBe(8242);
    expect(l.recebidoDinheiro).toBe(8242);
    expect(l.gaveta).toBe(0);
  });

  it("soma as sessões da mesma operadora e fecha o total do período", () => {
    const s = [
      sessao({ id: "m1", user_id: "u3", user_nome: "MAYARA", diferenca: -10 }),
      sessao({ id: "m2", user_id: "u3", user_nome: "MAYARA", diferenca: 0 }),
      sessao({ id: "n1", user_id: "u4", user_nome: "NICOLE", status: "aberto", diferenca: null }),
    ];
    const m = [
      mov("m1", "recebimento", 120, "dinheiro"),
      mov("m2", "recebimento", 4178, "dinheiro"),
      mov("m2", "sangria", 1450),
      mov("n1", "abertura", 50),
      mov("n1", "recebimento", 300, "dinheiro"),
      mov("n1", "recebimento", 200, "pix"),
    ];
    const { linhas, total } = resumoOperadoras(s, m);
    expect(linhas.map((l) => l.nome)).toEqual(["MAYARA", "NICOLE"]);
    expect(linhas[0].sessoes).toBe(2);
    expect(linhas[0].sangrias).toBe(1450);
    expect(linhas[0].diferenca).toBe(-10);
    // Sessão aberta: calculado em tempo real, sem diferença ainda.
    expect(linhas[1].calculado).toBe(500);
    expect(linhas[1].diferenca).toBeNull();
    expect(linhas[1].emAberto).toBe(true);
    expect(total.sangrias).toBe(1450);
    expect(total.recebidoDinheiro).toBe(4598);
    expect(total.gaveta).toBe(3148);
    expect(total.diferenca).toBe(-10);
  });

  it("troco de abertura entra na gaveta mas não no calculado", () => {
    const s = [sessao({ id: "t", user_id: "u5", status: "aberto", valor_abertura: 110 })];
    const m = [mov("t", "abertura", 110), mov("t", "recebimento", 90, "dinheiro")];
    const l = resumoOperadoras(s, m).linhas[0];
    expect(l.gaveta).toBe(200);
    expect(l.calculado).toBe(90);
  });
});
