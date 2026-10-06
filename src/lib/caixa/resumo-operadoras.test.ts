import { describe, expect, it } from "bun:test";
import {
  especiePreSangria,
  resumoOperadoras,
  type MovOperadora,
  type SessaoOperadora,
} from "./resumo-operadoras";

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

  it("abre o recebido por forma e dia a dia, líquido de estorno", () => {
    const s = [
      sessao({ id: "d2", user_id: "u6", dia: "2026-09-02", diferenca: -5 }),
      sessao({ id: "d1", user_id: "u6", dia: "2026-09-01" }),
    ];
    const m = [
      mov("d1", "recebimento", 300, "dinheiro"),
      mov("d1", "recebimento", 200, "pix"),
      mov("d1", "sangria", 250),
      mov("d2", "recebimento", 150, "cartao_credito"),
      mov("d2", "recebimento", 80, "cartao_debito"),
      mov("d2", "estorno", 50, "cartao_credito"),
      mov("d2", "recebimento", 30, "misto"),
      mov("d2", "recebimento", 0, "sem_cobranca"),
    ];
    const l = resumoOperadoras(s, m).linhas[0];
    expect(l.porForma).toEqual({ dinheiro: 300, pix: 200, credito: 100, debito: 80, outros: 30 });
    expect(l.detalhe.map((d) => d.dia)).toEqual(["2026-09-01", "2026-09-02"]);
    expect(l.detalhe[0]).toMatchObject({ sangrias: 250, gaveta: 50, calculado: 250 });
    expect(l.detalhe[1].diferenca).toBe(-5);
  });

  it("troco de abertura entra na gaveta mas não no calculado", () => {
    const s = [sessao({ id: "t", user_id: "u5", status: "aberto", valor_abertura: 110 })];
    const m = [mov("t", "abertura", 110), mov("t", "recebimento", 90, "dinheiro")];
    const l = resumoOperadoras(s, m).linhas[0];
    expect(l.gaveta).toBe(200);
    expect(l.calculado).toBe(90);
  });
});

describe("especiePreSangria", () => {
  const movH = (
    sessao_id: string,
    tipo: string,
    valor: number,
    hora: string,
    forma: string | null = null,
  ) =>
    ({
      sessao_id,
      tipo,
      valor,
      forma_pagamento: forma,
      created_at: `2026-10-06T${hora}:00Z`,
    }) as MovOperadora;

  it("guarda o resto que a sangria redonda deixou na gaveta", () => {
    // Mayara, 06/10/2026: R$ 3.092 na gaveta, sangria de R$ 2.800 às 12:56.
    const s = [sessao({ id: "a", user_id: "u1", user_nome: "MAYARA", status: "aberto" })];
    const m = [
      movH("a", "abertura", 100, "08:00"),
      movH("a", "recebimento", 3092, "09:00", "dinheiro"),
      movH("a", "sangria", 2800, "12:56"),
      movH("a", "recebimento", 150, "13:00", "dinheiro"),
      movH("a", "recebimento", 200, "13:30", "pix"),
      movH("a", "estorno", 20, "13:40", "dinheiro"),
      movH("a", "despesa", 10, "13:50"),
      movH("a", "suprimento", 50, "14:00"),
    ];
    const r = especiePreSangria(s, m);
    expect(r.linhas).toEqual([
      { userId: "u1", nome: "MAYARA", especie: 412, ultimaSangria: "2026-10-06T12:56:00Z" },
    ]);
    expect(r.total).toBe(412);
  });

  it("sem sangria ainda, conta todo o dinheiro do caixa", () => {
    const s = [sessao({ id: "b", user_id: "u2", user_nome: "NICOLE", status: "aberto" })];
    const m = [movH("b", "recebimento", 120, "09:00", "dinheiro")];
    const l = especiePreSangria(s, m).linhas[0];
    expect(l.especie).toBe(120);
    expect(l.ultimaSangria).toBeNull();
  });

  it("sangria que levou também o troco não deixa o pendente negativo", () => {
    const s = [sessao({ id: "t", user_id: "u6", status: "aberto", valor_abertura: 100 })];
    const m = [
      movH("t", "abertura", 100, "08:00"),
      movH("t", "recebimento", 50, "09:00", "dinheiro"),
      movH("t", "sangria", 150, "10:00"),
    ];
    expect(especiePreSangria(s, m).total).toBe(0);
  });

  it("caixa fechado fica de fora e o total junta as operadoras", () => {
    const s = [
      sessao({ id: "f", user_id: "u3", user_nome: "MAYARA" }),
      sessao({ id: "c", user_id: "u4", user_nome: "CARLA", status: "aberto" }),
      sessao({ id: "d", user_id: "u5", user_nome: "DANI", status: "aberto" }),
    ];
    const m = [
      movH("f", "recebimento", 999, "09:00", "dinheiro"),
      movH("c", "recebimento", 40, "09:00", "dinheiro"),
      movH("d", "recebimento", 35.5, "09:00", "dinheiro"),
    ];
    const r = especiePreSangria(s, m);
    expect(r.linhas.map((l) => l.nome)).toEqual(["CARLA", "DANI"]);
    expect(r.total).toBe(75.5);
  });
});
