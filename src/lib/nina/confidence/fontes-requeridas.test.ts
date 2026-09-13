import { describe, expect, it } from "bun:test";
import { decidirConfianca } from "./engine";
import { OfficialSourceValidator } from "./validators";
import { fontesPresentes, requisitosDeFonte } from "./fontes-requeridas";
import type { ContextoConfianca } from "./types";

function contexto(extras: Partial<ContextoConfianca> = {}): ContextoConfianca {
  return {
    requestedAction: null,
    tipoAvaliacao: "answer_confidence",
    intent: "informacao",
    turnType: "INFORMACAO",
    fatos: [],
    consultas: [],
    toolResults: [],
    retrievedSources: [],
    businessContext: {
      ambiente: "homologacao",
      pacienteIdentificado: false,
      agendamentoConfirmado: false,
      esclarecimentoUsado: false,
      handoffSolicitado: false,
    },
    ...extras,
  };
}
const catalogo = { tipo: "catalogo_publicado" as const, temConteudo: true, publicado: true };
const agenda = { tipo: "agenda" as const, temConteudo: true, publicado: true };
const selecaoMedico =
  "O Dr. Carlos Silva atende quartas e sextas às 13h, quintas e sábados às 08h. Você prefere cardiologia geral ou infantil?";

describe("fonte exigida por afirmação", () => {
  it("profissional e escala sem fonte não são classificados como contradição de agenda", () => {
    const c = contexto({
      draftText: selecaoMedico,
      mensagemPaciente: "Vou fazer com o Dr. Carlos",
    });
    const requisitos = requisitosDeFonte(c);
    expect(requisitos).toHaveLength(5);
    expect(requisitos.every((r) => r.fonte === "catalogo_publicado")).toBe(true);
    expect(
      requisitos
        .filter((r) => r.tipoClaim === "escala")
        .every((r) => r.chave?.medicoNome === "Carlos Silva"),
    ).toBe(true);
    const r = decidirConfianca(c);
    expect(r.hardBlockers).toContain("MISSING_REQUIRED_OFFICIAL_SOURCE");
    expect(r.hardBlockers).not.toContain("INCONSISTENT_SCHEDULE");
    expect(r.decision).not.toBe("ALLOW");
  });

  it.each([
    "Dr. Carlos Silva atende aqui.",
    "Dr. Carlos Silva atende segunda às 09h.",
    "Cardiologia custa R$ 120,00 no dinheiro.",
  ])("agenda não substitui catálogo: %s", (draftText) => {
    const r = OfficialSourceValidator(contexto({ draftText, retrievedSources: [agenda] }));
    expect(r.status).toBe("BLOCK");
    expect(r.reasonCode).toBe("FONTE_OFICIAL_AUSENTE");
  });

  it("catálogo não prova uma vaga mesmo que a escala esteja publicada", () => {
    const c = contexto({
      draftText: "Temos vaga amanhã às 10h com Dr. Carlos Silva.",
      retrievedSources: [catalogo],
    });
    expect(requisitosDeFonte(c).some((r) => r.fonte === "agenda")).toBe(true);
    expect(OfficialSourceValidator(c).status).toBe("BLOCK");
  });

  it("os dois canais são necessários quando a resposta contém profissional e vaga", () => {
    const c = contexto({
      draftText: "Temos vaga amanhã às 10h com Dr. Carlos Silva.",
      retrievedSources: [catalogo, agenda],
    });
    expect(OfficialSourceValidator(c).status).toBe("PASS");
    // Presença dos canais não aprova conteúdo sem fatos concretos.
    expect(decidirConfianca(c).decision).not.toBe("ALLOW");
  });

  it("uma pergunta para consultar disponibilidade não afirma vaga", () => {
    const c = contexto({ draftText: "Gostaria que eu verificasse as vagas disponíveis?" });
    expect(requisitosDeFonte(c)).toEqual([]);
    expect(OfficialSourceValidator(c).status).toBe("NOT_APPLICABLE");
  });

  it("catálogo reidratado com fatos reais dispensa repetir a chamada ao modelo/ferramenta", () => {
    const c = contexto({
      draftText: "Dr. Carlos Silva atende aqui.",
      retrievedSources: [catalogo],
      fatos: [
        {
          consulta: "consulta-publicada-anterior",
          capacidade: "searchKnowledgeBase",
          entidade: "profissional",
          campo: "nome",
          valor: "Carlos Silva",
          fonte: "catalogo_publicado",
          registro: "medico-teste",
          versao: "v-publicada",
          chave: { medicoNome: "Carlos Silva" },
        },
      ],
      consultas: [
        {
          id: "consulta-publicada-anterior",
          consulta: "catalogo",
          capacidade: "searchKnowledgeBase",
          status: "com_itens",
          tentativas: 1,
          falhasAnteriores: [],
        },
      ],
    });
    expect(OfficialSourceValidator(c).status).toBe("PASS");
    const r = decidirConfianca(c);
    expect(r.hardBlockers).not.toContain("MISSING_REQUIRED_OFFICIAL_SOURCE");
    expect(r.hardBlockers).not.toContain("INCONSISTENT_SCHEDULE");
    expect(r.claims?.semEvidencia).toHaveLength(0);
  });

  it("texto da assistente no histórico não cria fonte oficial", () => {
    const c = contexto({
      draftText: selecaoMedico,
      evidenciasFluxo: {
        registroFerramentasCompleto: true,
        historicoCompleto: true,
        sessionId: "sessao-teste",
        historico: [{ role: "assistant", content: selecaoMedico }],
      },
    });
    expect(fontesPresentes(c).catalogo_publicado).toBe(false);
    expect(OfficialSourceValidator(c).status).toBe("BLOCK");
  });

  it("lista de profissionais vinda da agenda não se torna catálogo publicado", () => {
    const c = contexto({
      draftText: "Dr. Carlos Silva atende aqui.",
      toolResults: [
        {
          nome: "listar_profissionais",
          capacidade: "listProfessionals",
          fonte: "agenda",
          success: true,
          temConteudo: true,
        },
      ],
    });
    expect(OfficialSourceValidator(c).status).toBe("BLOCK");
  });

  it.each([
    { appointmentCreated: true, appointmentId: null },
    { appointmentCreated: false, appointmentId: "id-isolado" },
    { appointmentCreated: true, appointmentId: " " },
  ])("reserva exige operação confirmada e identificador válido: %p", (operationalState) => {
    const c = contexto({
      draftText: "Sua consulta foi agendada.",
      operationalState,
      retrievedSources: [agenda, catalogo],
    });
    expect(OfficialSourceValidator(c).blocker).toBe("AFIRMACAO_OPERACIONAL_SEM_PROVA");
  });

  it("tool de criação com HTTP sucesso não substitui comprovação da reserva", () => {
    const c = contexto({
      draftText: "Sua consulta foi agendada.",
      toolResults: [
        {
          nome: "agendar",
          capacidade: "createAppointment",
          fonte: "agenda",
          success: true,
          temConteudo: true,
        },
      ],
    });
    expect(fontesPresentes(c).operacao_confirmada).toBe(false);
    expect(OfficialSourceValidator(c).status).toBe("BLOCK");
  });

  it("horário da reserva já confirmada usa a prova da operação, não requer nova busca de vagas", () => {
    const c = contexto({
      draftText: "Seu agendamento segue confirmado para 08/03 às 08:00.",
      operationalState: { appointmentCreated: true, appointmentId: "reserva-teste" },
    });
    expect(requisitosDeFonte(c).every((r) => r.fonte === "operacao_confirmada")).toBe(true);
    expect(OfficialSourceValidator(c).status).toBe("PASS");
  });

  it("reserva persistida não prova vagas adicionais", () => {
    const c = contexto({
      draftText: "Seu agendamento está confirmado e temos vagas amanhã às 10h.",
      operationalState: { appointmentCreated: true, appointmentId: "reserva-teste" },
    });
    expect(requisitosDeFonte(c).some((r) => r.fonte === "agenda")).toBe(true);
    expect(OfficialSourceValidator(c).status).toBe("BLOCK");
  });

  it("canal existe sem evidências propagadas continua sem aprovação", () => {
    const r = decidirConfianca(
      contexto({
        draftText: "Cardiologia custa R$ 120,00 no dinheiro.",
        fatos: undefined,
        retrievedSources: [catalogo],
      }),
    );
    expect(r.validators?.find((v) => v.validator === "ClaimGroundingValidator")?.status).toBe(
      "UNKNOWN",
    );
    expect(r.decision).not.toBe("ALLOW");
  });
});
