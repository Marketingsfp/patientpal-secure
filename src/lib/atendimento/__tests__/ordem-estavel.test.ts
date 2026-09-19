import { describe, expect, it } from "bun:test";
import { ordenarInbox } from "../ordem-inbox";
import { mesclarListaConversas } from "../inbox-merge";
import { patchListaPorConversa, patchListaPorMensagem } from "../patch-inbox";
import { aplicarPreviaLocalEnvio } from "../pos-envio";
import { selecaoDeveSair } from "../inbox-cache";

const instante = (hora: number) => `2026-09-19T${hora}:00:00Z`;
const conversa = (id: string, entrada: number) => ({
  id,
  inbox_entrada_em: instante(entrada),
  ultima_msg_em: instante(entrada),
  clinica_id: "clinica",
  created_at: instante(10),
  status: "active",
  owner_type: "HUMAN",
  atribuida_user_id: "ana",
  fila_pendente: false,
  is_teste: false,
  ultima_msg_preview: "Oi",
  nao_lidas: 0,
});
const contexto = { clinicaId: "clinica", userId: "ana", gestor: false, escopo: "minhas" as const };
const lista = [conversa("b", 12), conversa("a", 11)];
const ids = (linhas: { id: string }[]) => linhas.map((c) => c.id);

describe("cards reais fixos durante o atendimento", () => {
  it("mensagens repetidas atualizam prévia/não lidas e mantêm o card e o chat", () => {
    let atual = [...lista];
    for (const hora of [13, 14, 15]) {
      atual = patchListaPorMensagem(
        atual,
        {
          conversa_id: "a",
          direction: "in",
          body: `Mensagem ${hora}`,
          recebida_em: instante(hora),
        },
        { conversaAberta: "b" },
      ).lista as typeof lista;
      expect(ids(atual)).toEqual(["b", "a"]);
      expect(
        selecaoDeveSair({ selecionada: lista[0], linhas: atual, buscando: false, ctx: contexto }),
      ).toBe(false);
    }
    expect(atual[1].ultima_msg_preview).toBe("Mensagem 15");
    expect(atual[1].nao_lidas).toBe(3);
    expect(atual[0]).toBe(lista[0]);
  });

  it("resposta humana e confirmação do banco não sobem o card", () => {
    const enviada = aplicarPreviaLocalEnvio(lista, {
      conversaId: "a",
      texto: "Bom dia",
      quando: instante(16),
    });
    const confirmada = patchListaPorConversa(
      enviada,
      {
        ...conversa("a", 11),
        ultima_msg_em: instante(16),
        ultima_msg_preview: "Bom dia",
        updated_at: instante(16),
        assigned_at: instante(16),
        nao_lidas: 0,
      },
      contexto,
    );
    expect(ids(enviada)).toEqual(["b", "a"]);
    expect(ids(confirmada.lista)).toEqual(["b", "a"]);
  });

  it("novo paciente atribuído entra no topo e empurra os anteriores mantendo a ordem", () => {
    const nova = patchListaPorConversa(lista, conversa("c", 13), contexto).lista;
    expect(ids(nova)).toEqual(["c", "b", "a"]);
    const mensagem = patchListaPorMensagem(
      nova,
      {
        conversa_id: "a",
        direction: "in",
        body: "Outra dúvida",
        recebida_em: instante(14),
      },
      { conversaAberta: "a" },
    ).lista;
    expect(ids(mensagem)).toEqual(["c", "b", "a"]);
  });

  it("reabertura registrada pelo banco volta ao topo, mesmo no mesmo id", () => {
    const reaberta = patchListaPorConversa(lista, conversa("a", 17), contexto).lista;
    expect(ids(reaberta)).toEqual(["a", "b"]);
    expect(ids(ordenarInbox(mesclarListaConversas([], reaberta)))).toEqual(["a", "b"]);
  });

  it("F5/reconexão e troca de filtro reproduzem a posição persistida", () => {
    const resposta = [{ ...lista[1], ultima_msg_em: instante(18), nao_lidas: 4 }, lista[0]];
    const servidorOrdenado = ordenarInbox(resposta);
    expect(ids(servidorOrdenado)).toEqual(["b", "a"]);
    expect(ids(mesclarListaConversas(lista, servidorOrdenado))).toEqual(["b", "a"]);
    expect(ids(mesclarListaConversas([], servidorOrdenado))).toEqual(["b", "a"]);
  });

  it("mantém Maior espera e Resolvidas com seus critérios específicos", () => {
    expect(ids(ordenarInbox(lista, "espera", { a: instante(10), b: instante(11) }))).toEqual([
      "a",
      "b",
    ]);
    expect(
      ids(
        ordenarInbox(
          [
            { ...lista[0], resolved_at: instante(16) },
            { ...lista[1], resolved_at: instante(17) },
          ],
          "resolvidas",
        ),
      ),
    ).toEqual(["a", "b"]);
  });

  it("empates e ausência do campo nunca usam a última mensagem", () => {
    const empatadas = [{ ...conversa("z", 10), ultima_msg_em: instante(19) }, conversa("a", 10)];
    expect(ids(ordenarInbox(empatadas))).toEqual(["a", "z"]);
    expect(
      ids(ordenarInbox(empatadas.map((c) => ({ ...c, inbox_entrada_em: undefined })))),
    ).toEqual(["a", "z"]);
    const prontas = ordenarInbox(lista);
    expect(ordenarInbox(prontas)).toBe(prontas);
  });
});
