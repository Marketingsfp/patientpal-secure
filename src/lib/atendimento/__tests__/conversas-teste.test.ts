import { describe, expect, it } from "bun:test";
import {
  conversaEhDeTeste,
  incluirTesteEfetivo,
  linhaDeTesteOculta,
  mesclarEsperaTeste,
  perfilPodeSimularAtendimento,
} from "../conversas-teste";
import { classificarEvento } from "../realtime-roteador";
import { normalizarMensagemRealtime } from "../mensagem-realtime";
import { patchListaPorConversa } from "../patch-inbox";
import { podeRevalidarChatEntreFiltros } from "../inbox-cache";

const ctxTela = { clinicaId: "cl-1", conversaAberta: "A" };

describe("modo treinamento — regras puras", () => {
  it("só o perfil autorizado com o controle ligado inclui teste", () => {
    expect(incluirTesteEfetivo(true, true)).toBe(true);
    expect(incluirTesteEfetivo(true, false)).toBe(false);
    expect(incluirTesteEfetivo(false, true)).toBe(false);
    expect(incluirTesteEfetivo(undefined, true)).toBe(false);
  });

  it("treinamento aceita Administração, Supervisão e Telefonia, sem aceitar outros perfis", () => {
    for (const perfil of ["admin", "supervisor", "telefonia"])
      expect(perfilPodeSimularAtendimento(perfil)).toBe(true);
    for (const perfil of ["medico", "recepcao", "financeiro", "gestor", "", null, undefined])
      expect(perfilPodeSimularAtendimento(perfil)).toBe(false);
  });

  it("linha de teste fica oculta sem o controle e aparece com ele", () => {
    expect(linhaDeTesteOculta({ is_teste: true }, undefined)).toBe(true);
    expect(linhaDeTesteOculta({ is_teste: true }, false)).toBe(true);
    expect(linhaDeTesteOculta({ is_teste: true }, true)).toBe(false);
    expect(linhaDeTesteOculta({ is_teste: false }, false)).toBe(false);
    expect(linhaDeTesteOculta(null, false)).toBe(false);
  });

  it("conversa de teste é bloqueada para resposta e para assumir", () => {
    expect(conversaEhDeTeste({ is_teste: true })).toBe(true);
    expect(conversaEhDeTeste({ is_teste: false })).toBe(false);
    expect(conversaEhDeTeste(null)).toBe(false);
  });

  it("espera: reais e teste se juntam só com o controle ligado", () => {
    const reais = { a: "2026-10-09T10:00:00Z" };
    const testes = { t: "2026-10-09T10:05:00Z" };
    expect(mesclarEsperaTeste(reais, testes, false)).toEqual(reais);
    expect(mesclarEsperaTeste(reais, testes, true)).toEqual({ ...reais, ...testes });
    expect(mesclarEsperaTeste(reais, null, true)).toEqual(reais);
  });
});

describe("modo treinamento — tempo real e lista", () => {
  const evConversaTeste = {
    table: "atend_conversas",
    eventType: "UPDATE" as const,
    new: { id: "T", clinica_id: "cl-1", is_teste: true, status: "waiting", owner_type: "NONE" },
  };

  it("desligado: evento de conversa de teste continua ignorado (comportamento atual)", () => {
    expect(classificarEvento(evConversaTeste, ctxTela)).toEqual([]);
    expect(classificarEvento(evConversaTeste, { ...ctxTela, incluirTeste: false })).toEqual([]);
  });

  it("ligado: evento de conversa de teste atualiza a lista", () => {
    expect(classificarEvento(evConversaTeste, { ...ctxTela, incluirTeste: true })).toContain(
      "lista",
    );
  });

  it("mensagem de teste na conversa aberta só vira bolha com o controle ligado", () => {
    const ev = {
      table: "whatsapp_mensagens",
      eventType: "INSERT" as const,
      new: {
        id: "m1",
        clinica_id: "cl-1",
        conversa_id: "A",
        is_teste: true,
        recebida_em: "2026-10-09T10:00:00Z",
        direction: "in",
        body: "oi",
      },
    };
    expect(normalizarMensagemRealtime(ev, ctxTela)).toEqual({
      usar: false,
      motivo: "homologacao",
    });
    expect(normalizarMensagemRealtime(ev, { ...ctxTela, incluirTeste: true }).usar).toBe(true);
  });

  it("patch da lista: conversa de teste só entra com o controle ligado", () => {
    const linha = {
      id: "T",
      clinica_id: "cl-1",
      is_teste: true,
      status: "waiting",
      owner_type: "NONE",
      atribuida_user_id: null,
    };
    const base = { escopo: "equipe" as const, userId: "u1", gestor: true };
    const semControle = patchListaPorConversa([], linha, base);
    expect(semControle.lista).toEqual([]);
    const comControle = patchListaPorConversa([], linha, { ...base, incluirTeste: true });
    expect(comControle.lista.map((c) => c.id)).toEqual(["T"]);
  });

  it("cache: a conversa de teste selecionada só é revalidada com o controle ligado", () => {
    const selecionada = { id: "T", clinica_id: "cl-1", is_teste: true };
    const ctx = { clinicaId: "cl-1", userId: "u1", escopo: "equipe" as const, gestor: true };
    expect(podeRevalidarChatEntreFiltros(selecionada, ctx)).toBe(false);
    expect(podeRevalidarChatEntreFiltros(selecionada, { ...ctx, incluirTeste: true })).toBe(true);
  });
});
