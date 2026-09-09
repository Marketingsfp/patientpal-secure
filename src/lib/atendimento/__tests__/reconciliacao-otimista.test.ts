import { describe, expect, it } from "bun:test";
import {
  chaveLogica,
  conciliarOtimistas,
  criarMensagemOtimista,
  ehOtimista,
  inserirOtimista,
  marcarFalhaOtimista,
  mesclarOficial,
} from "../envio-otimista";
import { mesclarNovas } from "../atualizacao-incremental";

const agora = new Date("2026-09-09T12:00:00.000Z");

const otim = (texto: string, cmid: string) =>
  criarMensagemOtimista({
    conversaId: "A",
    texto,
    usuarioId: "u1",
    clientMessageId: cmid,
    agora,
  });

const oficial = (texto: string, cmid: string | null, id = `db-${cmid ?? texto}`) => ({
  id,
  conversa_id: "A",
  direction: "out",
  enviada_por: "humano",
  body: texto,
  status: "sent",
  wa_message_id: `wamid.${id}`,
  client_message_id: cmid,
  recebida_em: "2026-09-09T12:00:02.000Z",
});

describe("FASE 2 — reconciliação por client_message_id", () => {
  it("A) otimista ABC + Realtime ABC = uma bolha", () => {
    const lista = mesclarNovas(inserirOtimista([], otim("Oi", "ABC")), [oficial("Oi", "ABC")]);
    expect(lista.length).toBe(1);
    expect(lista[0].id).toBe("db-ABC");
    expect(lista[0].status).toBe("sent");
    expect(ehOtimista(lista[0])).toBe(false);
  });

  it("B) resposta HTTP ABC + Realtime ABC = uma bolha", () => {
    const comHttp = mesclarOficial(inserirOtimista([], otim("Oi", "ABC")), oficial("Oi", "ABC"));
    const comRealtime = mesclarNovas(comHttp, [oficial("Oi", "ABC")]);
    expect(comRealtime.length).toBe(1);
    expect(comRealtime[0].wa_message_id).toBe("wamid.db-ABC");
  });

  it("C) mesmo texto com identificadores diferentes = duas mensagens", () => {
    const lista = mesclarNovas([], [oficial("Oi", "ABC", "db-1"), oficial("Oi", "XYZ", "db-2")]);
    expect(lista.length).toBe(2);
  });

  it("D) mesmo clientMessageId reenviado não duplica", () => {
    const base = mesclarNovas([], [oficial("Oi", "ABC")]);
    const repetido = mesclarNovas(base, [oficial("Oi", "ABC")]);
    expect(repetido.length).toBe(1);
  });

  it("E) erro do backend mantém a bolha com estado de falha e o texto", () => {
    const m = otim("Oi", "ABC");
    const lista = marcarFalhaOtimista(inserirOtimista([], m), "ABC");
    expect(lista.length).toBe(1);
    expect(lista[0].status).toBe("failed");
    expect(lista[0].body).toBe("Oi");
  });

  it("a bolha muda de estado sem sumir e reaparecer", () => {
    const lista = mesclarOficial(inserirOtimista([], otim("Oi", "ABC")), oficial("Oi", "ABC"));
    expect(lista.length).toBe(1);
    expect(lista[0].client_message_id).toBe("ABC");
    expect(lista[0].optimistic).toBe(false);
  });

  it("mensagens antigas (sem identificador) continuam pelo id", () => {
    const antiga = { id: "velha", body: "Bom dia", recebida_em: "2026-09-01T10:00:00.000Z" };
    expect(chaveLogica(antiga)).toBe("id:velha");
    expect(mesclarNovas([antiga], [antiga]).length).toBe(1);
  });

  it("conciliação prioriza o identificador e não o texto", () => {
    const m = otim("Oi", "ABC");
    // Outra mensagem humana com o MESMO texto, mas de outro envio: a otimista
    // continua na tela até chegar a dela.
    const lista = conciliarOtimistas([...inserirOtimista([], m), oficial("Oi", "XYZ")]);
    expect(lista.filter(ehOtimista).length).toBe(1);
    expect(lista.length).toBe(2);
  });
});
