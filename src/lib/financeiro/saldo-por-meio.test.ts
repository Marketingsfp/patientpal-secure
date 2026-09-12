import { describe, expect, it } from "bun:test";
import { saldoPorMeio, type LinhaClassificada } from "./movimento-resultado";

const l = (p: Partial<LinhaClassificada>): LinhaClassificada =>
  ({
    id: p.id ?? Math.random().toString(36).slice(2),
    tipo: p.tipo ?? "receita",
    valor: p.valor ?? 0,
    forma: p.forma ?? "dinheiro",
    forma_pagamento: null,
    grupo: p.grupo ?? "consulta",
    condicao: "particular",
  }) as unknown as LinhaClassificada;

describe("saldoPorMeio", () => {
  it("separa a gaveta do banco", () => {
    const s = saldoPorMeio([
      l({ valor: 100, forma: "dinheiro" }),
      l({ valor: 200, forma: "pix" }),
      l({ valor: 50, forma: "credito" }),
      l({ tipo: "despesa", valor: 30, forma: "dinheiro" }),
      l({ tipo: "despesa", valor: 20, forma: "transferencia" }),
    ]);
    expect(s.especie).toEqual({ entradas: 100, saidas: 30, saldo: 70 });
    expect(s.banco).toEqual({ entradas: 250, saidas: 20, saldo: 230 });
    expect(s.outros.saldo).toBe(0);
  });

  it("manda convênio e sem informação para outros", () => {
    const s = saldoPorMeio([
      l({ valor: 0, forma: "convenio" }),
      l({ valor: 40, forma: "sem_informacao" }),
    ]);
    expect(s.outros.entradas).toBe(40);
    expect(s.banco.entradas).toBe(0);
  });

  it("a soma dos três meios é o saldo do caixa", () => {
    const s = saldoPorMeio([
      l({ valor: 10.1, forma: "dinheiro" }),
      l({ valor: 20.2, forma: "pix" }),
      l({ tipo: "despesa", valor: 5.05, forma: "dinheiro" }),
    ]);
    expect(s.especie.saldo + s.banco.saldo + s.outros.saldo).toBeCloseTo(25.25, 2);
  });
});
