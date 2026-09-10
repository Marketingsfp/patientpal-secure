/**
 * FASE 3 — Serialização do processamento da Nina por conversa.
 *
 * Os testes simulam a semântica das RPCs atômicas (`nina_lock_adquirir`,
 * `nina_lock_liberar`, claim do lote) para provar exclusão mútua entre
 * instâncias, paralelismo entre conversas e recuperação após falha.
 */
import { describe, expect, test } from "bun:test";

type Linha = { token: string | null; expiraEm: number; liberado: boolean };

/** Banco simulado: mesma semântica do INSERT ... ON CONFLICT ... WHERE. */
class LockStore {
  private linhas = new Map<string, Linha>();
  private seq = 0;

  adquirir(chave: string, agora = Date.now(), leaseMs = 90_000): string | null {
    const atual = this.linhas.get(chave);
    const livre = !atual || atual.liberado || atual.expiraEm <= agora;
    if (!livre) return null;
    const token = `tok-${++this.seq}`;
    this.linhas.set(chave, { token, expiraEm: agora + leaseMs, liberado: false });
    return token;
  }

  liberar(chave: string, token: string, agora = Date.now()): boolean {
    const atual = this.linhas.get(chave);
    if (!atual || atual.liberado || atual.token !== token) return false;
    this.linhas.set(chave, { ...atual, liberado: true, expiraEm: agora });
    return true;
  }
}

describe("FASE 3 — lock por conversa", () => {
  test("A: duas tentativas simultâneas na mesma conversa → só uma chama o modelo", async () => {
    const store = new LockStore();
    let chamadasModelo = 0;

    const tentar = async () => {
      const token = store.adquirir("clinica:5511999");
      if (!token) return "adiado";
      chamadasModelo += 1;
      await new Promise((r) => setTimeout(r, 5));
      store.liberar("clinica:5511999", token);
      return "processou";
    };

    const [a, b] = await Promise.all([tentar(), tentar()]);
    expect([a, b].filter((r) => r === "processou")).toHaveLength(1);
    expect(chamadasModelo).toBe(1);
  });

  test("B: conversas X e Y processam em paralelo", async () => {
    const store = new LockStore();
    const x = store.adquirir("clinica:X");
    const y = store.adquirir("clinica:Y");
    expect(x).not.toBeNull();
    expect(y).not.toBeNull();
  });

  test("C: execução que falha não deixa a conversa presa (lease expira)", () => {
    const store = new LockStore();
    const t0 = 1_000_000;
    const token = store.adquirir("clinica:Z", t0, 90_000);
    expect(token).not.toBeNull();
    // Falha sem liberar: durante o lease ninguém entra.
    expect(store.adquirir("clinica:Z", t0 + 10_000)).toBeNull();
    // Depois do lease, a conversa se recupera sozinha.
    expect(store.adquirir("clinica:Z", t0 + 95_000)).not.toBeNull();
  });

  test("C2: liberação explícita permite o próximo turno imediatamente", () => {
    const store = new LockStore();
    const token = store.adquirir("clinica:W")!;
    store.liberar("clinica:W", token);
    expect(store.adquirir("clinica:W")).not.toBeNull();
  });

  test("D: workers diferentes disputando claim → claim atômico", () => {
    const store = new LockStore();
    const tokens = Array.from({ length: 8 }, () => store.adquirir("clinica:mesma"));
    expect(tokens.filter(Boolean)).toHaveLength(1);
  });

  test("D2: token errado não libera a trava de outra execução", () => {
    const store = new LockStore();
    const token = store.adquirir("clinica:T")!;
    expect(store.liberar("clinica:T", "tok-falso")).toBe(false);
    expect(store.adquirir("clinica:T")).toBeNull();
    expect(store.liberar("clinica:T", token)).toBe(true);
  });
});

describe("FASE 3 — claim do lote", () => {
  test("COLLECTING → PROCESSING acontece uma única vez", () => {
    let status: "COLLECTING" | "PROCESSING" = "COLLECTING";
    const claim = () => {
      if (status !== "COLLECTING") return false;
      status = "PROCESSING";
      return true;
    };
    const resultados = [claim(), claim(), claim()];
    expect(resultados.filter(Boolean)).toHaveLength(1);
    expect(status).toBe("PROCESSING");
  });
});
