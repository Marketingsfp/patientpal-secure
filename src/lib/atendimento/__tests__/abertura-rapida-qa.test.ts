import { describe, it, expect } from "bun:test";
import { respostaAindaVale } from "../conversa-cache";
import { acaoPermitida } from "../rascunhos-conversa";

/**
 * FASE 2 — o chat precisa ficar utilizável assim que as mensagens recentes
 * chegam. Resumo da Nina, painel de contato e notas carregam depois, cada um
 * com seu próprio indicador, sem segurar a conversa.
 *
 * O simulador abaixo reproduz exatamente as regras aplicadas na tela:
 * duas trilhas independentes (crítica e secundária), ambas protegidas contra
 * respostas de conversas antigas.
 */
function criarTela() {
  let selecionada: string | null = null;
  let criticoId: string | null = null;
  let secundarioId: string | null = null;
  let resumoId: string | null = null;
  let msgs: string[] = [];
  let contato: string | null = null;
  let pedido = 0;
  let scrollNoFim = false;

  const vale = (alvo: string, p: number) =>
    respostaAindaVale({ alvo, selecionadaAgora: selecionada, pedido: p, pedidoAtual: pedido });

  return {
    get estado() {
      const chatPronto = !!selecionada && criticoId === selecionada;
      return {
        selecionada,
        chatPronto,
        skeletonPrincipal: !!selecionada && !chatPronto,
        msgs: chatPronto ? msgs : [],
        contatoCarregando: !!selecionada && secundarioId !== selecionada,
        contato: secundarioId === selecionada ? contato : null,
        resumoCarregando: !!selecionada && resumoId !== selecionada,
        composerHabilitado: chatPronto,
        scrollNoFim,
      };
    },
    selecionar(id: string) {
      selecionada = id;
      criticoId = null;
      secundarioId = null;
      resumoId = null;
      msgs = [];
      contato = null;
      scrollNoFim = false;
      return ++pedido;
    },
    mensagensChegaram(alvo: string, p: number, lista: string[]) {
      if (!vale(alvo, p)) return false;
      msgs = lista;
      criticoId = alvo;
      scrollNoFim = true; // o scroll vai ao fim junto com as mensagens
      return true;
    },
    contatoChegou(alvo: string, p: number, dados: string) {
      if (!vale(alvo, p)) return false;
      contato = dados;
      secundarioId = alvo;
      return true;
    },
    resumoChegou(alvo: string, p: number) {
      if (!vale(alvo, p)) return false;
      resumoId = alvo;
      return true;
    },
  };
}

describe("abertura da conversa — caminho crítico", () => {
  it("resumo lento: o chat aparece antes do resumo", () => {
    const t = criarTela();
    const p = t.selecionar("A");
    t.mensagensChegaram("A", p, ["oi"]);
    expect(t.estado.chatPronto).toBe(true);
    expect(t.estado.skeletonPrincipal).toBe(false);
    expect(t.estado.resumoCarregando).toBe(true);
    t.resumoChegou("A", p);
    expect(t.estado.resumoCarregando).toBe(false);
  });

  it("contato lento: o chat aparece antes e só o painel de contato fica carregando", () => {
    const t = criarTela();
    const p = t.selecionar("A");
    t.mensagensChegaram("A", p, ["oi"]);
    expect(t.estado.chatPronto).toBe(true);
    expect(t.estado.contatoCarregando).toBe(true);
    expect(t.estado.contato).toBeNull();
    t.contatoChegou("A", p, "Ana");
    expect(t.estado.contatoCarregando).toBe(false);
    expect(t.estado.contato).toBe("Ana");
  });

  it("mensagens carregadas: o esqueleto principal desaparece", () => {
    const t = criarTela();
    const p = t.selecionar("A");
    expect(t.estado.skeletonPrincipal).toBe(true);
    t.mensagensChegaram("A", p, ["oi"]);
    expect(t.estado.skeletonPrincipal).toBe(false);
  });

  it("a conversa abre já posicionada no fim, sem esperar resumo/contato", () => {
    const t = criarTela();
    const p = t.selecionar("A");
    t.mensagensChegaram("A", p, ["oi", "tudo bem?"]);
    expect(t.estado.scrollNoFim).toBe(true);
    expect(t.estado.contatoCarregando).toBe(true);
  });

  it("o campo de envio só é habilitado para a conversa correta", () => {
    const t = criarTela();
    const pA = t.selecionar("A");
    t.mensagensChegaram("A", pA, ["oi"]);
    expect(t.estado.composerHabilitado).toBe(true);
    expect(acaoPermitida({ alvo: "A", selecionadaAgora: "A", carregando: false })).toBe(true);

    t.selecionar("B");
    expect(t.estado.composerHabilitado).toBe(false);
    expect(acaoPermitida({ alvo: "A", selecionadaAgora: "B", carregando: true })).toBe(false);
  });

  it("privacidade preservada: dados atrasados de A não entram na tela de B", () => {
    const t = criarTela();
    const pA = t.selecionar("A");
    const pB = t.selecionar("B");
    expect(t.mensagensChegaram("A", pA, ["msg de A"])).toBe(false);
    expect(t.contatoChegou("A", pA, "contato de A")).toBe(false);
    expect(t.estado.msgs).toEqual([]);
    expect(t.estado.contato).toBeNull();
    expect(t.mensagensChegaram("B", pB, ["msg de B"])).toBe(true);
    expect(t.estado.msgs).toEqual(["msg de B"]);
  });

  it("contato atrasado da conversa anterior não aparece junto do chat novo", () => {
    const t = criarTela();
    const pA = t.selecionar("A");
    t.mensagensChegaram("A", pA, ["msg de A"]);
    const pB = t.selecionar("B");
    t.mensagensChegaram("B", pB, ["msg de B"]);
    expect(t.contatoChegou("A", pA, "contato de A")).toBe(false);
    expect(t.estado.contato).toBeNull();
    expect(t.estado.contatoCarregando).toBe(true);
  });
});
