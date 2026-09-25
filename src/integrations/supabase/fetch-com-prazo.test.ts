import { afterEach, describe, expect, it } from "bun:test";
import { criarFetchComPrazo } from "./fetch-com-prazo";

const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
});

/** `fetch` que nunca responde, como uma conexão presa; só termina se for cancelado. */
function fetchTravado(sinais: Array<AbortSignal | undefined>) {
  globalThis.fetch = ((_: RequestInfo | URL, init?: RequestInit) => {
    sinais.push(init?.signal ?? undefined);
    return new Promise<Response>((_, rejeitar) =>
      init?.signal?.addEventListener("abort", () => rejeitar(init.signal!.reason)),
    );
  }) as typeof fetch;
}

describe("prazo das requisições do cliente do servidor", () => {
  it("cancela a consulta ao banco que não responde dentro do prazo", async () => {
    const sinais: Array<AbortSignal | undefined> = [];
    fetchTravado(sinais);
    const inicio = Date.now();
    const erro = await criarFetchComPrazo(50)(
      "https://x.supabase.co/rest/v1/rpc/nina_lock_renovar",
      {
        method: "POST",
      },
    ).catch((e: unknown) => e);
    expect((erro as Error).name).toBe("TimeoutError");
    expect(Date.now() - inicio).toBeLessThan(2_000);
  });

  it("mantém o prazo próprio de quem chama junto com o padrão", async () => {
    const sinais: Array<AbortSignal | undefined> = [];
    fetchTravado(sinais);
    const proprio = new AbortController();
    const chamada = criarFetchComPrazo(60_000)("https://x.supabase.co/rest/v1/agendamentos", {
      signal: proprio.signal,
    }).catch((e: unknown) => e);
    proprio.abort(new Error("cancelado por quem chamou"));
    expect(((await chamada) as Error).message).toBe("cancelado por quem chamou");
  });

  it("não mexe em Storage nem Auth (upload grande pode demorar mais)", async () => {
    const sinais: Array<AbortSignal | undefined> = [];
    globalThis.fetch = ((_: RequestInfo | URL, init?: RequestInit) => {
      sinais.push(init?.signal ?? undefined);
      return Promise.resolve(new Response("{}"));
    }) as typeof fetch;
    const f = criarFetchComPrazo(50);
    await f("https://x.supabase.co/storage/v1/object/backups/a.json", { method: "POST" });
    await f("https://x.supabase.co/auth/v1/user");
    expect(sinais).toEqual([undefined, undefined]);
  });
});
