/**
 * FASE 5 — contagens e limites das evidências. Módulo puro.
 */
import { describe, expect, it } from "bun:test";
import {
  limitesDaCaptura,
  resumirEntradasDoModelo,
  resumirFerramentas,
  TEXTO_NAO_REGISTRADO,
  valorOuNaoRegistrado,
} from "./evidencias-resumo";

describe("resumirEntradasDoModelo", () => {
  it("uma mensagem recebida e duas entradas user: duplicação preservada e apontada", () => {
    const r = resumirEntradasDoModelo({
      dados: {
        mensagens: [
          { role: "system", content: "instruções" },
          { role: "user", content: "TESTE-ARQUITETURA-9381" },
          { role: "user", content: "TESTE-ARQUITETURA-9381" },
        ],
      },
    });
    expect(r.total).toBe(3);
    expect(r.user).toBe(2);
    expect(r.duplicados).toEqual([{ conteudo: "TESTE-ARQUITETURA-9381", vezes: 2 }]);
    expect(r.texto).toContain("2 do paciente (user)");
    expect(r.texto).toContain("duplicação preservada");
  });

  it("sem etapa registrada não presume zero", () => {
    const r = resumirEntradasDoModelo(null);
    expect(r.total).toBeNull();
    expect(r.user).toBeNull();
    expect(r.texto).toBe(TEXTO_NAO_REGISTRADO);
  });

  it("entradas sem repetição não apontam duplicação", () => {
    const r = resumirEntradasDoModelo({
      dados: { mensagens: [{ role: "user", content: "oi" }] },
    });
    expect(r.duplicados).toHaveLength(0);
    expect(r.texto).not.toContain("repetidas");
  });
});

describe("resumirFerramentas", () => {
  it("ferramentas disponíveis sem chamadas", () => {
    const r = resumirFerramentas(
      { dados: { ferramentas_disponiveis: ["agendar", "solicitar_atendente_humano"] } },
      { dados: { tool_calls: [] } },
    );
    expect(r.disponiveis).toHaveLength(2);
    expect(r.chamadas).toEqual([]);
    expect(r.texto).toContain("Disponíveis (2)");
    expect(r.texto).toContain("Chamadas pelo modelo: nenhuma");
  });

  it("metadados ausentes não viram afirmação de não uso", () => {
    const r = resumirFerramentas({ dados: { ferramentas_disponiveis: ["agendar"] } }, null);
    expect(r.chamadas).toBeNull();
    expect(r.texto).toContain(`Chamadas pelo modelo: ${TEXTO_NAO_REGISTRADO}`);
    expect(r.texto).toContain("não comprova");
  });

  it("chamada registrada aparece pelo nome", () => {
    const r = resumirFerramentas(
      { dados: { ferramentas_disponiveis: [] } },
      { dados: { tool_calls: [{ nome: "agendar" }] } },
    );
    expect(r.chamadas).toEqual(["agendar"]);
    expect(r.texto).toContain("nenhuma declarada nesta requisição");
  });
});

describe("valorOuNaoRegistrado", () => {
  it("vazio, nulo e lista vazia são Não registrado", () => {
    expect(valorOuNaoRegistrado(null)).toBe(TEXTO_NAO_REGISTRADO);
    expect(valorOuNaoRegistrado("")).toBe(TEXTO_NAO_REGISTRADO);
    expect(valorOuNaoRegistrado([])).toBe(TEXTO_NAO_REGISTRADO);
    expect(valorOuNaoRegistrado("ok")).toBe("ok");
  });
});

describe("limitesDaCaptura", () => {
  const etapa = (tipo: string, dados: Record<string, unknown>) =>
    ({ tipo, dados }) as never;

  it("nunca declara requisição completa", () => {
    const r = limitesDaCaptura([
      etapa("contexto_modelo", { mensagens: [] }),
      etapa("modelo_parametros", {}),
      etapa("resposta_original", {}),
    ]);
    expect(r.completa).toBe(false);
    expect(r.descricao).toContain("Captura parcial");
    expect(r.truncada).toBe(false);
  });

  it("corte em camada posterior aparece como truncamento", () => {
    const r = limitesDaCaptura([
      etapa("contexto_modelo", { mensagens: [{ role: "user", content: "abc…[truncado]" }] }),
    ]);
    expect(r.truncada).toBe(true);
    expect(r.descricao).toContain("truncado");
  });

  it("sanitização é declarada", () => {
    const r = limitesDaCaptura([etapa("contexto_modelo", { mensagens: "[redigido]" })]);
    expect(r.sanitizada).toBe(true);
    expect(r.descricao).toContain("sanitizado");
  });

  it("registro histórico incompleto lista as etapas ausentes", () => {
    const r = limitesDaCaptura([etapa("modelo_parametros", {})]);
    expect(r.camposOmitidos).toEqual(["contexto_modelo", "resposta_original"]);
    expect(r.descricao).toContain("etapas ausentes");
  });
});
