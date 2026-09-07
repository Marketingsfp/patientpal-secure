import { describe, expect, it } from "bun:test";
import {
  CLASSIFICACAO_ALTA_CONFIANCA_ERRO,
  calcularAltaConfiancaComErro,
  calcularCalibracaoPorFaixaScore,
  type ErroReportado,
  type LinhaDecisaoMetrica,
} from "./metricas";

function linha(p: Partial<LinhaDecisaoMetrica>): LinhaDecisaoMetrica {
  return {
    id: p.id ?? "d",
    created_at: "2026-09-01T10:00:00.000Z",
    ambiente: "producao",
    conversation_id: p.conversation_id ?? null,
    execucao_id: p.execucao_id ?? null,
    score: p.score ?? 95,
    nivel: p.nivel ?? null,
    decisao: "ALLOW",
    acao: null,
    intencao: p.intencao ?? null,
    categorias: p.categorias ?? [],
    bloqueadores: [],
    reason_codes: p.reason_codes ?? [],
    validadores: p.validadores ?? [],
    ferramentas: p.ferramentas ?? [],
    data_local: "2026-09-01",
    dia_semana: 2,
    periodo: "DENTRO_DO_HORARIO",
  };
}

const erro = (execucao_id: string): ErroReportado => ({
  id: `e-${execucao_id}`,
  conversa_id: null,
  execucao_id,
  created_at: "2026-09-01T12:00:00.000Z",
  categoria: null,
});

describe("FASE 7 — HIGH_CONFIDENCE_ERROR", () => {
  it("conta só respostas de alta confiança reportadas como erro e aponta onde investigar", () => {
    const linhas = [
      linha({
        id: "1",
        execucao_id: "x1",
        score: 98,
        categorias: ["valor"],
        validadores: [{ validator: "fonte_oficial", status: "PASS" }],
        ferramentas: [{ nome: "catalogo", sucesso: true }],
        reason_codes: ["SOURCE_PUBLISHED"],
      }),
      linha({ id: "2", execucao_id: "x2", score: 94 }),
      linha({ id: "3", execucao_id: "x3", score: 45 }),
    ];
    const r = calcularAltaConfiancaComErro(linhas, [erro("x1"), erro("x3")]);

    expect(r.classificacao).toBe(CLASSIFICACAO_ALTA_CONFIANCA_ERRO);
    expect(r.casos).toBe(1);
    expect(r.mensagensAlta).toBe(2);
    expect(r.taxa).toBe(50);
    expect(r.participacaoNosErros).toBe(50);
    expect(r.scoreMedio).toBe(98);
    expect(r.fontesProvaveis.validadores).toEqual([{ chave: "fonte_oficial", total: 1 }]);
    expect(r.fontesProvaveis.ferramentas).toEqual([{ chave: "catalogo", total: 1 }]);
    expect(r.fontesProvaveis.tiposAtendimento).toEqual([{ chave: "valor", total: 1 }]);
  });

  it("erro de baixa confiança não entra na classificação", () => {
    const r = calcularAltaConfiancaComErro([linha({ execucao_id: "x1", score: 40 })], [erro("x1")]);
    expect(r.casos).toBe(0);
    expect(r.taxa).toBe(0);
  });

  it("sem erros reportados não há caso", () => {
    const r = calcularAltaConfiancaComErro([linha({ execucao_id: "x1", score: 99 })], []);
    expect(r).toMatchObject({ casos: 0, mensagensAlta: 1, taxa: 0, participacaoNosErros: 0 });
  });
});

describe("FASE 8 — calibração por faixa de score", () => {
  const l = (score: number, execucao_id: string): LinhaDecisaoMetrica =>
    linha({ id: execucao_id, execucao_id, score, nivel: null });

  it("agrupa mensagens e erros nas faixas definidas e calcula a taxa", () => {
    const linhas = [l(50, "a"), l(65, "b"), l(75, "c"), l(85, "d"), l(92, "e"), l(97, "f"), l(98, "g")];
    const r = calcularCalibracaoPorFaixaScore(linhas, [erro("a"), erro("e")]);

    expect(r.faixas.map((f) => f.rotulo)).toEqual([
      "0–59%",
      "60–69%",
      "70–79%",
      "80–89%",
      "90–94%",
      "95–100%",
    ]);
    expect(r.faixas.find((f) => f.id === "0-59")).toMatchObject({ mensagens: 1, erros: 1, taxaErro: 100 });
    expect(r.faixas.find((f) => f.id === "90-94")).toMatchObject({ mensagens: 1, erros: 1, taxaErro: 100 });
    expect(r.faixas.find((f) => f.id === "95-100")).toMatchObject({ mensagens: 2, erros: 0, taxaErro: 0 });
    expect(r.faixasComDados).toBe(6);
  });

  it("aponta inversão quando faixa de confiança maior erra mais", () => {
    const r = calcularCalibracaoPorFaixaScore([l(65, "a"), l(97, "b")], [erro("b")]);
    expect(r.monotonica).toBe(false);
    expect(r.inversoes).toEqual([{ de: "60–69%", para: "95–100%", taxaDe: 0, taxaPara: 100 }]);
  });

  it("sem dados suficientes não afirma calibração", () => {
    expect(calcularCalibracaoPorFaixaScore([], []).monotonica).toBeNull();
    expect(calcularCalibracaoPorFaixaScore([l(95, "a")], []).monotonica).toBeNull();
  });
});
