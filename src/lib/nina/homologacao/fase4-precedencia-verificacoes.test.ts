/**
 * FASE 4 — testes locais (puros) de precedência, modo técnico e das duas
 * verificações. A aderência do MODELO só é comprovada rodando a verificação
 * de fonte com LLM real — isto aqui não substitui aquilo.
 */
import { describe, it, expect } from "bun:test";
import {
  resolverPrecedencia,
  saudacaoObrigatoriaEfetiva,
  textoContratoPrecedencia,
  resumoPrecedencia,
  REGRA_SAUDACAO,
  type RestricaoEstruturada,
} from "@/lib/nina/prompt/precedencia";
import {
  decidirModoTecnico,
  excecoesDaVerificacaoDeFonte,
  CANAL_HOMOLOGACAO,
} from "@/lib/nina/homologacao/modo-tecnico";
import {
  PARES_MARCADOR_PADRAO,
  regraPublicavelDoPar,
  avaliarAderenciaFonte,
  resumirAtendimentoCompleto,
} from "@/lib/nina/homologacao/verificacoes";
import { decidirHandoff } from "@/lib/nina/confidence/handoff-decision";
import { validarTemplateInstrucoes } from "@/lib/nina/instrucoes-template";

const saudacao: RestricaoEstruturada = {
  codigo: REGRA_SAUDACAO,
  nivel: "regra_geral",
  origem: "publicado",
  descricao: "apresentação obrigatória",
  texto: "Apresente-se na primeira mensagem.",
};

describe("precedência", () => {
  it("exceção publicada suprime a regra geral de apresentação", () => {
    const r = resolverPrecedencia({
      regrasGerais: [saudacao],
      excecoes: excecoesDaVerificacaoDeFonte("responda NINA-X"),
    });
    expect(r.suprimidas).toContain(REGRA_SAUDACAO);
    expect(saudacaoObrigatoriaEfetiva(true, r)).toBe(false);
  });

  it("conversa comum sem exceção mantém a saudação", () => {
    const r = resolverPrecedencia({ regrasGerais: [saudacao], excecoes: [] });
    expect(saudacaoObrigatoriaEfetiva(true, r)).toBe(true);
    expect(textoContratoPrecedencia(r)).toContain(REGRA_SAUDACAO);
  });

  it("nenhuma exceção suprime proteção inegociável", () => {
    const r = resolverPrecedencia({
      regrasGerais: [saudacao],
      excecoes: [
        {
          codigo: "TENTATIVA",
          nivel: "excecao_publicada",
          origem: "publicado",
          descricao: "tenta liberar agendamento",
          suprime: ["BLOQUEIO_AGENDAMENTO_SEM_CONFIRMACAO"],
        },
      ],
    });
    expect(r.supressoesRecusadas).toContain("BLOQUEIO_AGENDAMENTO_SEM_CONFIRMACAO");
    expect(r.suprimidas).not.toContain("BLOQUEIO_AGENDAMENTO_SEM_CONFIRMACAO");
    expect(resumoPrecedencia(r).supressoes_recusadas.length).toBe(1);
  });
});

describe("modo técnico", () => {
  it("nunca liga em produção", () => {
    expect(
      decidirModoTecnico({
        ambiente: "producao",
        canal: CANAL_HOMOLOGACAO,
        autorizadoPeloServidor: true,
      }).ativo,
    ).toBe(false);
  });

  it("nunca liga fora do canal de teste, mesmo autorizado", () => {
    expect(
      decidirModoTecnico({
        ambiente: "homologacao",
        canal: "whatsapp",
        autorizadoPeloServidor: true,
      }).ativo,
    ).toBe(false);
  });

  it("exige autorização do servidor", () => {
    expect(
      decidirModoTecnico({
        ambiente: "homologacao",
        canal: CANAL_HOMOLOGACAO,
        autorizadoPeloServidor: false,
      }).ativo,
    ).toBe(false);
  });
});

describe("verificação de fonte", () => {
  it("os dois pares padrão são distintos", () => {
    const [a, b] = PARES_MARCADOR_PADRAO;
    expect(a!.marcador).not.toBe(b!.marcador);
    expect(a!.gatilho).not.toBe(b!.gatilho);
  });

  it("a regra publicável passa na allowlist de marcadores", () => {
    for (const par of PARES_MARCADOR_PADRAO) {
      const v = validarTemplateInstrucoes("homologacao", regraPublicavelDoPar(par));
      expect(v.ok).toBe(true);
    }
  });

  it("aderência separa presença no payload de cumprimento da resposta", () => {
    const par = PARES_MARCADOR_PADRAO[0]!;
    const payload = regraPublicavelDoPar(par);
    expect(
      avaliarAderenciaFonte({ par, payload, primeiraResposta: par.marcador }),
    ).toEqual({ regraChegouAoPayload: true, primeiraRespostaCumpriu: true });
    expect(
      avaliarAderenciaFonte({ par, payload, primeiraResposta: "Olá! Como posso ajudar?" }),
    ).toEqual({ regraChegouAoPayload: true, primeiraRespostaCumpriu: false });
    expect(
      avaliarAderenciaFonte({ par, payload: "sem regra", primeiraResposta: par.marcador }),
    ).toEqual({ regraChegouAoPayload: false, primeiraRespostaCumpriu: true });
  });

  it("retirar a regra retira o marcador do texto publicável", () => {
    const par = PARES_MARCADOR_PADRAO[1]!;
    const semRegra = "Nenhuma regra de marcador está vigente nesta sessão.";
    expect(semRegra.includes(par.marcador)).toBe(false);
  });
});

describe("atendimento completo", () => {
  it("sem registro do turno o resultado é SEM_EVIDENCIA", () => {
    const r = resumirAtendimentoCompleto(null);
    expect(r.resultado).toBe("SEM_EVIDENCIA");
    expect(r.lacunas).toContain("registro_do_turno");
  });

  it("intervenção aparece separada, sem virar sucesso limpo", () => {
    const r = resumirAtendimentoCompleto({
      modelo_chamado: true,
      origem_resposta: "modelo_transformado",
      transformacoes: [{ etapa: "confianca", motivo: "sanitizacao" }],
      confianca: { decisao: "ALLOW", score: 0.9, nivel: "ALTA", etapa: "final", avaliacao: "ok" },
      entrega: { mensagemId: "m1" },
    });
    expect(r.resultado).toBe("APROVADO_COM_INTERVENCAO");
    expect(r.intervencoes[0]!.etapa).toBe("confianca");
  });

  it("decisão de bloqueio não é apresentada como aprovação", () => {
    const r = resumirAtendimentoCompleto({
      modelo_chamado: true,
      confianca: { decisao: "HANDOFF" },
      entrega: { mensagemId: "m2" },
    });
    expect(r.resultado).toBe("REPROVADO");
  });
});

describe("handoff com exceção publicada", () => {
  const base = {
    avaliacaoAcao: { decision: "CLARIFY", hardBlockers: [] } as never,
    decisaoEfetiva: "CLARIFY" as const,
    tipoTurno: "PERGUNTA_FACTUAL" as const,
    tentativasEsclarecimento: 0,
  };

  it("exceção publicada evita CLARIFY desnecessário", () => {
    const d = decidirHandoff({ ...base, excecaoPublicadaAplicavel: true } as never);
    expect(d.decision).toBe("CONTINUE");
    expect(d.reason).toBe("PUBLISHED_EXCEPTION");
  });

  it("sem exceção, o comportamento anterior continua", () => {
    const d = decidirHandoff({ ...base } as never);
    expect(d.decision).toBe("CLARIFY");
  });
});
