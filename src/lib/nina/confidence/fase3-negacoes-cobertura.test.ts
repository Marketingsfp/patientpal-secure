/**
 * FASE 3 (MOTOR DE CONFIABILIDADE) — NEGAÇÕES E COBERTURA DAS AFIRMAÇÕES.
 *
 * Dados fictícios. Nenhuma mensagem real, nenhum paciente real.
 *
 * O que estes testes travam:
 * - "não temos vaga" com a agenda devolvendo vaga não pode ser aprovado;
 * - resultado vazio só sustenta ausência dentro do escopo consultado;
 * - consulta que falhou, veio parcial ou truncada não comprova inexistência;
 * - o "não" de uma oração não impede a conferência do preço da oração seguinte;
 * - pergunta, recusa e desconhecimento declarado não são afirmações factuais;
 * - zero afirmações reconhecidas não é prova de que não havia o que verificar.
 */
import { describe, expect, it } from "bun:test";
import { avaliarGrounding, ClaimGroundingValidator, extrairClaimsDoTexto } from "./claims";
import { classificarNatureza, oracaoNaPosicao, oracoesDaResposta } from "./modalidade";
import type { ConsultaDoTurno, FatoRecuperado } from "./evidencia";
import type { ContextoConfianca } from "./types";

const consulta = (c: Partial<ConsultaDoTurno>): ConsultaDoTurno => ({
  id: "c1",
  consulta: "consultar_agenda",
  capacidade: "checkAvailability",
  status: "vazio",
  tentativas: 1,
  falhasAnteriores: [],
  ...c,
});

const ctx = (
  fatos: FatoRecuperado[],
  consultas: ConsultaDoTurno[],
  extras: Partial<ContextoConfianca> = {},
): ContextoConfianca => ({
  requestedAction: null,
  fatos,
  consultas,
  retrievedSources: [],
  toolResults: [],
  businessContext: {
    ambiente: "producao",
    pacienteIdentificado: false,
    agendamentoConfirmado: false,
    esclarecimentoUsado: false,
    handoffSolicitado: false,
  },
  ...extras,
});

const fatoVaga: FatoRecuperado = {
  consulta: "consultar_agenda",
  capacidade: "checkAvailability",
  entidade: "vaga",
  campo: "slot",
  valor: "14:00",
  fonte: "agenda",
  registro: "slot-1",
};

const fatoPreco: FatoRecuperado = {
  consulta: "buscar_conhecimento",
  capacidade: "searchKnowledgeBase",
  entidade: "procedimento",
  campo: "preco",
  valor: "150,00",
  fonte: "catalogo_publicado",
  registro: "proc-1",
};

describe("orações e natureza", () => {
  it("separa orações ligadas por vírgula e conectivos", () => {
    const t = "Não precisa de encaminhamento, a consulta custa R$ 999";
    expect(oracoesDaResposta(t).length).toBeGreaterThan(1);
    expect(classificarNatureza(oracaoNaPosicao(t, t.indexOf("R$")))).toBe("afirmacao_positiva");
    expect(classificarNatureza(oracaoNaPosicao(t, 0))).toBe("ausencia_afirmada");
  });

  it("distingue desconhecido, falha, recusa, hipótese e pergunta", () => {
    expect(classificarNatureza("não tenho essa informação")).toBe("desconhecido_declarado");
    expect(classificarNatureza("não consegui consultar a agenda agora")).toBe("falha_declarada");
    expect(classificarNatureza("não posso informar por aqui")).toBe("recusa_ou_limitacao");
    expect(classificarNatureza("geralmente custa R$ 150")).toBe("hipotese");
    expect(classificarNatureza("Qual dia você prefere?")).toBe("pergunta");
    expect(classificarNatureza("a consulta custa R$ 150")).toBe("afirmacao_positiva");
  });

  it("o 'não' de uma oração não vira negativa do preço afirmado ao lado", () => {
    const t = "Não precisa de encaminhamento, a consulta custa R$ 999";
    const preco = extrairClaimsDoTexto(t).find((c) => c.tipo === "valor");
    expect(preco?.modalidade).toBe("afirmacao");
    expect(preco?.natureza).toBe("afirmacao_positiva");
  });
});

describe("negativas factuais", () => {
  it("consulta retornou vaga e a resposta nega — divergente, sem suporte", () => {
    const r = avaliarGrounding(
      ctx([fatoVaga], [consulta({ status: "com_itens" })]),
      "Não temos vaga disponível",
    );
    const neg = r.claims.find((c) => c.modalidade === "negacao");
    expect(neg?.situacao).toBe("divergente");
    expect(neg?.suportado).toBe(false);
    expect(r.semEvidencia.length).toBeGreaterThan(0);
  });

  it("consulta vazia no escopo correto sustenta a ausência", () => {
    const r = avaliarGrounding(ctx([], [consulta({ status: "vazio" })]), "Não temos vaga disponível");
    const neg = r.claims.find((c) => c.modalidade === "negacao");
    expect(neg?.situacao).toBe("confirmado");
    expect(neg?.suportado).toBe(true);
  });

  it("consulta que falhou não comprova inexistência", () => {
    const r = avaliarGrounding(
      ctx([], [consulta({ status: "falha", erro: "timeout" })]),
      "Não temos vaga disponível",
    );
    const neg = r.claims.find((c) => c.modalidade === "negacao");
    expect(neg?.suportado).toBe(false);
    expect(neg?.motivo).toContain("falha");
  });

  it("consulta parcial ou truncada não comprova inexistência", () => {
    const parcial = avaliarGrounding(
      ctx([], [consulta({ status: "parcial" })]),
      "Não temos vaga disponível",
    );
    expect(parcial.claims.find((c) => c.modalidade === "negacao")?.situacao).toBe("nao_verificado");

    const truncada = avaliarGrounding(
      ctx([], [consulta({ status: "vazio", truncado: true })]),
      "Não temos vaga disponível",
    );
    expect(truncada.claims.find((c) => c.modalidade === "negacao")?.suportado).toBe(false);
  });
});

describe("orações mistas e naturezas não factuais", () => {
  it("preço divergente é pego mesmo com negativa na oração anterior", () => {
    const r = avaliarGrounding(
      ctx([fatoPreco], [consulta({ consulta: "buscar_conhecimento", capacidade: "searchKnowledgeBase", status: "com_itens" })]),
      "Não precisa de encaminhamento, a consulta custa R$ 999",
    );
    const preco = r.claims.find((c) => c.tipo === "valor");
    expect(preco?.situacao).toBe("divergente");
    expect(preco?.valorDaFonte).toBe("150,00");
  });

  it("pergunta não gera afirmação; recusa e desconhecimento não são penalizados", () => {
    const pergunta = avaliarGrounding(ctx([], []), "Qual valor você já tem em mãos?");
    expect(pergunta.claims.length).toBe(0);

    const recusa = avaliarGrounding(ctx([], []), "Não posso informar o valor por aqui");
    expect(recusa.semEvidencia.length).toBe(0);
    for (const c of recusa.claims) expect(c.situacao).toBe("nao_verificado");
  });
});

describe("cobertura da extração", () => {
  it("dado operacional não reconhecido vira limitação, não aprovação", () => {
    const contexto = ctx([], [], { draftText: "Chegue com 3h de jejum." });
    const r = avaliarGrounding(contexto, contexto.draftText);
    if (r.total === 0) {
      expect(r.limitacoes.length).toBeGreaterThan(0);
      expect(ClaimGroundingValidator(contexto).status).toBe("UNKNOWN");
    } else {
      expect(r.claims.length).toBeGreaterThan(0);
    }
  });
});
