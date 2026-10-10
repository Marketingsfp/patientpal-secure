import { describe, expect, it } from "bun:test";
import {
  abrirConversaSimulada,
  avancarSimulacao,
  conversasDaSimulacao,
  criarSimulacao,
  responderSimulacao,
  resolverSimulacao,
} from "../simulacao-atendimento";
import { conversaNovaParaAtendente } from "../conversa-nova";

const INICIO = Date.parse("2026-10-10T12:00:00Z");
describe("simulação isolada da Inbox", () => {
  it("primeiro card chega, os demais respeitam o intervalo e toda linha é fictícia", () => {
    let e = avancarSimulacao(criarSimulacao(), 250, INICIO + 250);
    expect(e.conversas).toHaveLength(1);
    e = avancarSimulacao(e, 2750, INICIO + 3000);
    expect(e.conversas).toHaveLength(2);
    expect(
      e.conversas.every(
        (c) =>
          c.is_teste && c.id.startsWith("simulada-") && c.contato_telefone === "Número fictício",
      ),
    ).toBe(true);
  });
  it("mensagem recebida atualiza prévia sem mudar a posição do card na fila", () => {
    const e = avancarSimulacao(criarSimulacao(), 10000, INICIO + 10000);
    expect(conversasDaSimulacao(e, "ativas").map((c) => c.id)).toEqual([
      "simulada-1",
      "simulada-2",
      "simulada-3",
      "simulada-4",
    ]);
    expect(e.conversas[0].mensagens).toHaveLength(2);
    expect(e.conversas[0].esperaDesde).toBe(e.conversas[0].created_at);
  });
  it("abrir tira não lidas e Novo sem tirar Pendentes; resposta tira Pendentes", () => {
    let e = avancarSimulacao(criarSimulacao(), 250, INICIO + 250);
    expect(conversaNovaParaAtendente({ ...e.conversas[0], is_teste: false })).toBe(true);
    e = abrirConversaSimulada(e, "simulada-1");
    expect(e.conversas[0].nao_lidas).toBe(0);
    expect(conversaNovaParaAtendente({ ...e.conversas[0], is_teste: false })).toBe(false);
    expect(conversasDaSimulacao(e, "pendentes")).toHaveLength(1);
    e = responderSimulacao(e, "simulada-1", "Bom dia! Como posso ajudar?", INICIO + 1000);
    expect(conversasDaSimulacao(e, "pendentes")).toHaveLength(0);
    expect(conversasDaSimulacao(e, "ativas")).toHaveLength(1);
    expect(e.conversas[0].mensagens.at(-1)?.direction).toBe("out");
  });
  it("novo contato do paciente recoloca em Pendentes, sem reativar selo Novo", () => {
    let e = avancarSimulacao(criarSimulacao(1), 250, INICIO + 250);
    e = abrirConversaSimulada(e, "simulada-1");
    e = responderSimulacao(e, "simulada-1", "Bom dia", INICIO + 1000);
    e = avancarSimulacao(e, 8750, INICIO + 9000);
    expect(conversasDaSimulacao(e, "pendentes")).toHaveLength(1);
    expect(e.conversas[0].esperaDesde).toBe(new Date(INICIO + 9000).toISOString());
    expect(conversaNovaParaAtendente({ ...e.conversas[0], is_teste: false })).toBe(false);
  });
  it("resolver remove das abertas e mensagens posteriores não reabrem a conversa", () => {
    let e = avancarSimulacao(criarSimulacao(1), 250, INICIO + 250);
    e = resolverSimulacao(e, "simulada-1", INICIO + 1000);
    e = avancarSimulacao(e, 20000, INICIO + 20250);
    expect(conversasDaSimulacao(e, "ativas")).toHaveLength(0);
    expect(conversasDaSimulacao(e, "fechadas")).toHaveLength(1);
    expect(e.conversas[0].mensagens).toHaveLength(1);
    expect(
      responderSimulacao(e, "simulada-1", "Olá", INICIO + 30000).conversas[0].mensagens,
    ).toHaveLength(1);
  });
  it("pausar execução não consome chegadas; fora de Online não atribui novos cards", () => {
    const inicial = criarSimulacao();
    expect(avancarSimulacao({ ...inicial, executando: false }, 10000, INICIO)).toEqual({
      ...inicial,
      executando: false,
    });
    for (const presenca of ["PAUSA", "PAUSA_SAIDA", "OFFLINE"] as const) {
      const e = avancarSimulacao({ ...inicial, presenca }, 10000, INICIO + 10000);
      expect(e.conversas).toHaveLength(0);
      expect(e.chegadas).toHaveLength(inicial.chegadas.length);
    }
  });
  it("em pausa mantém as mensagens das atribuídas; Offline bloqueia resposta e resolução", () => {
    let e = avancarSimulacao(criarSimulacao(), 250, INICIO + 250);
    e = avancarSimulacao({ ...e, presenca: "PAUSA" }, 10000, INICIO + 10250);
    expect(e.conversas).toHaveLength(1);
    expect(e.conversas[0].mensagens).toHaveLength(2);
    e = { ...e, presenca: "OFFLINE" };
    expect(responderSimulacao(e, "simulada-1", "Olá", INICIO)).toBe(e);
    expect(resolverSimulacao(e, "simulada-1", INICIO)).toBe(e);
  });
  it("conclui o ciclo com no máximo 24 cards; reinício cria estado vazio", () => {
    const e = avancarSimulacao(criarSimulacao(100), 100000, INICIO + 100000);
    expect(e.conversas).toHaveLength(24);
    expect(e.executando).toBe(false);
    expect(e.chegadas).toHaveLength(0);
    expect(criarSimulacao().conversas).toEqual([]);
  });
});
