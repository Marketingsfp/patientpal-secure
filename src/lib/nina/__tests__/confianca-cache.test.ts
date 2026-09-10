/**
 * FASE 11 — desempenho: garante lote único, cache entre conversas e
 * ausência de piscada (o que já está em cache continua visível).
 */
import { describe, expect, test } from "bun:test";
import {
  chaveCache,
  gravarLote,
  idsParaBuscar,
  LOTE_MAXIMO,
  mapaDoCache,
  TTL_CONFIANCA_MS,
  type CacheConfianca,
} from "@/lib/nina/confianca-cache";
import type { ConfiancaDaMensagem } from "@/lib/nina/confianca.functions";

const CLINICA = "c1";

function decisao(id: string, score = 94): ConfiancaDaMensagem {
  return {
    execucao_id: id,
    score,
    nivel: "HIGH",
    resultado: "ALLOW",
    bloqueadores: [],
    registrado_em: "2026-09-07T12:00:00.000Z",
    policy_version: "v1",
    erro_reportado: null,
    alta_confianca_com_erro: false,
    avaliacao: "answer_confidence",
    config_id: null,
  };
}

describe("FASE 11 — carga do selo de confiança", () => {
  test("50 mensagens geram UM lote, não 50 consultas", () => {
    const cache: CacheConfianca = new Map();
    const ids = Array.from({ length: 50 }, (_, i) => `e${i}`);
    const lote = idsParaBuscar(cache, CLINICA, ids, 1_000);
    expect(lote.length).toBe(50);
    expect(new Set(lote).size).toBe(50);
    expect(lote.length).toBeLessThanOrEqual(LOTE_MAXIMO);
  });

  test("execuções repetidas na conversa não são pedidas duas vezes", () => {
    const cache: CacheConfianca = new Map();
    const lote = idsParaBuscar(cache, CLINICA, ["e1", "e1", "e2", "", "e2"], 1_000);
    expect(lote).toEqual(["e1", "e2"]);
  });

  test("voltar para a mesma conversa não refaz consulta dentro do TTL", () => {
    const cache: CacheConfianca = new Map();
    gravarLote(cache, CLINICA, ["e1", "e2"], [decisao("e1"), decisao("e2")], 1_000);
    expect(idsParaBuscar(cache, CLINICA, ["e1", "e2"], 1_000 + TTL_CONFIANCA_MS - 1)).toEqual([]);
    // Só o que é novo entra no próximo lote.
    expect(idsParaBuscar(cache, CLINICA, ["e1", "e3"], 1_500)).toEqual(["e3"]);
  });

  test("execução sem snapshot fica marcada e não é reconsultada a cada rolagem", () => {
    const cache: CacheConfianca = new Map();
    gravarLote(cache, CLINICA, ["e1", "antiga"], [decisao("e1")], 1_000);
    expect(cache.get(chaveCache(CLINICA, "antiga"))?.valor).toBeNull();
    expect(idsParaBuscar(cache, CLINICA, ["antiga"], 1_200)).toEqual([]);
    // Continua "Não avaliada": não entra no mapa exibido, sem score inventado.
    expect(mapaDoCache(cache, CLINICA, ["antiga"])["antiga"]).toBeUndefined();
  });

  test("depois do TTL revalida em segundo plano (erro reportado pode ter surgido)", () => {
    const cache: CacheConfianca = new Map();
    gravarLote(cache, CLINICA, ["e1"], [decisao("e1")], 1_000);
    expect(idsParaBuscar(cache, CLINICA, ["e1"], 1_000 + TTL_CONFIANCA_MS)).toEqual(["e1"]);
    // Enquanto revalida, o valor antigo continua na tela — sem piscar.
    expect(mapaDoCache(cache, CLINICA, ["e1"])["e1"]?.score).toBe(94);
  });

  test("cache é por clínica: não vaza entre clínicas", () => {
    const cache: CacheConfianca = new Map();
    gravarLote(cache, CLINICA, ["e1"], [decisao("e1")], 1_000);
    expect(idsParaBuscar(cache, "c2", ["e1"], 1_100)).toEqual(["e1"]);
    expect(mapaDoCache(cache, "c2", ["e1"])["e1"]).toBeUndefined();
  });

  test("lote respeita o teto aceito pela função de servidor", () => {
    const cache: CacheConfianca = new Map();
    const ids = Array.from({ length: 400 }, (_, i) => `x${i}`);
    expect(idsParaBuscar(cache, CLINICA, ids, 1).length).toBe(LOTE_MAXIMO);
  });
});
