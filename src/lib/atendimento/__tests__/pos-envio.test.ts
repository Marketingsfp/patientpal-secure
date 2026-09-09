import { describe, expect, it } from "bun:test";
import { criarCacheConversas } from "../conversa-cache";
import {
  aplicarPreviaLocalEnvio,
  atualizarMensagemNoCache,
  criarContagemEnvio,
  transformarMensagensNoCache,
} from "../pos-envio";
import { criarMensagemOtimista, ehOtimista, inserirOtimista } from "../envio-otimista";

const agora = new Date("2026-09-09T12:00:00.000Z");

const conteudo = (msgs: any[]) => ({
  msgs,
  contato: { nome: "Fulano" },
  notas: [{ id: "n1" }],
  eventos: [{ id: "e1" }],
});

const oficial = (cmid: string) => ({
  id: `db-${cmid}`,
  conversa_id: "A",
  direction: "out",
  enviada_por: "humano",
  body: "Oi",
  status: "sent",
  client_message_id: cmid,
  recebida_em: "2026-09-09T12:00:02.000Z",
});

describe("FASE 3 — pós-envio incremental", () => {
  it("atualiza só a mensagem no cache, preservando contato, notas e eventos", () => {
    const cache = criarCacheConversas();
    const otim = criarMensagemOtimista({
      conversaId: "A",
      texto: "Oi",
      clientMessageId: "ABC",
      agora,
    });
    cache.guardar("A", conteudo(inserirOtimista([], otim)));
    expect(atualizarMensagemNoCache(cache, "A", oficial("ABC"))).toBe(true);
    const c = cache.obter("A")!;
    expect(c.msgs.length).toBe(1);
    expect(ehOtimista(c.msgs[0])).toBe(false);
    expect(c.contato).toEqual({ nome: "Fulano" });
    expect(c.notas.length).toBe(1);
    expect(c.eventos.length).toBe(1);
  });

  it("não cria cache para conversa que não estava guardada", () => {
    const cache = criarCacheConversas();
    expect(atualizarMensagemNoCache(cache, "Z", oficial("ABC"))).toBe(false);
    expect(cache.tamanho()).toBe(0);
  });

  it("transforma mensagens em cache sem tocar no resto", () => {
    const cache = criarCacheConversas();
    cache.guardar("A", conteudo([{ id: "1", status: "sending" }]));
    transformarMensagensNoCache(cache, "A", (msgs) =>
      msgs.map((m) => ({ ...m, status: "failed" })),
    );
    expect(cache.obter("A")!.msgs[0].status).toBe("failed");
    expect(cache.obter("A")!.notas.length).toBe(1);
  });

  it("mostra a prévia na lista e sobe a conversa para o topo", () => {
    const lista = [
      { id: "B", ultima_msg_preview: "b", ultima_msg_em: "2026-09-09T12:00:01.000Z" },
      { id: "A", ultima_msg_preview: "a", ultima_msg_em: "2026-09-09T11:00:00.000Z" },
    ];
    const nova = aplicarPreviaLocalEnvio(lista, {
      conversaId: "A",
      texto: "Oi",
      quando: "2026-09-09T12:00:05.000Z",
    });
    expect(nova[0].id).toBe("A");
    expect(nova[0].ultima_msg_preview).toBe("Oi");
  });

  it("não sobrescreve uma confirmação mais nova do servidor", () => {
    const lista = [{ id: "A", ultima_msg_preview: "servidor", ultima_msg_em: "2026-09-09T13:00:00.000Z" }];
    const nova = aplicarPreviaLocalEnvio(lista, {
      conversaId: "A",
      texto: "Oi",
      quando: "2026-09-09T12:00:05.000Z",
    });
    expect(nova[0].ultima_msg_preview).toBe("servidor");
    expect(nova).toBe(lista);
  });

  it("conversa fora da lista atual não é inserida", () => {
    const lista = [{ id: "B", ultima_msg_em: "2026-09-09T12:00:00.000Z" }];
    const nova = aplicarPreviaLocalEnvio(lista, {
      conversaId: "A",
      texto: "Oi",
      quando: "2026-09-09T12:00:05.000Z",
    });
    expect(nova.length).toBe(1);
    expect(nova).toBe(lista);
  });

  it("um envio simples usa 1 chamada e nenhuma busca extra", () => {
    const contagem = criarContagemEnvio();
    contagem.registrar("post");
    expect(contagem.total()).toEqual({ post: 1, get: 0 });
  });
});
