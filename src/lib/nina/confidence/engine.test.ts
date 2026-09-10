import { describe, expect, it } from "bun:test";
import { decidirConfianca } from "./engine";
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

describe("contrato do motor", () => {
  it("devolve score, nível, decisão, bloqueadores, checks e evidências", () => {
    const r = decidirConfianca(ctx({ draftText: "Oi! Como posso ajudar?" }));
    expect(r.score).toBe(100);
    expect(r.level).toBe("HIGH");
    expect(r.decision).toBe("ALLOW");
    expect(r.blockers).toEqual([]);
    expect(r.checks.length).toBeGreaterThan(0);
    expect(r.evidence.motivos.length).toBeGreaterThan(0);
  });

  it("funciona sem rascunho de texto, apenas pela ação pretendida", () => {
    const r = decidirConfianca(ctx({ requestedAction: "informar_valor" }));
    expect(r.blockers).toContain("VALOR_SEM_CATALOGO");
    expect(r.decision).toBe("HANDOFF");
  });
});

describe("bloqueadores absolutos", () => {
  it("valor sem catálogo publicado", () => {
    const r = decidirConfianca(ctx({ draftText: "O exame custa R$ 250" }));
    expect(r.blockers).toContain("VALOR_SEM_CATALOGO");
    expect(r.score).toBe(0);
    expect(r.level).toBe("LOW");
  });

  it("valor com catálogo publicado é liberado", () => {
    const r = decidirConfianca(
      ctx({
        draftText: "O exame custa R$ 250",
        toolResults: [tool()],
        // FASE 2 — o preço afirmado precisa bater com o preço recuperado.
        fatos: [
          {
            consulta: "buscar_procedimentos",
            capacidade: "listCatalog",
            entidade: "procedimento",
            campo: "preco",
            valor: "R$ 250,00",
            fonte: "catalogo_publicado",
          },
        ],
      }),
    );
    expect(r.blockers).toEqual([]);
    expect(r.decision).toBe("ALLOW");
  });

  it("consulta ao catálogo que não achou nada não vale como fonte", () => {
    const r = decidirConfianca(
      ctx({ draftText: "O exame custa R$ 250", toolResults: [tool({ temConteudo: false })] }),
    );
    expect(r.blockers).toContain("VALOR_SEM_CATALOGO");
  });

  it("ferramenta que falhou bloqueia mesmo em resposta simples", () => {
    const r = decidirConfianca(
      ctx({ draftText: "Claro!", toolResults: [tool({ success: false, erro: "timeout" })] }),
    );
    expect(r.blockers).toContain("FERRAMENTA_FALHOU");
    expect(r.decision).toBe("HANDOFF");
  });

  it("escrita bloqueada devolve BLOCK_ACTION, não HANDOFF", () => {
    const r = decidirConfianca(ctx({ requestedAction: "criar_agendamento" }));
    expect(r.blockers).toContain("AGENDA_SEM_CONFIRMACAO");
    expect(r.decision).toBe("BLOCK_ACTION");
  });

  it("campo obrigatório ausente bloqueia a ação", () => {
    const r = decidirConfianca(
      ctx({
        requestedAction: "criar_agendamento",
        requiredFields: ["procedimento", "data"],
        entities: { procedimento: "USG", data: "" },
        businessContext: { ...negocio, agendamentoConfirmado: true },
      }),
    );
    expect(r.blockers).toContain("CAMPO_OBRIGATORIO_AUSENTE");
    expect(r.evidence.camposFaltantes).toEqual(["data"]);
  });

  it("preparo sem fonte publicada bloqueia", () => {
    const r = decidirConfianca(ctx({ draftText: "Faça jejum de 8 horas" }));
    expect(r.blockers).toContain("PREPARO_SEM_FONTE");
  });

  it("fonte recuperada publicada substitui a tool do catálogo", () => {
    const r = decidirConfianca(
      ctx({
        draftText: "Faça jejum de 8 horas",
        toolResults: [tool({ capacidade: "searchKnowledgeBase" })],
        retrievedSources: [{ tipo: "catalogo_publicado", temConteudo: true, publicado: true }],
      }),
    );
    expect(r.blockers).toEqual([]);
  });

  it("rascunho no catálogo não conta como fonte", () => {
    const r = decidirConfianca(
      ctx({
        draftText: "Faça jejum de 8 horas",
        retrievedSources: [{ tipo: "catalogo_publicado", temConteudo: true, publicado: false }],
      }),
    );
    expect(r.blockers).toContain("PREPARO_SEM_FONTE");
  });
});

describe("níveis e decisões graduais", () => {
  it("dado do paciente sem identificação vira CLARIFY", () => {
    const r = decidirConfianca(
      ctx({
        draftText: "Seu cadastro está atualizado",
        toolResults: [tool({ nome: "identificar_paciente", capacidade: "getPatient", fonte: "crm" })],
      }),
    );
    expect(r.level).toBe("MEDIUM");
    expect(r.decision).toBe("CLARIFY");
  });

  it("esclarecimento já usado vira HANDOFF", () => {
    const r = decidirConfianca(
      ctx({
        draftText: "Seu cadastro está atualizado",
        toolResults: [tool({ nome: "identificar_paciente", capacidade: "getPatient", fonte: "crm" })],
        businessContext: { ...negocio, esclarecimentoUsado: true },
      }),
    );
    expect(r.decision).toBe("HANDOFF");
  });

  it("handoff sem bloqueios é respeitado", () => {
    const r = decidirConfianca(
      ctx({
        draftText: "Vou transferir você para uma atendente.",
        requestedAction: "transferir_humano",
        businessContext: { ...negocio, handoffSolicitado: true },
      }),
    );
    expect(r.decision).toBe("ALLOW");
    expect(r.blockers).toEqual([]);
  });

  it("FASE 4 — handoff NÃO apaga bloqueio de fonte oficial", () => {
    const r = decidirConfianca(
      ctx({
        draftText: "O exame custa R$ 250",
        businessContext: { ...negocio, handoffSolicitado: true },
      }),
    );
    expect(r.blockers).toContain("VALOR_SEM_CATALOGO");
    expect(r.score).toBeLessThan(90);
  });

  it("resposta vazia cai para LOW e transfere", () => {
    const r = decidirConfianca(ctx({ draftText: "   " }));
    expect(r.level).toBe("LOW");
    expect(r.decision).toBe("HANDOFF");
  });
});
