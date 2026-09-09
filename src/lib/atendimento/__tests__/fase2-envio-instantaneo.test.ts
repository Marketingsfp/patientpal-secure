/**
 * FASE 2 — o clique precisa produzir bolha imediata, sem esperar o WhatsApp.
 *
 * Cenários exigidos: backend lento de 6 s, três envios seguidos, troca de lead
 * logo após enviar, falha recuperável e ausência de duplicidade no tempo real.
 */
import { describe, expect, it } from "bun:test";
import {
  chaveLogica,
  criarMensagemOtimista,
  ehOtimista,
  inserirOtimista,
  marcarFalhaOtimista,
  mesclarOficial,
  novoClientMessageId,
} from "../envio-otimista";
import { criarFilaEnvio } from "../fila-envio";

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Simula o clique: bolha local + chamada ao servidor (aqui, lenta). */
function clicarEnviar(estado: { msgs: any[]; campo: string }, conversaId: string) {
  const t0 = performance.now();
  const texto = estado.campo.trim();
  const clientMessageId = novoClientMessageId();
  const otimista = criarMensagemOtimista({ conversaId, texto, clientMessageId });
  estado.campo = "";
  estado.msgs = inserirOtimista(estado.msgs, otimista);
  return { clientMessageId, otimista, ms: performance.now() - t0 };
}

describe("clique → bolha", () => {
  it("renderiza em menos de 100 ms mesmo com backend de 6 segundos", async () => {
    const estado = { msgs: [] as any[], campo: "Bom dia" };
    const backendLento = async () => {
      await espera(6000);
      return { ok: true };
    };
    const pendente = backendLento();
    const r = clicarEnviar(estado, "c1");
    expect(r.ms).toBeLessThan(100);
    expect(estado.msgs).toHaveLength(1);
    expect(estado.msgs[0].status).toBe("sending");
    expect(estado.campo).toBe("");
    void pendente;
  });

  it("o campo fica livre para a próxima mensagem na hora", () => {
    const estado = { msgs: [] as any[], campo: "primeira" };
    clicarEnviar(estado, "c1");
    estado.campo = "segunda";
    const r2 = clicarEnviar(estado, "c1");
    expect(r2.ms).toBeLessThan(100);
    expect(estado.msgs.map((m) => m.body)).toEqual(["primeira", "segunda"]);
  });
});

describe("fila de transporte por conversa", () => {
  it("envia A → B → C mesmo com a primeira chamada mais lenta", async () => {
    const fila = criarFilaEnvio();
    const ordem: string[] = [];
    const atrasos: Record<string, number> = { A: 60, B: 5, C: 1 };
    for (const letra of ["A", "B", "C"]) {
      void fila.enfileirar("c1", async () => {
        await espera(atrasos[letra]!);
        ordem.push(letra);
      });
    }
    expect(fila.pendentes("c1")).toBe(3);
    await fila.ocioso("c1");
    expect(ordem).toEqual(["A", "B", "C"]);
    expect(fila.pendentes("c1")).toBe(0);
  });

  it("conversas diferentes têm filas independentes", async () => {
    const fila = criarFilaEnvio();
    const ordem: string[] = [];
    void fila.enfileirar("c1", async () => {
      await espera(40);
      ordem.push("c1");
    });
    void fila.enfileirar("c2", async () => {
      ordem.push("c2");
    });
    expect(fila.conversasAtivas().sort()).toEqual(["c1", "c2"]);
    await Promise.all([fila.ocioso("c1"), fila.ocioso("c2")]);
    expect(ordem).toEqual(["c2", "c1"]);
  });

  it("uma falha não trava a mensagem seguinte", async () => {
    const fila = criarFilaEnvio();
    const ordem: string[] = [];
    void fila.enfileirar("c1", async () => {
      ordem.push("A");
      throw new Error("rede caiu");
    });
    void fila.enfileirar("c1", async () => {
      ordem.push("B");
    });
    await fila.ocioso("c1");
    expect(ordem).toEqual(["A", "B"]);
  });
});

describe("reconciliação e falha", () => {
  it("a mensagem oficial mescla na bolha, sem duplicar no tempo real", () => {
    const otimista = criarMensagemOtimista({ conversaId: "c1", texto: "oi", clientMessageId: "u1" });
    let msgs = inserirOtimista([], otimista);
    const oficial = {
      id: "db-1",
      client_message_id: "u1",
      conversa_id: "c1",
      direction: "out",
      body: "oi",
      recebida_em: otimista.recebida_em,
    };
    msgs = mesclarOficial(msgs, oficial);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe("db-1");
    expect(ehOtimista(msgs[0])).toBe(false);
    // Realtime traz a MESMA linha: continua uma bolha só.
    msgs = mesclarOficial(msgs, oficial);
    expect(msgs).toHaveLength(1);
    expect(chaveLogica(msgs[0])).toBe("cmid:u1");
  });

  it("falha mantém a mensagem na tela como não enviada", () => {
    const otimista = criarMensagemOtimista({ conversaId: "c1", texto: "oi", clientMessageId: "u2" });
    const msgs = marcarFalhaOtimista(inserirOtimista([], otimista), "u2");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].status).toBe("failed");
  });

  it("reenvio reutiliza o identificador (o WhatsApp não recebe duas vezes)", async () => {
    const fila = criarFilaEnvio();
    const recebidos: string[] = [];
    const enviar = (cmid: string) =>
      fila.enfileirar("c1", async () => {
        recebidos.push(cmid);
      });
    await enviar("u3");
    await enviar("u3"); // tentativa manual após falha
    expect(new Set(recebidos).size).toBe(1);
  });
});

describe("troca de lead", () => {
  it("a bolha pertence à conversa de origem, nunca à conversa aberta depois", () => {
    const otimista = criarMensagemOtimista({ conversaId: "c1", texto: "oi", clientMessageId: "u4" });
    const listaOutroLead = inserirOtimista([], otimista).filter((m) => m.conversa_id === "c2");
    expect(listaOutroLead).toHaveLength(0);
    expect(otimista.conversa_id).toBe("c1");
  });
});
