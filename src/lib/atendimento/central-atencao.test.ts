import { describe, expect, it } from "bun:test";
import { calcularAtencao, itensDaCategoria, nivelAtencao, rotuloCentral } from "./central-atencao";

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
      naoAtribuidas: [
        { id: "a", contato_nome: "João Silva", handoff_motivo: "sem atendente online" },
      ],
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
      naoAtribuidas: [
        { id: "n", contato_nome: "Sem dono", handoff_motivo: "sem atendente online" },
      ],
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

  it("conversa aberta sem responsável entra na global mesmo sem motivo de handoff", () => {
    const r = calcularAtencao({
      naoAtribuidas: [{ id: "z", contato_nome: "Aberta manualmente" }],
      espera: {},
      agora: AGORA,
    });
    expect(r.naoAtribuidas).toBe(1);
    expect(r.naoAtribuidasGlobal).toBe(1);
    expect(r.total).toBe(1);
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

  it("agrupa pendências por atendente, com 1 e 10 conversas, e separa a global", () => {
    const filas = [
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `a${i}`,
        atribuida_user_id: "ana",
        atendente_nome: "Ana",
        fila_pendente: true,
      })),
      { id: "b", atribuida_user_id: "bia", atendente_nome: "Bia", fila_pendente: true },
      { id: "global1" },
      { id: "global2" },
    ];
    const r = calcularAtencao({
      naoAtribuidas: filas,
      espera: { a0: haMin(30), global1: haMin(20) },
      agora: AGORA,
    });
    expect(r.filasIndividuais).toEqual([
      { atendenteId: "ana", nome: "Ana", total: 10 },
      { atendenteId: "bia", nome: "Bia", total: 1 },
    ]);
    expect(r.naoAtribuidasGlobal).toBe(2);
    expect(r.naoAtribuidas).toBe(13);
    expect(r.total).toBe(13); // críticas sobrepostas não duplicam o total
  });

  it("contagem usa IDs e não mistura duas atendentes de mesmo nome", () => {
    const a = { id: "c1", atribuida_user_id: "a", atendente_nome: "Maria", fila_pendente: true };
    const b = { id: "c2", atribuida_user_id: "b", atendente_nome: "Maria", fila_pendente: true };
    const r = calcularAtencao({ naoAtribuidas: [a, a, b], espera: {} });
    expect(r.filasIndividuais.map((f) => [f.atendenteId, f.total])).toEqual([
      ["a", 1],
      ["b", 1],
    ]);
    expect(r.total).toBe(2);
  });

  it("resposta ou encerramento tira da fila; Nina e conversas já ativas não entram", () => {
    const r = calcularAtencao({
      naoAtribuidas: [
        { id: "ativa", atribuida_user_id: "a", fila_pendente: false },
        { id: "fechada", status: "closed" },
        { id: "finalizada", status: "finished", fila_pendente: true },
        { id: "nina", owner_type: "AI" },
      ],
      espera: {},
    });
    expect(r.total).toBe(0);
    expect(r.filasIndividuais).toEqual([]);
    expect(r.naoAtribuidasGlobal).toBe(0);
  });

  it("clicar em uma atendente ou na global isola a lista daquela fila", () => {
    const r = calcularAtencao({
      naoAtribuidas: [
        { id: "a1", atribuida_user_id: "a", fila_pendente: true },
        { id: "b1", atribuida_user_id: "b", fila_pendente: true },
        { id: "g1" },
      ],
      espera: {},
    });
    expect(itensDaCategoria(r.itens, "nao_atribuida_individual", "a").map((i) => i.id)).toEqual([
      "a1",
    ]);
    expect(itensDaCategoria(r.itens, "nao_atribuida_global").map((i) => i.id)).toEqual(["g1"]);
  });

  it("total global pode superar 200 e independe do limite de detalhes exibidos", () => {
    const r = calcularAtencao({
      naoAtribuidas: Array.from({ length: 501 }, (_, i) => ({ id: String(i) })),
      espera: {},
      limiteItens: 8,
    });
    expect(r.naoAtribuidasGlobal).toBe(501);
    expect(r.total).toBe(501);
    expect(r.itens).toHaveLength(8);
  });

  it("perfil operacional acompanha o total global sem detalhes de outros pacientes", () => {
    const r = calcularAtencao({
      naoAtribuidas: [{ id: "propria", atribuida_user_id: "a", fila_pendente: true }],
      espera: {},
      globalSemDetalhes: 250,
    });
    expect(r.naoAtribuidasGlobal).toBe(250);
    expect(r.total).toBe(251);
    expect(r.itens).toHaveLength(1);
    expect(itensDaCategoria(r.itens, "nao_atribuida_global")).toEqual([]);
  });
});
