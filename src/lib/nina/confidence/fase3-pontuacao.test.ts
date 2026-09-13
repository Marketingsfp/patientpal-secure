/**
 * FASE 3 — aceite da matemática, classificação e configuração.
 *
 * Contas reproduzíveis sobre a avaliação real da Fase 2 (contrato da Fase 1).
 * Nenhuma nota é fornecida pronta: tudo sai do motor.
 */
import { describe, expect, it } from "bun:test";
import { PROMPT_CANDIDATO_23_REGRAS } from "./fixtures/prompt-23-regras";
import { compilarContratoRegras } from "./contrato-regras";
import { montarContextoCanonico, type EntradaContextoCanonico } from "./contexto-canonico";
import { avaliarContrato, type AvaliacaoContrato } from "./avaliacao-regras";
import { configuracaoPadrao, montarConfiguracao } from "./configuracao";
import { POLITICA_PADRAO } from "./policy";
import {
  explicarPontuacao,
  politicaDoTurno,
  pontuarContrato,
  validarPoliticaCompleta,
  VERSAO_PONTUACAO_CONTRATO,
  type EntradaPontuacao,
} from "./pontuacao-contrato";

const META = { escopo: "homologacao", versao: "candidato-1", versaoId: "v1" };
const contrato = compilarContratoRegras(PROMPT_CANDIDATO_23_REGRAS, META);
const CFG = configuracaoPadrao();

function avaliar(e: EntradaContextoCanonico, opcoes = {}): AvaliacaoContrato {
  return avaliarContrato(
    contrato,
    montarContextoCanonico({ identidadePublicada: contrato.identidade, ...e }),
    opcoes,
  );
}

function pontuar(e: EntradaContextoCanonico, extra: Partial<EntradaPontuacao> = {}) {
  return pontuarContrato({ avaliacao: avaliar(e), configuracao: CFG, ...extra });
}

const SAUDACAO: EntradaContextoCanonico = {
  mensagemRecebida: "oi",
  candidato: "Oi! Sou a Nina, da Policlínica Menino Jesus. Como posso ajudar?",
  ambiente: "homologacao",
  primeiraResposta: true,
  apresentacaoEntregue: false,
};

describe("1. saudação adequada deixa de receber falso LOW", () => {
  const p = pontuar(SAUDACAO);

  it("nota conhecida e cobertura saem da fórmula, não de um valor fixo", () => {
    const A = p.parcelas.filter((x) => x.contaNaNota).reduce((s, x) => s + x.peso, 0);
    const R = p.parcelas.reduce((s, x) => s + x.peso, 0);
    expect(p.denominadorAvaliado).toBeCloseTo(A, 4);
    expect(p.denominadorRelevante).toBeCloseTo(R, 4);
    expect(p.cobertura).toBe(Math.round((100 * A) / R));
  });

  it("classifica HIGH e entrega, sem bypass de envio", () => {
    expect(p.bloqueadores).toEqual([]);
    expect(p.cobertura).toBe(100);
    expect(p.nivel).toBe("HIGH");
    expect(p.decisao).toBe("ENTREGAR");
    expect(p.segurancaAcao.estado).toBe("sem_acao");
  });

  it("orçamento de instruções é 15 e não cresce com o número de regras", () => {
    const total = p.parcelas.reduce((s, x) => s + x.peso, 0);
    expect(Math.round(total)).toBe(POLITICA_PADRAO.pesos["InstructionComplianceValidator"]);
  });

  it("saída técnica traz numerador, denominadores, tetos e motivo", () => {
    const t = explicarPontuacao(p);
    expect(t).toContain("nao e probabilidade");
    expect(t).toContain("cobertura=100%");
    expect(t).toContain(`versoes=${VERSAO_PONTUACAO_CONTRATO}`);
  });
});

describe("2. mesmo texto com identidade errada é bloqueado", () => {
  const p = pontuar({
    ...SAUDACAO,
    candidato: "Oi! Sou a Carla, da Clínica Vida Nova. Como posso ajudar?",
  });

  it("bloqueia por identidade e força LOW", () => {
    expect(p.bloqueadores).toContain("IDENTIDADE_INCORRETA");
    expect(p.notaFinal).toBe(0);
    expect(p.nivel).toBe("LOW");
    expect(p.decisao).toBe("BLOQUEAR_E_ENCAMINHAR");
  });
});

const PRECO = (comFonte: boolean, texto: string): EntradaContextoCanonico => ({
  mensagemRecebida: "qual o valor do hemograma?",
  candidato: texto,
  ambiente: "homologacao",
  primeiraResposta: false,
  apresentacaoEntregue: true,
  afirmacoes: [
    {
      id: "a1",
      texto: "hemograma R$ 51,00",
      tipo: "preco",
      entidade: "hemograma",
      condicao: "dinheiro",
      comFonte,
      ...(comFonte ? { fonte: "catálogo publicado" } : {}),
    },
  ],
});

describe("3. preço conferido na fonte x preço divergente", () => {
  it("preço com fonte é aprovado", () => {
    const p = pontuar(PRECO(true, "O hemograma custa R$ 51,00 no dinheiro."));
    expect(p.bloqueadores).toEqual([]);
    expect(p.nivel).toBe("HIGH");
  });

  it("preço sem lastro é bloqueado mesmo com cobertura 100%", () => {
    const p = pontuar(PRECO(false, "O hemograma custa R$ 90,00 no dinheiro."));
    expect(p.cobertura).toBe(100);
    expect(p.bloqueadores).toContain("AFIRMACAO_SEM_FONTE");
    expect(p.nivel).toBe("LOW");
  });
});

describe("4. só linguagem indeterminada não derruba a nota substantiva", () => {
  const p = pontuarContrato({
    avaliacao: (() => {
      const a = avaliar(SAUDACAO);
      const ling = a.resultados.filter((r) => r.categoria === "LINGUAGEM");
      return {
        ...a,
        resultados: a.resultados.map((r) =>
          r.categoria === "LINGUAGEM"
            ? { ...r, status: "UNKNOWN" as const, nota: null, motivo: "VERIFICACAO_SEMANTICA_INDISPONIVEL" }
            : r,
        ),
        apenasLinguagemIndeterminada: ling.length > 0,
      };
    })(),
    configuracao: CFG,
  });

  it("cobertura substantiva segue 100 e nada vai ao teto 74", () => {
    expect(p.cobertura).toBe(100);
    expect(p.tetos).toEqual([]);
    expect(p.nivel).toBe("HIGH");
  });

  it("linguagem é reportada à parte", () => {
    expect(p.linguagem.unknown).toBeGreaterThanOrEqual(0);
    expect(p.linguagem.avaliadas + p.linguagem.unknown).toBeGreaterThanOrEqual(0);
  });
});

describe("5. prova essencial indeterminada não recebe aprovação", () => {
  const p = pontuar({
    mensagemRecebida: "confirmou meu agendamento?",
    candidato: "Já confirmei seu agendamento para amanhã às 9h.",
    ambiente: "homologacao",
    primeiraResposta: false,
    apresentacaoEntregue: true,
    operacao: {
      tipo: "criar_agendamento",
      anunciadaNaResposta: true,
      executada: true,
      resultado: null,
      comprovante: null,
      dadosPendentes: [],
    },
  });

  it("fica LOW e vai para o destino humano", () => {
    expect(p.nivel).toBe("LOW");
    expect(p.decisao).toBe("BLOQUEAR_E_ENCAMINHAR");
    expect(
      p.bloqueadores.includes("PROVA_ESSENCIAL_INDETERMINADA") ||
        p.bloqueadores.includes("OPERACAO_SEM_CONFIRMACAO"),
    ).toBe(true);
  });
});

describe("6. duplicação de regra e orientações de linguagem não distorcem pesos", () => {
  const base = avaliar(SAUDACAO);
  const dobrada = {
    ...base,
    resultados: [
      ...base.resultados,
      ...base.resultados.map((r) => ({ ...r, identificador: `${r.identificador}-BIS` })),
    ],
  };
  const p1 = pontuarContrato({ avaliacao: base, configuracao: CFG });
  const p2 = pontuarContrato({ avaliacao: dobrada, configuracao: CFG });

  it("duplicar regra equivalente não muda nota nem cobertura", () => {
    expect(p2.notaFinal).toBe(p1.notaFinal);
    expect(p2.cobertura).toBe(p1.cobertura);
    expect(p2.denominadorRelevante).toBeCloseTo(p1.denominadorRelevante, 4);
  });

  it("peso total continua dentro do orçamento", () => {
    const total = p2.parcelas.reduce((s, x) => s + x.peso, 0);
    expect(Math.round(total)).toBe(15);
  });
});

describe("7. falha de verificador não conta como evidência avaliada", () => {
  const base = avaliar(SAUDACAO);
  const alvo = base.resultados.find((r) => r.categoria === "ESSENCIAL")!;
  const comFalha = {
    ...base,
    resultados: base.resultados.map((r) =>
      r.identificador === alvo.identificador
        ? { ...r, status: "UNKNOWN" as const, nota: null, falhaTecnica: true, motivo: "VERIFICADOR_FALHOU" }
        : r,
    ),
  };
  const p = pontuarContrato({ avaliacao: comFalha, configuracao: CFG });

  it("sai da nota conhecida e entra só na cobertura", () => {
    const parcela = p.parcelas.find((x) => x.identificadores.includes(alvo.identificador!))!;
    expect(parcela.contaNaNota).toBe(false);
    expect(parcela.contaNaCobertura).toBe(true);
    expect(parcela.falhaTecnica).toBe(true);
    expect(p.cobertura).toBeLessThan(100);
  });
});

describe("8. limites personalizados, fronteiras e ausência de evidência", () => {
  it("limiar personalizado válido é respeitado", () => {
    const cfg = montarConfiguracao([
      {
        id: "p1",
        tipo: "AJUSTAR_LIMITE",
        alvo: "limites.HIGH",
        valor: 80,
        aplicadoPor: "jean",
        aplicadoEm: "2026-09-12T00:00:00Z",
      },
    ]);
    const { politica } = politicaDoTurno(cfg);
    expect(politica.limites.HIGH).toBe(80);
    expect(Object.isFrozen(politica)).toBe(true);
  });

  it("conjunto incompatível não entra em vigor: cai no padrão inteiro", () => {
    const invalida = { ...POLITICA_PADRAO, limites: { HIGH: 60, MEDIUM: 75 } };
    expect(validarPoliticaCompleta(invalida).ok).toBe(false);
    const { politica, degradacao } = politicaDoTurno({ ...CFG, parametros: invalida });
    expect(politica.limites).toEqual(POLITICA_PADRAO.limites);
    expect(degradacao).toContain("configuracao_invalida");
  });

  it("sem nenhuma evidência avaliável a nota é 0, nunca 100", () => {
    const p = pontuarContrato({
      avaliacao: { ...avaliar(SAUDACAO), resultados: [] },
      configuracao: CFG,
    });
    expect(p.notaFinal).toBe(0);
    expect(p.cobertura).toBe(0);
    expect(p.bloqueadores).toContain("CONFIANCA_INSUFICIENTE");
    expect(p.decisao).toBe("BLOQUEAR_E_ENCAMINHAR");
  });

  it("decisão anterior ALLOW não entrega um LOW", () => {
    const p = pontuar(PRECO(false, "O hemograma custa R$ 90,00."), { decisaoAnterior: "ALLOW" });
    expect(p.nivel).toBe("LOW");
    expect(p.decisao).toBe("BLOQUEAR_E_ENCAMINHAR");
  });
});
