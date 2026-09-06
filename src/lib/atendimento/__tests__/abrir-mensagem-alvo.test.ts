import { describe, expect, it, afterEach } from "bun:test";
import {
  ABRIR_CONVERSA_KEY,
  ABRIR_MENSAGEM_KEY,
  EVENTO_ABRIR_CONVERSA,
  pedirAbrirConversa,
} from "../central-atencao";

/**
 * "Ver conversa" de um erro reportado: o pedido leva a conversa e, quando
 * existe, a mensagem exata a localizar. A abertura normal pela Inbox não pode
 * herdar um alvo de um pedido anterior.
 */
function prepararJanela() {
  const store = new Map<string, string>();
  const eventos: any[] = [];
  (globalThis as any).window = {
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    dispatchEvent: (e: any) => (eventos.push(e), true),
    CustomEvent: class {
      type: string;
      detail: any;
      constructor(type: string, init?: any) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
  };
  (globalThis as any).CustomEvent = (globalThis as any).window.CustomEvent;
  return { store, eventos };
}

afterEach(() => {
  delete (globalThis as any).window;
});

describe("pedirAbrirConversa", () => {
  it("guarda conversa e mensagem-alvo e avisa a Inbox já aberta", () => {
    const { store, eventos } = prepararJanela();
    pedirAbrirConversa({ conversaId: "conv-1", mensagemId: "msg-9" });

    expect(store.get(ABRIR_CONVERSA_KEY)).toBe("conv-1");
    expect(store.get(ABRIR_MENSAGEM_KEY)).toBe("msg-9");
    expect(eventos).toHaveLength(1);
    expect(eventos[0].type).toBe(EVENTO_ABRIR_CONVERSA);
    expect(eventos[0].detail).toEqual({ id: "conv-1", mensagemId: "msg-9" });
  });

  it("sem mensagem-alvo, limpa alvo anterior (abertura normal vai ao fim)", () => {
    const { store, eventos } = prepararJanela();
    pedirAbrirConversa({ conversaId: "conv-1", mensagemId: "msg-9" });
    pedirAbrirConversa({ conversaId: "conv-2" });

    expect(store.get(ABRIR_CONVERSA_KEY)).toBe("conv-2");
    expect(store.has(ABRIR_MENSAGEM_KEY)).toBe(false);
    expect(eventos[1].detail).toEqual({ id: "conv-2", mensagemId: null });
  });
});
