import { describe, expect, it } from "vitest";
import {
  calcularMetricasConfiabilidade,
  decisaoDa,
  nivelDa,
  type LinhaDecisaoMetrica,
} from "./metricas";

function linha(p: Partial<LinhaDecisaoMetrica> = {}): LinhaDecisaoMetrica {
  return {
    id: p.id ?? crypto.randomUUID(),
    created_at: p.created_at ?? "2026-09-05T12:00:00.000Z",
    ambiente: p.ambiente ?? "producao",
    conversation_id: p.conversation_id ?? null,
    score: p.score ?? 95,
    nivel: p.nivel ?? null,
    decisao: p.decisao ?? "ALLOW",
    acao: p.acao ?? null,
    intencao: p.intencao ?? "informar_valor",
    categorias: p.categorias ?? ["valor"],
    bloqueadores: p.bloqueadores ?? [],
    reason_codes: p.reason_codes ?? [],
    validadores: p.validadores ?? [],
    ferramentas: p.ferramentas ?? [],
    data_local: p.data_local ?? "2026-09-05",
    dia_semana: p.dia_semana ?? 6,
    periodo: p.periodo ?? "DENTRO_DO_HORARIO",
  };
}

describe("métricas de confiabilidade", () => {
  it("deriva nível e decisão de registros antigos", () => {
    expect(nivelDa({ nivel: null, score: 92 })).toBe("HIGH");
    expect(nivelDa({ nivel: null, score: 80 })).toBe("MEDIUM");
    expect(nivelDa({ nivel: null, score: 10 })).toBe("LOW");
    expect(decisaoDa({ decisao: null, acao: "transferir" })).toBe("HANDOFF");
    expect(decisaoDa({ decisao: "CLARIFY", acao: null })).toBe("CLARIFY");
  });

  it("resume média, distribuição e decisões", () => {
    const m = calcularMetricasConfiabilidade([
      linha({ score: 100, nivel: "HIGH", decisao: "ALLOW" }),
      linha({ score: 80, nivel: "MEDIUM", decisao: "CLARIFY" }),
      linha({ score: 40, nivel: "LOW", decisao: "HANDOFF" }),
    ]);
    expect(m.total).toBe(3);
    expect(m.scoreMedio).toBe(73.3);
    expect(m.distribuicao).toEqual({ HIGH: 1, MEDIUM: 1, LOW: 1 });
    expect(m.esclarecimentos).toBe(1);
    expect(m.respostasLiberadas).toBe(1);
    expect(m.handoffsBaixaConfianca).toBe(1);
  });

  it("aponta motivo, validador, ferramenta e informação ausente", () => {
    const m = calcularMetricasConfiabilidade([
      linha({
        score: 40,
        nivel: "LOW",
        decisao: "HANDOFF",
        bloqueadores: ["MISSING_REQUIRED_OFFICIAL_SOURCE"],
        reason_codes: ["MISSING_OFFICIAL_SOURCE", "TOOL_ERROR"],
        validadores: [
          { validator: "OfficialSourceValidator", status: "BLOCK" },
          { validator: "IntentClarityValidator", status: "PASS" },
        ],
        ferramentas: [{ nome: "buscar_agenda", sucesso: false }],
      }),
    ]);
    expect(m.bloqueadores).toBe(1);
    expect(m.motivosBaixaConfianca[0]?.chave).toBeTruthy();
    expect(m.validadoresQueProvocamHandoff[0]).toEqual({
      chave: "OfficialSourceValidator",
      total: 1,
    });
    expect(m.ferramentasComFalha[0]).toEqual({ chave: "buscar_agenda", total: 1 });
    expect(m.informacoesAusentes.map((i) => i.chave)).toContain("MISSING_OFFICIAL_SOURCE");
  });

  it("agrupa por tipo, dia da semana e período de operação", () => {
    const m = calcularMetricasConfiabilidade([
      linha({ categorias: ["exame"], score: 90, dia_semana: 6, periodo: "FORA_DO_HORARIO" }),
      linha({ categorias: ["exame"], score: 70, dia_semana: 6, periodo: "FORA_DO_HORARIO", nivel: "LOW" }),
      linha({ categorias: ["consulta"], score: 100, dia_semana: 1, periodo: "DENTRO_DO_HORARIO" }),
    ]);
    const exame = m.porTipoAtendimento.find((t) => t.chave === "exame");
    expect(exame).toMatchObject({ total: 2, scoreMedio: 80, baixa: 1 });
    expect(m.porDiaSemana.find((d) => d.chave === "Sábado")?.total).toBe(2);
    expect(m.porPeriodoOperacao.find((p) => p.chave === "FORA_DO_HORARIO")?.scoreMedio).toBe(80);
  });

  it("correlaciona faixas de confiança com erros reportados", () => {
    const m = calcularMetricasConfiabilidade(
      [
        linha({ score: 95, conversation_id: "c1", created_at: "2026-09-01T10:00:00.000Z" }),
        linha({ score: 60, conversation_id: "c2", created_at: "2026-09-01T10:00:00.000Z", nivel: "LOW" }),
      ],
      [
        { id: "e1", conversa_id: "c2", created_at: "2026-09-01T12:00:00.000Z", categoria: "valor" },
        { id: "e2", conversa_id: "c1", created_at: "2026-08-01T12:00:00.000Z", categoria: "valor" },
      ],
    );
    const alta = m.correlacaoErros.find((f) => f.faixa === "alta");
    const baixa = m.correlacaoErros.find((f) => f.faixa === "baixa");
    expect(alta).toMatchObject({ decisoes: 1, conversasComErro: 0, taxaErro: 0 });
    expect(baixa).toMatchObject({ decisoes: 1, conversasComErro: 1, taxaErro: 100 });
  });
});
