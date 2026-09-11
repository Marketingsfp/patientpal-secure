import { describe, expect, it } from "bun:test";
import {
  ActionRiskValidator,
  BusinessRulesValidator,
  ConflictValidator,
  CONFIG_PADRAO_VALIDADORES,
  EntityResolutionValidator,
  executarValidadoresDeConfianca,
  IntentClarityValidator,
  OfficialSourceValidator,
  RequiredDataValidator,
  SourceFreshnessValidator,
  ToolIntegrityValidator,
} from "./validators";
import type { ContextoConfianca, ResultadoFerramenta } from "./types";

const negocio = {
  clinicaId: "c1",
  ambiente: "homologacao" as const,
  pacienteIdentificado: false,
  agendamentoConfirmado: false,
  esclarecimentoUsado: false,
  handoffSolicitado: false,
};

const ctx = (over: Partial<ContextoConfianca> = {}): ContextoConfianca => ({
  conversationId: "conv-1",
  messageId: "msg-1",
  requestedAction: "responder_informacao",
  entities: {},
  retrievedSources: [],
  toolResults: [],
  businessContext: negocio,
  ...over,
});

const tool = (o: Partial<ResultadoFerramenta> = {}): ResultadoFerramenta => ({
  nome: "buscar_procedimentos",
  capacidade: "listCatalog",
  fonte: "base_conhecimento",
  success: true,
  temConteudo: true,
  ...o,
});

describe("contrato comum dos validadores", () => {
  it("todo validador devolve validator, status, score, reasonCode e evidence", () => {
    const rs = executarValidadoresDeConfianca({ ctx: ctx() });
    expect(rs.length).toBe(12);
    for (const r of rs) {
      expect(typeof r.validator).toBe("string");
      expect(["PASS", "WARNING", "FAIL", "BLOCK", "NOT_APPLICABLE"]).toContain(r.status);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(typeof r.reasonCode).toBe("string");
      expect(typeof r.evidence).toBe("object");
    }
  });

  it("validador desligado por configuração devolve NOT_APPLICABLE", () => {
    const rs = executarValidadoresDeConfianca({
      ctx: ctx({ requestedAction: "informar_valor" }),
      categorias: ["valor"],
      config: { ...CONFIG_PADRAO_VALIDADORES, OfficialSourceValidator: { ativo: false, peso: 0 } },
    });
    const v = rs.find((r) => r.validator === "OfficialSourceValidator")!;
    expect(v.status).toBe("NOT_APPLICABLE");
    expect(v.reasonCode).toBe("VALIDADOR_DESLIGADO");
  });

  it("erro dentro de um validador não derruba a execução", () => {
    const quebrado = ctx();
    Object.defineProperty(quebrado, "toolResults", {
      get() {
        throw new Error("boom");
      },
    });
    const rs = executarValidadoresDeConfianca({ ctx: quebrado });
    expect(rs.length).toBe(12);
    expect(rs.some((r) => r.reasonCode === "VALIDADOR_FALHOU")).toBe(true);
  });
});

describe("IntentClarityValidator", () => {
  it("reprova quando o runtime marca a intenção como ambígua", () => {
    const r = IntentClarityValidator(ctx({ intentAmbiguo: true }));
    expect(r.status).toBe("FAIL");
    expect(r.reasonCode).toBe("INTENCAO_AMBIGUA");
  });

  it("reprova confiança baixa de intenção", () => {
    const r = IntentClarityValidator(ctx({ intentConfidence: 0.2 }));
    expect(r.status).toBe("FAIL");
  });

  it("avisa em confiança intermediária", () => {
    const r = IntentClarityValidator(ctx({ intentConfidence: 0.6 }));
    expect(r.status).toBe("WARNING");
  });

  it("aprova intenção definida", () => {
    const r = IntentClarityValidator(ctx({ intent: "preco_exame", requestedAction: "informar_valor" }));
    expect(r.status).toBe("PASS");
  });
});

describe("EntityResolutionValidator", () => {
  it("pede esclarecimento quando há vários ultrassons possíveis", () => {
    const r = EntityResolutionValidator(
      ctx({ entityCandidates: { procedimento: ["USG abdome", "USG tireoide", "USG obstétrica"] } }),
    );
    expect(r.status).toBe("FAIL");
    expect(r.reasonCode).toBe("ENTIDADE_AMBIGUA");
  });

  it("aprova quando há candidato único", () => {
    const r = EntityResolutionValidator(ctx({ entityCandidates: { procedimento: ["USG abdome"] } }));
    expect(r.status).toBe("PASS");
  });

  it("não se aplica sem candidatos informados", () => {
    expect(EntityResolutionValidator(ctx()).status).toBe("NOT_APPLICABLE");
  });
});

describe("RequiredDataValidator", () => {
  it("bloqueia escrita com campo faltando", () => {
    const r = RequiredDataValidator(
      ctx({
        requestedAction: "criar_agendamento",
        requiredFields: ["procedimento", "data"],
        entities: { procedimento: "USG", data: "" },
      }),
    );
    expect(r.status).toBe("BLOCK");
    expect(r.blocker).toBe("CAMPO_OBRIGATORIO_AUSENTE");
    expect(r.evidence["faltantes"]).toEqual(["data"]);
  });

  it("não exige campos fora do momento", () => {
    expect(RequiredDataValidator(ctx()).status).toBe("NOT_APPLICABLE");
  });
});

describe("OfficialSourceValidator", () => {
  it("bloqueia preço sem catálogo publicado", () => {
    const r = OfficialSourceValidator(ctx({ requestedAction: "informar_valor" }), ["valor"]);
    expect(r.status).toBe("BLOCK");
    expect(r.blocker).toBe("VALOR_SEM_CATALOGO");
  });

  it("aprova preço com catálogo publicado", () => {
    const r = OfficialSourceValidator(ctx({ toolResults: [tool()] }), ["valor"]);
    expect(r.status).toBe("PASS");
  });

  it("nota interna nunca serve de fonte para o paciente", () => {
    const r = OfficialSourceValidator(
      ctx({ retrievedSources: [{ tipo: "catalogo_publicado", temConteudo: true, publicado: true, interna: true }] }),
      ["preparo"],
    );
    expect(r.blocker).toBe("NOTA_INTERNA_COMO_FONTE");
  });
});

describe("SourceFreshnessValidator", () => {
  it("bloqueia fonte expirada", () => {
    const r = SourceFreshnessValidator(
      ctx({ retrievedSources: [{ tipo: "catalogo_publicado", temConteudo: true, publicado: true, expiraEm: "2020-01-01" }] }),
      new Date("2026-01-01"),
    );
    expect(r.blocker).toBe("FONTE_NAO_VIGENTE");
  });

  it("bloqueia fonte substituída ou desativada", () => {
    expect(
      SourceFreshnessValidator(
        ctx({ retrievedSources: [{ tipo: "catalogo_publicado", temConteudo: true, substituidoPor: "v2" }] }),
      ).status,
    ).toBe("BLOCK");
    expect(
      SourceFreshnessValidator(
        ctx({ retrievedSources: [{ tipo: "catalogo_publicado", temConteudo: true, ativo: false }] }),
      ).status,
    ).toBe("BLOCK");
  });

  it("aprova fonte vigente", () => {
    const r = SourceFreshnessValidator(
      ctx({ retrievedSources: [{ tipo: "catalogo_publicado", temConteudo: true, publicado: true }] }),
    );
    expect(r.status).toBe("PASS");
  });
});

describe("ToolIntegrityValidator", () => {
  it("falha técnica bloqueia e não vira 'não temos'", () => {
    const r = ToolIntegrityValidator(ctx({ toolResults: [tool({ success: false, erro: "timeout" })] }));
    expect(r.status).toBe("BLOCK");
    expect(r.blocker).toBe("FERRAMENTA_FALHOU");
  });

  it("retorno vazio é aviso, não bloqueio", () => {
    const r = ToolIntegrityValidator(ctx({ toolResults: [tool({ temConteudo: false })] }));
    expect(r.status).toBe("WARNING");
  });

  it("sem ferramentas não se aplica", () => {
    expect(ToolIntegrityValidator(ctx()).status).toBe("NOT_APPLICABLE");
  });
});

describe("ConflictValidator", () => {
  it("bloqueia preços divergentes entre origens", () => {
    const r = ConflictValidator(
      ctx({
        conflitos: [
          { campo: "preco_consulta", valores: [{ origem: "catalogo", valor: "150" }, { origem: "legado", valor: "180" }] },
        ],
      }),
    );
    expect(r.blocker).toBe("CONFLITO_DE_FONTE");
  });

  it("origens concordando passam", () => {
    const r = ConflictValidator(
      ctx({
        conflitos: [
          { campo: "preco_consulta", valores: [{ origem: "catalogo", valor: "150" }, { origem: "agenda", valor: "150" }] },
        ],
      }),
    );
    expect(r.status).toBe("PASS");
  });
});

describe("BusinessRulesValidator", () => {
  it("regra que exige humano bloqueia", () => {
    const r = BusinessRulesValidator(
      ctx({ regrasNegocio: [{ id: "procedimento_exige_humano", satisfeita: true, exigeHumano: true }] }),
    );
    expect(r.blocker).toBe("REGRA_EXIGE_HUMANO");
  });

  it("regra determinística não atendida bloqueia", () => {
    const r = BusinessRulesValidator(ctx({ regrasNegocio: [{ id: "agenda_restrita", satisfeita: false }] }));
    expect(r.blocker).toBe("REGRA_DE_NEGOCIO_NAO_ATENDIDA");
  });

  it("sem regras não se aplica", () => {
    expect(BusinessRulesValidator(ctx()).status).toBe("NOT_APPLICABLE");
  });
});

describe("ActionRiskValidator", () => {
  it("classifica risco e exigência por ação", () => {
    expect(ActionRiskValidator(ctx()).evidence["risco"]).toBe("LOW");
    expect(ActionRiskValidator(ctx({ requestedAction: "informar_valor" })).evidence["risco"]).toBe("MEDIUM");
    expect(ActionRiskValidator(ctx({ requestedAction: "informar_horario" })).evidence["risco"]).toBe("HIGH");
    const critico = ActionRiskValidator(ctx({ requestedAction: "criar_agendamento" }));
    expect(critico.evidence["risco"]).toBe("CRITICAL");
    expect(critico.evidence["minimoExigido"]).toBe(90);
  });
});
