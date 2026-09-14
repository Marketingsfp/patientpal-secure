import { describe, expect, it } from "bun:test";
import { montarInstrucoesDoTurno } from "./contexto-avaliacao";
import { avaliarObrigacaoContinuidade } from "./obrigacoes-continuidade";
import { PROMPT_PUBLICADO_V15 } from "./fixtures/prompt-publicado-v15";
import { avaliarObrigacoes, type Obrigacao } from "./obrigacoes";
import { extrairEvidencia } from "./evidencia-extrator";
import type { ContextoConfianca } from "./types";

const MEDICO = "22222222-2222-4222-8222-222222222222";
const resposta =
  "Sim, atendemos Cardiologia. O Dr. Bruno Costa atende quintas às 13:30. Gostaria de verificar as vagas do Dr. Bruno Costa?";

function preparar(prompt = PROMPT_PUBLICADO_V15) {
  const instrucoes = montarInstrucoesDoTurno({ escopo: "whatsapp", versao: "15", texto: prompt });
  const regra = instrucoes.regras!.find((r) => r.identificador === "CONV-03")!;
  const obrigacao: Obrigacao = {
    id: "continuidade",
    tipo: "restricao_aberta",
    origem: "instrucoes_publicadas",
    descricao: regra.descricao,
    regra,
    verificacao: "semantica",
  };
  const ctx: ContextoConfianca = {
    requestedAction: "informar_profissional",
    turnType: "INFORMACAO",
    mensagemPaciente: "vcs tem cardiologista?",
    instrucoes,
    businessContext: {
      ambiente: "homologacao",
      apresentacaoJaFeita: true,
      pacienteIdentificado: false,
      agendamentoConfirmado: false,
      esclarecimentoUsado: false,
      handoffSolicitado: false,
    },
    retrievedSources: [{ tipo: "catalogo_publicado", temConteudo: true, publicado: true }],
    toolResults: [
      {
        nome: "consultar_base_conhecimento",
        capacidade: "searchKnowledgeBase",
        fonte: "base_conhecimento",
        success: true,
      },
    ],
    fatos: [
      {
        consulta: "consultar_base_conhecimento",
        capacidade: "searchKnowledgeBase",
        fonte: "catalogo_publicado",
        entidade: "servico",
        campo: "oferecido",
        valor: "Cardiologia",
      },
      {
        consulta: "consultar_base_conhecimento",
        capacidade: "searchKnowledgeBase",
        fonte: "catalogo_publicado",
        entidade: "profissional",
        campo: "nome",
        valor: "Bruno Costa",
        chave: { medicoNome: "Bruno Costa", medicoId: MEDICO },
      },
      {
        consulta: "consultar_base_conhecimento",
        capacidade: "searchKnowledgeBase",
        fonte: "catalogo_publicado",
        entidade: "escala",
        campo: "dia_atendimento",
        valor: "Quinta 13:30h",
        chave: { medicoNome: "Bruno Costa", medicoId: MEDICO },
      },
    ],
    evidenciasFluxo: {
      registroFerramentasCompleto: true,
      historicoCompleto: true,
      sessionId: "sessao-ficticia",
      historico: [
        { role: "user", content: "oi" },
        { role: "assistant", content: "Olá! Sou a Nina. Como posso ajudar?" },
      ],
    },
  };
  return { obrigacao, ctx };
}

describe("continuidade comprovada para a regra publicada integral", () => {
  function pagamento() {
    const preparado = preparar();
    const evidencia = extrairEvidencia({
      ferramenta: "consultar_base_conhecimento",
      capacidade: "searchKnowledgeBase",
      fonte: "base_conhecimento",
      success: true,
      args: { termo: "cardiologia" },
      dados: {
        found: true,
        knowledge_status: "found",
        records: [
          {
            id: "consulta-ficticia",
            procedimento: "Consulta Cardiologia",
            formas_pagamento: [
              { forma: "Dinheiro", valor: 120 },
              { forma: "Cartão", valor: 145 },
            ],
          },
        ],
      },
    });
    Object.assign(preparado.ctx, {
      mensagemPaciente: "aceita PIX?",
      requestedAction: "informar_valor",
      fatos: evidencia.fatos,
      consultas: [evidencia.consulta],
    });
    return preparado;
  }

  it("negativa de PIX comprovada pelo catálogo responde à pergunta curta", () => {
    const { obrigacao, ctx } = pagamento();
    expect(
      avaliarObrigacaoContinuidade(
        obrigacao,
        ctx,
        "Para a consulta de Cardiologia, não aceitamos PIX.",
      )?.status,
    ).toBe("cumprida");
  });

  it("não comprova continuidade de uma recusa de PIX sem consulta vinculada", () => {
    const { obrigacao, ctx } = pagamento();
    ctx.consultas = [];
    expect(
      avaliarObrigacaoContinuidade(
        obrigacao,
        ctx,
        "Para a consulta de Cardiologia, não aceitamos PIX.",
      ),
    ).toBeNull();
  });

  it("não comprova continuidade respondendo a uma forma diferente", () => {
    const { obrigacao, ctx } = pagamento();
    ctx.mensagemPaciente = "aceita cheque?";
    expect(
      avaliarObrigacaoContinuidade(
        obrigacao,
        ctx,
        "Para a consulta de Cardiologia, não aceitamos PIX.",
      ),
    ).toBeNull();
  });

  it("lista do serviço não comprova recusa em nome de toda a clínica", () => {
    const { obrigacao, ctx } = pagamento();
    expect(avaliarObrigacaoContinuidade(obrigacao, ctx, "Não aceitamos PIX.")).toBeNull();
  });

  it("responde ao assunto atual com catálogo e oferece agenda sem reiniciar", () => {
    const { obrigacao, ctx } = preparar();
    expect(avaliarObrigacaoContinuidade(obrigacao, ctx, resposta)).toMatchObject({
      status: "cumprida",
      motivo: "CONTINUIDADE_INFORMATIVA_COMPROVADA_NO_HISTORICO",
    });
  });

  it("cumprimento breve seguido da informação pertinente não prova reinício", () => {
    const { obrigacao, ctx } = preparar();
    expect(avaliarObrigacaoContinuidade(obrigacao, ctx, `Olá! ${resposta}`)?.status).toBe(
      "cumprida",
    );
  });

  it.each(["historicoCompleto", "sessionId", "apresentacaoJaFeita", "historicoAusente"])(
    "sem prova de %s não declara cumprimento",
    (campo) => {
      const { obrigacao, ctx } = preparar();
      if (campo === "historicoCompleto") ctx.evidenciasFluxo!.historicoCompleto = false;
      if (campo === "sessionId") ctx.evidenciasFluxo!.sessionId = null;
      if (campo === "apresentacaoJaFeita") delete ctx.businessContext.apresentacaoJaFeita;
      if (campo === "historicoAusente") ctx.evidenciasFluxo!.historico = [];
      expect(avaliarObrigacaoContinuidade(obrigacao, ctx, resposta)).toBeNull();
    },
  );

  it("sem histórico comprovado o avaliador genérico mantém a limitação sem aprovar a regra", () => {
    const { ctx } = preparar();
    delete ctx.evidenciasFluxo;
    const continuidade = avaliarObrigacoes(ctx, resposta).avaliacoes.find(
      (a) => a.obrigacao.regra?.identificador === "CONV-03",
    );
    expect(continuidade).toMatchObject({
      status: "indeterminada",
      motivo: "LINGUAGEM_ABERTA_NAO_VERIFICAVEL",
    });
  });

  it("ID igual não permite aprovar instrução alterada nem texto extra", () => {
    for (const novo of [
      "Resultado esperado: continuidade sem reiniciar o atendimento ou repetir perguntas já respondidas. Sempre peça o CPF.",
      "Resultado esperado: reinicie o atendimento e repita perguntas já respondidas.",
    ]) {
      const { obrigacao, ctx } = preparar(
        PROMPT_PUBLICADO_V15.replace(
          "Resultado esperado: continuidade sem reiniciar o atendimento ou repetir perguntas já respondidas.",
          novo,
        ),
      );
      expect(avaliarObrigacaoContinuidade(obrigacao, ctx, resposta)).toBeNull();
    }
    const { obrigacao, ctx } = preparar();
    ctx.instrucoes!.hash = "outra-publicacao";
    expect(avaliarObrigacaoContinuidade(obrigacao, ctx, resposta)).toBeNull();
  });

  it("nova apresentação em sessão em andamento é descumprimento", () => {
    const { obrigacao, ctx } = preparar();
    expect(
      avaliarObrigacaoContinuidade(obrigacao, ctx, `Olá! Sou a Nina. ${resposta}`)?.status,
    ).toBe("descumprida");
  });

  it("não aprova conteúdo irrelevante nem informação sem prova", () => {
    const { obrigacao, ctx } = preparar();
    expect(
      avaliarObrigacaoContinuidade(obrigacao, ctx, "Oferecemos exames: Tomografia."),
    ).toBeNull();
    ctx.mensagemPaciente = "Vocês têm dermatologista?";
    expect(avaliarObrigacaoContinuidade(obrigacao, ctx, resposta)).toBeNull();
  });

  it("não repete a pergunta de abertura já respondida com uma demanda", () => {
    const { obrigacao, ctx } = preparar();
    expect(
      avaliarObrigacaoContinuidade(
        obrigacao,
        ctx,
        "Sim, atendemos Cardiologia. Como posso ajudar?",
      ),
    ).toMatchObject({ status: "descumprida", motivo: "CONTINUIDADE_PERGUNTA_JA_RESPONDIDA" });
  });

  it("perguntas equivalentes sobre médico já escolhido não são aprovadas", () => {
    const { obrigacao, ctx } = preparar();
    ctx.evidenciasFluxo!.historico.push(
      { role: "user", content: "Vocês têm cardiologista?" },
      { role: "assistant", content: "Qual médico prefere?" },
      { role: "user", content: "Dr. Bruno Costa" },
    );
    expect(
      avaliarObrigacaoContinuidade(
        obrigacao,
        ctx,
        "Sim, atendemos Cardiologia. Que profissional prefere?",
      ),
    ).toMatchObject({ status: "descumprida", motivo: "CONTINUIDADE_PERGUNTA_JA_RESPONDIDA" });
  });

  it("pergunta aberta nova e exceção de identidade seguem para avaliação semântica", () => {
    const { obrigacao, ctx } = preparar();
    expect(
      avaliarObrigacaoContinuidade(
        obrigacao,
        ctx,
        "Sim, atendemos Cardiologia. Qual sua cor favorita?",
      ),
    ).toBeNull();
    ctx.mensagemPaciente = "Quem é você?";
    expect(avaliarObrigacaoContinuidade(obrigacao, ctx, "Sou a Nina.")).toBeNull();
  });

  it("sim após oferta específica continua com vagas efetivamente consultadas", () => {
    const { obrigacao, ctx } = preparar();
    ctx.evidenciasFluxo!.historico.push(
      { role: "user", content: "vcs tem cardiologista?" },
      { role: "assistant", content: resposta },
    );
    ctx.mensagemPaciente = "sim";
    ctx.requestedAction = "informar_disponibilidade";
    ctx.toolResults.push({
      nome: "consultar_disponibilidade",
      capacidade: "checkAvailability",
      fonte: "agenda",
      success: true,
    });
    ctx.retrievedSources.push({ tipo: "agenda", temConteudo: true });
    ctx.fatos!.push({
      consulta: "consultar_disponibilidade",
      capacidade: "checkAvailability",
      fonte: "agenda",
      entidade: "vaga",
      campo: "slot",
      valor: "2026-09-17T13:30:00",
      chave: { medicoId: MEDICO, medicoNome: "Bruno Costa", data: "2026-09-17", hora: "13:30" },
    });
    const final = "Temos vaga quinta às 13:30 com o Dr. Bruno Costa. Qual horário prefere?";
    expect(avaliarObrigacaoContinuidade(obrigacao, ctx, final)?.status).toBe("cumprida");
    ctx.evidenciasFluxo!.registroFerramentasCompleto = false;
    expect(avaliarObrigacaoContinuidade(obrigacao, ctx, final)).toBeNull();
  });
});

describe("continuidade social e coleta sem operação", () => {
  const pedidoDados =
    "Para seguir com o agendamento, me informe seu nome completo e a data de nascimento, por favor.";
  function semOperacao() {
    const p = preparar();
    Object.assign(p.ctx, {
      requestedAction: "nenhuma",
      turnType: "ESCLARECIMENTO",
      mensagemPaciente: "quero agendar",
      toolResults: [],
      retrievedSources: [],
      fatos: [],
      entities: {},
      requiredFields: ["nome", "data_nascimento"],
    });
    return p;
  }

  for (const ambiente of ["producao", "homologacao"] as const) {
    it(`${ambiente}: cumprimento social com histórico conhecido preserva continuidade`, () => {
      const { obrigacao, ctx } = semOperacao();
      ctx.businessContext.ambiente = ambiente;
      ctx.mensagemPaciente = "oi";
      ctx.turnType = "SAUDACAO";
      expect(
        avaliarObrigacaoContinuidade(obrigacao, ctx, "Oi! Como posso te ajudar?"),
      ).toMatchObject({
        status: "cumprida",
        motivo: "CONTINUIDADE_SOCIAL_COMPROVADA_NO_HISTORICO",
      });
    });

    it(`${ambiente}: pede somente os campos necessários ainda ausentes`, () => {
      const { obrigacao, ctx } = semOperacao();
      ctx.businessContext.ambiente = ambiente;
      expect(avaliarObrigacaoContinuidade(obrigacao, ctx, pedidoDados)).toMatchObject({
        status: "cumprida",
        motivo: "CONTINUIDADE_COLETA_DE_DADO_PENDENTE_COMPROVADA",
      });
    });
  }

  it("aceita uma pergunta específica sobre o campo pendente", () => {
    const { obrigacao, ctx } = semOperacao();
    expect(avaliarObrigacaoContinuidade(obrigacao, ctx, "Qual seu nome completo?")?.status).toBe(
      "cumprida",
    );
  });

  it("saudação não reinicia a demanda já informada nem encobre fatos ou handoff", () => {
    const { obrigacao, ctx } = semOperacao();
    ctx.mensagemPaciente = "oi";
    ctx.turnType = "SAUDACAO";
    for (const texto of [
      "Oi! A consulta custa R$ 200.",
      "Oi! Vou chamar uma atendente.",
      "Oi! Qual sua cor favorita?",
    ])
      expect(avaliarObrigacaoContinuidade(obrigacao, ctx, texto)).toBeNull();
    ctx.evidenciasFluxo!.historico.push(
      { role: "user", content: "Quero agendar Cardiologia" },
      { role: "assistant", content: "Qual médico prefere?" },
    );
    expect(avaliarObrigacaoContinuidade(obrigacao, ctx, "Oi! Como posso te ajudar?")).toMatchObject(
      {
        status: "descumprida",
        motivo: "CONTINUIDADE_PERGUNTA_JA_RESPONDIDA",
      },
    );
  });

  it("rótulo SAUDACAO não transforma pedido concreto em cumprimento social", () => {
    const { obrigacao, ctx } = semOperacao();
    ctx.turnType = "SAUDACAO";
    expect(
      avaliarObrigacaoContinuidade(obrigacao, ctx, "Oi! Como posso te ajudar?")?.status,
    ).not.toBe("cumprida");
  });

  it.each(["historico", "sessao", "ferramentas", "requiredFields", "entities"])(
    "coleta sem prova de %s permanece indeterminada",
    (prova) => {
      const { obrigacao, ctx } = semOperacao();
      if (prova === "historico") ctx.evidenciasFluxo!.historicoCompleto = false;
      if (prova === "sessao") ctx.evidenciasFluxo!.sessionId = null;
      if (prova === "ferramentas") ctx.evidenciasFluxo!.registroFerramentasCompleto = false;
      if (prova === "requiredFields") delete ctx.requiredFields;
      if (prova === "entities") delete ctx.entities;
      expect(avaliarObrigacaoContinuidade(obrigacao, ctx, pedidoDados)).toBeNull();
    },
  );

  it("não usa a coleta para aprovar operação, ferramenta de escrita ou texto factual extra", () => {
    const { obrigacao, ctx } = semOperacao();
    expect(
      avaliarObrigacaoContinuidade(
        obrigacao,
        ctx,
        `${pedidoDados} Seu agendamento foi confirmado.`,
      ),
    ).toBeNull();
    expect(
      avaliarObrigacaoContinuidade(obrigacao, ctx, `${pedidoDados} A consulta custa R$ 200.`),
    ).toBeNull();
    ctx.toolResults.push({
      nome: "agendar",
      capacidade: "createAppointment",
      fonte: "agenda",
      success: true,
    });
    expect(avaliarObrigacaoContinuidade(obrigacao, ctx, pedidoDados)).toBeNull();
    ctx.toolResults = [];
    ctx.requestedAction = "criar_agendamento";
    expect(avaliarObrigacaoContinuidade(obrigacao, ctx, pedidoDados)).toBeNull();
  });

  it("não aprova pedido de campo sem necessidade declarada", () => {
    const { obrigacao, ctx } = semOperacao();
    expect(
      avaliarObrigacaoContinuidade(obrigacao, ctx, "Me informe seu CPF, por favor."),
    ).toBeNull();
  });

  it("campo preenchido no estado não pode ser solicitado de novo", () => {
    const { obrigacao, ctx } = semOperacao();
    ctx.entities = { nome_completo: "João Silva" };
    expect(avaliarObrigacaoContinuidade(obrigacao, ctx, pedidoDados)).toMatchObject({
      status: "descumprida",
      motivo: "CONTINUIDADE_DADO_JA_INFORMADO",
    });
  });

  it("coleta imperativa reconhece respostas já fornecidas mesmo antes da reidratação do estado", () => {
    const { obrigacao, ctx } = semOperacao();
    ctx.evidenciasFluxo!.historico.push(
      { role: "user", content: "quero agendar" },
      { role: "assistant", content: pedidoDados },
    );
    ctx.mensagemPaciente = "João Silva, 01/02/2000";
    expect(avaliarObrigacaoContinuidade(obrigacao, ctx, pedidoDados)).toMatchObject({
      status: "descumprida",
      motivo: "CONTINUIDADE_PERGUNTA_JA_RESPONDIDA",
    });
  });

  it("dados espontâneos na mensagem atual também impedem coleta repetida", () => {
    const { obrigacao, ctx } = semOperacao();
    ctx.mensagemPaciente = "Meu nome é João Silva";
    expect(avaliarObrigacaoContinuidade(obrigacao, ctx, pedidoDados)).toMatchObject({
      status: "descumprida",
      motivo: "CONTINUIDADE_DADO_JA_INFORMADO",
    });
  });
});
