import { describe, expect, it } from "bun:test";
import {
  agregarPorConversa,
  filtrarTestes,
  resumirTestes,
  resumirPorVersaoPrompt,
  type EntradaDashboard,
} from "@/lib/nina/dashboard-homologacao";

function entrada(): EntradaDashboard {
  return {
    tipoPorConversa: { c1: "terra", c2: "cenarios", c3: "carga" },
    execucoes: [
      {
        conversaId: "c1",
        quando: "2026-09-01T10:00:00Z",
        modelo: "google/gemini",
        promptVersao: 21,
        sucesso: true,
        erroCategoria: null,
        handoff: false,
        conhecimento: "ok",
        inputTokens: 100,
        outputTokens: 50,
        latenciaMs: 1000,
      },
      {
        conversaId: "c2",
        quando: "2026-09-02T10:00:00Z",
        modelo: "google/gemini",
        promptVersao: 22,
        sucesso: false,
        erroCategoria: "tool_error",
        handoff: true,
        conhecimento: null,
        inputTokens: 10,
        outputTokens: 5,
        latenciaMs: 3000,
      },
      {
        conversaId: "c3",
        quando: "2026-09-03T10:00:00Z",
        modelo: "openai/gpt",
        promptVersao: 22,
        sucesso: true,
        erroCategoria: null,
        handoff: false,
        conhecimento: null,
        inputTokens: 1,
        outputTokens: 1,
        latenciaMs: 2000,
      },
    ],
    ferramentas: [
      { conversaId: "c1", nome: "agendar_consulta", ok: true, erro: null, quando: "2026-09-01T10:01:00Z" },
      { conversaId: "c2", nome: "transferir_atendente_humano", ok: true, erro: null, quando: "2026-09-02T10:01:00Z" },
    ],
    avaliacoes: [
      { conversaId: "c1", quando: "2026-09-01T11:00:00Z", resultado: "aprovado", score: 96, achados: [] },
      {
        conversaId: "c2",
        quando: "2026-09-02T11:00:00Z",
        resultado: "reprovado",
        score: 60,
        achados: [{ gravidade: "critica", componente: "agenda", observado: "agenda errada" }],
      },
    ],
    custoPorConversa: { c2: 0.5 },
  };
}

describe("dashboard da homologação", () => {
  it("agrega cada conversa de teste com seu tipo e resultado", () => {
    const testes = agregarPorConversa(entrada());
    expect(testes).toHaveLength(3);
    const c1 = testes.find((t) => t.conversaId === "c1")!;
    expect(c1.tipo).toBe("terra");
    expect(c1.resultado).toBe("aprovado");
    expect(c1.agendamentos).toBe(1);
    const c3 = testes.find((t) => t.conversaId === "c3")!;
    expect(c3.resultado).toBe("sem_avaliacao");
  });

  it("conta transferências, erros críticos e categorias", () => {
    const resumo = resumirTestes(agregarPorConversa(entrada()));
    expect(resumo.testes).toBe(3);
    expect(resumo.transferencias).toBe(2);
    expect(resumo.errosCriticos).toBe(2);
    expect(resumo.aprovados).toBe(1);
    expect(resumo.reprovados).toBe(1);
    expect(resumo.semAvaliacao).toBe(1);
    expect(resumo.scoreMedio).toBe(78);
    expect(resumo.errosPorCategoria.some((c) => c.categoria === "agenda")).toBe(true);
  });

  it("não inventa custo nem score", () => {
    const resumo = resumirTestes(
      agregarPorConversa({ ...entrada(), custoPorConversa: {}, avaliacoes: [] }),
    );
    expect(resumo.custo).toBeNull();
    expect(resumo.scoreMedio).toBeNull();
    expect(resumo.taxaAprovacao).toBeNull();
  });

  it("filtra por tipo, modelo, versão e resultado", () => {
    const testes = agregarPorConversa(entrada());
    expect(filtrarTestes(testes, { tipos: ["terra"] })).toHaveLength(1);
    expect(filtrarTestes(testes, { modelo: "openai/gpt" })).toHaveLength(1);
    expect(filtrarTestes(testes, { promptVersao: 22 })).toHaveLength(2);
    expect(filtrarTestes(testes, { resultado: "reprovado" })).toHaveLength(1);
  });

  it("compara versões do prompt pela taxa de aprovação", () => {
    const porVersao = resumirPorVersaoPrompt(agregarPorConversa(entrada()));
    expect(porVersao[0]!.versao).toBe(22);
    expect(porVersao[0]!.resumo.taxaAprovacao).toBe(0);
    const v21 = porVersao.find((v) => v.versao === 21)!;
    expect(v21.resumo.taxaAprovacao).toBe(100);
  });

  it("calcula latência média e p95", () => {
    const resumo = resumirTestes(agregarPorConversa(entrada()));
    expect(resumo.latenciaMediaMs).toBe(2000);
    expect(resumo.latenciaP95Ms).toBe(3000);
  });
});
