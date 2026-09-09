import { describe, expect, it } from "bun:test";
import {
  conciliarOtimistas,
  criarMensagemOtimista,
  ehOtimista,
  inserirOtimista,
  marcarFalhaOtimista,
  preservarOtimistas,
  removerOtimista,
} from "../envio-otimista";

const agora = new Date("2026-09-09T12:00:00.000Z");

const otim = (texto: string, conversaId = "A") =>
  criarMensagemOtimista({ conversaId, texto, usuarioId: "u1", clientMessageId: `c-${texto}`, agora });

const real = (texto: string, quando = "2026-09-09T12:00:02.000Z") => ({
  id: `real-${texto}`,
  conversa_id: "A",
  direction: "out",
  enviada_por: "humano",
  body: texto,
  recebida_em: quando,
});

describe("mensagem otimista", () => {
  it("nasce presa à conversa do clique, com estado de envio", () => {
    const m = otim("Olá");
    expect(m.conversa_id).toBe("A");
    expect(m.status).toBe("sending");
    expect(m.direction).toBe("out");
    expect(ehOtimista(m)).toBe(true);
  });

  it("entra na lista imediatamente e não duplica", () => {
    const m = otim("Olá");
    const lista = inserirOtimista(inserirOtimista([], m), m);
    expect(lista.length).toBe(1);
  });

  it("marca falha sem apagar o texto", () => {
    const m = otim("Olá");
    const lista = marcarFalhaOtimista(inserirOtimista([], m), m.client_message_id);
    expect(lista[0].status).toBe("failed");
    expect(lista[0].body).toBe("Olá");
  });

  it("remove a otimista quando o envio é descartado", () => {
    const m = otim("Olá");
    expect(removerOtimista(inserirOtimista([], m), m.client_message_id)).toEqual([]);
  });

  it("some quando a mensagem real chega do servidor", () => {
    const m = otim("Olá");
    const lista = conciliarOtimistas([...inserirOtimista([], m), real("Olá")]);
    expect(lista.filter(ehOtimista)).toEqual([]);
    expect(lista.length).toBe(1);
  });

  it("permanece enquanto o servidor ainda não tem a mensagem", () => {
    const m = otim("Olá");
    const lista = preservarOtimistas(inserirOtimista([], m), [real("Bom dia")]);
    expect(lista.some(ehOtimista)).toBe(true);
    expect(lista.length).toBe(2);
  });

  it("carga do servidor não apaga a mensagem recém-enviada", () => {
    const m = otim("Olá");
    const lista = preservarOtimistas(inserirOtimista([], m), []);
    expect(lista.length).toBe(1);
  });

  it("nunca mistura conversas: a otimista guarda o id de origem", () => {
    const a = otim("Olá", "A");
    const b = otim("Oi", "B");
    expect(a.conversa_id).not.toBe(b.conversa_id);
    const listaB = inserirOtimista([], b);
    expect(listaB.every((m) => m.conversa_id === "B")).toBe(true);
  });
});
