import { describe, expect, test } from "bun:test";
import {
  CONTROLE_INICIAL,
  TEXTO_ESCOLHA_PENDENTE,
  aoCarregar,
  aoConfirmar,
  aoFalhar,
  aoIniciarGravacao,
  opcaoDesabilitada,
  opcaoSelecionada,
  precisaEscolher,
  recebeNovasConversas,
  textoSituacao,
} from "../controle-presenca";

describe("FASE 3 — controle manual de presença", () => {
  test("carregando: nada selecionado, nada clicável, e Online não é assumido", () => {
    expect(opcaoSelecionada(CONTROLE_INICIAL, "ONLINE")).toBe(false);
    expect(opcaoDesabilitada(CONTROLE_INICIAL)).toBe(true);
    expect(recebeNovasConversas(CONTROLE_INICIAL)).toBe(false);
    expect(textoSituacao(CONTROLE_INICIAL)).toContain("Carregando");
  });

  test("sem escolha registrada: pede a escolha, sem quarto estado selecionado", () => {
    const e = aoCarregar(CONTROLE_INICIAL, null);
    expect(precisaEscolher(e)).toBe(true);
    expect(textoSituacao(e)).toBe(TEXTO_ESCOLHA_PENDENTE);
    expect(opcaoSelecionada(e, "ONLINE")).toBe(false);
    expect(opcaoSelecionada(e, "OFFLINE")).toBe(false);
    expect(opcaoSelecionada(e, "PAUSA")).toBe(false);
    expect(recebeNovasConversas(e)).toBe(false);
  });

  test("recarregar a página recupera a escolha salva", () => {
    const e = aoCarregar(CONTROLE_INICIAL, "PAUSA");
    expect(opcaoSelecionada(e, "PAUSA")).toBe(true);
    expect(precisaEscolher(e)).toBe(false);
    expect(textoSituacao(e)).toBe("Você está Em pausa");
  });

  test("salvando: mostra que está salvando e não antecipa a mudança", () => {
    const salvo = aoCarregar(CONTROLE_INICIAL, "OFFLINE");
    const salvando = aoIniciarGravacao(salvo, "ONLINE");
    expect(salvando.salvando).toBe("ONLINE");
    expect(opcaoSelecionada(salvando, "ONLINE")).toBe(false);
    expect(opcaoSelecionada(salvando, "OFFLINE")).toBe(true);
    expect(opcaoDesabilitada(salvando)).toBe(true); // impede clique duplicado
    expect(textoSituacao(salvando)).toBe("Salvando Online…");
    expect(recebeNovasConversas(salvando)).toBe(false);
  });

  test("sucesso: só após confirmação o estado muda e o recebimento abre", () => {
    const e = aoConfirmar(aoIniciarGravacao(aoCarregar(CONTROLE_INICIAL, "OFFLINE"), "ONLINE"), "ONLINE");
    expect(opcaoSelecionada(e, "ONLINE")).toBe(true);
    expect(opcaoSelecionada(e, "OFFLINE")).toBe(false);
    expect(opcaoDesabilitada(e)).toBe(false);
    expect(e.erro).toBeNull();
    expect(recebeNovasConversas(e)).toBe(true);
    expect(textoSituacao(e)).toBe("Você está Online");
  });

  test("falha: preserva o último estado confirmado e mostra o erro", () => {
    const salvando = aoIniciarGravacao(aoCarregar(CONTROLE_INICIAL, "OFFLINE"), "ONLINE");
    const falhou = aoFalhar(salvando, "Sem conexão com o servidor");
    expect(opcaoSelecionada(falhou, "OFFLINE")).toBe(true);
    expect(opcaoSelecionada(falhou, "ONLINE")).toBe(false);
    expect(falhou.erro).toBe("Sem conexão com o servidor");
    expect(textoSituacao(falhou)).toBe("Sem conexão com o servidor");
    expect(recebeNovasConversas(falhou)).toBe(false);
  });

  test("falha permite nova tentativa explícita, que pode dar certo", () => {
    const falhou = aoFalhar(aoIniciarGravacao(aoCarregar(CONTROLE_INICIAL, "OFFLINE"), "ONLINE"), "erro");
    expect(opcaoDesabilitada(falhou)).toBe(false);
    const retry = aoConfirmar(aoIniciarGravacao(falhou, "ONLINE"), "ONLINE");
    expect(retry.erro).toBeNull();
    expect(opcaoSelecionada(retry, "ONLINE")).toBe(true);
  });

  test("mensagem de erro vazia vira texto legível", () => {
    expect(aoFalhar(CONTROLE_INICIAL, "").erro).toBe("Não foi possível salvar a presença.");
  });

  test("atividade/inatividade não existem: só carregar, salvar, confirmar e falhar mudam o estado", () => {
    const e = aoCarregar(CONTROLE_INICIAL, "ONLINE");
    // nenhuma outra função altera `confirmado`
    expect(aoIniciarGravacao(e, "OFFLINE").confirmado).toBe("ONLINE");
    expect(aoFalhar(e, "x").confirmado).toBe("ONLINE");
  });
});
