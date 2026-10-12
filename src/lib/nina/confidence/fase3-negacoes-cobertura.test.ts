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
});
