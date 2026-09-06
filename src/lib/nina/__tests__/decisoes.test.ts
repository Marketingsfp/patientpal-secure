/**
 * FASE 5 — decisões humanas: rótulos, separação de responsabilidades,
 * conflito de edição, versões de análise e camada da causa.
 */
import { describe, expect, test } from "bun:test";
import {
  AVISO_ANALISE_NAO_APROVA,
  EXPLICACAO_APROVAR,
  MSG_CONFLITO,
  TIPOS_DECISAO,
  analiseUsouOutroConjunto,
  camadaDaCausa,
  rotuloDecisao,
} from "@/lib/nina/decisoes";
import { registrarDecisao } from "@/lib/nina/decisoes.functions";

function supabaseFake(error: { message: string } | null) {
  const chamadas: Record<string, unknown>[] = [];
  return {
    chamadas,
    client: {
      from: () => ({
        insert: async (linha: Record<string, unknown>) => {
          chamadas.push(linha);
          return { error };
        },
      }),
    },
  };
}

describe("decisões humanas", () => {
  test("confirmar problema, aprovar e aplicar são decisões distintas", () => {
    const valores = TIPOS_DECISAO.map((d) => d.valor);
    expect(valores).toContain("problema_confirmado");
    expect(valores).toContain("aprovado");
    // Aplicar continua fora desta lista: é o fluxo autorizado já existente.
    expect(valores).not.toContain("aplicado");
    expect(EXPLICACAO_APROVAR).toMatch(/não altera o catálogo/i);
  });

  test("a análise por IA nunca aprova sozinha", () => {
    expect(AVISO_ANALISE_NAO_APROVA).toMatch(/não aprova/i);
  });

  test("falso positivo tem rótulo próprio e valor desconhecido não quebra", () => {
    expect(rotuloDecisao("falso_positivo")).toBe("Falso positivo");
    expect(rotuloDecisao("xyz")).toBe("xyz");
    expect(rotuloDecisao(null)).toBe("—");
  });

  test("análise com outro conjunto de evidências é sinalizada, sem nova chamada", () => {
    expect(analiseUsouOutroConjunto({ entradas: 2, etapas: 5 }, { entradas: 3, etapas: 5 })).toBe(
      true,
    );
    expect(analiseUsouOutroConjunto({ entradas: 2, etapas: 5 }, { entradas: 2, etapas: 5 })).toBe(
      false,
    );
    expect(analiseUsouOutroConjunto(null, { entradas: 1, etapas: 1 })).toBe(false);
  });

  test("causa técnica não sugere alterar o catálogo", () => {
    expect(camadaDaCausa("knowledge_error").alvo).toBe("catalogo");
    expect(camadaDaCausa("tool_error").alvo).toBe("tecnico");
    expect(camadaDaCausa(null).alvo).toBe("indefinido");
  });

  test("registro de decisão falha fechada quando a auditoria não grava", async () => {
    const fake = supabaseFake({ message: "rls" });
    await expect(
      registrarDecisao(fake.client, {
        clinicaId: "c",
        feedbackId: "f",
        tipo: "problema_confirmado",
        autor: "u",
      }),
    ).rejects.toThrow(/auditoria/i);
  });

  test("registro de decisão grava autor, tipo e estados", async () => {
    const fake = supabaseFake(null);
    await registrarDecisao(fake.client, {
      clinicaId: "c",
      feedbackId: "f",
      tipo: "aprovado",
      autor: "u1",
      statusAntes: "pending",
      statusDepois: "approved",
    });
    expect(fake.chamadas[0]).toMatchObject({
      tipo: "aprovado",
      autor: "u1",
      status_antes: "pending",
      status_depois: "approved",
    });
  });

  test("mensagem de conflito orienta recarregar", () => {
    expect(MSG_CONFLITO).toMatch(/Recarregue/i);
  });
});
