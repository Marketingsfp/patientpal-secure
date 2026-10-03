import { describe, expect, it } from "bun:test";
import {
  aplicarAberturaConfirmada,
  conversaNovaParaAtendente,
  deveRegistrarPrimeiraAbertura,
  entradaAtendimento,
  EVENTO_INBOX_ABERTA,
  type ConversaNova,
} from "../conversa-nova";
import { mesclarListaConversas } from "../inbox-merge";
import { patchListaPorMensagem, patchListaPorConversa } from "../patch-inbox";
import { classificarEvento } from "../realtime-roteador";

const c: ConversaNova & { nao_lidas: number } = {
  id: "c1",
  atribuida_user_id: "ana",
  owner_type: "HUMAN",
  status: "waiting",
  inbox_entrada_em: "2026-10-03T10:00:00.123456+00:00",
  nao_lidas: 3,
};
const aberta = () =>
  aplicarAberturaConfirmada(c, { userId: "ana", entradaEm: entradaAtendimento(c)! });
const ctx = {
  userId: "ana",
  operacional: true,
  carregadaId: "c1",
  visivel: true,
  carregando: false,
};

describe("Novo significa primeira abertura da atribuição, não novas mensagens", () => {
  it("exibe para uma atribuição ainda não aberta, inclusive sem mensagens não lidas", () => {
    expect(conversaNovaParaAtendente(c)).toBe(true);
    const semNaoLidas = { ...c, nao_lidas: 0 };
    expect(conversaNovaParaAtendente(semNaoLidas)).toBe(true);
  });
  it("a primeira abertura remove Novo, preserva as não lidas e não modifica o original", () => {
    expect(conversaNovaParaAtendente(aberta())).toBe(false);
    expect(aberta().nao_lidas).toBe(3);
    expect(conversaNovaParaAtendente(c)).toBe(true);
  });
  it("nem mensagem do paciente nem resposta da atendente faz Novo voltar ou move o card", () => {
    const outra = { ...c, id: "c2", inbox_entrada_em: "2026-10-03T11:00:00Z" };
    let lista = [aberta(), outra];
    for (const direction of ["in", "out"]) {
      lista = patchListaPorMensagem(
        lista,
        {
          conversa_id: "c1",
          recebida_em: "2026-10-03T12:00:00Z",
          direction,
          body: "Outra mensagem",
        },
        { conversaAberta: null },
      ).lista as typeof lista;
      expect(lista.map((i) => i.id)).toEqual(["c1", "c2"]);
      expect(conversaNovaParaAtendente(lista[0]!)).toBe(false);
    }
  });
  it("não marca Nina, fila sem responsável, encerradas ou homologação", () => {
    for (const patch of [
      { owner_type: "AI" },
      { atribuida_user_id: null },
      { status: "closed" },
      { status: "finished" },
      { is_teste: true },
    ]) {
      expect(conversaNovaParaAtendente({ ...c, ...patch })).toBe(false);
    }
  });
  it("transferência fica nova para a destinatária, mesmo que já tenha aberto em outro ciclo", () => {
    const transferida = patchListaPorConversa(
      [aberta()],
      {
        ...c,
        atribuida_user_id: "bia",
        inbox_entrada_em: "2026-10-03T13:00:00Z",
      },
      { escopo: "equipe", userId: "gestor", gestor: true },
    ).lista[0]!;
    expect(conversaNovaParaAtendente(transferida)).toBe(true);
  });
  it("encerramento esconde o selo; uma nova atribuição após reabertura devolve Novo", () => {
    expect(conversaNovaParaAtendente({ ...aberta(), status: "closed" })).toBe(false);
    expect(
      conversaNovaParaAtendente({ ...aberta(), inbox_entrada_em: "2026-10-04T10:00:00Z" }),
    ).toBe(true);
  });
  it("uma resposta atrasada não remove Novo depois de transferir e retornar à mesma atendente", () => {
    const reatribuida = { ...c, inbox_entrada_em: "2026-10-03T10:00:00.123457Z" };
    expect(
      aplicarAberturaConfirmada(reatribuida, { userId: "ana", entradaEm: entradaAtendimento(c)! }),
    ).toBe(reatribuida);
    expect(conversaNovaParaAtendente(reatribuida)).toBe(true);
    expect(aplicarAberturaConfirmada(c, { userId: "bia", entradaEm: entradaAtendimento(c)! })).toBe(
      c,
    );
  });
  it("normaliza fuso preservando os microssegundos da atribuição", () => {
    expect(entradaAtendimento(c)).toBe("2026-10-03T10:00:00.123456Z");
    expect(entradaAtendimento({ ...c, inbox_entrada_em: "2026-10-03T07:00:00.123456-03:00" })).toBe(
      entradaAtendimento(c),
    );
    expect(entradaAtendimento({ ...c, inbox_entrada_em: "invalida" })).toBeNull();
  });
  it("só a responsável com o chat carregado e visível pode registrar a abertura", () => {
    expect(deveRegistrarPrimeiraAbertura(c, ctx)).toBe(true);
    for (const patch of [
      { userId: "supervisor" },
      { operacional: false },
      { visivel: false },
      { carregadaId: "c2" },
      { carregadaId: null },
      { carregando: true },
    ]) {
      expect(deveRegistrarPrimeiraAbertura(c, { ...ctx, ...patch })).toBe(false);
    }
    expect(deveRegistrarPrimeiraAbertura(aberta(), ctx)).toBe(false);
  });
  it("recarregar a lista preserva a abertura; o ciclo novo não herda o selo antigo", () => {
    const recarregada = mesclarListaConversas([c], [aberta()]);
    expect(conversaNovaParaAtendente(recarregada[0]!)).toBe(false);
    const nova = mesclarListaConversas(recarregada, [
      {
        ...c,
        inbox_entrada_em: "2026-10-04T10:00:00Z",
        inbox_aberta_user_id: "",
        inbox_aberta_entrada_em: "",
      },
    ]);
    expect(conversaNovaParaAtendente(nova[0]!)).toBe(true);
  });
  it("a abertura atualiza os cards da supervisão sem poluir o chat nem outra clínica", () => {
    const ev = {
      table: "atend_conversa_eventos",
      eventType: "INSERT",
      new: {
        clinica_id: "clinica",
        conversa_id: "c2",
        evento: EVENTO_INBOX_ABERTA,
      },
    };
    expect(classificarEvento(ev, { clinicaId: "clinica", conversaAberta: "c1" })).toEqual([
      "lista",
    ]);
    expect(classificarEvento(ev, { clinicaId: "outra", conversaAberta: "c1" })).toEqual([]);
  });
});
