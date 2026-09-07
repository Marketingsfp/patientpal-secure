import { describe, expect, it } from "bun:test";
import {
  linhasConfiabilidade,
  montarRegistroAuditoria,
  resultadoFinalDa,
  sanearEvidencia,
} from "./auditoria";
import type { ResultadoConfianca } from "./types";

const base: ResultadoConfianca = {
  score: 94,
  level: "HIGH",
  decision: "ALLOW",
  blockers: [],
  hardBlockers: [],
  checks: [],
  validators: [
    {
      validator: "OfficialSourceValidator",
      status: "PASS",
      score: 100,
      reasonCode: "FONTE_OFICIAL_OK",
      evidence: { fonte: "procedimento #873", publicado: true },
    },
    {
      validator: "ToolIntegrityValidator",
      status: "FAIL",
      score: 0,
      reasonCode: "AGENDA_INDISPONIVEL",
      evidence: { ferramenta: "consultar_disponibilidade" },
    },
  ],
  evidence: {
    categorias: ["valor"],
    fontesUteis: 1,
    fontesPublicadas: 1,
    ferramentasExecutadas: 1,
    ferramentasComFalha: 1,
    camposFaltantes: [],
    motivos: ["agenda não confirmada"],
  },
};

describe("auditoria da confiabilidade", () => {
  it("registra os campos exigidos pela Fase 5", () => {
    const r = montarRegistroAuditoria(base, {
      conversationId: "c1",
      messageId: "wamid.1",
      intencao: "preco",
      acaoSolicitada: "informar_valor",
      ferramentas: [
        { nome: "buscar_procedimentos", capacidade: "searchKnowledgeBase", fonte: "catalogo", success: true },
        { nome: "consultar_disponibilidade", capacidade: "checkAvailability", fonte: "agenda", success: false, erro: "timeout" },
      ],
      fontes: [{ tipo: "catalogo_publicado", referencia: "873", publicado: true, temConteudo: true }],
    });

    expect(r.conversationId).toBe("c1");
    expect(r.messageId).toBe("wamid.1");
    expect(r.intencao).toBe("preco");
    expect(r.acaoSolicitada).toBe("informar_valor");
    expect(r.score).toBe(94);
    expect(r.nivel).toBe("HIGH");
    expect(r.decisao).toBe("ALLOW");
    expect(r.validadores).toHaveLength(2);
    expect(r.reasonCodes).toEqual(["AGENDA_INDISPONIVEL"]);
    expect(r.ferramentas[1]?.sucesso).toBe(false);
    expect(r.fontes[0]?.publicado).toBe(true);
    expect(r.resultadoFinal).toBe("resposta_liberada");
    expect(typeof r.timestamp).toBe("string");
  });

  it("não registra rascunho, prompt nem raciocínio do modelo", () => {
    const limpo = sanearEvidencia({
      fonte: "procedimento #873",
      draftText: "vou responder que custa R$150",
      raciocinio: "a IA pensou que provavelmente...",
      prompt: "instruções",
      historico: ["oi"],
      publicado: true,
    });
    expect(limpo).toEqual({ fonte: "procedimento #873", publicado: true });
  });

  it("descarta texto longo e objetos aninhados", () => {
    const limpo = sanearEvidencia({ nota: "x".repeat(500), objeto: { a: 1 }, n: 3 });
    expect(limpo).toEqual({ n: 3 });
  });

  it("traduz a decisão em resultado final", () => {
    expect(resultadoFinalDa("ALLOW")).toBe("resposta_liberada");
    expect(resultadoFinalDa("CLARIFY")).toBe("pergunta_de_esclarecimento");
    expect(resultadoFinalDa("HANDOFF")).toBe("transferido_para_humano");
    expect(resultadoFinalDa("BLOCK_ACTION")).toBe("acao_bloqueada");
  });

  it("gera linhas ✓/✕ legíveis para o painel", () => {
    const r = montarRegistroAuditoria(base, {
      ferramentas: [{ nome: "consultar_disponibilidade", success: false, erro: "timeout" }],
      fontes: [{ tipo: "catalogo_publicado", referencia: "873", publicado: true, temConteudo: true }],
    });
    const linhas = linhasConfiabilidade(r);
    const oficial = linhas.find((l) => l.rotulo === "Fonte oficial encontrada");
    const agenda = linhas.find((l) => l.rotulo.startsWith("Consulta:"));
    expect(oficial?.ok).toBe(true);
    expect(agenda?.ok).toBe(false);
    expect(agenda?.detalhe).toBe("timeout");
    expect(linhas.some((l) => l.rotulo.startsWith("Fonte: catalogo_publicado"))).toBe(true);
  });

  it("mantém os bloqueadores encontrados", () => {
    const r = montarRegistroAuditoria(
      { ...base, decision: "HANDOFF", hardBlockers: ["SOURCE_CONFLICT"], blockers: ["CONFLITO_DE_FONTE"] },
      {},
    );
    expect(r.bloqueadores).toContain("SOURCE_CONFLICT");
    expect(r.resultadoFinal).toBe("transferido_para_humano");
  });
});
