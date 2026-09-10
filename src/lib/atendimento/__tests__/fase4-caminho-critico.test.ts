import { describe, expect, it } from "bun:test";
import { classificarEvento } from "../realtime-roteador";
import { patchListaPorConversa, patchListaPorMensagem } from "../patch-inbox";

const lista = [
  {
    id: "A",
    ultima_msg_preview: "oi",
    ultima_msg_em: "2026-09-09T10:00:00.000Z",
    nao_lidas: 0,
    status: "active",
    atribuida_user_id: "u1",
    owner_type: "HUMAN",
    clinica_id: "cl-1",
  },
  {
    id: "B",
    ultima_msg_preview: "tudo bem",
    ultima_msg_em: "2026-09-09T11:00:00.000Z",
    nao_lidas: 1,
    status: "active",
    atribuida_user_id: "u1",
    owner_type: "HUMAN",
    clinica_id: "cl-1",
  },
];

describe("FASE 4 — Inbox fora do caminho crítico da mensagem", () => {
  it("mensagem nova ajusta só a linha da conversa, sem recarregar a lista", () => {
    const r = patchListaPorMensagem(
      lista,
      {
        conversa_id: "A",
        direction: "in",
        body: "chegou agora",
        created_at: "2026-09-09T12:00:00.000Z",
      },
      { conversaAberta: null },
    );
    expect(r.aplicado).toBe(true);
    expect(r.reconciliar).toBe(false);
    expect(r.lista[0]!.id).toBe("A");
    expect(r.lista[0]!.ultima_msg_preview).toBe("chegou agora");
    expect(r.lista[0]!.nao_lidas).toBe(1);
  });

  it("mensagem da conversa aberta não incrementa não lidas", () => {
    const r = patchListaPorMensagem(
      lista,
      {
        conversa_id: "A",
        direction: "in",
        body: "lida na hora",
        created_at: "2026-09-09T12:00:00.000Z",
      },
      { conversaAberta: "A" },
    );
    expect(r.lista[0]!.nao_lidas).toBe(0);
  });

  it("conversa fora da lista atual pede reconciliação em vez de palpite", () => {
    const r = patchListaPorMensagem(
      lista,
      { conversa_id: "Z", direction: "in", body: "novo lead", created_at: "2026-09-09T12:00:00.000Z" },
      { conversaAberta: null },
    );
    expect(r.aplicado).toBe(false);
    expect(r.reconciliar).toBe(true);
    expect(r.lista).toBe(lista);
  });

  it("troca de responsável dentro do mesmo filtro é ajustada localmente", () => {
    const r = patchListaPorConversa(
      lista,
      { ...lista[1], status: "waiting" },
      { escopo: "minhas", userId: "u1", gestor: false },
    );
    expect(r.aplicado).toBe(true);
    expect(r.lista.find((c) => c.id === "B")!["status"]).toBe("waiting");
  });

  // FASE 3 — sair do filtro passou a ser resolvido na própria tela.
  it("conversa que sai do filtro é removida sem recarregar a lista", () => {
    const r = patchListaPorConversa(
      lista,
      { ...lista[1], atribuida_user_id: "u2" },
      { escopo: "minhas", userId: "u1", gestor: false },
    );
    expect(r.aplicado).toBe(true);
    expect(r.reconciliar).toBe(false);
    expect(r.lista.some((c) => c.id === lista[1]!.id)).toBe(false);
  });

  it("mensagem comum não recalcula a fila de espera", () => {
    const alvos = classificarEvento(
      { table: "whatsapp_mensagens", eventType: "INSERT", new: { clinica_id: "cl-1", conversa_id: "B" } },
      { clinicaId: "cl-1", conversaAberta: "A" },
    );
    expect(alvos).not.toContain("espera");
  });

  it("mudança na conversa continua atualizando a espera", () => {
    const alvos = classificarEvento(
      { table: "atend_conversas", eventType: "UPDATE", new: { clinica_id: "cl-1", id: "B" } },
      { clinicaId: "cl-1", conversaAberta: "A" },
    );
    expect(alvos).toContain("espera");
  });
});
