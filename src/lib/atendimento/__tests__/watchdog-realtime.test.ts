import { describe, expect, it } from "bun:test";
import { criarWatchdog, INTERVALO_FALLBACK_MS } from "../watchdog-realtime";

function relogio() {
  let t = 1_000;
  return { agora: () => t, avancar: (ms: number) => (t += ms) };
}

describe("FASE 3 — vigia da conexão e rede de segurança", () => {
  it("canal saudável não liga conferência periódica", () => {
    const w = criarWatchdog();
    expect(w.aoEstado("SUBSCRIBED")).toEqual({ fallback: "manter", reconciliar: false });
    expect(w.snapshot().fallbackAtivo).toBe(false);
  });

  it("canal com problema liga a conferência periódica uma única vez", () => {
    const w = criarWatchdog();
    w.aoEstado("SUBSCRIBED");
    expect(w.aoEstado("DEGRADED").fallback).toBe("ativar");
    expect(w.aoEstado("DISCONNECTED").fallback).toBe("manter");
    expect(w.snapshot().fallbackAtivo).toBe(true);
  });

  it("recuperação para a conferência periódica e confere uma última vez", () => {
    const w = criarWatchdog();
    w.aoEstado("DEGRADED");
    const volta = w.aoEstado("SUBSCRIBED");
    expect(volta).toEqual({ fallback: "parar", reconciliar: true });
    expect(w.snapshot().fallbackAtivo).toBe(false);
    // Confirmação repetida não religa nem reconfere.
    expect(w.aoEstado("SUBSCRIBED")).toEqual({ fallback: "manter", reconciliar: false });
  });

  it("intervalo da rede de segurança é conservador (nunca de 1 em 1 segundo)", () => {
    expect(INTERVALO_FALLBACK_MS).toBeGreaterThanOrEqual(10_000);
    expect(INTERVALO_FALLBACK_MS).toBeLessThanOrEqual(15_000);
  });

  it("guarda marcas técnicas para diferenciar 'não houve aviso' de 'falhou a conferência'", () => {
    const c = relogio();
    const w = criarWatchdog({ agora: c.agora });
    w.aoEstado("SUBSCRIBED");
    w.aoEvento();
    c.avancar(500);
    w.aoSincronizar("realtime");

    const s = w.snapshot();
    expect(s.status).toBe("SUBSCRIBED");
    expect(s.ultimoEventoEm).toBe(1_000);
    expect(s.ultimaSincronizacaoEm).toBe(1_500);
    expect(s.ultimoMotivo).toBe("realtime");
    // Nenhum dado de paciente é guardado.
    expect(Object.keys(s).sort()).toEqual([
      "fallbackAtivo",
      "status",
      "ultimaSincronizacaoEm",
      "ultimoEventoEm",
      "ultimoMotivo",
    ]);
  });
});
