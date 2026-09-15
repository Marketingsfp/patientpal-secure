import { describe, expect, test } from "bun:test";
import { conciliarProcessamentoNina, esperaRetryWatchdog, percentil } from "../watchdog";
import { fileURLToPath } from "node:url";
import { metricasWatchdogCarga } from "../watchdog-metricas.server";
import { chamarModeloGemini } from "../adapters/gemini-adapter.server";

describe("Watchdog — invariantes de observabilidade", () => {
  test("mensagem ausente e processing são falhas de integridade, inclusive em lote agrupado", () => {
    const r = conciliarProcessamentoNina(
      ["a", "b", "c"],
      [
        { id: "a", nina_status: "completed", nina_batch_id: "lote" },
        { id: "b", nina_status: "processing", nina_batch_id: "lote" },
      ],
    );
    expect(r).toMatchObject({
      recebidas: 3,
      terminais: 1,
      pendentes: 2,
      ausentes: 1,
      integridade: false,
      aprovado: false,
    });
  });
  test("failed é terminal conhecido e reprova o resultado funcional", () => {
    expect(conciliarProcessamentoNina(["a"], [{ id: "a", nina_status: "failed" }])).toMatchObject({
      terminais: 1,
      pendentes: 0,
      integridade: true,
      aprovado: false,
    });
  });
  test("backoff é limitado e percentis usam amostras realmente observadas", () => {
    expect(esperaRetryWatchdog(1, () => 0)).toBe(1500);
    expect(esperaRetryWatchdog(100, () => 1)).toBe(30000);
    expect(percentil([], 0.95)).toBeNull();
    expect(percentil([1, 2, 3, 4, 5], 0.95)).toBe(5);
  });
  test("timeout aborta a chamada e devolve erro classificável sem resposta inventada", async () => {
    const anterior = globalThis.fetch,
      chave = process.env.LOVABLE_API_KEY;
    process.env.LOVABLE_API_KEY = "somente-teste-local";
    globalThis.fetch = ((_url: any, init: any) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      })) as any;
    try {
      const r = await chamarModeloGemini({
        modelo: "teste",
        messages: [{ role: "user", content: "oi" }],
        timeoutMs: 20,
      });
      expect(r.ok).toBe(false);
      expect(r.conteudo).toBe("");
      expect(r.erro).toMatch(/timeout|timed out/i);
    } finally {
      globalThis.fetch = anterior;
      if (chave === undefined) delete process.env.LOVABLE_API_KEY;
      else process.env.LOVABLE_API_KEY = chave;
    }
  });
  test("gateway repete timeout com limite e não repete payload inválido", async () => {
    const fixture = fileURLToPath(
      new URL("./fixtures/watchdog-gateway.fixture.ts", import.meta.url),
    );
    const p = Bun.spawn([process.execPath, fixture], {
      env: { ...process.env, NODE_ENV: "test" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited,
    ]);
    if (code) throw Error(out + err);
    const linha = out.split(/\r?\n/).find((l) => l.startsWith("WATCHDOG_GATEWAY="));
    expect(linha).toBeDefined();
    expect(JSON.parse(linha!.slice("WATCHDOG_GATEWAY=".length))).toEqual({
      timeoutAttempts: 3,
      permanentAttempts: 1,
    });
  }, 15000);
  test("carga rastreada falha mesmo se todas as entradas desapareceram", async () => {
    const admin = {
      from: () => {
        const q: any = {
          select: () => q,
          eq: () => q,
          in: () => q,
          then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
        };
        return q;
      },
    };
    const carga = {
      id: "carga",
      clinica_id: "clinica",
      watchdog_ativo: true,
      enviadas: 10,
      plano: Array.from({ length: 10 }, (_, indice) => ({ indice, leadId: "lead" + indice })),
      created_at: new Date(0).toISOString(),
      finalizado_em: new Date(1000).toISOString(),
    };
    const r = await metricasWatchdogCarga(admin, carga, 2000);
    expect(r).toMatchObject({
      esperadas: 10,
      recebidas: 0,
      naoLocalizadas: 10,
      pendentes: 10,
      erroCritico: true,
      testeFalhou: true,
      aprovado: false,
    });
    expect(
      await metricasWatchdogCarga(admin, { ...carga, watchdog_ativo: false }, 2000),
    ).toBeNull();
  });
});
