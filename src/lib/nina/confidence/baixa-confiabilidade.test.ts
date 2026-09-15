/**
 * Testes da regra obrigatória: confiança BAIXA encaminha para humano.
 */
import { describe, expect, it } from "bun:test";
import {
  AVISO_ENCAMINHAMENTO_FALHOU,
  AVISO_ENCAMINHAMENTO_HUMANO,
  MOTIVO_BLOQUEIO_BAIXA_CONFIANCA,
  MOTIVO_ISENCAO_INCERTEZA_ETAPA_A,
  decidirBloqueioBaixaConfianca,
  ehAvisoControlado,
  isencaoIncertezaAplicavel,
  nivelExigeEncaminhamento,
  saidaControladaBaixaConfianca,
} from "./baixa-confiabilidade";

const CASO_REFERENCIA = {
  nivel: "LOW" as const,
  score: 65,
  decisaoMotor: "CLARIFY" as const,
  configId: "cfg-clinica",
};

describe("baixa confiabilidade — decisão", () => {
  it("LOW + CLARIFY bloqueia o candidato e encaminha", () => {
    const d = decidirBloqueioBaixaConfianca({
      ...CASO_REFERENCIA,
      etapa: "C",
      ambiente: "producao",
    });
    expect(d.bloquear).toBe(true);
    expect(d.encaminhar).toBe(true);
    expect(d.motivo).toBe(MOTIVO_BLOQUEIO_BAIXA_CONFIANCA);
    expect(d.precedeDecisaoMotor).toBe(true);
  });

  it("LOW na etapa A aplica a regra obrigatória (precedência registrada)", () => {
    const d = decidirBloqueioBaixaConfianca({
      ...CASO_REFERENCIA,
      etapa: "A",
      ambiente: "producao",
    });
    expect(d.bloquear).toBe(true);
    expect(d.encaminhar).toBe(true);
    expect(d.precedeEtapaAtivacao).toBe(true);
  });

  it("MEDIUM e HIGH não acionam a regra", () => {
    for (const nivel of ["MEDIUM", "HIGH"] as const) {
      const d = decidirBloqueioBaixaConfianca({
        nivel,
        score: 80,
        decisaoMotor: "ALLOW",
        etapa: "C",
        ambiente: "producao",
      });
      expect(d.bloquear).toBe(false);
      expect(d.encaminhar).toBe(false);
    }
    expect(nivelExigeEncaminhamento(null)).toBe(false);
  });

  it("reprocessamento não duplica aviso nem encaminhamento", () => {
    const jaAvisado = decidirBloqueioBaixaConfianca({
      ...CASO_REFERENCIA,
      etapa: "C",
      ambiente: "producao",
      avisoJaAplicado: true,
    });
    expect(jaAvisado.bloquear).toBe(true);
    expect(jaAvisado.jaAplicado).toBe(true);
    expect(jaAvisado.encaminhar).toBe(false);

    const jaEncaminhado = decidirBloqueioBaixaConfianca({
      ...CASO_REFERENCIA,
      etapa: "C",
      ambiente: "producao",
      jaEncaminhado: true,
    });
    expect(jaEncaminhado.encaminhar).toBe(false);
  });
});

describe("baixa confiabilidade — saída controlada", () => {
  it("produção: encaminhamento real confirmado envia somente o aviso", () => {
    const s = saidaControladaBaixaConfianca({
      tipo: "real",
      confirmado: true,
      comprovacao: "conv-1",
    });
    expect(s.aviso).toBe(AVISO_ENCAMINHAMENTO_HUMANO);
    expect(s.candidatoDescartado).toBe(true);
    expect(s.encaminhamento).toBe("real_confirmado");
    expect(s.encaminhamentoConfirmado).toBe(true);
    expect(s.origem).toBe("mensagem_controlada_sistema");
  });

  it("homologação: aviso simulado NÃO anuncia transferência concluída", () => {
    const s = saidaControladaBaixaConfianca({ tipo: "simulado" });
    expect(s.aviso).not.toBe(AVISO_ENCAMINHAMENTO_HUMANO);
    expect(s.aviso).not.toContain("Vou chamar uma pessoa");
    expect(s.encaminhamento).toBe("simulado");
    expect(s.encaminhamentoConfirmado).toBe(false);
    expect(s.registro).toBe("Encaminhamento humano simulado por baixa confiabilidade");
  });

  it("falha no encaminhamento não anuncia sucesso e mantém o bloqueio", () => {
    const s = saidaControladaBaixaConfianca({
      tipo: "real",
      confirmado: false,
      erro: "handoff_indisponivel",
    });
    expect(s.aviso).toBe(AVISO_ENCAMINHAMENTO_FALHOU);
    expect(s.aviso).not.toContain("Vou chamar uma pessoa");
    expect(s.encaminhamentoConfirmado).toBe(false);
    expect(s.exigeIntervencao).toBe(true);
    expect(s.erro).toBe("handoff_indisponivel");
    expect(s.candidatoDescartado).toBe(true);
  });

  it("o aviso final não herda a nota do candidato descartado", () => {
    for (const s of [
      saidaControladaBaixaConfianca({ tipo: "real", confirmado: true, comprovacao: "c" }),
      saidaControladaBaixaConfianca({ tipo: "simulado" }),
      saidaControladaBaixaConfianca({ tipo: "nao_executado" }),
    ]) {
      expect(s.herdaNotaDoCandidato).toBe(false);
      expect(s.origem).toBe("mensagem_controlada_sistema");
    }
  });

  it("caso de referência 65/100 Baixa: saudação é substituída só pelo aviso", () => {
    const candidato = "Oi! Tudo bem? 😊 Como posso te ajudar hoje?";
    const d = decidirBloqueioBaixaConfianca({
      ...CASO_REFERENCIA,
      etapa: "A",
      ambiente: "producao",
      conteudoCandidatoHash: "hash-candidato",
    });
    const s = saidaControladaBaixaConfianca({
      tipo: "real",
      confirmado: true,
      comprovacao: "conv-9",
    });
    expect(d.bloquear).toBe(true);
    expect(s.aviso).toBe(AVISO_ENCAMINHAMENTO_HUMANO);
    expect(s.aviso).not.toContain(candidato);
    // Texto e áudio derivam deste mesmo texto: nenhuma representação leva o
    // conteúdo reprovado.
    expect(ehAvisoControlado(s.aviso)).toBe(true);
    expect(ehAvisoControlado(candidato)).toBe(false);
  });
});

describe("baixa confiabilidade — incerteza pura na etapa A", () => {
  const incertezaPura = { coberturaInsuficiente: true, falhaComprovada: false };
  const semRisco = {
    turnoSocial: false,
    acaoOperacional: false,
    afirmacaoSemFonte: false,
    pedidoDeHumano: false,
    conflitoDeIdentidade: false,
    conformidadeBloqueante: false,
    conformidadeNaoVerificada: true,
  };

  it("LOW por cobertura insuficiente, sem falha comprovada, na etapa A: registra e não encaminha", () => {
    const d = decidirBloqueioBaixaConfianca({
      nivel: "LOW",
      score: 74,
      decisaoMotor: "CLARIFY",
      etapa: "A",
      ambiente: "producao",
      incerteza: incertezaPura,
      saudacao: semRisco,
      bloqueadoresAbsolutos: [],
    });
    expect(d.bloquear).toBe(false);
    expect(d.encaminhar).toBe(false);
    expect(d.isencaoIncertezaEtapaA).toBe(true);
    expect(d.impedimentoIncerteza).toBeNull();
    expect(d.motivo).toBe(MOTIVO_ISENCAO_INCERTEZA_ETAPA_A);
    expect(d.precedeEtapaAtivacao).toBe(false);
  });

  it("a mesma incerteza na etapa B volta a encaminhar", () => {
    const d = decidirBloqueioBaixaConfianca({
      nivel: "LOW",
      score: 74,
      decisaoMotor: "CLARIFY",
      etapa: "B",
      ambiente: "producao",
      incerteza: incertezaPura,
      saudacao: semRisco,
    });
    expect(d.bloquear).toBe(true);
    expect(d.isencaoIncertezaEtapaA).toBe(false);
    expect(d.impedimentoIncerteza).toBe("ETAPA_ALEM_DE_A");
  });

  it("incerteza não observada não isenta (comportamento anterior preservado)", () => {
    const d = decidirBloqueioBaixaConfianca({
      ...CASO_REFERENCIA,
      etapa: "A",
      ambiente: "producao",
    });
    expect(d.bloquear).toBe(true);
    expect(d.impedimentoIncerteza).toBe("INCERTEZA_NAO_OBSERVADA");
  });

  it("LOW que não vem da cobertura (nota baixa com cobertura completa) encaminha na etapa A", () => {
    const d = decidirBloqueioBaixaConfianca({
      nivel: "LOW",
      score: 60,
      decisaoMotor: "HANDOFF",
      etapa: "A",
      ambiente: "producao",
      incerteza: { coberturaInsuficiente: false, falhaComprovada: false },
      saudacao: semRisco,
    });
    expect(d.bloquear).toBe(true);
    expect(d.impedimentoIncerteza).toBe("LOW_NAO_VEM_DA_COBERTURA");
  });

  it.each([
    [{ ...incertezaPura, falhaComprovada: true }, [] as string[], semRisco, "FALHA_COMPROVADA"],
    [incertezaPura, ["CLAIM_CONTRADICTS_SOURCE"], semRisco, "BLOQUEADOR_ABSOLUTO"],
    [incertezaPura, [] as string[], { ...semRisco, afirmacaoSemFonte: true }, "AFIRMACAO_SEM_FONTE"],
    [incertezaPura, [] as string[], { ...semRisco, pedidoDeHumano: true }, "PEDIDO_DE_ATENDIMENTO_HUMANO"],
    [incertezaPura, [] as string[], { ...semRisco, conflitoDeIdentidade: true }, "CONFLITO_DE_IDENTIDADE"],
    [incertezaPura, [] as string[], { ...semRisco, conformidadeBloqueante: true }, "CONFORMIDADE_BLOQUEANTE"],
  ])("qualquer sinal de risco devolve a decisão à regra obrigatória (%#)", (incerteza, bloqueadores, saudacao, impedimento) => {
    const d = decidirBloqueioBaixaConfianca({
      nivel: "LOW",
      score: 70,
      decisaoMotor: "CLARIFY",
      etapa: "A",
      ambiente: "homologacao",
      incerteza,
      bloqueadoresAbsolutos: bloqueadores,
      saudacao,
    });
    expect(d.bloquear).toBe(true);
    expect(d.isencaoIncertezaEtapaA).toBe(false);
    expect(d.impedimentoIncerteza).toBe(impedimento);
  });

  it("regra publicada aplicável não verificada NÃO impede a isenção (é incerteza, não falha)", () => {
    const r = isencaoIncertezaAplicavel({
      etapa: "A",
      incerteza: incertezaPura,
      saudacao: { ...semRisco, conformidadeNaoVerificada: true },
    });
    expect(r.aplica).toBe(true);
    expect(r.impedimento).toBeNull();
  });
});
