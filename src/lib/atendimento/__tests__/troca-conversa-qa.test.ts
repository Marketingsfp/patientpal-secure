import { describe, it, expect } from "bun:test";
import { criarCacheConversas, respostaAindaVale } from "../conversa-cache";
import {
  acaoPermitida,
  gravarRascunho,
  lerRascunho,
  limparRascunho,
} from "../rascunhos-conversa";
import { mesclarListaConversas, ordenarPorRecentes } from "../inbox-merge";

/**
 * QA da Fase 5: a troca entre pacientes é tratada como operação de
 * consistência e privacidade — conteúdo de um paciente jamais pode ser
 * exibido junto do outro.
 */

/** Simulador mínimo da tela central (mesmas regras do componente). */
function criarTela() {
  const cache = criarCacheConversas(10);
  let selecionada: string | null = null;
  let carregadaId: string | null = null;
  let conteudo: { msgs: string[]; contato: string; resumo: string } | null = null;
  let pedidoAtual = 0;
  return {
    get estado() {
      const visivel = selecionada && carregadaId === selecionada;
      return {
        selecionada,
        carregando: !!selecionada && !visivel,
        msgs: visivel ? conteudo?.msgs ?? [] : [],
        contato: visivel ? conteudo?.contato ?? null : null,
        resumo: visivel ? conteudo?.resumo ?? null : null,
      };
    },
    selecionar(id: string) {
      selecionada = id;
      const emCache = cache.obter(id);
      if (emCache) {
        conteudo = emCache as any;
        carregadaId = id;
      } else {
        conteudo = null;
        carregadaId = null;
      }
      return ++pedidoAtual;
    },
    responder(alvo: string, pedido: number, dados: { msgs: string[]; contato: string; resumo: string }) {
      if (!respostaAindaVale({ alvo, selecionadaAgora: selecionada, pedido, pedidoAtual })) {
        return false;
      }
      cache.guardar(alvo, { msgs: dados.msgs, contato: dados.contato, notas: [], eventos: [] } as any);
      (cache.obter(alvo) as any).resumo = dados.resumo;
      conteudo = dados;
      carregadaId = alvo;
      return true;
    },
  };
}

const dados = (id: string) => ({
  msgs: [`msg de ${id}`],
  contato: `contato de ${id}`,
  resumo: `resumo de ${id}`,
});

describe("troca entre conversas — consistência", () => {
  it("A → B: conteúdo de A some na hora e nunca aparece com o cabeçalho de B", () => {
    const tela = criarTela();
    const pA = tela.selecionar("A");
    tela.responder("A", pA, dados("A"));
    expect(tela.estado.msgs).toEqual(["msg de A"]);

    tela.selecionar("B");
    expect(tela.estado.msgs).toEqual([]);
    expect(tela.estado.contato).toBeNull();
    expect(tela.estado.resumo).toBeNull();
    expect(tela.estado.carregando).toBe(true);
  });

  it("A → B → C → D → E rapidamente: somente E termina renderizada", () => {
    const tela = criarTela();
    const pedidos: Record<string, number> = {};
    for (const id of ["A", "B", "C", "D", "E"]) pedidos[id] = tela.selecionar(id);
    // Respostas chegam fora de ordem, a de E por último.
    expect(tela.responder("C", pedidos["C"], dados("C"))).toBe(false);
    expect(tela.responder("A", pedidos["A"], dados("A"))).toBe(false);
    expect(tela.responder("D", pedidos["D"], dados("D"))).toBe(false);
    expect(tela.responder("E", pedidos["E"], dados("E"))).toBe(true);
    expect(tela.estado.selecionada).toBe("E");
    expect(tela.estado.msgs).toEqual(["msg de E"]);
    expect(tela.estado.contato).toBe("contato de E");
    expect(tela.estado.resumo).toBe("resumo de E");
  });

  it("mensagens chegando de A e B enquanto C está aberta não trocam a tela", () => {
    const tela = criarTela();
    const pA = tela.selecionar("A");
    tela.responder("A", pA, dados("A"));
    const pB = tela.selecionar("B");
    tela.responder("B", pB, dados("B"));
    const pC = tela.selecionar("C");
    tela.responder("C", pC, dados("C"));

    // Realtime dispara recargas de A e B (conversas que não estão abertas).
    expect(tela.responder("A", pA, { ...dados("A"), msgs: ["nova de A"] })).toBe(false);
    expect(tela.responder("B", pB, { ...dados("B"), msgs: ["nova de B"] })).toBe(false);
    expect(tela.estado.msgs).toEqual(["msg de C"]);
    expect(tela.estado.contato).toBe("contato de C");
  });

  it("A → B → A volta pelo cache do próprio A, nunca pelo de B", () => {
    const tela = criarTela();
    const pA = tela.selecionar("A");
    tela.responder("A", pA, dados("A"));
    const pB = tela.selecionar("B");
    tela.responder("B", pB, dados("B"));
    tela.selecionar("A");
    expect(tela.estado.carregando).toBe(false);
    expect(tela.estado.msgs).toEqual(["msg de A"]);
    expect(tela.estado.contato).toBe("contato de A");
  });

  it("privacidade: nenhum estado intermediário mistura contato e mensagens de pacientes diferentes", () => {
    const tela = criarTela();
    const pA = tela.selecionar("A");
    tela.responder("A", pA, dados("A"));
    const pB = tela.selecionar("B");
    const durante = tela.estado;
    expect(durante.msgs).toEqual([]);
    expect(durante.contato).toBeNull();
    tela.responder("B", pB, dados("B"));
    const depois = tela.estado;
    expect(depois.msgs.every((m) => m.includes("B"))).toBe(true);
    expect(depois.contato).toBe("contato de B");
  });
});

describe("ações durante o carregamento", () => {
  it("enviar/transferir/encerrar/agendar são recusados enquanto a conversa carrega", () => {
    expect(acaoPermitida({ alvo: "B", selecionadaAgora: "B", carregando: true })).toBe(false);
  });

  it("ação nunca é aplicada à conversa anterior", () => {
    expect(acaoPermitida({ alvo: "A", selecionadaAgora: "B", carregando: false })).toBe(false);
    expect(acaoPermitida({ alvo: "B", selecionadaAgora: "B", carregando: false })).toBe(true);
    expect(acaoPermitida({ alvo: null, selecionadaAgora: "B", carregando: false })).toBe(false);
  });
});

describe("rascunhos por conversa", () => {
  it("texto digitado em A não aparece em B", () => {
    let r = gravarRascunho({}, "A", "Bom dia, dona Maria");
    expect(lerRascunho(r, "A")).toBe("Bom dia, dona Maria");
    expect(lerRascunho(r, "B")).toBe("");
    r = gravarRascunho(r, "B", "Segue o horário");
    expect(lerRascunho(r, "A")).toBe("Bom dia, dona Maria");
    expect(lerRascunho(r, "B")).toBe("Segue o horário");
  });

  it("após enviar, o rascunho daquela conversa é limpo sem afetar as outras", () => {
    let r = gravarRascunho(gravarRascunho({}, "A", "oi"), "B", "olá");
    r = limparRascunho(r, "A");
    expect(lerRascunho(r, "A")).toBe("");
    expect(lerRascunho(r, "B")).toBe("olá");
  });
});

describe("lista de conversas durante a troca", () => {
  it("realtime atualiza a lista sem apagar dados do cartão", () => {
    const antes = [{ id: "A", nome: "Ana", ultima_mensagem: "oi", atualizada_em: "2026-01-01T10:00:00Z" }];
    const depois = [{ id: "A", ultima_mensagem: "tudo bem?", atualizada_em: "2026-01-01T10:05:00Z" }];
    const r = ordenarPorRecentes(mesclarListaConversas(antes as any, depois as any)) as any[];
    expect(r[0].nome).toBe("Ana");
    expect(r[0].ultima_mensagem).toBe("tudo bem?");
  });
});
