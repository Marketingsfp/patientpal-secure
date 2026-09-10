/**
 * FASE 4 — Realtime dos filtros compactos (Escopo × Visualização) e memória
 * do filtro. Só apresentação: RBAC segue no backend.
 */
import { describe, expect, it } from "bun:test";
import { patchListaPorConversa, patchListaPorMensagem } from "../patch-inbox";
import {
  lerFiltrosInbox,
  salvarFiltrosInbox,
  sanitizarFiltrosSalvos,
} from "../filtros-persistencia";

const JEAN = "11111111-1111-1111-1111-111111111111";
const MARIA = "22222222-2222-2222-2222-222222222222";

const base = (extra: Record<string, any> = {}) => ({
  id: "conv-x",
  status: "active",
  atribuida_user_id: JEAN,
  ultima_msg_em: "2026-09-09T10:00:00Z",
  ...extra,
});

const ctxGestor = {
  escopo: "equipe" as const,
  userId: "admin",
  gestor: true,
  atendenteId: JEAN,
  status: "all",
};

describe("FASE 4 — Realtime por eixo de visualização", () => {
  it("Exemplo 1: transferida PARA Jean entra na lista (Jean + Recentes)", () => {
    const r = patchListaPorConversa([], base(), { ...ctxGestor, visualizacao: "recentes" });
    expect(r.aplicado).toBe(true);
    expect(r.reconciliar).toBe(false);
    expect(r.lista.map((c) => c.id)).toEqual(["conv-x"]);
  });

  it("Exemplo 2: transferida de Jean para Maria sai da lista", () => {
    const r = patchListaPorConversa([base() as any], base({ atribuida_user_id: MARIA }), {
      ...ctxGestor,
      visualizacao: "recentes",
    });
    expect(r.lista).toHaveLength(0);
    expect(r.reconciliar).toBe(false);
  });

  it("Exemplo 3: resolvida entra em Resolvidas pelo responsável do encerramento", () => {
    const resolvida = base({
      status: "closed",
      atribuida_user_id: null,
      last_assigned_user_id: JEAN,
      resolved_at: "2026-09-09T11:00:00Z",
    });
    const emResolvidas = patchListaPorConversa([], resolvida, {
      ...ctxGestor,
      visualizacao: "resolvidas",
    });
    expect(emResolvidas.lista.map((c) => c.id)).toEqual(["conv-x"]);
    // e sai de Recentes no mesmo evento
    const emRecentes = patchListaPorConversa([base() as any], resolvida, {
      ...ctxGestor,
      visualizacao: "recentes",
    });
    expect(emRecentes.lista).toHaveLength(0);
  });

  it("Resolvidas de outra pessoa não entram no recorte de Jean", () => {
    const r = patchListaPorConversa(
      [],
      base({ status: "closed", atribuida_user_id: null, last_assigned_user_id: MARIA }),
      { ...ctxGestor, visualizacao: "resolvidas" },
    );
    expect(r.lista).toHaveLength(0);
  });

  it("Exemplo 4: Maior espera só mostra quem o paciente deixou aguardando", () => {
    const semEspera = patchListaPorConversa([], base(), {
      ...ctxGestor,
      visualizacao: "espera",
      espera: {},
    });
    expect(semEspera.lista).toHaveLength(0);

    const comEspera = patchListaPorConversa([], base(), {
      ...ctxGestor,
      visualizacao: "espera",
      espera: { "conv-x": "2026-09-09T09:00:00Z" },
    });
    expect(comEspera.lista.map((c) => c.id)).toEqual(["conv-x"]);
  });

  it("Maior espera ordena do mais antigo para o mais recente", () => {
    const lista = [
      { id: "a", ultima_msg_em: "2026-09-09T10:00:00Z" },
      { id: "b", ultima_msg_em: "2026-09-09T09:00:00Z" },
    ];
    const r = patchListaPorConversa(lista, { id: "c", status: "active", atribuida_user_id: JEAN }, {
      ...ctxGestor,
      visualizacao: "espera",
      espera: {
        a: "2026-09-09T08:00:00Z",
        b: "2026-09-09T07:00:00Z",
        c: "2026-09-09T06:00:00Z",
      },
    });
    expect(r.lista.map((c) => c.id)).toEqual(["c", "b", "a"]);
  });

  it("mensagem nova não força recarga completa em Resolvidas/Espera", () => {
    const r = patchListaPorMensagem(
      [],
      { conversa_id: "conv-x", created_at: "2026-09-09T12:00:00Z", direction: "in" },
      { conversaAberta: null, visualizacao: "resolvidas" },
    );
    expect(r.reconciliar).toBe(false);
  });

  it("mensagem nova de conversa fora da lista reconcilia em Recentes", () => {
    const r = patchListaPorMensagem(
      [],
      { conversa_id: "conv-x", created_at: "2026-09-09T12:00:00Z", direction: "in" },
      { conversaAberta: null, visualizacao: "recentes" },
    );
    expect(r.reconciliar).toBe(true);
  });
});

describe("FASE 4 — memória do filtro por clínica", () => {
  it("sem supervisão descarta atendente e escopo de equipe", () => {
    expect(
      sanitizarFiltrosSalvos(
        { base: "equipe", visualizacao: "espera", atendenteId: JEAN },
        { gestor: false },
      ),
    ).toEqual({ base: "minhas", visualizacao: "espera", atendenteId: null });
  });

  it("atendente que não pertence à equipe atual é descartado", () => {
    expect(
      sanitizarFiltrosSalvos(
        { base: "equipe", visualizacao: "recentes", atendenteId: JEAN },
        { gestor: true, usuariosIds: [MARIA] },
      ).atendenteId,
    ).toBeNull();
  });

  it("grava e restaura por clínica, sem atravessar clínicas", () => {
    const dados: Record<string, string> = {};
    const storage = {
      getItem: (k: string) => dados[k] ?? null,
      setItem: (k: string, v: string) => {
        dados[k] = v;
      },
    };
    salvarFiltrosInbox(storage as any, "clinica-a", {
      base: "equipe",
      visualizacao: "espera",
      atendenteId: JEAN,
    });
    expect(
      lerFiltrosInbox(storage as any, "clinica-a", { gestor: true, usuariosIds: [JEAN] }),
    ).toEqual({ base: "equipe", visualizacao: "espera", atendenteId: JEAN });
    expect(lerFiltrosInbox(storage as any, "clinica-b", { gestor: true })).toEqual({
      base: "minhas",
      visualizacao: "recentes",
      atendenteId: null,
    });
  });

  it("conteúdo corrompido volta ao padrão", () => {
    const storage = { getItem: () => "{{{", setItem: () => {} };
    expect(lerFiltrosInbox(storage as any, "clinica-a", { gestor: true })).toEqual({
      base: "minhas",
      visualizacao: "recentes",
      atendenteId: null,
    });
  });
});
