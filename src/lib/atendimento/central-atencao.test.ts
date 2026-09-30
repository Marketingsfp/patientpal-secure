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

  it("Caso 2 — não atribuída sem espera crítica mantém a Central neutra", () => {
    const r = calcularAtencao({
      naoAtribuidas: [
        { id: "a", contato_nome: "João Silva", handoff_motivo: "sem atendente online" },
      ],
      espera: {},
      agora: AGORA,
    });
    expect(r.total).toBe(0);
    expect(r.naoAtribuidas).toBe(1);
    expect(r.nivel).toBe(0);
    expect(r.itens[0]?.nome).toBe("João Silva");
    expect(itensDaCategoria(r.itens, null)).toEqual([]);
  });

  it("Caso 3 — só depois de 10 minutos a espera passa a crítica, sem nova mensagem", () => {
    const r = calcularAtencao({ naoAtribuidas: [], espera: { b: haMin(10) }, agora: AGORA });
    expect(r.aguardando).toBe(1);
    expect(r.criticas).toBe(0);
    expect(r.total).toBe(0);
    expect(itensDaCategoria(r.itens, null)).toEqual([]);

    const depois = calcularAtencao({
      naoAtribuidas: [],
      espera: { b: haMin(10) },
      agora: AGORA + 1,
    });
    expect(depois.aguardando).toBe(0);
    expect(depois.criticas).toBe(1);
    expect(depois.total).toBe(1);
    expect(depois.nivel).toBe(1);
    expect(itensDaCategoria(depois.itens, "aguardando")).toEqual([]);
    expect(itensDaCategoria(depois.itens, null).map((i) => i.id)).toEqual(["b"]);
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
    expect(itensDaCategoria(r.itens, null)).toEqual([]);
  });

  it("níveis progressivos", () => {
    expect(nivelAtencao(0)).toBe(0);
    expect(nivelAtencao(4)).toBe(1);
    expect(nivelAtencao(5)).toBe(2);
    expect(nivelAtencao(9)).toBe(2);
    expect(nivelAtencao(14)).toBe(3);
  });

  it("prioriza maiores esperas críticas antes de filas não críticas", () => {
    const r = calcularAtencao({
      naoAtribuidas: [
        { id: "n", contato_nome: "Sem dono", handoff_motivo: "sem atendente online" },
      ],
      espera: { k: haMin(20), j: haMin(6), l: haMin(30) },
      agora: AGORA,
    });
    expect(r.itens.map((i) => i.id)).toEqual(["l", "k", "n", "j"]);
    expect(itensDaCategoria(r.itens, null).map((i) => i.id)).toEqual(["l", "k"]);
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
    expect(r.total).toBe(4);
    expect(rotuloCentral(r)).toBe(
      "Central de Atenção. 4 conversas precisam de atenção por aguardar resposta há mais de 10 minutos.",
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
    expect(r.aguardando).toBe(1);
    expect(itensDaCategoria(r.itens, "aguardando").map((i) => i.id)).toEqual(["j"]);
    expect(itensDaCategoria(r.itens, null).map((i) => i.id)).toEqual(["k"]);
  });

  it("só a fila global (sem responsável) conta como não atribuída; conversas com dono não", () => {
    const filas = [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, atribuida_user_id: "ana", atendente_nome: "Ana" })),
      { id: "b", atribuida_user_id: "bia", atendente_nome: "Bia" },
      { id: "global1" },
      { id: "global2" },
    ];
    const r = calcularAtencao({
      naoAtribuidas: filas,
      espera: { a0: haMin(30), global1: haMin(20) },
      agora: AGORA,
    });
    expect(r.naoAtribuidasGlobal).toBe(2);
    expect(r.naoAtribuidas).toBe(2);
    expect(r.total).toBe(2); // as duas esperas críticas, mesmo a de conversa que já tem dono
  });

  it("resposta ou encerramento tira da fila; Nina e conversas já ativas não entram", () => {
    const r = calcularAtencao({
      naoAtribuidas: [
        { id: "ativa", atribuida_user_id: "a" },
        { id: "fechada", status: "closed" },
        { id: "finalizada", status: "finished" },
        { id: "nina", owner_type: "AI" },
      ],
      espera: {},
    });
    expect(r.total).toBe(0);
    expect(r.naoAtribuidasGlobal).toBe(0);
  });

  it("clicar na global isola a lista da fila sem responsável", () => {
    const r = calcularAtencao({
      naoAtribuidas: [{ id: "a1", atribuida_user_id: "a" }, { id: "g1" }],
      espera: {},
    });
    expect(itensDaCategoria(r.itens, "nao_atribuida_global").map((i) => i.id)).toEqual(["g1"]);
  });

  it("total global pode superar 200 e independe do limite de detalhes exibidos", () => {
    const r = calcularAtencao({
      naoAtribuidas: Array.from({ length: 501 }, (_, i) => ({ id: String(i) })),
      espera: {},
      limiteItens: 8,
    });
    expect(r.naoAtribuidasGlobal).toBe(501);
    expect(r.total).toBe(0);
    expect(r.nivel).toBe(0);
    expect(r.itens).toHaveLength(8);
  });

  it("perfil operacional acompanha o total global sem detalhes de outros pacientes", () => {
    const r = calcularAtencao({
      naoAtribuidas: [{ id: "propria", atribuida_user_id: "a" }],
      espera: {},
      globalSemDetalhes: 250,
    });
    expect(r.naoAtribuidasGlobal).toBe(250);
    expect(r.total).toBe(0);
    expect(r.itens).toHaveLength(0);
    expect(itensDaCategoria(r.itens, "nao_atribuida_global")).toEqual([]);
  });

  it("não atribuídas recentes só viram prioridade quando ultrapassam dez minutos", () => {
    const entrada = {
      naoAtribuidas: [
        { id: "global" },
        { id: "individual", atribuida_user_id: "ana" },
      ],
      espera: { global: haMin(9), individual: haMin(2) },
    };
    const antes = calcularAtencao({ ...entrada, agora: AGORA });
    expect(antes.aguardando).toBe(2);
    expect(antes.total).toBe(0);
    expect(antes.nivel).toBe(0);
    expect(itensDaCategoria(antes.itens, null)).toEqual([]);

    const depois = calcularAtencao({ ...entrada, agora: AGORA + 60_001 });
    expect(depois.total).toBe(1);
    expect(depois.aguardando).toBe(1);
    expect(depois.naoAtribuidas).toBe(1);
    expect(itensDaCategoria(depois.itens, null).map((i) => [i.id, i.categoria])).toEqual([
      ["global", "critica"],
    ]);
    expect(itensDaCategoria(depois.itens, "aguardando").map((i) => i.id)).toEqual(["individual"]);

    const respondida = calcularAtencao({
      ...entrada,
      espera: { individual: entrada.espera.individual },
      agora: AGORA + 60_001,
    });
    expect(respondida.total).toBe(0);
    expect(respondida.nivel).toBe(0);
    expect(itensDaCategoria(respondida.itens, null)).toEqual([]);
  });

  it("timestamps ausentes ou inválidos não entram nas esperas", () => {
    const r = calcularAtencao({
      naoAtribuidas: [],
      espera: { vazio: "", invalido: "sem-data" },
      agora: AGORA,
    });
    expect(r.total).toBe(0);
    expect(r.aguardando).toBe(0);
    expect(r.itens).toEqual([]);
  });

  it("o limite de detalhes não esconde críticas atrás de não atribuídas", () => {
    const r = calcularAtencao({
      naoAtribuidas: Array.from({ length: 20 }, (_, i) => ({ id: `n${i}` })),
      espera: { critica: haMin(15), recente: haMin(1) },
      agora: AGORA,
      limiteItens: 1,
    });
    expect(r.total).toBe(1);
    expect(itensDaCategoria(r.itens, null).map((i) => i.id)).toEqual(["critica"]);
  });
});
