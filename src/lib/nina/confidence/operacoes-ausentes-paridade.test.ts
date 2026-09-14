import { describe, expect, it } from "bun:test";
import { montarInstrucoesDoTurno } from "./contexto-avaliacao";
import { conformidadeDasInstrucoes } from "./conformidade-entrega";
import { verificarRespostaFinal } from "./final-answer";
import { PROMPT_PUBLICADO_V19 } from "./fixtures/prompt-publicado-v19";
import { avaliarObrigacoes } from "./obrigacoes";
import type { ContextoConfianca } from "./types";

const apresentacao =
  "Olá! Sou a Nina, atendente virtual da Policlínica Menino Jesus. Como posso ajudar?";
const instrucoes = montarInstrucoesDoTurno({
  texto: PROMPT_PUBLICADO_V19,
  escopo: "whatsapp",
  versao: "19",
});

function contexto(ambiente: "producao" | "homologacao"): ContextoConfianca {
  return {
    instanteAvaliacao: "2026-09-14T12:00:00Z",
    requestedAction: null,
    mensagemPaciente: "oi",
    turnType: "SAUDACAO",
    instrucoes,
    fatos: [],
    consultas: [],
    retrievedSources: [],
    toolResults: [],
    businessContext: {
      ambiente,
      apresentacaoJaFeita: true,
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
      sessionId: "sessao-pura",
      historicoCompleto: true,
      registroFerramentasCompleto: true,
      historico: [
        { role: "user", content: "oi" },
        { role: "assistant", content: apresentacao },
      ],
    },
  };
}

function avaliar(ctx: ContextoConfianca, texto: string) {
  const resultado = verificarRespostaFinal({ ctx, textoFinal: texto });
  const conformidade = conformidadeDasInstrucoes(resultado);
  const operacional = avaliarObrigacoes(ctx, texto).avaliacoes.find(
    (a) => a.escopoVerificacao === "operacional",
  );
  return {
    operacional,
    resumo: {
      score: resultado.score,
      cobertura: resultado.evidenceCoverage,
      nivel: resultado.level,
      decisao: resultado.decision,
      bloqueia: conformidade.bloqueante,
    },
    resultado,
  };
}

describe("prompt v19: prova de ausência de operações preserva a paridade", () => {
  it.each([null, "nenhuma"] as const)(
    "saudação e coleta com ação explícita %s não ganham bloqueio exclusivo da homologação",
    (acao) => {
      for (const coleta of [false, true]) {
        const resultados = (["producao", "homologacao"] as const).map((ambiente) => {
          const ctx = contexto(ambiente);
          ctx.requestedAction = acao;
          const texto = coleta
            ? "Para seguir com o agendamento, me informe seu nome completo e a data de nascimento, por favor."
            : "Oi! Como posso te ajudar?";
          if (coleta) {
            ctx.turnType = "ESCLARECIMENTO";
            ctx.mensagemPaciente = "quero agendar";
            ctx.requiredFields = ["nome", "data_nascimento"];
            ctx.entities = {};
          }
          const r = avaliar(ctx, texto);
          expect(r.resumo.bloqueia).toBe(false);
          expect(r.resumo.nivel).not.toBe("LOW");
          if (ambiente === "homologacao")
            expect(r.operacional).toMatchObject({
              status: "cumprida",
              motivo: "HOMOLOGACAO_TURNO_SEM_ACAO_SEM_EFEITO_OPERACIONAL",
            });
          return r.resumo;
        });
        expect(resultados[0]).toEqual(resultados[1]);
      }
    },
  );

  it("leitura que falhou não inventa efeito operacional e preço sem fonte continua bloqueado nos dois ambientes", () => {
    const resultados = (["producao", "homologacao"] as const).map((ambiente) => {
      const ctx = contexto(ambiente);
      ctx.requestedAction = "informar_valor";
      ctx.turnType = "INFORMACAO";
      ctx.mensagemPaciente = "Quanto custa a consulta de Cardiologia?";
      ctx.toolResults = [
        {
          nome: "consultar_base_conhecimento",
          capacidade: "searchKnowledgeBase",
          fonte: "base_conhecimento",
          success: false,
          erro: "timeout",
        },
      ];
      const r = avaliar(ctx, "A consulta de Cardiologia custa R$ 120,00 no dinheiro.");
      expect(r.resumo.nivel).toBe("LOW");
      expect(r.resumo.decisao).not.toBe("ALLOW");
      if (ambiente === "homologacao") expect(r.operacional?.status).toBe("cumprida");
      return r.resumo;
    });
    expect(resultados[0]).toEqual(resultados[1]);
  });

  it.each(["registro", "estado"])(
    "sem prova completa de %s a saudação da homologação continua indeterminada",
    (faltante) => {
      const ctx = contexto("homologacao");
      if (faltante === "registro") ctx.evidenciasFluxo!.registroFerramentasCompleto = false;
      else delete ctx.operationalState!.appointmentAttempted;
      const r = avaliar(ctx, "Oi! Como posso te ajudar?");
      expect(r.operacional?.status).toBe("indeterminada");
      expect(r.resumo.bloqueia).toBe(true);
    },
  );
});
