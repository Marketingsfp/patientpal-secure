import { describe, expect, it } from "bun:test";
import {
  assinarTexto,
  conciliarOtimistas,
  criarMensagemOtimista,
  mesclarOficial,
} from "../envio-otimista";

describe("assinatura na bolha otimista", () => {
  it("a bolha já nasce com a assinatura do servidor", () => {
    const m = criarMensagemOtimista({
      conversaId: "c1",
      texto: "teste",
      nomeAutor: "JEAN XAVIER FERREIRA PINHO",
      clientMessageId: "u1",
    });
    expect(m.body).toBe("*JEAN XAVIER FERREIRA PINHO:*\nteste");
    expect(m.texto_original).toBe("teste");
  });

  it("sem nome, vai sem assinatura (igual ao servidor)", () => {
    const m = criarMensagemOtimista({ conversaId: "c1", texto: "oi", clientMessageId: "u2" });
    expect(m.body).toBe("oi");
    expect(assinarTexto("  ", "oi")).toBe("oi");
  });

  it("limpa marcações do nome como o servidor", () => {
    expect(assinarTexto("*Ana_*", "oi")).toBe("*Ana:*\noi");
  });

  it("confirmação do servidor não duplica a bolha", () => {
    const otimista = criarMensagemOtimista({
      conversaId: "c1",
      texto: "teste",
      nomeAutor: "Ana",
      clientMessageId: "u3",
    });
    const oficial = {
      id: "db-1",
      client_message_id: "u3",
      direction: "out",
      enviada_por: "humano",
      body: assinarTexto("Ana", "teste"),
      recebida_em: otimista.recebida_em,
      status: "sent",
    };
    const lista = mesclarOficial([otimista], oficial);
    expect(lista).toHaveLength(1);
    expect(lista[0].body).toBe(otimista.body);
    expect(conciliarOtimistas([otimista, oficial])).toHaveLength(1);
  });
});
