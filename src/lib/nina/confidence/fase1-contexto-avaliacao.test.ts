/**
 * FASE 1 (MOTOR DE CONFIABILIDADE) — o contexto avaliado precisa conter os
 * dados reais do turno, e cada dado precisa chegar ao validador correspondente.
 */
import { describe, expect, it } from "bun:test";
import {
  camposObrigatoriosDaAcao,
  candidatosDeEntidade,
  enriquecerContextoAvaliacao,
  fontesDosFatos,
  montarInstrucoesDoTurno,
  obrigacoesDoPrompt,
} from "./contexto-avaliacao";
import { detectarConflitosEntreFatos } from "./evidencia";
import { detectarIntencoes, intencaoAmbigua } from "../atendimento-fase1";
import type { FatoRecuperado } from "./evidencia";
import { montarContextoDoTurno, type EstadoDoTurno } from "./runtime";
import {
  ConflictValidator,
  EntityResolutionValidator,
  IntentClarityValidator,
  RequiredDataValidator,
  SourceFreshnessValidator,
} from "./validators";

const fato = (f: Partial<FatoRecuperado>): FatoRecuperado => ({
  consulta: "buscar_conhecimento",
  capacidade: "searchKnowledgeBase",
  entidade: "procedimento",
  campo: "preco",
  valor: "250,00",
  fonte: "catalogo_publicado",
  ...f,
});

const estado = (e: Partial<EstadoDoTurno> = {}): EstadoDoTurno => ({
  ferramentas: [],
  catalogoEncontrou: false,
  agendamentoConfirmado: false,
  pacienteIdentificado: false,
  esclarecimentoUsado: false,
  handoffSolicitado: false,
  ...e,
});

describe("fontes recuperadas a partir dos fatos", () => {
  it("catálogo publicado entra como fonte publicada e vigente", () => {
    const fontes = fontesDosFatos([fato({ registro: "cat-1" })]);
    expect(fontes).toHaveLength(1);
    expect(fontes[0]!.tipo).toBe("catalogo_publicado");
    expect(fontes[0]!.publicado).toBe(true);
    expect(fontes[0]!.temConteudo).toBe(true);
  });

  it("vigência expirada chega ao validador de atualidade", () => {
    const ctx = montarContextoDoTurno(
      estado({
        acao: "informar_valor",
        tipoTurno: "INFORMACAO",
        fatos: [fato({ registro: "cat-9", vigenteAte: "2020-01-01" })],
      }),
    );
    const r = SourceFreshnessValidator(ctx, new Date("2026-01-01"));
    expect(r.status).toBe("BLOCK");
    expect(r.blocker).toBe("FONTE_NAO_VIGENTE");
  });

  it("fonte sem nenhum sinal de vigência é avaliação incompleta, não aprovação", () => {
    const r = SourceFreshnessValidator({
      requestedAction: "informar_regra",
      turnType: "INFORMACAO",
      retrievedSources: [{ tipo: "desconhecida", referencia: "x", temConteudo: true }],
      toolResults: [],
      businessContext: {
        ambiente: "producao",
        pacienteIdentificado: false,
        agendamentoConfirmado: false,
        esclarecimentoUsado: false,
        handoffSolicitado: false,
      },
    });
    expect(r.status).toBe("UNKNOWN");
    expect(r.reasonCode).toBe("VIGENCIA_NAO_REGISTRADA");
  });
});

describe("conflitos entre fatos do mesmo campo e escopo", () => {
  it("dois preços diferentes para o mesmo procedimento são conflito", () => {
    const conflitos = detectarConflitosEntreFatos([
      fato({ valor: "250,00", registro: "a", chave: { procedimento: "Ultrassom" } }),
      fato({ valor: "310,00", registro: "b", chave: { procedimento: "Ultrassom" } }),
    ]);
    expect(conflitos).toHaveLength(1);
    expect(conflitos[0]!.valores).toHaveLength(2);
  });

  it("procedimentos diferentes não são conflito", () => {
    expect(
      detectarConflitosEntreFatos([
        fato({ valor: "250,00", chave: { procedimento: "Ultrassom" } }),
        fato({ valor: "310,00", chave: { procedimento: "Ressonância" } }),
      ]),
    ).toHaveLength(0);
  });

  it("lista de dias de atendimento não vira conflito", () => {
    expect(
      detectarConflitosEntreFatos([
        fato({ entidade: "escala", campo: "dia_atendimento", valor: "segunda" }),
        fato({ entidade: "escala", campo: "dia_atendimento", valor: "quarta" }),
      ]),
    ).toHaveLength(0);
  });

  it("o conflito detectado chega ao ConflictValidator pelo caminho principal", () => {
    const ctx = montarContextoDoTurno(
      estado({
        acao: "informar_valor",
        tipoTurno: "INFORMACAO",
        fatos: [
          fato({ valor: "250,00", registro: "a", chave: { procedimento: "Ultrassom" } }),
          fato({ valor: "310,00", registro: "b", chave: { procedimento: "Ultrassom" } }),
        ],
      }),
    );
    const r = ConflictValidator(ctx);
    expect(r.status).toBe("BLOCK");
    expect(r.blocker).toBe("CONFLITO_DE_FONTE");
  });
});

describe("candidatos de entidade", () => {
  it("dois procedimentos devolvidos viram candidatos ambíguos", () => {
    const candidatos = candidatosDeEntidade([
      fato({ chave: { procedimento: "Ultrassom abdome" } }),
      fato({ chave: { procedimento: "Ultrassom tireoide" } }),
    ]);
    expect(candidatos["procedimento"]).toHaveLength(2);

    const ctx = montarContextoDoTurno(
      estado({
        acao: "informar_valor",
        tipoTurno: "INFORMACAO",
        fatos: [
          fato({ chave: { procedimento: "Ultrassom abdome" } }),
          fato({ chave: { procedimento: "Ultrassom tireoide" } }),
        ],
      }),
    );
    const r = EntityResolutionValidator(ctx);
    expect(r.status).toBe("FAIL");
    expect(r.reasonCode).toBe("ENTIDADE_AMBIGUA");
  });
  const profissionais = [
    fato({ entidade: "escala", campo: "dia_atendimento", valor: "segunda 09:30", chave: { procedimento: "Consulta Cardiologia", medicoNome: "Rosângela Riolino", especialidade: "Cardiologia" } }),
    fato({ entidade: "escala", campo: "dia_atendimento", valor: "quinta 13:30", chave: { procedimento: "Consulta Cardiologia", medicoNome: "Antonio Cobucci", especialidade: "Cardiologia" } }),
    fato({ entidade: "servico", campo: "nome", valor: "Ecocardiograma", chave: { procedimento: "Ecocardiograma", especialidade: "Cardiologia" } }),
  ];
  const contextoLista = (mensagemPaciente: string, e: Partial<EstadoDoTurno> = {}) => montarContextoDoTurno(estado({
    mensagemPaciente,
    acao: "informar_profissional",
    tipoTurno: "INFORMACAO",
    intentAmbiguo: intencaoAmbigua(mensagemPaciente, detectarIntencoes(mensagemPaciente)),
    fatos: profissionais,
    ...e,
  }));

  it.each(["vcs tem cardiologista?", "Vocês têm cardiologia e quais dias os médicos atendem?"])("preserva opções publicadas sem inventar ambiguidade na lista: %s", (m) => {
    const ctx = contextoLista(m);
    expect(ctx.entityCandidates?.medico).toHaveLength(2);
    expect(ctx.entityCandidates?.procedimento).toHaveLength(2);
    expect(IntentClarityValidator(ctx).status).toBe("PASS");
    const r = EntityResolutionValidator(ctx);
    expect(r.status).toBe("PASS");
    expect(r.reasonCode).toBe("OPCOES_INFORMATIVAS_PUBLICADAS");
    expect(r.evidence["opcoes"]).toContainEqual({ campo: "medico", opcoes: ["Rosângela Riolino", "Antonio Cobucci"] });
  });

  it.each(["cardiologia", "Tem vaga com cardiologista?", "Quero agendar cardiologia", "Vocês têm cardiologista Antonio?", "Tem cardiologista amanhã?"])("não dispensa resolução para pedido específico ou assunto solto: %s", (m) => {
    expect(EntityResolutionValidator(contextoLista(m)).reasonCode).toBe("ENTIDADE_AMBIGUA");
  });

  it("uma pergunta geral não dispensa a escolha antes de informar vaga ou gravar agendamento", () => {
    for (const acao of ["informar_disponibilidade", "criar_agendamento"] as const) {
      expect(EntityResolutionValidator(contextoLista("vcs tem cardiologista?", { acao })).status).toBe("FAIL");
    }
  });

  it("não aprova candidatos ausentes da evidência publicada", () => {
    const ctx = contextoLista("vcs tem cardiologista?", { entityCandidates: { medico: ["Rosângela Riolino", "Médico inventado"] } });
    expect(EntityResolutionValidator(ctx).status).toBe("FAIL");
  });

  it("uma fonte de agenda não é tratada como lista publicada", () => {
    const ctx = contextoLista("vcs tem cardiologista?", { fatos: profissionais.map((f) => ({ ...f, fonte: "agenda" })) });
    expect(EntityResolutionValidator(ctx).status).toBe("FAIL");
  });
});

describe("campos obrigatórios da ação", () => {
  it("agendar declara os campos e a falta chega ao validador", () => {
    expect(camposObrigatoriosDaAcao("criar_agendamento")).toContain("inicio");
    expect(camposObrigatoriosDaAcao("responder_informacao")).toBeNull();

    const ctx = montarContextoDoTurno(
      estado({ acao: "criar_agendamento", tipoTurno: "OPERACAO", entities: { procedimento: "Consulta" } }),
    );
    const r = RequiredDataValidator(ctx);
    expect(r.status).toBe("BLOCK");
    expect((r.evidence["faltantes"] as string[]).length).toBeGreaterThan(0);
  });

  it("campos informados pelo chamador não são sobrescritos", () => {
    const ctx = enriquecerContextoAvaliacao({
      requestedAction: "criar_agendamento",
      requiredFields: ["cpf"],
      retrievedSources: [],
      toolResults: [],
      businessContext: {
        ambiente: "producao",
        pacienteIdentificado: false,
        agendamentoConfirmado: false,
        esclarecimentoUsado: false,
        handoffSolicitado: false,
      },
    });
    expect(ctx.requiredFields).toEqual(["cpf"]);
  });
});

describe("mensagem completa e instruções publicadas", () => {
  it("a mensagem do turno chega ao contexto avaliado", () => {
    const ctx = montarContextoDoTurno(
      estado({ mensagemPaciente: "quanto custa o ultrassom? e tem hoje?" }),
    );
    expect(ctx.mensagemPaciente).toBe("quanto custa o ultrassom? e tem hoje?");
  });

  it("obrigações vêm do texto publicado e a versão do turno é preservada", () => {
    const obrigacoes = obrigacoesDoPrompt(
      [
        "Você é a Nina.",
        "- Nunca informe preço sem consultar o catálogo publicado.",
        "- Sempre chame solicitar_atendente_humano quando faltar informação.",
        "Oi.",
      ].join("\n"),
    );
    expect(obrigacoes).toHaveLength(2);

    const instrucoes = montarInstrucoesDoTurno({
      escopo: "whatsapp",
      versao: "6",
      versaoId: "v6",
      publicadoEm: "2026-09-01T10:00:00Z",
      origem: "publicado",
      hash: "abc",
      texto: "- Nunca invente horários.",
    });
    const ctx = montarContextoDoTurno(estado({ instrucoes }));
    expect(ctx.instrucoes?.versao).toBe("6");
    expect(ctx.instrucoes?.obrigacoes).toEqual(["Nunca invente horários."]);
  });
});
