/**
 * FASE 4 — VERIFICAÇÃO DO MOTOR DE CONFIABILIDADE.
 *
 * Bateria de aceite dos 12 casos exigidos. Tudo aqui é camada pura: sem banco,
 * sem rede, sem modelo, sem mensagem real e sem tocar em fila, transferência,
 * Tool Broker ou telas. O que se verifica é a CLASSIFICAÇÃO.
 *
 * Nenhum caso exige nota fixa para saudação: o que se exige é que a saudação
 * válida não seja rebaixada por regra inaplicável nem pela dimensão separada
 * de linguagem, e que erro de fato, de identidade ou de operação continue
 * bloqueando.
 */
import { describe, expect, it } from "bun:test";
import { montarInstrucoesDoTurno } from "./contexto-avaliacao";
import { extrairEvidencia, type RetornoFerramenta } from "./evidencia-extrator";
import { verificarRespostaFinal } from "./final-answer";
import { montarResultadoConhecimento } from "../knowledge-contract";
import { InstructionComplianceValidator } from "./obrigacoes";
import { POLITICA_PADRAO, VERSAO_MOTOR, VERSAO_POLITICA } from "./policy";
import { PROMPT_PUBLICADO_V15 } from "./fixtures/prompt-publicado-v15";
import {
  garantirScoreDoTextoEnviado,
  montarContextoDoTurno,
  type EstadoDoTurno,
} from "./runtime";

const instrucoes = montarInstrucoesDoTurno({
  escopo: "whatsapp",
  texto: PROMPT_PUBLICADO_V15,
  versao: "15",
  versaoId: "e8ecc58b-7186-42ce-8e3f-a90c42c25c1a",
});

const APRESENTACAO =
  "Olá! Bom dia! Eu sou a Nina, atendente virtual da Policlínica Menino Jesus. Como posso te ajudar hoje?";

const estado = (over: Partial<EstadoDoTurno> = {}): EstadoDoTurno => ({
  texto: null,
  mensagemPaciente: "ola bom dia",
  acao: "responder_informacao",
  tipoTurno: "SAUDACAO",
  ferramentas: [],
  catalogoEncontrou: false,
  agendamentoConfirmado: false,
  pacienteIdentificado: false,
  esclarecimentoUsado: false,
  handoffSolicitado: false,
  apresentacaoJaFeita: false,
  ambiente: "producao",
  conversaId: "conv-fase4",
  messageId: "msg-fase4",
  instrucoes,
  ...over,
});

function avaliar(e: EstadoDoTurno, texto: string) {
  return verificarRespostaFinal({ ctx: montarContextoDoTurno(e), textoFinal: texto });
}

type ObrigacaoEvidencia = {
  id: string;
  tipo: string;
  status: string;
  motivo: string;
  prioridade: string | null;
};

function obrigacoesDe(e: EstadoDoTurno, texto: string): ObrigacaoEvidencia[] {
  const v = InstructionComplianceValidator({ ...montarContextoDoTurno(e), draftText: texto });
  const lista = (v.evidence as { obrigacoes?: ObrigacaoEvidencia[] }).obrigacoes ?? [];
  return lista;
}

// ----------------------------------------------------------- fonte oficial

const REGISTRO = {
  id: "reg-ecg",
  procedimento: "Eletrocardiograma",
  medico: "Dra. Marina",
  preco_dinheiro: 51,
  preco_cartao: 60,
};

const retorno: RetornoFerramenta = {
  ferramenta: "buscar_conhecimento",
  capacidade: "searchKnowledgeBase",
  fonte: "base_conhecimento",
  success: true,
  dados: montarResultadoConhecimento({
    registros: [REGISTRO],
    base: { versao: 6, arquivo: "catalogo.xlsx" },
  }),
  args: { termo: "eletrocardiograma" },
};
const evidencia = extrairEvidencia(retorno);

const comCatalogo = (over: Partial<EstadoDoTurno> = {}): EstadoDoTurno =>
  estado({
    mensagemPaciente: "bom dia, quanto custa o eletrocardiograma?",
    tipoTurno: "INFORMACAO",
    acao: "informar_valor",
    catalogoEncontrou: true,
    fatos: evidencia.fatos,
    ferramentas: [
      {
        nome: "buscar_conhecimento",
        capacidade: "searchKnowledgeBase",
        fonte: "base_conhecimento",
        success: true,
      },
    ],
    ...over,
  });

// =========================================================== casos 1 a 12

describe("FASE 4 — 1. saudação histórica 'ola bom dia'", () => {
  it("não recebe LOW nem transferência", () => {
    const r = avaliar(estado({ texto: APRESENTACAO }), APRESENTACAO);
    expect(r.level).not.toBe("LOW");
    expect(r.decision).not.toBe("HANDOFF");
    expect(r.blockers).toEqual([]);
    expect(r.hardBlockers).toEqual([]);
  });

  it("a limitação de linguagem continua declarada, sem virar aprovação", () => {
    const v = InstructionComplianceValidator({
      ...montarContextoDoTurno(estado({ texto: APRESENTACAO })),
      draftText: APRESENTACAO,
    });
    const limitacoes = (v.evidence as { limitacoes?: string[] }).limitacoes ?? [];
    expect(limitacoes).toContain("REGRA_DE_LINGUAGEM_ABERTA_NAO_VERIFICADA_AUTOMATICAMENTE");
  });
});

describe("FASE 4 — 2. 'oi' e 'oi boa tarde'", () => {
  const casos: Array<[string, string]> = [
    [
      "oi",
      "Olá! Eu sou a Nina, atendente virtual da Policlínica Menino Jesus. Como posso te ajudar?",
    ],
    [
      "oi boa tarde",
      "Olá! Boa tarde! Eu sou a Nina, atendente virtual da Policlínica Menino Jesus. Como posso ajudar?",
    ],
  ];
  for (const [msg, resposta] of casos) {
    it(`"${msg}" com resposta adequada não é rebaixada`, () => {
      const r = avaliar(estado({ mensagemPaciente: msg, texto: resposta }), resposta);
      expect(r.level).not.toBe("LOW");
      expect(r.decision).not.toBe("HANDOFF");
      expect(r.hardBlockers).toEqual([]);
    });
  }
});

describe("FASE 4 — 3. saudação em sessão já apresentada", () => {
  it("cumprimento curto sem repetir a apresentação não é penalizado", () => {
    const texto = "Oi! Como posso te ajudar?";
    const r = avaliar(estado({ apresentacaoJaFeita: true, mensagemPaciente: "oi", texto }), texto);
    expect(r.level).not.toBe("LOW");
    expect(r.blockers).toEqual([]);
  });
});

describe("FASE 4 — 4. saudação com pergunta de preço", () => {
  it("saudação que não afirma valor não é bloqueada", () => {
    const texto =
      "Olá! Bom dia! Eu sou a Nina, atendente virtual da Policlínica Menino Jesus. Já verifico o valor do eletrocardiograma para você.";
    const r = avaliar(comCatalogo({ texto }), texto);
    expect(r.hardBlockers).toEqual([]);
    expect(r.level).not.toBe("LOW");
  });
});

describe("FASE 4 — 5. preço correto sustentado por registro oficial", () => {
  it("valores iguais aos do registro passam", () => {
    const texto = "O eletrocardiograma custa R$ 51,00 no dinheiro e R$ 60,00 no cartão.";
    const r = avaliar(comCatalogo({ texto }), texto);
    expect(r.blockers).toEqual([]);
    expect(r.hardBlockers).toEqual([]);
    expect(r.level).not.toBe("LOW");
  });
});

describe("FASE 4 — 6. preço adulterado com a mesma fonte", () => {
  it("valor divergente continua bloqueando", () => {
    const texto = "O eletrocardiograma custa R$ 999,00 no cartão.";
    const r = avaliar(comCatalogo({ texto }), texto);
    expect(r.blockers).toContain("AFIRMACAO_SEM_EVIDENCIA");
    expect(r.hardBlockers).toContain("UNGROUNDED_CLAIM");
    expect(r.level).toBe("LOW");
    expect(r.decision).not.toBe("ALLOW");
  });
});

describe("FASE 4 — 7. resposta com identidade incorreta", () => {
  const texto = "Olá! Eu sou a Sofia, atendente virtual da Clínica Bem Estar. Como posso ajudar?";

  it("a divergência é apontada contra a identidade publicada", () => {
    const identidade = obrigacoesDe(estado({ texto }), texto).find(
      (o) => o.id === "instrucao:identidade",
    );
    expect(identidade?.status).toBe("descumprida");
    expect(identidade?.prioridade).toBe("critica");
    expect(identidade?.motivo).toContain("IDENTIDADE_DIVERGENTE_DA_PUBLICACAO");
  });

  it("não pode ser aprovada", () => {
    const r = avaliar(estado({ texto }), texto);
    expect(r.decision).not.toBe("ALLOW");
    expect(r.level).toBe("LOW");
  });

  it("a identidade correta da mesma publicação continua passando", () => {
    const identidade = obrigacoesDe(estado({ texto: APRESENTACAO }), APRESENTACAO).find(
      (o) => o.id === "instrucao:identidade",
    );
    expect(identidade?.status).toBe("cumprida");
  });
});

describe("FASE 4 — 8. coleta pertinente de dado sem executar operação", () => {
  it("pedir o dado que falta não é erro de resposta", () => {
    const texto = "Para seguir com o agendamento, me informe seu nome completo e a data de nascimento, por favor.";
    const r = avaliar(
      estado({
        mensagemPaciente: "quero agendar",
        tipoTurno: "ESCLARECIMENTO",
        acao: "nenhuma",
        apresentacaoJaFeita: true,
        requiredFields: ["nome", "data_nascimento"],
        texto,
      }),
      texto,
    );
    expect(r.hardBlockers).toEqual([]);
    expect(r.level).not.toBe("LOW");
  });
});

describe("FASE 4 — 9. operação dada como concluída sem comprovação", () => {
  it("continua bloqueada", () => {
    const texto = "Pronto! Seu agendamento foi confirmado para amanhã às 10h.";
    const r = avaliar(
      estado({
        mensagemPaciente: "quero agendar amanha as 10h",
        tipoTurno: "OPERACAO",
        acao: "criar_agendamento",
        apresentacaoJaFeita: true,
        texto,
      }),
      texto,
    );
    expect(r.decision).not.toBe("ALLOW");
    expect(r.level).toBe("LOW");
    expect((r.hardBlockers ?? []).length).toBeGreaterThan(0);
  });
});

describe("FASE 4 — 10. regra essencial aplicável e não verificável", () => {
  const e = estado({ ambiente: "homologacao", texto: APRESENTACAO });

  it("permanece indeterminada — nunca vira cumprida", () => {
    const criticasAbertas = obrigacoesDe(e, APRESENTACAO).filter(
      (o) => o.prioridade === "critica" && o.tipo === "restricao_aberta",
    );
    expect(criticasAbertas.length).toBeGreaterThan(0);
    expect(criticasAbertas.every((o) => o.status === "indeterminada")).toBe(true);
  });

  it("reduz a cobertura e impede aprovação, sem inventar nota de aprovação", () => {
    const r = avaliar(e, APRESENTACAO);
    expect(r.decision).not.toBe("ALLOW");
    expect(r.evidenceCoverage ?? 100).toBeLessThan(100);
    expect(r.unknownDimensions.length).toBeGreaterThan(0);
  });
});

describe("FASE 4 — 11. teste literal exato e mensagens fora da condição", () => {
  const literal = (e: EstadoDoTurno, texto: string) =>
    obrigacoesDe(e, texto).find((o) => o.motivo.startsWith("TEXTO_LITERAL"));

  it("condição satisfeita e resposta exata: exigência cumprida", () => {
    const texto = "ARQUITETURA_CONFIRMADA_9381";
    const e = estado({
      ambiente: "homologacao",
      mensagemPaciente: "TESTE-ARQUITETURA-9381",
      texto,
    });
    expect(literal(e, texto)?.status).toBe("cumprida");
    expect(avaliar(e, texto).decision).not.toBe("HANDOFF");
  });

  it("condição satisfeita e resposta com texto extra: exigência descumprida", () => {
    const texto = "Olá! ARQUITETURA_CONFIRMADA_9381";
    const e = estado({
      ambiente: "homologacao",
      mensagemPaciente: "TESTE-ARQUITETURA-9381",
      texto,
    });
    expect(literal(e, texto)?.status).toBe("descumprida");
    const r = avaliar(e, texto);
    expect(r.decision).not.toBe("ALLOW");
    expect(r.level).toBe("LOW");
  });

  it("mesma mensagem em produção: a regra não se aplica", () => {
    const texto = "Olá! Como posso te ajudar?";
    const e = estado({
      ambiente: "producao",
      mensagemPaciente: "TESTE-ARQUITETURA-9381",
      apresentacaoJaFeita: true,
      texto,
    });
    expect(literal(e, texto)).toBeUndefined();
    expect(avaliar(e, texto).level).not.toBe("LOW");
  });

  it("saudação comum não é cobrada pelo marcador literal", () => {
    const e = estado({ ambiente: "homologacao", texto: APRESENTACAO });
    expect(literal(e, APRESENTACAO)).toBeUndefined();
  });
});

describe("FASE 4 — 12. texto alterado depois da primeira avaliação", () => {
  it("a avaliação anterior é descartada e o motor roda de novo", () => {
    const e = estado({ texto: APRESENTACAO });
    const primeira = garantirScoreDoTextoEnviado(e, APRESENTACAO);
    expect(primeira.recalculado).toBe(true);
    expect(primeira.motivo).toBe("sem_avaliacao_previa");

    const reaproveitada = garantirScoreDoTextoEnviado(
      e,
      APRESENTACAO,
      primeira.resultado,
    );
    expect(reaproveitada.recalculado).toBe(false);
    expect(reaproveitada.motivo).toBe("avaliacao_valida");

    const alterado = `${APRESENTACAO} Posso confirmar seu agendamento agora.`;
    const nova = garantirScoreDoTextoEnviado(e, alterado, primeira.resultado);
    expect(nova.recalculado).toBe(true);
    expect(nova.motivo).toBe("texto_alterado_apos_avaliacao");
    expect(nova.resultado.textoAvaliadoHash).not.toBe(primeira.resultado.textoAvaliadoHash);
  });
});

describe("FASE 4 — invariantes de política", () => {
  it("os limites configurados continuam os mesmos", () => {
    expect(POLITICA_PADRAO.limites.HIGH).toBe(90);
    expect(POLITICA_PADRAO.limites.MEDIUM).toBe(75);
  });

  it("a versão vigente do motor e da política está declarada", () => {
    expect(VERSAO_MOTOR).toBe("confidence-v3");
    expect(VERSAO_POLITICA).toBe("v7");
  });
});
