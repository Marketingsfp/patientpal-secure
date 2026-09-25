/**
 * Visão simples "Como a Nina atende": fiel ao mapa técnico e sem jargão.
 */
import { describe, expect, test } from "bun:test";
import { NODES_ARQUITETURA, nodePorId } from "../manifesto";
import {
  ETAPAS_VISAO_SIMPLES,
  NOTA_HOMOLOGACAO_VISAO_SIMPLES,
  SAIDAS_VISAO_SIMPLES,
} from "../visao-simples";

const itens = [...ETAPAS_VISAO_SIMPLES, ...SAIDAS_VISAO_SIMPLES];

describe("visão simples da Nina", () => {
  test("tem 7 etapas e 3 saídas, com identificadores únicos", () => {
    expect(ETAPAS_VISAO_SIMPLES).toHaveLength(7);
    expect(SAIDAS_VISAO_SIMPLES).toHaveLength(3);
    const ids = itens.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("cada saída sai de uma etapa que existe", () => {
    const etapas = new Set(ETAPAS_VISAO_SIMPLES.map((e) => e.id));
    for (const saida of SAIDAS_VISAO_SIMPLES) expect(etapas.has(saida.depoisDe), saida.id).toBe(true);
  });

  test("só aponta para caixas que existem no mapa técnico", () => {
    for (const item of itens)
      for (const id of item.componentes) expect(nodePorId(id), `${item.id}: ${id}`).toBeDefined();
  });

  test("toda caixa do atendimento real aparece no resumo", () => {
    const cobertas = new Set(itens.flatMap((i) => i.componentes));
    const atendimentoReal = NODES_ARQUITETURA.filter(
      (n) => n.categoria !== "HOMOLOGACAO" && !n.id.startsWith("voice."),
    );
    for (const node of atendimentoReal) expect(cobertas.has(node.id), node.id).toBe(true);
  });

  test("usa linguagem simples: resumo curto e sem jargão técnico", () => {
    const jargao =
      /\b(webhook|gateway|prompt|trace|runtime|watchdog|hmac|llm|payload|broker|endpoint|flag)\b/i;
    for (const item of itens) {
      expect(item.resumo.split(/\s+/).length, item.id).toBeLessThanOrEqual(5);
      for (const texto of [item.titulo, item.resumo, ...item.explicacao])
        expect(jargao.test(texto), `${item.id}: ${texto}`).toBe(false);
    }
    expect(jargao.test(NOTA_HOMOLOGACAO_VISAO_SIMPLES)).toBe(false);
  });
});
