import { describe, expect, it } from "bun:test";
import {
  categoriaDoAchado,
  CATEGORIA_PADRAO_ACHADO,
  correcaoDoAchado,
  evidenciaDoAchado,
  motivoBloqueioRegressao,
  podeVirarRegressao,
  prioridadeDoAchado,
  rascunhoCenarioRegressao,
  rootCauseDoAchado,
  type ContextoAchado,
} from "@/lib/nina/revisao-teste";

const achado = {
  mensagem: "Temos horário às 14h",
  observado: "A Nina ofereceu um horário que a agenda não retornou",
  esperado: "Oferecer somente horários retornados pela agenda",
  fonte: "ferramenta buscar_horarios",
  componente: "Agenda",
  confianca: "alta" as const,
  gravidade: "alta" as const,
  dimensao: "precisao" as never,
};

const ctx: ContextoAchado = {
  testeTipo: "terra",
  testeExecucaoId: null,
  cenarioTexto: "Agendar cardiologista",
  cenarioId: null,
  leadIndice: 2,
  conversaId: "c1",
  avaliacaoId: "a1",
  avaliacaoResultado: "reprovado",
  avaliacaoScore: 86,
  avaliacaoResumo: "Horário inexistente",
  modeloAvaliador: "sol",
  promptVersao: 3,
  promptVersaoId: "p3",
  traceIds: ["t1"],
  mensagemPaciente: "Quero marcar cardiologista",
  respostaNina: "Temos horário às 14h",
  mensagemId: "m1",
  fontes: ["catálogo"],
  toolCalls: [{ ferramenta: "buscar_horarios", ok: true }],
};

describe("classificação do achado", () => {
  it("mapeia agenda para horário incorreto", () => {
    expect(categoriaDoAchado(achado)).toBe("horario_incorreto");
  });

  it("cai em categoria neutra quando não há pista", () => {
    expect(
      categoriaDoAchado({ componente: "algo novo", observado: "xyz", dimensao: null }),
    ).toBe(CATEGORIA_PADRAO_ACHADO);
  });

  it("traduz gravidade em prioridade", () => {
    expect(prioridadeDoAchado("critica")).toBe("critico");
    expect(prioridadeDoAchado("alta")).toBe("alto");
    expect(prioridadeDoAchado("baixa")).toBe("normal");
  });

  it("sugere causa provável", () => {
    expect(rootCauseDoAchado(achado)).toBe("tool_error");
  });
});

describe("evidência do item de revisão", () => {
  it("guarda execução, avaliação, trace, prompt, fontes e tools", () => {
    const e = evidenciaDoAchado(achado, ctx, 0);
    expect(e.achado_indice).toBe(0);
    expect(e.teste.lead_indice).toBe(2);
    expect(e.avaliacao.id).toBe("a1");
    expect(e.trace_ids).toEqual(["t1"]);
    expect(e.prompt.versao).toBe(3);
    expect(e.tool_calls[0].ferramenta).toBe("buscar_horarios");
    expect(e.classificacao.categoria).toBe("horario_incorreto");
  });

  it("usa o esperado como correção", () => {
    expect(correcaoDoAchado(achado)).toContain("somente horários");
  });
});

describe("regressão só depois de decisão humana", () => {
  it("bloqueia item pendente", () => {
    expect(podeVirarRegressao({ status: "pending" })).toBe(false);
    expect(motivoBloqueioRegressao({ status: "pending" })).toContain("Confirme o problema");
  });

  it("libera erro confirmado ou aprovado", () => {
    expect(podeVirarRegressao({ decisao_humana: "problema_confirmado" })).toBe(true);
    expect(podeVirarRegressao({ status: "approved" })).toBe(true);
    expect(motivoBloqueioRegressao({ status: "applied" })).toBeNull();
  });

  it("explica falso positivo", () => {
    expect(motivoBloqueioRegressao({ decisao_humana: "falso_positivo" })).toContain(
      "falso positivo",
    );
  });

  it("monta rascunho verificável sem inventar critério", () => {
    const r = rascunhoCenarioRegressao({
      mensagemPaciente: "Quero marcar cardiologista",
      achado,
      cenarioTexto: "Agendar cardiologista",
      toolCalls: [{ ferramenta: "buscar_horarios" }],
    });
    expect(r.categoria).toBe("regressao");
    expect(r.nome).toContain("Regressão");
    expect(r.criterios).toContainEqual({ tipo: "sem_erro" });
    expect(r.criterios).toContainEqual({ tipo: "usou_ferramenta", valor: "buscar_horarios" });
    expect(r.dadosSinteticos).toEqual({ primeira_mensagem: "Quero marcar cardiologista" });
  });
});
