import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  _resetPerf,
  ciclosInbox,
  contarCicloInbox,
  iniciarTroca,
  marcarCache,
  marcarTroca,
  medirRequest,
  relatorioTroca,
  tracoAtual,
} from "../perf-troca";

const store = new Map<string, string>();

beforeEach(() => {
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  store.set("nina:perf", "1");
  _resetPerf();
});

afterEach(() => {
  store.clear();
  delete (globalThis as any).localStorage;
});

describe("Fase 4 — instrumentação da troca", () => {
  it("cada navegação tem identificação própria", () => {
    const a = iniciarTroca("A");
    const b = iniciarTroca("B");
    expect(a).toBe(1);
    expect(b).toBe(2);
    expect(tracoAtual()?.conversaId).toBe("B");
  });

  it("resposta atrasada de A não registra etapa na medição de B", () => {
    iniciarTroca("A");
    iniciarTroca("B");
    marcarTroca("T4_mensagens", "A");
    const r = relatorioTroca()!;
    expect(r.conversaId).toBe("B");
    expect(r.marcas_ignoradas).toBe(1);
    expect(r.etapas.mensagens).toBeUndefined();
  });

  it("etapa da própria conversa é registrada", () => {
    iniciarTroca("B");
    marcarTroca("T2_requests", "B");
    marcarTroca("T4_mensagens", "B");
    marcarTroca("T4b_mensagens_corretas", "B");
    const r = relatorioTroca()!;
    expect(r.etapas.mensagens).not.toBeUndefined();
    expect(r.etapas.mensagens_corretas).not.toBeUndefined();
  });

  it("requisição de outra conversa é contada como descartada", async () => {
    iniciarTroca("A");
    iniciarTroca("B");
    await medirRequest("listarMensagensConversa", Promise.resolve(1), "A");
    await medirRequest("listarMensagensConversa", Promise.resolve(1), "B");
    const r = relatorioTroca()!;
    expect(r.total_requests).toBe(1);
    expect(r.requests_descartadas).toBe(1);
    expect(r.duplicadas).toEqual([]);
  });

  it("aponta requisições duplicadas da mesma navegação", async () => {
    iniciarTroca("A");
    await medirRequest("obterDadosContato", Promise.resolve(1), "A");
    await medirRequest("obterDadosContato", Promise.resolve(1), "A");
    expect(relatorioTroca()!.duplicadas).toEqual([["obterDadosContato", 2]]);
  });

  it("registra acertos e ausências de cache sem conteúdo de paciente", () => {
    iniciarTroca("A");
    marcarCache("mensagens_cache", true, "A");
    marcarCache("mensagens_prefetch", false, "A");
    marcarCache("mensagens_cache", true, "B");
    const r = relatorioTroca()!;
    expect(r.cache).toEqual({ acertos: ["mensagens_cache"], ausencias: ["mensagens_prefetch"] });
    expect(JSON.stringify(r)).not.toContain("@");
  });

  it("skeleton não conta como conversa carregada", () => {
    iniciarTroca("A");
    marcarTroca("T5_render", "A");
    marcarTroca("T6_scroll", "A");
    // Sem mensagens certas visíveis não há tempo "até utilizável" válido.
    expect(relatorioTroca()!.etapas.mensagens_corretas).toBeUndefined();
  });

  it("conta montagens e desmontagens da Inbox", () => {
    contarCicloInbox("montagem");
    contarCicloInbox("montagem");
    contarCicloInbox("desmontagem");
    expect(ciclosInbox()).toEqual({ montagens: 2, desmontagens: 1 });
  });

  it("fica desligada quando a medição não foi ativada", () => {
    store.delete("nina:perf");
    _resetPerf();
    expect(iniciarTroca("A")).toBe(0);
    expect(relatorioTroca()).toBeNull();
  });
});
