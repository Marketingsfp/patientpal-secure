import { describe, expect, test } from "bun:test";
import { estadoFiltroAtendente, filtroAtendenteAtual, type FiltroAtendente } from "../filtros-atendente";
import { atendenteConsulta, escopoConsulta } from "../filtros-inbox";
import { filtrarPorEscopo } from "../inbox-cache";
import { usuarioPodeVerConversa, type ConversaEscopo } from "../escopo-inbox";
import { patchListaPorConversa } from "../patch-inbox";
import { lerFiltrosInbox, salvarFiltrosInbox } from "../filtros-persistencia";
import { assertAcessoConversa } from "../acesso-conversa.server";
import { escopoParaConversa } from "../deep-link";

const eu = "atendente-a";
const outra = "atendente-b";
const linhas = [
  { id: "ativa", status: "active", owner_type: "HUMAN", atribuida_user_id: eu },
  { id: "outra-ativa", status: "active", owner_type: "HUMAN", atribuida_user_id: outra },
  { id: "fila", status: "waiting", owner_type: "NONE", atribuida_user_id: null },
  { id: "nina", status: "bot_attending", owner_type: "AI", atribuida_user_id: null },
  { id: "fechada", status: "closed", owner_type: "NONE", atribuida_user_id: null, last_assigned_user_id: eu, resolved_by: eu },
  { id: "finalizada", status: "finished", owner_type: "NONE", atribuida_user_id: null, resolved_by: eu },
  { id: "outra-fechada", status: "closed", owner_type: "NONE", atribuida_user_id: null, last_assigned_user_id: outra, resolved_by: outra },
];
const contexto = (filtro: FiltroAtendente) => {
  const estado = { ...estadoFiltroAtendente(filtro), gestor: false, meuId: eu };
  return {
    escopo: escopoConsulta(estado), userId: eu, gestor: false,
    atendenteId: atendenteConsulta(estado), visualizacao: estado.visualizacao,
  };
};

describe("três filtros operacionais das atendentes", () => {
  test("cada opção traz somente seu conjunto, sem conversas de outra atendente", () => {
    expect(filtrarPorEscopo(linhas, contexto("ativas")).map(c => c.id)).toEqual(["ativa"]);
    expect(filtrarPorEscopo(linhas, contexto("nao_atribuidas")).map(c => c.id)).toEqual(["fila"]);
    expect(filtrarPorEscopo(linhas, contexto("fechadas")).map(c => c.id)).toEqual(["fechada", "finalizada"]);
  });

  test("entrar na fila depois de Fechadas não deixa o estado fechado oculto", () => {
    const escolhido = filtroAtendenteAtual({ visualizacao: "resolvidas", naoAtribuidas: true });
    expect(estadoFiltroAtendente(escolhido).visualizacao).toBe("recentes");
    expect(filtrarPorEscopo(linhas, contexto(escolhido)).map(c => c.id)).toEqual(["fila"]);
  });

  test("preferências antigas da Nina ou de maior espera não restringem Ativas", () => {
    const antigo = { base: "nina" as const, visualizacao: "espera" as const, naoAtribuidas: false };
    expect(estadoFiltroAtendente(filtroAtendenteAtual(antigo))).toEqual({
      base: "minhas", atendenteId: null, visualizacao: "recentes", naoAtribuidas: false,
    });
  });

  test("lembra Não atribuídas e isola a escolha por clínica", () => {
    const valores = new Map<string, string>();
    const storage = { getItem: (k: string) => valores.get(k) ?? null, setItem: (k: string, v: string) => valores.set(k, v) };
    salvarFiltrosInbox(storage, "clinica-a", estadoFiltroAtendente("nao_atribuidas"));
    const salvo = lerFiltrosInbox(storage, "clinica-a", { gestor: false });
    expect(salvo.naoAtribuidas).toBe(true);
    expect(lerFiltrosInbox(storage, "clinica-b", { gestor: false }).naoAtribuidas).not.toBe(true);
  });

  test("atribuição tira da fila e coloca em Ativas; encerramento move para Fechadas", () => {
    const fila = { id: "movimento", status: "waiting", owner_type: "NONE", atribuida_user_id: null };
    const assumida = { ...fila, status: "active", owner_type: "HUMAN", atribuida_user_id: eu };
    expect(patchListaPorConversa([fila], assumida, contexto("nao_atribuidas")).lista).toHaveLength(0);
    expect(patchListaPorConversa([], assumida, contexto("ativas")).lista).toHaveLength(1);
    const fechada = { ...assumida, status: "closed", atribuida_user_id: null, last_assigned_user_id: eu, resolved_by: eu };
    expect(patchListaPorConversa([assumida], fechada, contexto("ativas")).lista).toHaveLength(0);
    expect(patchListaPorConversa([], fechada, contexto("fechadas")).lista).toHaveLength(1);
    const reaberta = { ...fechada, status: "bot_attending", owner_type: "AI" };
    expect(patchListaPorConversa([fechada], reaberta, contexto("fechadas")).lista).toHaveLength(0);
  });

  test("histórico de outra atendente não passa por acesso, cache, link ou tempo real", () => {
    const outraFechada = linhas.find(c => c.id === "outra-fechada")!;
    expect(usuarioPodeVerConversa(outraFechada, { userId: eu, gestor: false })).toBe(false);
    expect(patchListaPorConversa([], outraFechada, contexto("fechadas")).lista).toHaveLength(0);
    expect(escopoParaConversa(outraFechada, { escopoAtual: "minhas", userId: eu, gestor: false })).toBeNull();
  });

  test("vínculo antigo só vale quando não há responsável registrado no encerramento", () => {
    const legado: ConversaEscopo = { status: "closed", atribuida_user_id: eu };
    expect(usuarioPodeVerConversa(legado, { userId: eu, gestor: false })).toBe(true);
    expect(usuarioPodeVerConversa({ ...legado, last_assigned_user_id: outra, resolved_by: outra }, { userId: eu, gestor: false })).toBe(false);
  });

  test("abertura no servidor carrega o vínculo histórico mesmo após limpar a atribuição", async () => {
    const fechada = linhas.find(c => c.id === "fechada")!;
    let selecionadas: string[] = [];
    const query = {
      select: (campos: string) => { selecionadas = campos.split(",").map(c => c.trim()); return query; },
      eq: () => query,
      maybeSingle: async () => ({ data: Object.fromEntries(selecionadas.map(c => [c, (fechada as Record<string, unknown>)[c]])), error: null }),
    };
    const db = { from: () => query, rpc: async () => ({ data: false }) };
    const resultado = await assertAcessoConversa(db as any, eu, "clinica-a", fechada.id);
    expect(resultado.id).toBe("fechada");
    await expect(assertAcessoConversa(db as any, outra, "clinica-a", fechada.id)).rejects.toThrow("permissão");
  });
});
