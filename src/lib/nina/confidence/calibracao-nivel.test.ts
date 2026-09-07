import { describe, expect, it } from "bun:test";
import {
  calcularCalibracaoPorNivel,
  type ErroReportado,
  type LinhaDecisaoMetrica,
} from "./metricas";

function linha(p: Partial<LinhaDecisaoMetrica>): LinhaDecisaoMetrica {
  return {
    id: p.id ?? "d",
    created_at: p.created_at ?? "2026-09-01T10:00:00.000Z",
    ambiente: "producao",
    conversation_id: p.conversation_id ?? null,
    execucao_id: p.execucao_id ?? null,
    score: p.score ?? 95,
    nivel: p.nivel ?? null,
    decisao: "ALLOW",
    acao: null,
    intencao: null,
    categorias: [],
    bloqueadores: [],
    reason_codes: [],
    validadores: [],
    ferramentas: [],
    data_local: "2026-09-01",
    dia_semana: 2,
    periodo: "DENTRO_DO_HORARIO",
  };
}

function erro(p: Partial<ErroReportado>): ErroReportado {
  return {
    id: p.id ?? "e",
    conversa_id: p.conversa_id ?? null,
    execucao_id: p.execucao_id ?? null,
    created_at: p.created_at ?? "2026-09-01T11:00:00.000Z",
    categoria: null,
  };
}

describe("FASE 6 — calibração por nível", () => {
  it("separa mensagens e erros por nível e calcula a taxa real", () => {
    const linhas = [
      linha({ id: "1", execucao_id: "x1", score: 96 }),
      linha({ id: "2", execucao_id: "x2", score: 92 }),
      linha({ id: "3", execucao_id: "x3", score: 80 }),
      linha({ id: "4", execucao_id: "x4", score: 60 }),
    ];
    const erros = [erro({ execucao_id: "x1" }), erro({ id: "e2", execucao_id: "x4" })];
    const r = calcularCalibracaoPorNivel(linhas, erros);
    const alta = r.find((x) => x.nivel === "HIGH")!;
    const media = r.find((x) => x.nivel === "MEDIUM")!;
    const baixa = r.find((x) => x.nivel === "LOW")!;

    expect(alta).toMatchObject({ mensagens: 2, erros: 1, taxaErro: 50 });
    expect(media).toMatchObject({ mensagens: 1, erros: 0, taxaErro: 0 });
    expect(baixa).toMatchObject({ mensagens: 1, erros: 1, taxaErro: 100 });
  });

  it("sem dados não inventa números", () => {
    expect(calcularCalibracaoPorNivel([], [])).toEqual([
      { nivel: "HIGH", rotulo: "Alta", mensagens: 0, erros: 0, taxaErro: 0 },
      { nivel: "MEDIUM", rotulo: "Média", mensagens: 0, erros: 0, taxaErro: 0 },
      { nivel: "LOW", rotulo: "Baixa", mensagens: 0, erros: 0, taxaErro: 0 },
    ]);
  });

  it("usa a conversa em até 48h quando o reporte não tem execução", () => {
    const linhas = [linha({ id: "1", conversation_id: "c1", score: 95 })];
    const r = calcularCalibracaoPorNivel(linhas, [
      erro({ conversa_id: "c1", created_at: "2026-09-02T09:00:00.000Z" }),
    ]);
    expect(r.find((x) => x.nivel === "HIGH")).toMatchObject({ mensagens: 1, erros: 1, taxaErro: 100 });
  });
});
