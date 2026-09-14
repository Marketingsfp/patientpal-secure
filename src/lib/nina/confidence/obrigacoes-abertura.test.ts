import { describe, expect, it } from "bun:test";
import { montarInstrucoesDoTurno } from "./contexto-avaliacao";
import { avaliarObrigacoes } from "./obrigacoes";
import { verificarRespostaFinal } from "./final-answer";
import { conformidadeDasInstrucoes } from "./conformidade-entrega";
import { extrairEvidencia } from "./evidencia-extrator";
import { PROMPT_PUBLICADO_V19 } from "./fixtures/prompt-publicado-v19";
import type { ContextoConfianca } from "./types";

const apresentacao = "Olá! Sou a Nina, atendente virtual da Policlínica Menino Jesus.";
const informacao =
  "Sim, temos Cardiologia. A consulta de Cardiologia custa R$ 120,00 no dinheiro e R$ 145,00 no cartão. Gostaria de verificar as vagas?";
const instrucoes = montarInstrucoesDoTurno({
  texto: PROMPT_PUBLICADO_V19,
  escopo: "whatsapp",
  versao: "19",
});

function contexto(ambiente: "producao" | "homologacao", apresentou = false): ContextoConfianca {
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
          procedimento: "Cardiologia",
          preco_dinheiro: 120,
          preco_cartao: 145,
        },
      ],
    },
  });
  return {
    instanteAvaliacao: "2026-09-14T13:53:00.000Z",
    intent: "medico",
    requestedAction: "informar_profissional",
    turnType: "INFORMACAO",
    mensagemPaciente: "Vocês tem cardiologista?",
    instrucoes,
    retrievedSources: [
      {
        tipo: "catalogo_publicado",
        referencia: "consulta-ficticia",
        temConteudo: true,
        publicado: true,
      },
    ],
    toolResults: [
      {
        nome: "consultar_base_conhecimento",
        capacidade: "searchKnowledgeBase",
        fonte: "base_conhecimento",
        success: true,
      },
    ],
    fatos: evidencia.fatos,
    consultas: [evidencia.consulta],
    businessContext: {
      ambiente,
      apresentacaoJaFeita: apresentou,
      pacienteIdentificado: false,
      agendamentoConfirmado: false,
      esclarecimentoUsado: false,
      handoffSolicitado: false,
    },
    operationalState: {
      workflowState: "INFORMATION_RESPONSE",
      appointmentToolCalled: false,
      appointmentAttempted: false,
      appointmentCreated: false,
      bookingIntentConfirmed: false,
      appointmentFlowActive: false,
      appointmentId: null,
    },
    evidenciasFluxo: {
      registroFerramentasCompleto: true,
      historicoCompleto: true,
      sessionId: "sessao-ficticia",
      historico: apresentou
        ? [
            { role: "user", content: "Oi" },
            { role: "assistant", content: `${apresentacao} Como posso ajudar?` },
          ]
        : [],
    },
  };
}

function regra(ctx: ContextoConfianca, texto: string, id: string) {
  return avaliarObrigacoes(ctx, texto).avaliacoes.find(
    (a) => a.obrigacao.regra?.identificador === id,
  );
}

describe("publicação v19: mesma avaliação de abertura e continuidade nos dois ambientes", () => {
  it.each(["producao", "homologacao"] as const)(
    "saudação em %s é verificável sem catálogo",
    (ambiente) => {
      const ctx = contexto(ambiente);
      Object.assign(ctx, {
        mensagemPaciente: "oi bom dia",
        turnType: "SAUDACAO",
        requestedAction: "responder_informacao",
        fatos: [],
        consultas: [],
        retrievedSources: [],
        toolResults: [],
      });
      const texto = `${apresentacao} Como posso te ajudar hoje?`;
      expect(regra(ctx, texto, "CONV-01")?.status).toBe("cumprida");
      expect(
        conformidadeDasInstrucoes(verificarRespostaFinal({ ctx, textoFinal: texto })).bloqueante,
      ).toBe(false);
    },
  );

  it.each([false, true])(
    "primeiro pedido/continuidade (apresentou=%s) mantém conteúdo e decisão iguais",
    (apresentou) => {
      const texto = apresentou ? informacao : `${apresentacao} ${informacao}`;
      const resultados = (["producao", "homologacao"] as const).map((ambiente) => {
        const ctx = contexto(ambiente, apresentou);
        expect(regra(ctx, texto, apresentou ? "CONV-03" : "CONV-02")?.status).toBe("cumprida");
        const avaliacao = verificarRespostaFinal({ ctx, textoFinal: texto });
        const conformidade = conformidadeDasInstrucoes(avaliacao);
        expect(conformidade.bloqueante).toBe(false);
        expect(avaliacao.level).not.toBe("LOW");
        return {
          decisao: avaliacao.decision,
          nivel: avaliacao.level,
          bloqueante: conformidade.bloqueante,
        };
      });
      expect(resultados[0]).toEqual(resultados[1]);
    },
  );

  it.each(["producao", "homologacao"] as const)(
    "sem apresentação exigida em %s não recebe aprovação por outro cumprimento",
    (ambiente) => {
      const ctx = contexto(ambiente);
      expect(regra(ctx, informacao, "CONV-02")).toMatchObject({
        status: "descumprida",
        motivo: "ABERTURA_APRESENTACAO_AUSENTE",
      });
      expect(
        conformidadeDasInstrucoes(verificarRespostaFinal({ ctx, textoFinal: informacao }))
          .bloqueante,
      ).toBe(true);
    },
  );

  it.each(["producao", "homologacao"] as const)(
    "preço incorreto em %s continua bloqueado",
    (ambiente) => {
      const ctx = contexto(ambiente);
      const texto = `${apresentacao} ${informacao.replace("120,00", "999,00")}`;
      expect(regra(ctx, texto, "CONV-02")?.status).not.toBe("cumprida");
      expect(verificarRespostaFinal({ ctx, textoFinal: texto }).level).toBe("LOW");
    },
  );

  it("preço sem fonte nunca comprova avanço no pedido", () => {
    for (const ambiente of ["producao", "homologacao"] as const) {
      const ctx = contexto(ambiente);
      ctx.fatos = [];
      ctx.consultas = [];
      ctx.retrievedSources = [];
      ctx.toolResults = [];
      const texto = `${apresentacao} ${informacao}`;
      expect(regra(ctx, texto, "CONV-02")?.status).toBe("indeterminada");
      expect(
        conformidadeDasInstrucoes(verificarRespostaFinal({ ctx, textoFinal: texto })).bloqueante,
      ).toBe(true);
    }
  });

  it("não aprova identidade errada nem saudação vazia no lugar do pedido", () => {
    const ctx = contexto("producao");
    expect(
      regra(ctx, `${apresentacao.replace("Nina", "Outra")} ${informacao}`, "CONV-02")?.status,
    ).toBe("descumprida");
    expect(regra(ctx, `${apresentacao} Como posso ajudar?`, "CONV-02")?.status).toBe(
      "indeterminada",
    );
  });

  it("pergunta específica pelo exame ainda não informado comprova avanço sem inventar fatos", () => {
    const ctx = contexto("producao");
    Object.assign(ctx, {
      mensagemPaciente: "bom dia, qual o valor do exame?",
      fatos: [],
      consultas: [],
      retrievedSources: [],
      toolResults: [],
    });
    expect(regra(ctx, `${apresentacao} Qual exame você precisa?`, "CONV-02")?.status).toBe(
      "cumprida",
    );
    ctx.mensagemPaciente = "Qual o valor do exame cardiológico?";
    expect(regra(ctx, `${apresentacao} Qual exame você precisa?`, "CONV-02")?.status).not.toBe(
      "cumprida",
    );
  });

  it("mesmo ID não autoriza ignorar exigência acrescentada na publicação", () => {
    const ctx = contexto("homologacao");
    ctx.instrucoes = montarInstrucoesDoTurno({
      texto: PROMPT_PUBLICADO_V19.replace(
        "Uma mensagem como",
        "Também informe uma condição adicional específica.\nUma mensagem como",
      ),
      escopo: "whatsapp",
      versao: "20",
    });
    expect(regra(ctx, `${apresentacao} ${informacao}`, "CONV-02")?.status).toBe("indeterminada");
  });

  it.each(["producao", "homologacao"] as const)(
    "preço comprovado em %s responde preço, sem substituir outras dimensões",
    (ambiente) => {
      const ctx = contexto(ambiente);
      ctx.requestedAction = "informar_valor";
      ctx.mensagemPaciente = "Qual o valor da consulta de cardiologia?";
      expect(regra(ctx, `${apresentacao} ${informacao}`, "CONV-02")?.status).toBe("cumprida");
      for (const mensagem of [
        "Qual a idade mínima para cardiologia?",
        "Qual o preparo para cardiologia?",
        "Quanto tempo dura a consulta de cardiologia?",
        "Qual o valor e a idade mínima para cardiologia?",
        "Quero cancelar minha consulta de cardiologia.",
        "Qual cardiologista atende?",
        "Qual o valor da cardiologia no pix?",
      ]) {
        ctx.mensagemPaciente = mensagem;
        expect(regra(ctx, `${apresentacao} ${informacao}`, "CONV-02")?.status).toBe(
          "indeterminada",
        );
      }
      ctx.mensagemPaciente = "Vocês tem cardiologista?";
      ctx.requestedAction = "cancelar_agendamento";
      expect(regra(ctx, `${apresentacao} ${informacao}`, "CONV-02")?.status).toBe("indeterminada");
    },
  );

  it.each(["producao", "homologacao"] as const)(
    "frase factual adicional não reconhecida em %s não herda prova dos preços",
    (ambiente) => {
      const ctx = contexto(ambiente);
      for (const extra of [
        "O exame garante 100% de cura.",
        "A duração é 25 minutos.",
        "Pode trazer seus documentos.",
        "Gostaria de verificar as vagas que garantem a cura?",
      ]) {
        const texto = `${apresentacao} ${informacao} ${extra}`;
        expect(regra(ctx, texto, "CONV-02")?.status).toBe("indeterminada");
      }
    },
  );

  it.each(["producao", "homologacao"] as const)(
    "esclarecimento em %s só aprova apresentação e pergunta específica sem fatos extras",
    (ambiente) => {
      const ctx = contexto(ambiente);
      Object.assign(ctx, {
        mensagemPaciente: "Qual o valor do exame?",
        fatos: [],
        consultas: [],
        retrievedSources: [],
        toolResults: [],
      });
      for (const corpo of [
        "A duração é 25 minutos. Qual exame você precisa?",
        "Pode trazer seus documentos. Qual exame você precisa?",
        "Qual exame que cura qualquer doença você precisa?",
        "Qual exame você precisa? O exame é garantido.",
      ])
        expect(regra(ctx, `${apresentacao} ${corpo}`, "CONV-02")?.status).toBe("indeterminada");
      ctx.mensagemPaciente = "Cardiologia: qual o valor do exame?";
      expect(regra(ctx, `${apresentacao} Qual exame você precisa?`, "CONV-02")?.status).toBe(
        "indeterminada",
      );
    },
  );

  it.each(["producao", "homologacao"] as const)(
    "pedido de exame incompleto em %s permite esclarecimento sem ação executável",
    (ambiente) => {
      const ctx = contexto(ambiente);
      Object.assign(ctx, {
        mensagemPaciente: "Qual o valor do exame?",
        turnType: "ESCLARECIMENTO",
        fatos: [],
        consultas: [],
        retrievedSources: [],
        toolResults: [],
      });
      const texto = `${apresentacao} Qual exame você precisa?`;
      for (const acao of [null, "nenhuma"] as const) {
        ctx.requestedAction = acao;
        expect(regra(ctx, texto, "CONV-02")?.status).toBe("cumprida");
        expect(
          conformidadeDasInstrucoes(verificarRespostaFinal({ ctx, textoFinal: texto })).bloqueante,
        ).toBe(false);
      }
      ctx.requestedAction = "criar_agendamento";
      expect(regra(ctx, texto, "CONV-02")?.status).toBe("indeterminada");
    },
  );

  it.each(["producao", "homologacao"] as const)(
    "nome parecido em %s não comprova identidade publicada",
    (ambiente) => {
      const ctx = contexto(ambiente);
      Object.assign(ctx, {
        mensagemPaciente: "oi",
        turnType: "SAUDACAO",
        requestedAction: "responder_informacao",
        fatos: [],
        consultas: [],
        retrievedSources: [],
        toolResults: [],
      });
      expect(
        regra(ctx, `${apresentacao.replace("Nina", "Ninando")} Como posso te ajudar?`, "CONV-01"),
      ).toMatchObject({ status: "descumprida", motivo: "ABERTURA_IDENTIDADE_DIVERGENTE" });
    },
  );
});
