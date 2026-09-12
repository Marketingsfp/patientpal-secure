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
import { InstructionComplianceValidator } from "./obrigacoes";
import {
  excecaoSaudacaoAplicavel,
  decidirBloqueioBaixaConfianca,
  type EntradaSaudacao,
} from "./baixa-confiabilidade";
import type { ContextoConfianca } from "./types";

const TEXTO_PUBLICADO = `ATENDIMENTO
Na primeira mensagem de cada conversa, apresente-se assim: "Olá! Sou a Nina, assistente da Policlínica Menino Jesus. Como posso ajudar?". Nas mensagens seguintes, continue o atendimento sem repetir a apresentação. Não acrescente saudação quando a pessoa já explicou o que precisa.`;

const HASH = "publicacao-teste";

function contexto(over: Partial<ContextoConfianca>): ContextoConfianca {
  const { regras, limitacoes } = extrairRegrasPublicadas(TEXTO_PUBLICADO, { escopo: "atendimento", hash: HASH });
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
  const { regras } = extrairRegrasPublicadas(TEXTO_PUBLICADO, { escopo: "atendimento", hash: HASH });
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

describe("saudação correta não vira evidência desconhecida", () => {
  it("não reprova nem marca UNKNOWN", () => {
    const r = InstructionComplianceValidator(contexto({}));
    expect(r.status).not.toBe("UNKNOWN");
    expect(r.status).not.toBe("FAIL");
    expect(r.score).toBe(100);
  });

  it("mantém a regra valendo quando a pessoa já pediu algo", () => {
    const r = InstructionComplianceValidator(
      contexto({
        mensagemPaciente: "quanto custa a consulta de cardiologia?",
        turnType: "INFORMACAO",
        draftText: "Olá! Sou a Nina. A consulta de cardiologia custa R$ 200.",
      }),
    );
    expect(r.status).toBe("FAIL");
    expect(r.reasonCode).toBe("RESTRICAO_PUBLICADA_DESCUMPRIDA");
  });
});

describe("exceção de saudação é estruturada", () => {
  const base: EntradaSaudacao = { turnoSocial: true };

  it("vale só quando nada de risco foi observado", () => {
    expect(excecaoSaudacaoAplicavel(base).aplica).toBe(true);
  });

  it.each([
    ["acaoOperacional", "ACAO_OPERACIONAL_NO_TURNO"],
    ["afirmacaoSemFonte", "AFIRMACAO_SEM_FONTE"],
    ["pedidoDeHumano", "PEDIDO_DE_ATENDIMENTO_HUMANO"],
    ["conflitoDeIdentidade", "CONFLITO_DE_IDENTIDADE"],
    ["conformidadeBloqueante", "CONFORMIDADE_BLOQUEANTE"],
  ] as const)("cai com %s", (campo: string, impedimento: string) => {
    const r = excecaoSaudacaoAplicavel({ ...base, [campo]: true });
    expect(r.aplica).toBe(false);
    expect(r.impedimento).toBe(impedimento);
  });

  it("não isenta turno que não é social", () => {
    expect(excecaoSaudacaoAplicavel({ turnoSocial: false }).aplica).toBe(false);
  });
});

describe("decisão de bloqueio com nota baixa", () => {
  const comum = {
    nivel: "LOW" as const,
    score: 74,
    decisaoMotor: "HANDOFF" as const,
    etapa: "A" as const,
    ambiente: "homologacao" as const,
  };

  it("saudação correta não encaminha", () => {
    const d = decidirBloqueioBaixaConfianca({
      ...comum,
      saudacao: { turnoSocial: true },
    });
    expect(d.bloquear).toBe(false);
    expect(d.encaminhar).toBe(false);
  });

  it("saudação com afirmação sem fonte volta ao critério normal", () => {
    const d = decidirBloqueioBaixaConfianca({
      ...comum,
      saudacao: { turnoSocial: true, afirmacaoSemFonte: true },
    });
    expect(d.bloquear).toBe(true);
    expect(d.impedimentoSaudacao).toBe("AFIRMACAO_SEM_FONTE");
  });

  it("homologação nunca transfere de verdade: a decisão só marca o desfecho", () => {
    const d = decidirBloqueioBaixaConfianca({
      ...comum,
      saudacao: { turnoSocial: false },
    });
    expect(d.ambiente).toBe("homologacao");
    expect(d.bloquear).toBe(true);
  });
});
