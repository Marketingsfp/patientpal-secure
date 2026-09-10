/**
 * FASE 1 — REGRESSÕES QUE CARACTERIZAM OS DEFEITOS ATUAIS.
 *
 * Cada teste compara a saída do motor REAL contra o fato declarado na fixture
 * (`fixtures/clinica-ficticia.ts`). Nada aqui reimplementa a regra sob teste:
 * mocks só existiriam nas fronteiras (banco/provedor), e estes cenários são
 * todos puros.
 *
 * Testes marcados com `it.failing` são os defeitos AINDA NÃO CORRIGIDOS: eles
 * passam enquanto o defeito existe e ficam vermelhos no dia em que a fase
 * correspondente corrigir o comportamento. Nenhum número esperado foi ajustado
 * para acomodar a falha.
 */
import { describe, expect, it } from "bun:test";
import { avaliarGrounding } from "./claims";
import { decidirHandoff } from "./handoff-decision";
import {
  decidirNoTurno,
  montarContextoDoTurno,
  validarAgendamentoAntesDoCommit,
  verificarRespostaFinalDoTurno,
  type EntradaCommitAgendamento,
} from "./runtime";
import {
  CATALOGO_PUBLICADO,
  CLINICA_FICTICIA,
  FERRAMENTA_CATALOGO_OK,
  FERRAMENTA_DISPONIBILIDADE_VAZIA,
  PROFISSIONAL,
  RESERVA_ANTERIOR,
  VAGAS,
  turnoBase,
} from "./fixtures/clinica-ficticia";

describe("FASE 1 — evidência real por afirmação", () => {
  it.failing(
    "preço divergente do catálogo com a MESMA consulta não pode ser dado como apoiado",
    () => {
      // Fato da fixture: R$ 250,00. A Nina escreveu R$ 180,00.
      const estado = turnoBase({
        acao: "informar_valor",
        tipoTurno: "INFORMACAO",
        catalogoEncontrou: true,
        ferramentas: [FERRAMENTA_CATALOGO_OK],
      });
      const ctx = montarContextoDoTurno(estado);
      const g = avaliarGrounding(ctx, "O ultrassom de abdome total custa R$ 180,00.");
      const valor = g.claims.find((c) => c.tipo === "valor");

      expect(CATALOGO_PUBLICADO.ultrassomAbdomeTotal.precoParticular).toBe(250);
      // Hoje basta "o catálogo respondeu algo" para o claim virar apoiado.
      expect(valor?.suportado).toBe(false);
    },
  );

  it.failing("endereço afirmado sem nenhuma fonte precisa aparecer como afirmação sem evidência", () => {
    const estado = turnoBase({ acao: "responder_informacao", tipoTurno: "INFORMACAO" });
    const ctx = montarContextoDoTurno(estado);
    const g = avaliarGrounding(
      ctx,
      `Atendemos na ${CLINICA_FICTICIA.unidade.endereco}. Pode vir sem agendar.`,
    );
    // Endereço/unidade não é um tipo de claim verificável hoje: passa direto.
    expect(g.semEvidencia.length).toBeGreaterThan(0);
  });

  it("afirmação de agendamento sem prova persistida continua sem evidência", () => {
    const estado = turnoBase({ acao: "criar_agendamento", tipoTurno: "AGENDAMENTO" });
    const g = avaliarGrounding(
      montarContextoDoTurno(estado),
      "Pronto, seu agendamento está confirmado!",
    );
    expect(g.semEvidencia.some((c) => c.tipo === "agendamento")).toBe(true);
  });
});

describe("FASE 1 — o motor não pode reprovar o que está correto", () => {
  it.failing("negativa apoiada no catálogo (não realizamos o exame) não vira bloqueio", () => {
    expect(CATALOGO_PUBLICADO.ressonanciaMagnetica.realizadoPelaClinica).toBe(false);
    const estado = turnoBase({
      acao: "informar_regra",
      tipoTurno: "INFORMACAO",
      catalogoEncontrou: false, // a busca não achou o procedimento: é a prova da negativa
      ferramentas: [FERRAMENTA_CATALOGO_OK],
    });
    const r = verificarRespostaFinalDoTurno(estado, "Não realizamos ressonância magnética aqui.");
    expect(r.decision).toBe("ALLOW");
  });

  it.failing("reserva criada em turno anterior pode ser confirmada sem nova chamada de ferramenta", () => {
    const estado = turnoBase({
      acao: "responder_informacao",
      tipoTurno: "INFORMACAO",
      pacienteIdentificado: true,
      agendamentoConfirmado: true,
      estadoOperacional: {
        appointmentCreated: true,
        appointmentId: RESERVA_ANTERIOR.appointmentId,
        appointmentToolCalled: false,
        appointmentAttempted: false,
        workflowState: "CONFIRMED",
        finalConfirmationReceived: true,
        slotSelected: true,
        patientDataComplete: true,
        bookingIntentConfirmed: true,
      },
    });
    const r = verificarRespostaFinalDoTurno(
      estado,
      "Seu agendamento segue confirmado para 08/03 às 08:00.",
    );
    expect(r.blockers).toEqual([]);
    expect(r.decision).toBe("ALLOW");
  });

  it.failing("ferramenta que falhou e foi refeita com sucesso não pode contar como falha do turno", () => {
    const estado = turnoBase({
      acao: "informar_valor",
      tipoTurno: "INFORMACAO",
      catalogoEncontrou: true,
      ferramentas: [
        { ...FERRAMENTA_CATALOGO_OK, success: false, erro: "timeout" },
        FERRAMENTA_CATALOGO_OK, // retry bem-sucedido, mesma capacidade
      ],
    });
    const r = decidirNoTurno(estado);
    expect(r.blockers).not.toContain("FERRAMENTA_FALHOU");
  });

  it("escala do profissional não é vaga: afirmar horário sem consulta de agenda não passa", () => {
    expect(PROFISSIONAL.escala[0]?.diaSemana).toBe(1);
    const estado = turnoBase({ acao: "informar_disponibilidade", tipoTurno: "INFORMACAO" });
    const r = verificarRespostaFinalDoTurno(
      estado,
      "A Dra. Fictícia Nogueira atende segunda, então temos horário às 9h.",
    );
    expect(r.level).not.toBe("HIGH");
  });
});

describe("FASE 1 — pré-condições antes da ação", () => {
  const argsValidos = {
    medico_id: PROFISSIONAL.referencia,
    inicio: VAGAS.segundaComVaga.slots[0]!.inicio,
    fim: VAGAS.segundaComVaga.slots[0]!.fim,
    procedimento: CATALOGO_PUBLICADO.ultrassomAbdomeTotal.nome,
  };

  it("paciente não identificado bloqueia o pré-commit", () => {
    const r = validarAgendamentoAntesDoCommit({
      args: argsValidos,
      ferramentas: [],
      pacienteIdentificado: false,
      disponibilidadeConfirmada: true,
    });
    expect(r.liberado).toBe(false);
    expect(r.faltas).toContain("paciente_nao_identificado");
  });

  it.failing("consulta de disponibilidade SEM vagas não pode liberar o agendamento", () => {
    expect(VAGAS.segundaSemVaga.slots.length).toBe(0);
    // Contrato esperado: o pré-commit precisa das VAGAS retornadas, não de um
    // booleano derivado de "a consulta respondeu 200".
    const entrada = {
      args: {
        ...argsValidos,
        inicio: `${VAGAS.segundaSemVaga.data}T08:00:00-03:00`,
        fim: `${VAGAS.segundaSemVaga.data}T08:30:00-03:00`,
      },
      ferramentas: [FERRAMENTA_DISPONIBILIDADE_VAZIA],
      pacienteIdentificado: true,
      disponibilidadeConfirmada: true,
      vagasOferecidas: VAGAS.segundaSemVaga.slots,
    } as unknown as EntradaCommitAgendamento;
    const r = validarAgendamentoAntesDoCommit(entrada);
    expect(r.liberado).toBe(false);
  });

  it("consentimento/regra da clínica não atendida bloqueia a ação", () => {
    const estado = turnoBase({
      acao: "criar_agendamento",
      tipoTurno: "AGENDAMENTO",
      pacienteIdentificado: true,
      ferramentas: [FERRAMENTA_CATALOGO_OK],
      catalogoEncontrou: true,
      regrasNegocio: [
        {
          id: "convenio_exige_guia_autorizada",
          descricao: "Boa Saúde exige guia autorizada",
          satisfeita: CATALOGO_PUBLICADO.convenioBoaSaude.exigeGuiaAutorizada ? false : true,
        },
      ],
    });
    const r = decidirNoTurno(estado);
    expect(r.decision).not.toBe("ALLOW");
  });
});

describe("FASE 1 — destino do turno e vínculo com a mensagem", () => {
  const base = turnoBase({ acao: "informar_valor", tipoTurno: "INFORMACAO" });

  it.failing("CLARIFY precisa declarar que o turno aguarda nova entrada do paciente", () => {
    const avaliacao = decidirNoTurno(base);
    const plano = decidirHandoff({
      avaliacaoAcao: avaliacao,
      decisaoEfetiva: "CLARIFY",
      tipoTurno: "ESCLARECIMENTO",
      tentativasEsclarecimento: 0,
    });
    // Hoje o plano não carrega esse contrato e o webhook faz outra rodada de
    // modelo sem esperar o paciente.
    expect((plano as unknown as { aguardarPaciente?: boolean }).aguardarPaciente).toBe(true);
  });

  it.failing("plano de handoff precisa declarar o texto seguro para quando a transferência falhar", () => {
    const avaliacao = decidirNoTurno(
      turnoBase({ acao: "informar_valor", tipoTurno: "INFORMACAO" }),
    );
    const plano = decidirHandoff({
      avaliacaoAcao: avaliacao,
      decisaoEfetiva: "HANDOFF",
      tipoTurno: "INFORMACAO",
      pedidoHumanoExplicito: false,
    });
    // Sem isso, falha na ferramenta libera ao paciente o texto reprovado.
    expect(
      (plano as unknown as { textoSeFalharHandoff?: string }).textoSeFalharHandoff,
    ).toBeTruthy();
  });

  it("score persistido pertence ao texto final: mudar o texto invalida a avaliação", async () => {
    const { avaliacaoValeParaOTexto } = await import("./final-answer");
    const r = verificarRespostaFinalDoTurno(base, "Texto avaliado.");
    expect(avaliacaoValeParaOTexto(r, "Texto avaliado.")).toBe(true);
    expect(avaliacaoValeParaOTexto(r, "Texto avaliado. Qualquer coisa me chame!")).toBe(false);
  });
});
