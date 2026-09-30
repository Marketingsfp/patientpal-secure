import { describe, expect, test } from "bun:test";
import {
  OPCOES_FILTRO_ATENDENTE,
  estadoFiltroAtendente,
  filtroAtendenteAtual,
  type FiltroAtendente,
} from "../filtros-atendente";
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
  { id: "aguardando", status: "waiting", owner_type: "HUMAN", atribuida_user_id: eu },
  { id: "global", status: "waiting", owner_type: "NONE", atribuida_user_id: null },
  { id: "outra-aguardando", status: "waiting", owner_type: "HUMAN", atribuida_user_id: outra },
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

describe("três filtros operacionais das atendentes: Ativas, Pendentes e Fechadas", () => {
  test("as opções são Ativas, Pendentes e Fechadas — sem Não atribuídas", () => {
    expect(OPCOES_FILTRO_ATENDENTE.map(o => o.rotulo)).toEqual(["Ativas", "Pendentes", "Fechadas"]);
  });

  test("Ativas e Pendentes partem das conversas da própria atendente; nunca de outra nem da fila global", () => {
    // Pendentes é "Minhas" com a ordem/recorte de espera: o corte fino vem da métrica canônica.
    const minhas = ["ativa", "aguardando"];
    expect(filtrarPorEscopo(linhas, contexto("ativas")).map(c => c.id)).toEqual(minhas);
    expect(filtrarPorEscopo(linhas, contexto("pendentes")).map(c => c.id)).toEqual(minhas);
    expect(filtrarPorEscopo(linhas, contexto("fechadas")).map(c => c.id)).toEqual(["fechada", "finalizada"]);
    for (const filtro of ["ativas", "pendentes", "fechadas"] as const)
      expect(filtrarPorEscopo(linhas, contexto(filtro)).map(c => c.id)).not.toContain("global");
  });

  test("Pendentes usa a visualização de maior espera; Ativas e Fechadas não", () => {
    expect(estadoFiltroAtendente("pendentes")).toEqual({
      base: "minhas", atendenteId: null, visualizacao: "espera", naoAtribuidas: false,
    });
    expect(estadoFiltroAtendente("ativas").visualizacao).toBe("recentes");
    expect(estadoFiltroAtendente("fechadas").visualizacao).toBe("resolvidas");
    for (const filtro of ["ativas", "pendentes", "fechadas"] as const)
      expect(estadoFiltroAtendente(filtro).naoAtribuidas).toBe(false);
  });

  test("o filtro aparece selecionado conforme a visualização guardada", () => {
    expect(filtroAtendenteAtual({ visualizacao: "espera" })).toBe("pendentes");
    expect(filtroAtendenteAtual({ visualizacao: "resolvidas" })).toBe("fechadas");
    expect(filtroAtendenteAtual({ visualizacao: "recentes" })).toBe("ativas");
  });

  test("trocar de Fechadas para Pendentes não deixa o estado fechado oculto", () => {
    const escolhido = filtroAtendenteAtual({ visualizacao: "espera" });
    expect(estadoFiltroAtendente(escolhido).visualizacao).toBe("espera");
    expect(filtrarPorEscopo(linhas, contexto(escolhido)).map(c => c.id)).toEqual(["ativa", "aguardando"]);
  });

  test("lembra Pendentes e isola a escolha por clínica", () => {
    const valores = new Map<string, string>();
    const storage = { getItem: (k: string) => valores.get(k) ?? null, setItem: (k: string, v: string) => valores.set(k, v) };
    salvarFiltrosInbox(storage, "clinica-a", estadoFiltroAtendente("pendentes"));
    expect(lerFiltrosInbox(storage, "clinica-a", { gestor: false }).visualizacao).toBe("espera");
    expect(lerFiltrosInbox(storage, "clinica-b", { gestor: false }).visualizacao).not.toBe("espera");
  });

  test("responder não tira a conversa de Ativas; encerramento move para Fechadas", () => {
    const aguardando = { id: "movimento", status: "waiting", owner_type: "HUMAN", atribuida_user_id: eu };
    const assumida = { ...aguardando, status: "active", owner_type: "HUMAN", atribuida_user_id: eu };
    expect(patchListaPorConversa([aguardando], assumida, contexto("ativas")).lista).toHaveLength(1);
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
