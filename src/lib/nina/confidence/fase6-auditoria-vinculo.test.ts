/**
 * FASE 6 — gate de saída: vínculo, auditabilidade e calibração.
 *
 * Nenhum teste aqui envia mensagem, cria agendamento ou toca produção.
 */
import { describe, expect, it } from "bun:test";
import { extrairConflitos, sanearEvidencia } from "./auditoria";
import { rotuloConfianca, scoreExibido, TETO_VISUAL_GERATIVO } from "../confianca-badge";
import {
  calcularCalibracaoPorFaixa,
  calcularTaxaErroAltaConfianca,
  foiReportadaComoErro,
  indexarErros,
  type ErroReportado,
  type LinhaDecisaoMetrica,
} from "./metricas";

const linha = (p: Partial<LinhaDecisaoMetrica>): LinhaDecisaoMetrica => ({
  id: "d1",
  created_at: "2026-09-10T12:00:00.000Z",
  ambiente: "producao",
  conversation_id: "conv-1",
  execucao_id: null,
  message_id: null,
  score: 95,
  nivel: "HIGH",
  decisao: "ALLOW",
  acao: null,
  intencao: null,
  categorias: [],
  bloqueadores: [],
  reason_codes: [],
  validadores: [],
  ferramentas: [],
  data_local: "2026-09-10",
  dia_semana: 4,
  periodo: "dentro" as LinhaDecisaoMetrica["periodo"],
  ...p,
});

const erro = (p: Partial<ErroReportado>): ErroReportado => ({
  id: "e1",
  conversa_id: "conv-1",
  created_at: "2026-09-10T12:05:00.000Z",
  categoria: null,
  ...p,
});

describe("FASE 6 — conflito auditável", () => {
  it("preserva campo, origem A/valor A e origem B/valor B", () => {
    const c = extrairConflitos({
      conflitos: [
        {
          campo: "valor",
          valores: [
            { origem: "catálogo publicado", valor: "R$ 150" },
            { origem: "agenda", valor: "R$ 180" },
          ],
        },
      ],
    });
    expect(c).toHaveLength(1);
    expect(c[0]!.campo).toBe("valor");
    expect(c[0]!.origens).toEqual([
      { origem: "catálogo publicado", valor: "R$ 150" },
      { origem: "agenda", valor: "R$ 180" },
    ]);
  });

  it("remove dado pessoal do valor conflitante", () => {
    const c = extrairConflitos({
      conflitos: [
        { campo: "contato", valores: [{ origem: "cadastro", valor: "joao@ex.com" }] },
      ],
    });
    expect(c[0]!.origens[0]!.valor).toBe("[email]");
  });

  it("não deixa texto livre longo entrar na evidência simples", () => {
    expect(sanearEvidencia({ nota: "x".repeat(500) })).toEqual({});
  });
});

describe("FASE 6 — score exibido", () => {
  it("limita a exibição gerativa a 99%", () => {
    expect(TETO_VISUAL_GERATIVO).toBe(99);
    expect(scoreExibido(100)).toBe(99);
    expect(scoreExibido(74)).toBe(74);
  });

  it("mensagem sem snapshot é Não avaliada, nunca 100%", () => {
    const r = rotuloConfianca(null);
    expect(r.avaliada).toBe(false);
    expect(r.texto).toBe("Resposta não avaliada");
    expect(r.score).toBeNull();
  });
});

describe("FASE 6 — calibração não contamina a conversa", () => {
  it("erro com mensagem exata só marca aquela mensagem", () => {
    const idx = indexarErros([erro({ mensagem_id: "m1" })]);
    expect(foiReportadaComoErro(linha({ message_id: "m1" }), idx)).toBe(true);
    expect(foiReportadaComoErro(linha({ message_id: "m2" }), idx)).toBe(false);
  });

  it("erro com execução exata não atinge outra resposta da mesma conversa", () => {
    const idx = indexarErros([erro({ execucao_id: "x1" })]);
    expect(foiReportadaComoErro(linha({ execucao_id: "x1" }), idx)).toBe(true);
    expect(foiReportadaComoErro(linha({ execucao_id: "x2" }), idx)).toBe(false);
  });

  it("reporte legado sem mensagem e sem execução ainda usa a conversa", () => {
    const idx = indexarErros([erro({})]);
    expect(foiReportadaComoErro(linha({}), idx)).toBe(true);
  });
});

describe("FASE 6 — métricas por faixa", () => {
  it("mede erro em alta confiança", () => {
    const r = calcularTaxaErroAltaConfianca(
      [linha({ message_id: "m1" }), linha({ id: "d2", message_id: "m2" })],
      [erro({ mensagem_id: "m1" })],
    );
    expect(r).toEqual({ mensagens: 2, erros: 1, taxa: 50 });
  });

  it("compara previsto e observado nas faixas pedidas", () => {
    const faixas = calcularCalibracaoPorFaixa(
      [
        linha({ score: 95, message_id: "m1" }),
        linha({ id: "d2", score: 80, nivel: "MEDIUM", message_id: "m2" }),
        linha({ id: "d3", score: 60, nivel: "MEDIUM", message_id: "m3" }),
        linha({ id: "d4", score: 20, nivel: "LOW", message_id: "m4" }),
      ],
      [erro({ mensagem_id: "m1" })],
    );
    expect(faixas.map((f) => f.id)).toEqual(["90-99", "75-89", "50-74", "0-49"]);
    const alta = faixas[0]!;
    expect(alta.mensagens).toBe(1);
    expect(alta.erros).toBe(1);
    expect(alta.acertoObservado).toBe(0);
    expect(alta.desvio).toBeLessThan(0);
    expect(faixas[1]!.acertoObservado).toBe(100);
  });
});
