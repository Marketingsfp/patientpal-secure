/**
 * Bloqueio INDEVIDO de saudação — regressão.
 *
 * Cenário real: "oi boa tarde" + apresentação correta era reprovada porque uma
 * regra publicada condicionada ("não acrescente saudação QUANDO a pessoa já
 * explicou o que precisa") era lida como proibição universal e ficava sem
 * conferência, derrubando a cobertura de evidências.
 *
 * Estes testes fixam:
 *  - a condição é lida por frase, e a situação da conversa decide se vale;
 *  - saudação correta não produz evidência desconhecida;
 *  - a mesma regra continua valendo quando a pessoa já expôs a demanda;
 *  - a exceção de saudação cai quando há ação, afirmação sem fonte, pedido de
 *    humano, conflito de identidade ou descumprimento bloqueante.
 */
import { describe, expect, it } from "bun:test";
import { extrairRegrasPublicadas, aplicabilidadeDaRegra } from "./regras-publicadas";
import type { ContextoConfianca } from "./types";

const TEXTO_PUBLICADO = `ATENDIMENTO
Na primeira mensagem de cada conversa, apresente-se assim: "Olá! Sou a Nina, assistente da Policlínica Menino Jesus. Como posso ajudar?". Nas mensagens seguintes, continue o atendimento sem repetir a apresentação. Não acrescente saudação quando a pessoa já explicou o que precisa.`;

const HASH = "publicacao-teste";

function contexto(over: Partial<ContextoConfianca>): ContextoConfianca {
  const { regras, limitacoes } = extrairRegrasPublicadas(TEXTO_PUBLICADO, {
    escopo: "atendimento",
    hash: HASH,
  });
  return {
    draftText: "Olá! Sou a Nina, assistente da Policlínica Menino Jesus. Como posso ajudar?",
    mensagemPaciente: "oi boa tarde",
    turnType: "SAUDACAO",
    instrucoes: { hash: HASH, regras, limitacoes },
    businessContext: {
      ambiente: "homologacao",
      pacienteIdentificado: false,
      agendamentoConfirmado: false,
      esclarecimentoUsado: false,
      handoffSolicitado: false,
      apresentacaoJaFeita: false,
    },
    ...over,
  } as ContextoConfianca;
}

describe("regra condicionada é lida por frase", () => {
  const { regras } = extrairRegrasPublicadas(TEXTO_PUBLICADO, {
    escopo: "atendimento",
    hash: HASH,
  });
  const proibicao = regras.find((r) => /n[ãa]o acrescente/i.test(r.descricao));

  it("guarda a situação declarada no texto, não a mensagem", () => {
    expect(proibicao?.condicao.tipo).toBe("situacao");
    expect(proibicao?.condicao).toMatchObject({ situacao: "demanda_declarada" });
  });

  it("não vale em uma saudação pura", () => {
    expect(aplicabilidadeDaRegra(proibicao!, { demandaDeclarada: false })).toBe("nao_aplica");
  });

  it("vale quando a pessoa já expôs a demanda", () => {
    expect(aplicabilidadeDaRegra(proibicao!, { demandaDeclarada: true })).toBe("aplica");
  });

  it("fica indeterminada quando a situação é desconhecida", () => {
    expect(aplicabilidadeDaRegra(proibicao!, {})).toBe("indeterminada");
  });
});
