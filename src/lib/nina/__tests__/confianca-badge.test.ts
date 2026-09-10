/**
 * FASE 10 — Casos 1 a 6 do indicador de confiança da Inbox interna.
 * Nenhum score é calculado aqui: os testes validam apenas a leitura do
 * snapshot histórico e a classificação HIGH_CONFIDENCE_ERROR.
 */
import { describe, expect, test } from "bun:test";
import {
  combinaFiltroConfianca,
  ehAltaConfiancaComErro,
  rotuloConfianca,
} from "@/lib/nina/confianca-badge";
import type { ConfiancaDaMensagem } from "@/lib/nina/confianca.functions";

function snapshot(over: Partial<ConfiancaDaMensagem>): ConfiancaDaMensagem {
  return {
    execucao_id: "exec-1",
    score: 90,
    nivel: "HIGH",
    resultado: "ALLOW",
    bloqueadores: [],
    registrado_em: "2026-09-01T12:00:00.000Z",
    policy_version: "v1",
    erro_reportado: null,
    alta_confianca_com_erro: false,
    avaliacao: "answer_confidence",
    config_id: "cfg:v5:teste",
    ...over,
  };
}

const erro = {
  id: "err-1",
  status: "aberto",
  categoria: "valor_incorreto",
  created_at: "2026-09-07T18:42:00.000Z",
};

describe("FASE 10 — selo de confiança por mensagem", () => {
  test("Caso 1 — alta confiança correta: 97% Alta, sem marcação de erro", () => {
    const r = rotuloConfianca(snapshot({ score: 97, nivel: "HIGH" }));
    expect(r.avaliada).toBe(true);
    expect(r.texto).toBe("97% Alta");
    expect(r.altaConfiancaComErro).toBe(false);
  });

  test("Caso 2 — alta confiança reportada depois: continua 96% Alta e vira HIGH_CONFIDENCE_ERROR", () => {
    const c = snapshot({ score: 96, nivel: "HIGH", erro_reportado: erro });
    const r = rotuloConfianca(c);
    expect(r.texto).toBe("96% Alta");
    expect(r.score).toBe(96);
    expect(ehAltaConfiancaComErro(c)).toBe(true);
    expect(r.altaConfiancaComErro).toBe(true);
    // Revisão de Aprendizados encontra o caso pelo filtro dedicado.
    expect(combinaFiltroConfianca("alta_erro", c)).toBe(true);
    expect(combinaFiltroConfianca("95", c)).toBe(true);
  });

  test("Caso 3 — média: 82% Média", () => {
    const r = rotuloConfianca(snapshot({ score: 82, nivel: "MEDIUM" }));
    expect(r.texto).toBe("82% Média");
    expect(r.altaConfiancaComErro).toBe(false);
  });

  test("Caso 4 — baixa: 63% Baixa", () => {
    const c = snapshot({ score: 63, nivel: "LOW", erro_reportado: erro });
    const r = rotuloConfianca(c);
    expect(r.texto).toBe("63% Baixa");
    // Erro em confiança baixa NÃO é HIGH_CONFIDENCE_ERROR.
    expect(ehAltaConfiancaComErro(c)).toBe(false);
    expect(combinaFiltroConfianca("alta_erro", c)).toBe(false);
  });

  test("Caso 5 — mensagem histórica sem snapshot: Não avaliada, sem score artificial", () => {
    for (const vazio of [null, undefined]) {
      const r = rotuloConfianca(vazio);
      expect(r.avaliada).toBe(false);
      expect(r.texto).toBe("Não avaliada");
      expect(r.score).toBeNull();
      expect(r.nivel).toBeNull();
      expect(r.policyVersion).toBeNull();
      expect(combinaFiltroConfianca("sem", vazio)).toBe(true);
      expect(combinaFiltroConfianca("HIGH", vazio)).toBe(false);
      expect(combinaFiltroConfianca("90", vazio)).toBe(false);
    }
  });

  test("Caso 6 — política alterada depois: mensagem histórica mantém 94% e Policy v1", () => {
    const historica = snapshot({ score: 94, nivel: "HIGH", policy_version: "v1" });
    const r = rotuloConfianca(historica);
    expect(r.texto).toBe("94% Alta");
    expect(r.policyVersion).toBe("v1");

    // Uma resposta nova sob a política v2 não altera a leitura da antiga.
    const nova = snapshot({ execucao_id: "exec-2", score: 88, nivel: "MEDIUM", policy_version: "v2" });
    expect(rotuloConfianca(nova).policyVersion).toBe("v2");
    expect(rotuloConfianca(historica).texto).toBe("94% Alta");
    expect(rotuloConfianca(historica).policyVersion).toBe("v1");
  });

  test("filtros por nível e por corte percentual usam apenas o snapshot", () => {
    const alta = snapshot({ score: 97, nivel: "HIGH" });
    const media = snapshot({ score: 82, nivel: "MEDIUM" });
    expect(combinaFiltroConfianca("todas", null)).toBe(true);
    expect(combinaFiltroConfianca("HIGH", alta)).toBe(true);
    expect(combinaFiltroConfianca("HIGH", media)).toBe(false);
    expect(combinaFiltroConfianca("90", media)).toBe(false);
    expect(combinaFiltroConfianca("95", snapshot({ score: 94, nivel: "HIGH" }))).toBe(false);
  });
});
