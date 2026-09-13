/**
 * FASE 5 — aceite: a tela explica a conta e os efeitos sem contradição.
 */
import { describe, expect, it } from "bun:test";
import {
  explicarResposta,
  explicarEstadoRegra,
  porcentagem,
  textoIndice,
  tituloIndice,
  NOTA_INDICE_TECNICO,
} from "./fase5-explicacao";
import {
  apurarEfeitoFinal,
  descreverModo,
  eventoDeDivergencia,
  lerModoHistorico,
  ordemValida,
  trilhaEmMemoria,
  TrilhaImutavel,
  type EntradaEvento,
} from "./fase5-eventos";
import {
  montarAmostra,
  validarRevisao,
  vereditoConclusivo,
  RevisaoInvalida,
  type ItemAmostra,
  type RevisaoItem,
} from "./fase5-revisao-amostra";
import { calcularIndicadores } from "./fase5-indicadores";
import { avaliarProposta } from "./fase5-propostas";
import { scoreExibido } from "../confianca-badge";
import type { PontuacaoContrato } from "./pontuacao-contrato";
import type { SaidaFinal } from "./saida-final";
import type { AvaliacaoContrato, ResultadoRegra } from "./avaliacao-regras";

// ------------------------------------------------------------------ apoio

function pontuacao(p: Partial<PontuacaoContrato> = {}): PontuacaoContrato {
  return {
    versaoPontuacao: "score-contrato-1",
    versaoPolitica: "v5",
    versaoMotor: "motor-1",
    configId: "cfg-1",
    hashPrompt: "prompt-abc",
    numerador: 90,
    denominadorAvaliado: 1,
    denominadorRelevante: 1,
    parcelas: [],
    notaConhecida: 90,
    cobertura: 100,
    descontos: [],
    tetos: [],
    notaFinal: 90,
    linguagem: { avaliadas: 1, unknown: 0, nota: 95 },
    segurancaAcao: { estado: "sem_acao", motivo: "turno sem ação" },
    bloqueadores: [],
    nivel: "HIGH",
    decisao: "ENTREGAR",
    motivoDecisao: "ok",
    degradacao: null,
    tentativa: 1,
    ...p,
  };
}

function regra(r: Partial<ResultadoRegra> = {}): ResultadoRegra {
  return {
    identificador: "PRECO_COM_FONTE",
    titulo: "Preço vem de fonte oficial",
    categoria: "ESSENCIAL" as ResultadoRegra["categoria"],
    momento: "SAIDA" as ResultadoRegra["momento"],
    componente: "resposta" as ResultadoRegra["componente"],
    aplicabilidade: "verdadeira",
    evidenciaCondicao: "a resposta cita valor em reais",
    status: "FAIL",
    nota: 0,
    motivo: "valor citado não confere com a tabela",
    trechoAvaliado: "R$ 180,00",
    evidencia: ["tabela: R$ 250,00"],
    falhaTecnica: false,
    contaNoCandidato: true,
    versao: "v3",
    versaoId: "regras-3",
    hash: "h1",
    hashRegra: "hr1",
    ...r,
  };
}

function avaliacao(resultados: ResultadoRegra[]): AvaliacaoContrato {
  return {
    resultados,
    guardasPosteriores: [],
    porGrupo: {} as AvaliacaoContrato["porGrupo"],
    falhasTecnicas: 0,
    essencialDescumprida: resultados.some((r) => r.status === "FAIL"),
    essencialIndeterminada: false,
    apenasLinguagemIndeterminada: false,
    versao: "v3",
    versaoId: "regras-3",
    hash: "h-aval",
  };
}

function saida(s: Partial<SaidaFinal> = {}): SaidaFinal {
  return {
    versao: "saida-final-1",
    desfecho: "ENTREGUE",
    mensagemEnviada: "Olá! Sou a assistente da clínica.",
    candidatoEntregue: true,
    notaCandidato: 90,
    nivelCandidato: "HIGH",
    hashCandidato: "t1",
    avisoHerdaNota: false,
    encaminhamento: null,
    iaPausada: false,
    apresentacaoConcluida: true,
    recomendacoesIntermediarias: [],
    divergenciaComRecomendacao: false,
    motivo: "ok",
    erroTelemetria: null,
    ...s,
  };
}

function item(i: Partial<ItemAmostra> = {}): ItemAmostra {
  return {
    id: "i1",
    conversaId: "c1",
    turnoId: "t1",
    ambiente: "producao",
    tipoAtendimento: "orcamento",
    versaoPolitica: "v5",
    nivel: "HIGH",
    nota: 90,
    destino: "LIBERADA",
    filaConfirmada: null,
    avisoEnviado: null,
    emProcessamento: false,
    revisao: null,
    ...i,
  };
}

const humana = (r: Partial<RevisaoItem> = {}): RevisaoItem => ({
  qualidade: "ADEQUADA",
  motivo: null,
  encaminhamento: "DESNECESSARIO",
  procedencia: "confirmacao_humana",
  revisor: "ana",
  revisadoEm: "2026-09-01T10:00:00Z",
  ...r,
});

// --------------------------------------------------------------- 1. índice

describe("FASE 5 — índice padronizado", () => {
  it("usa X/100 e diz que é índice técnico, não probabilidade", () => {
    expect(tituloIndice(72)).toBe("Índice da resposta: 72/100");
    expect(textoIndice(null)).toBe("—");
    expect(NOTA_INDICE_TECNICO).toMatch(/Não é probabilidade de acerto/);
  });

  it("mostra a nota real gravada: 100 não vira 99", () => {
    expect(scoreExibido(100)).toBe(100);
    const e = explicarResposta({ pontuacao: pontuacao({ notaFinal: 100, notaConhecida: 100 }) });
    expect(e.indice.texto).toBe("100/100");
    expect(e.indice.nota).toBe(100);
    expect(e.indice.nivel).toBe("HIGH");
  });

  it("porcentagem sempre carrega o denominador identificado", () => {
    expect(porcentagem(2, 5, "respostas revisadas").texto).toBe("40% (2 de 5 respostas revisadas)");
    const vazia = porcentagem(0, 0, "respostas revisadas");
    expect(vazia.valor).toBeNull();
    expect(vazia.texto).toMatch(/sem base/);
  });
});

// ------------------------------------------------------ 2. blocos separados

describe("FASE 5 — blocos separados e conta detalhada", () => {
  it("separa índice, cobertura, linguagem, segurança, decisão e operação", () => {
    const e = explicarResposta({
      pontuacao: pontuacao({
        notaConhecida: 80,
        denominadorAvaliado: 3,
        denominadorRelevante: 4,
        descontos: [{ codigo: "LINGUAGEM_SECA", pontos: 5 }],
        tetos: [{ codigo: "COBERTURA_BAIXA", valor: 74 }],
        notaFinal: 74,
        nivel: "MEDIUM",
        segurancaAcao: { estado: "bloqueada", motivo: "operação sem confirmação" },
      }),
      saida: saida({ desfecho: "ENTREGUE" }),
    });
    expect(e.cobertura.texto).toBe("75% (3 de 4 pontos de exigência relevantes)");
    expect(e.linguagem.nota).toBe(95);
    expect(e.segurancaAcao.estado).toBe("bloqueada");
    expect(e.segurancaAcao.observacao).toMatch(/não é a nota do texto/i);
    expect(e.conta.explicacao).toBe("Bruto 80 → descontos 5 → teto 74 → final 74");
    expect(e.decisaoFinal.efeitoConfirmado).toBe("resposta entregue ao paciente");
  });

  it("explica cada regra com id, condição, estado, evidência e contribuição", () => {
    const e = explicarResposta({
      pontuacao: pontuacao({
        parcelas: [
          {
            chave: "preco",
            identificadores: ["PRECO_COM_FONTE"],
            categoria: "ESSENCIAL",
            peso: 0.5,
            status: "FAIL",
            nota: 0,
            contaNaNota: true,
            contaNaCobertura: true,
            motivo: "valor divergente",
            falhaTecnica: false,
          },
        ],
      }),
      avaliacao: avaliacao([regra(), regra({ identificador: "NOME_PACIENTE", status: "UNKNOWN", nota: null })]),
    });
    const linha = e.regras[0]!;
    expect(linha.identificador).toBe("PRECO_COM_FONTE");
    expect(linha.condicao).toBe("a resposta cita valor em reais");
    expect(linha.aplicavel).toBe(true);
    expect(linha.estado.rotulo).toBe("Descumprida");
    expect(linha.estado.ehFalha).toBe(true);
    expect(linha.evidencia).toContain("tabela: R$ 250,00");
    expect(linha.contribuicao).toBe(0);
    expect(e.regras[1]!.estado.rotulo).toBe("Sem como conferir");
    expect(e.regras[1]!.estado.ehFalha).toBe(false);
  });

  it("explica UNKNOWN, não aplicável e pendência em palavras simples", () => {
    expect(explicarEstadoRegra("UNKNOWN").significado).toMatch(/Não é acerto nem erro/);
    expect(explicarEstadoRegra("NOT_APPLICABLE").significado).toMatch(/fora da conta/);
    expect(explicarEstadoRegra("PENDING").significado).toMatch(/pendência, não erro/);
  });

  it("mostra identidade do material e se a nota corresponde ao texto enviado", () => {
    const igual = explicarResposta({
      pontuacao: pontuacao(),
      identidade: { promptId: "p1", hashAvaliado: "x", hashTextoFinal: "x" },
    });
    expect(igual.identidade.correspondencia.confere).toBe(true);
    const diferente = explicarResposta({
      pontuacao: pontuacao(),
      identidade: { hashAvaliado: "x", hashTextoFinal: "y" },
    });
    expect(diferente.identidade.correspondencia.confere).toBe(false);
    expect(diferente.identidade.correspondencia.explicacao).toMatch(/mudou depois da avaliação/);
  });

  it("sem avaliação válida não inventa nota", () => {
    const sem = explicarResposta({ pontuacao: null });
    expect(sem.estado).toBe("nao_avaliada");
    expect(sem.rotuloEstado).toBe("Resposta não avaliada");
    expect(sem.indice.nota).toBeNull();
    expect(sem.indice.texto).toBe("—");

    const falha = explicarResposta({ pontuacao: null, falhaDeAvaliacao: "verificador indisponível" });
    expect(falha.estado).toBe("avaliacao_indisponivel");
    expect(falha.rotuloEstado).toBe("Avaliação indisponível");
    expect(falha.indice.nota).toBeNull();
  });

  it("parecer do Sol fica separado do índice do motor", () => {
    const e = explicarResposta({
      pontuacao: pontuacao({ notaFinal: 88 }),
      avaliacaoSol: { veredito: "resposta fraca" },
    });
    expect(e.indice.nota).toBe(88);
    expect(e.avaliacaoSol.veredito).toBe("resposta fraca");
    expect(e.avaliacaoSol.observacao).toMatch(/Não altera o índice do motor/);
  });
});

// ---------------------------------------------------------- 3. cenários aceite

describe("FASE 5 — aceite dos cinco cenários", () => {
  it("saudação correta: entregue, sem operação e sem contradição", () => {
    const e = explicarResposta({
      pontuacao: pontuacao({ notaFinal: 96, nivel: "HIGH", decisao: "ENTREGAR" }),
      saida: saida(),
      identidade: { hashAvaliado: "t1", hashTextoFinal: "t1" },
    });
    expect(e.decisaoFinal.desfecho).toBe("ENTREGUE");
    expect(e.operacao.entrouNaFila).toBeNull();
    expect(e.operacao.aviso).toBe("nao_aplicavel");
    expect(e.decisaoFinal.efeitoConfirmado).toBe("resposta entregue ao paciente");
  });

  it("preço incorreto: regra descumprida aparece com evidência e bloqueio", () => {
    const e = explicarResposta({
      pontuacao: pontuacao({
        notaFinal: 22,
        nivel: "LOW",
        decisao: "BLOQUEAR_E_ENCAMINHAR",
        bloqueadores: ["AFIRMACAO_SEM_FONTE"],
      }),
      avaliacao: avaliacao([regra()]),
    });
    expect(e.bloqueadores).toContain("AFIRMACAO_SEM_FONTE");
    expect(e.regras[0]!.trechoAvaliado).toBe("R$ 180,00");
    expect(e.indice.texto).toBe("22/100");
  });

  it("LOW encaminhado: fila confirmada é o efeito, e o aviso não herda a nota", () => {
    const s = saida({
      desfecho: "BLOQUEADO_ENCAMINHADO",
      mensagemEnviada: "Vou passar seu atendimento para a nossa equipe.",
      candidatoEntregue: false,
      notaCandidato: 18,
      nivelCandidato: "LOW",
      iaPausada: true,
      apresentacaoConcluida: false,
      encaminhamento: {
        chave: "c1|t1|confianca_baixa_no_texto_final",
        conversaId: "c1",
        turnoId: "t1",
        ambiente: "producao",
        etapa: "fila_confirmada",
        comprovanteFila: "fila-99",
        atendenteId: null,
        aviso: "enviado",
        erro: null,
        simulado: false,
        atualizadoEm: "2026-09-01T10:00:00Z",
      },
    });
    const e = explicarResposta({ pontuacao: pontuacao({ notaFinal: 18, nivel: "LOW" }), saida: s });
    expect(e.operacao.entrouNaFila).toBe(true);
    expect(e.operacao.comprovanteFila).toBe("fila-99");
    expect(e.decisaoFinal.efeitoConfirmado).toBe("encaminhado para a fila humana (confirmado)");
    // o aviso enviado NÃO recebe a nota do candidato rejeitado
    expect(s.avisoHerdaNota).toBe(false);
    expect(e.indice.nota).toBe(18);
    expect(e.operacao.aviso).toBe("enviado");
  });

  it("falha de fila: nada aparece como encaminhado com sucesso", () => {
    const e = explicarResposta({
      pontuacao: pontuacao({ notaFinal: 15, nivel: "LOW" }),
      saida: saida({
        desfecho: "BLOQUEADO_ENCAMINHAMENTO_PENDENTE",
        mensagemEnviada: null,
        candidatoEntregue: false,
        iaPausada: true,
        encaminhamento: {
          chave: "c2|t2|confianca_baixa_no_texto_final",
          conversaId: "c2",
          turnoId: "t2",
          ambiente: "producao",
          etapa: "falhou",
          comprovanteFila: null,
          atendenteId: null,
          aviso: "pendente",
          erro: "banco_indisponivel",
          simulado: false,
          atualizadoEm: "2026-09-01T10:00:00Z",
        },
      }),
    });
    expect(e.operacao.entrouNaFila).toBe(false);
    expect(e.operacao.erro).toBe("banco_indisponivel");
    expect(e.decisaoFinal.efeitoConfirmado).toBe("encaminhamento sem confirmação da fila");
  });

  it("simulação: homologação mostra efeito nenhum", () => {
    const e = explicarResposta({
      pontuacao: pontuacao({ notaFinal: 30, nivel: "LOW" }),
      saida: saida({
        desfecho: "BLOQUEADO_SIMULADO",
        candidatoEntregue: false,
        encaminhamento: {
          chave: "c3|t3|confianca_baixa_no_texto_final",
          conversaId: "c3",
          turnoId: "t3",
          ambiente: "homologacao",
          etapa: "encaminhamento_pendente",
          comprovanteFila: null,
          atendenteId: null,
          aviso: "pendente",
          erro: null,
          simulado: true,
          atualizadoEm: "2026-09-01T10:00:00Z",
        },
      }),
    });
    expect(e.operacao.simulado).toBe(true);
    expect(e.decisaoFinal.efeitoConfirmado).toBe("simulação: nenhum efeito real");
  });
});

// ------------------------------------------------------------- 4. auditoria

describe("FASE 5 — trilha de eventos vinculada", () => {
  const base = (tipo: EntradaEvento["tipo"], extra: Partial<EntradaEvento> = {}): EntradaEvento => ({
    tipo,
    conversaId: "c1",
    turnoId: "t1",
    correlacaoId: "c1:t1",
    modo: { observacao: false, aplicacao: true, ambiente: "producao", efeito: "nenhum" },
    conteudo: null,
    hashConteudo: null,
    dados: {},
    ...extra,
  });

  it("preserva conteúdo, hash e ordem dos eventos", () => {
    const t = trilhaEmMemoria();
    t.registrar(base("candidato_avaliado", { conteudo: "texto A", hashConteudo: "hA", dados: { decisao: "ALLOW", origem: "action_safety" } }));
    t.registrar(base("correcao_de_texto", { conteudo: "texto B", hashConteudo: "hB" }));
    t.registrar(base("decisao_final", { dados: { decisao: "BLOQUEAR_E_ENCAMINHAR" } }));
    t.registrar(base("operacao_fila", { modo: { observacao: false, aplicacao: true, ambiente: "producao", efeito: "fila_confirmada" }, dados: { comprovante: "fila-7" } }));
    t.registrar(base("saida_enviada", { conteudo: "aviso", hashConteudo: "hC", modo: { observacao: false, aplicacao: true, ambiente: "producao", efeito: "aviso_enviado" } }));

    const eventos = t.eventos("c1:t1");
    expect(eventos.map((x) => x.sequencia)).toEqual([1, 2, 3, 4, 5]);
    expect(eventos[0]!.conteudo).toBe("texto A");
    expect(eventos[0]!.hashConteudo).toBe("hA");
    expect(ordemValida(eventos)).toBe(true);
  });

  it("não reescreve evento já gravado", () => {
    const t = trilhaEmMemoria();
    t.registrar(base("decisao_final", { hashConteudo: "h1" }));
    expect(() => t.registrar(base("decisao_final", { hashConteudo: "h1" }))).toThrow(TrilhaImutavel);
  });

  it("efeito final vem da operação confirmada, e a decisão intermediária fica identificada", () => {
    const t = trilhaEmMemoria();
    t.registrar(base("candidato_avaliado", { hashConteudo: "h1", dados: { decisao: "ALLOW", origem: "action_safety" } }));
    t.registrar(base("decisao_final", { hashConteudo: "h2", dados: { decisao: "BLOQUEAR_E_ENCAMINHAR" } }));
    t.registrar(base("operacao_fila", { hashConteudo: "h3", modo: { observacao: false, aplicacao: true, ambiente: "producao", efeito: "fila_confirmada" } }));

    const r = apurarEfeitoFinal(t.eventos("c1:t1"));
    expect(r.efeito).toBe("fila_confirmada");
    expect(r.decisaoFinal).toBe("BLOQUEAR_E_ENCAMINHAR");
    expect(r.intermediarias).toEqual([{ origem: "action_safety", decisao: "ALLOW" }]);
    expect(r.divergente).toBe(true);
  });

  it("observação, aplicação, ambiente e efeito são campos distintos", () => {
    const m = { observacao: false, aplicacao: true, ambiente: "producao" as const, efeito: "fila_confirmada" as const };
    expect(descreverModo(m)).toBe("decisão com autoridade · aplicada · ambiente=producao · efeito=fila_confirmada");
  });

  it("snapshot histórico 'shadow' com efeito real vira divergência, sem reescrita", () => {
    const r = lerModoHistorico("shadow", "fila_confirmada", "producao");
    expect(r.inconsistente).toBe(true);
    expect(r.modo.observacao).toBe(true);
    expect(r.modo.efeito).toBe("fila_confirmada");
    expect(r.observacaoTecnica).toMatch(/histórico é preservado/i);

    const complemento = eventoDeDivergencia({
      conversaId: "c1",
      turnoId: "t1",
      correlacaoId: "c1:t1",
      ambiente: "producao",
      snapshotId: "s1",
      motivo: "modo shadow com efeito real",
    });
    expect(complemento.tipo).toBe("divergencia_registrada");
    expect(complemento.dados["historico_preservado"]).toBe(true);
  });
});

// ------------------------------------------------------------ 5. calibração

describe("FASE 5 — revisão, indicadores e propostas", () => {
  it("reporte e parecer de IA não fecham o caso; só confirmação humana", () => {
    expect(vereditoConclusivo({ ...humana(), procedencia: "reporte_inicial" })).toBe("NAO_REVISADA");
    expect(vereditoConclusivo({ ...humana(), procedencia: "analise_ia" })).toBe("NAO_REVISADA");
    expect(vereditoConclusivo(humana({ qualidade: "INADEQUADA", motivo: "preço errado" }))).toBe("INADEQUADA");
    expect(vereditoConclusivo(null)).toBe("NAO_REVISADA");
  });

  it("resposta inadequada exige motivo", () => {
    expect(() => validarRevisao(humana({ qualidade: "INADEQUADA", motivo: null }))).toThrow(RevisaoInvalida);
    expect(validarRevisao(humana({ qualidade: "INADEQUADA", motivo: "preço errado" })).motivo).toBe("preço errado");
  });

  it("amostra inclui LOW bloqueado e resposta liberada, por tipo e versão", () => {
    const a = montarAmostra([
      item({ id: "a", destino: "BLOQUEADA", nivel: "LOW" }),
      item({ id: "b", destino: "LIBERADA", tipoAtendimento: "agendamento" }),
      item({ id: "c", destino: "SIMULADA", ambiente: "homologacao" }),
    ]);
    expect(a.bloqueados).toBe(1);
    expect(a.liberados).toBe(1);
    expect(a.porTipo["orcamento"]).toBe(2);
    expect(a.comparavel).toBe(false);
    expect(a.observacao).toMatch(/mistura ambientes/);
  });

  it("caso não revisado não entra como correto", () => {
    const r = calcularIndicadores({
      itens: [
        item({ id: "1", destino: "LIBERADA", revisao: null }),
        item({ id: "2", destino: "BLOQUEADA", nivel: "LOW", revisao: humana() }),
      ],
    });
    expect(r.naoRevisados).toBe(1);
    expect(r.coberturaRevisao.texto).toBe("50% (1 de 2 respostas do recorte)");
    expect(r.falsosBloqueios.texto).toBe("100% (1 de 1 respostas revisadas como adequadas)");
    expect(r.liberacoesIndevidas.valor).toBeNull();
    expect(r.observacao).toMatch(/Ausência de reporte não é acerto observado/);
  });

  it("LOW em produção: fila confirmada, falha de fila e falha de aviso com denominador próprio", () => {
    const r = calcularIndicadores({
      ambiente: "producao",
      itens: [
        item({ id: "1", nivel: "LOW", destino: "BLOQUEADA", filaConfirmada: true, avisoEnviado: true }),
        item({ id: "2", nivel: "LOW", destino: "BLOQUEADA", filaConfirmada: false, avisoEnviado: null }),
        item({ id: "3", nivel: "LOW", destino: "BLOQUEADA", filaConfirmada: true, avisoEnviado: false }),
        item({ id: "4", ambiente: "homologacao", nivel: "LOW", destino: "SIMULADA" }),
      ],
      regras: [{ regra: "PRECO_COM_FONTE", unknown: 2, falhasTecnicas: 1, avaliacoes: 10 }],
    });
    expect(r.lowComFilaConfirmada.texto).toBe(
      "66.7% (2 de 3 respostas de baixa confiança em produção)",
    );
    expect(r.falhasDeFila.numerador).toBe(1);
    expect(r.falhasDeAviso.texto).toBe("50% (1 de 2 avisos tentados)");
    expect(r.porRegra[0]!.proporcao.texto).toBe("30% (3 de 10 avaliações da regra)");
  });

  it("indeterminado e em processamento ficam em categoria própria", () => {
    const r = calcularIndicadores({
      itens: [
        item({ id: "1", revisao: humana({ qualidade: "EVIDENCIA_INSUFICIENTE", encaminhamento: "INDETERMINADO" }) }),
        item({ id: "2", emProcessamento: true }),
      ],
    });
    expect(r.indeterminados).toBeGreaterThanOrEqual(1);
    expect(r.emProcessamento).toBe(1);
  });

  it("ajuste protegido é recusado e nada é aplicado automaticamente", () => {
    const p = avaliarProposta({
      ajuste: { alvo: "todo_low_encaminha", de: 1, para: 0, justificativa: "fila cheia" },
      conjuntoDeEscolha: [],
      conjuntoIndependente: [],
      confirmacoesHumanas: 500,
    });
    expect(p.status).toBe("RECUSADA");
    expect(p.protegido).toBe(true);
    expect(p.aprovacao).toBe("pendente");
  });

  it("poucos reportes não autorizam ajuste, e o impacto exige amostra independente", () => {
    const poucos = avaliarProposta({
      ajuste: { alvo: "peso_linguagem", de: 10, para: 5, justificativa: "dois reclames" },
      conjuntoDeEscolha: [item({ id: "a" })],
      conjuntoIndependente: [item({ id: "b" })],
      confirmacoesHumanas: 2,
    });
    expect(poucos.status).toBe("RECUSADA");
    expect(poucos.motivo).toMatch(/Evidência insuficiente/);

    const sobreposto = avaliarProposta({
      ajuste: { alvo: "peso_linguagem", de: 10, para: 5, justificativa: "x" },
      conjuntoDeEscolha: [item({ id: "a" })],
      conjuntoIndependente: [item({ id: "a" })],
      confirmacoesHumanas: 50,
    });
    expect(sobreposto.status).toBe("RECUSADA");
    expect(sobreposto.motivo).toMatch(/sobrepostos/);

    const ok = avaliarProposta({
      ajuste: { alvo: "peso_linguagem", de: 10, para: 5, justificativa: "x" },
      conjuntoDeEscolha: [item({ id: "a" })],
      conjuntoIndependente: [item({ id: "b" })],
      confirmacoesHumanas: 50,
    });
    expect(ok.status).toBe("PROPOSTA");
    expect(ok.aprovacao).toBe("pendente");
    expect(ok.impactoConjuntoIndependente).not.toBeNull();
  });
});
