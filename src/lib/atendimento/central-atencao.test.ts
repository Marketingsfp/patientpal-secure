import { describe, expect, it } from "bun:test";
import { calcularAtencao, nivelAtencao, rotuloCentral } from "./central-atencao";

const AGORA = Date.parse("2026-09-05T12:00:00Z");
const haMin = (m: number) => new Date(AGORA - m * 60000).toISOString();

describe("Central de Atenção", () => {
  it("Caso 1 — sem pendências fica neutra", () => {
    const r = calcularAtencao({ naoAtribuidas: [], espera: {}, agora: AGORA });
    expect(r.total).toBe(0);
    expect(r.nivel).toBe(0);
  });

  it("Caso 2 — conversa não atribuída ativa o alerta", () => {
    const r = calcularAtencao({
      naoAtribuidas: [{ id: "a", contato_nome: "João Silva", handoff_motivo: "sem atendente online" }],
      espera: {},
      agora: AGORA,
    });
    expect(r.total).toBe(1);
    expect(r.naoAtribuidas).toBe(1);
    expect(r.nivel).toBe(1);
    expect(r.itens[0]?.nome).toBe("João Silva");
  });

  it("Caso 3 — 10 min sem resposta entra como espera crítica", () => {
    const r = calcularAtencao({ naoAtribuidas: [], espera: { b: haMin(10) }, agora: AGORA });
    expect(r.criticas).toBe(1);
    expect(r.total).toBe(1);
  });

  it("Caso 4 — clínica respondeu: some da espera", () => {
    const r = calcularAtencao({ naoAtribuidas: [], espera: {}, agora: AGORA });
    expect(r.criticas).toBe(0);
    expect(r.aguardando).toBe(0);
  });

  it("Caso 5 — assumida sai de Não atribuídas", () => {
    const r = calcularAtencao({ naoAtribuidas: [], espera: { c: haMin(2) }, agora: AGORA });
    expect(r.naoAtribuidas).toBe(0);
    expect(r.total).toBe(0);
  });

  it("Caso 6 — não atribuída + crítica conta uma vez só", () => {
    const r = calcularAtencao({
      naoAtribuidas: [{ id: "x", contato_nome: "Maria", handoff_motivo: "sem atendente online" }],
      espera: { x: haMin(17) },
      agora: AGORA,
    });
    expect(r.total).toBe(1);
    expect(r.naoAtribuidas).toBe(1);
    expect(r.criticas).toBe(1);
  });

  it("aguardando resposta inclui esperas não críticas, sem entrar no total", () => {
    const r = calcularAtencao({ naoAtribuidas: [], espera: { d: haMin(8) }, agora: AGORA });
    expect(r.aguardando).toBe(1);
    expect(r.criticas).toBe(0);
    expect(r.total).toBe(0);
    expect(r.itens[0]?.categoria).toBe("aguardando");
  });

  it("níveis progressivos", () => {
    expect(nivelAtencao(0)).toBe(0);
    expect(nivelAtencao(4)).toBe(1);
    expect(nivelAtencao(5)).toBe(2);
    expect(nivelAtencao(9)).toBe(2);
    expect(nivelAtencao(14)).toBe(3);
  });

  it("prioriza não atribuídas e maiores esperas na lista", () => {
    const r = calcularAtencao({
      naoAtribuidas: [{ id: "n", contato_nome: "Sem dono", handoff_motivo: "sem atendente online" }],
      espera: { k: haMin(20), j: haMin(6) },
      agora: AGORA,
    });
    expect(r.itens.map((i) => i.id)).toEqual(["n", "k", "j"]);
  });

  it("rótulo acessível descreve as categorias", () => {
    const r = calcularAtencao({
      naoAtribuidas: [
        { id: "a", handoff_motivo: "handoff" },
        { id: "b", handoff_motivo: "handoff" },
        { id: "c", handoff_motivo: "handoff" },
      ],
      espera: { d: haMin(30), e: haMin(40), f: haMin(50), g: haMin(60) },
      agora: AGORA,
    });
    expect(r.total).toBe(7);
    expect(rotuloCentral(r)).toBe(
      "Central de Atenção. 7 conversas precisam de atenção. 3 não atribuídas e 4 com tempo de espera crítico.",
    );
  });

  it("FASE 3 — sem handoff registrado não é 'Não atribuída'", () => {
    const r = calcularAtencao({
      naoAtribuidas: [{ id: "z", contato_nome: "Aberta manualmente" }],
      espera: {},
      agora: AGORA,
    });
    expect(r.naoAtribuidas).toBe(0);
    expect(r.total).toBe(0);
  });

  it("FASE 3 — lista por categoria dentro da própria Central", () => {
    const r = calcularAtencao({
      naoAtribuidas: [{ id: "n", contato_nome: "Sem dono", handoff_motivo: "handoff" }],
      espera: { k: haMin(20), j: haMin(6) },
      agora: AGORA,
      limiteItens: 200,
    });
    expect(itensDaCategoria(r.itens, "nao_atribuida").map((i) => i.id)).toEqual(["n"]);
    expect(itensDaCategoria(r.itens, "critica").map((i) => i.id)).toEqual(["k"]);
    expect(itensDaCategoria(r.itens, "aguardando").map((i) => i.id)).toEqual(["k", "j"]);
    expect(itensDaCategoria(r.itens, null).length).toBe(3);
  });
});
