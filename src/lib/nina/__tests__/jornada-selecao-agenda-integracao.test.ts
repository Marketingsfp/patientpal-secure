/** Integração determinística dos helpers usados no WhatsApp. Os callbacks de
 * catálogo, resposta e agenda abaixo são simulados e identificados por nome;
 * nenhum modelo, banco, reserva ou atendimento real é acionado. */
import { describe, expect, it } from "bun:test";
import {
  conhecimentoDaMesmaSessao,
  consultaDoNovoTurno,
  lembrarConsultaComprovada,
  type ConhecimentoSessao,
} from "../confidence/conhecimento-sessao";
import { incorporarResultadoOficial } from "../confidence/evidencias-turno";
import type { ConsultaDoTurno, FatoRecuperado } from "../confidence/evidencia";
import {
  normalizarSelecaoContextual,
  resolverSelecaoContextual,
} from "../confidence/selecao-contextual";
import { historicoParaConsultaAgenda } from "../consulta-agenda-historico";
import {
  atualizarInteresseConsultaAgenda,
  autorizarConsultaAgenda,
  interesseEmConsultarAgenda,
  normalizarInteresseConsultaAgenda,
  type ContextoConsultaAgenda,
} from "../consulta-agenda";
import type { ResultadoBroker } from "../tool-broker";

const CLINICA = "clinica-integracao-ficticia";
const CONVERSA = "conversa-integracao-ficticia";
const INICIO = "2026-09-13T13:00:00.000Z";
const ALEX = { id: "11111111-1111-4111-8111-111111111111", nome: "ALEX LOUZA" };
const BRUNO = { id: "22222222-2222-4222-8222-222222222222", nome: "Bruno Costa" };
const MEDICOS_AGENDA = [ALEX, BRUNO];

function catalogoFicticio() {
  return [
    {
      id: "nina_cat_profissionais:alex-ficticio",
      medico: "Alex Louza",
      procedimento: "Consulta — CARDIOLOGIA, CARDIOLOGIA INFANTIL",
      dia: "Quarta 13h, Sexta 13h",
      extras: {
        especialidades: ["Cardiologia", "Cardiologia Infantil"],
        formas_pagamento: [
          { forma: "Dinheiro", valor: 120, condicao: "Consulta Cardiologia" },
          { forma: "Cartão", valor: 145, condicao: "Consulta Cardiologia" },
          { forma: "Dinheiro", valor: 160, condicao: "Consulta Cardiologia Infantil" },
          { forma: "Cartão", valor: 190, condicao: "Consulta Cardiologia Infantil" },
        ],
      },
    },
    {
      id: "nina_cat_profissionais:bruno-ficticio",
      medico: "Bruno Costa",
      procedimento: "Consulta — CARDIOLOGIA",
      dia: "Quarta 13h",
      extras: { formas_pagamento: [{ forma: "Dinheiro", valor: 120 }] },
    },
  ];
}

type RegistroMensagem = {
  id: string;
  conversa_id: string;
  direction: "in" | "out";
  body: string;
  status: string;
  created_at: string;
  is_teste: boolean;
};

function criarJornada() {
  const mensagens: RegistroMensagem[] = [];
  const consultasSimuladas: Array<{ args: unknown; versao: string }> = [];
  const leiturasAgendaSimuladas: string[] = [];
  const respostasSimuladas: Array<{ texto: string; fatosRecebidos: FatoRecuperado[] }> = [];
  let conhecimento: ConhecimentoSessao | null = null;
  let sessao = "sessao-integracao-1";
  let inicioSessao = INICIO;
  let sequencia = 0;

  const callbackCatalogoSimulado = (
    args: unknown,
    records = catalogoFicticio(),
  ): ResultadoBroker => {
    const versao = `publicacao-simulada-${consultasSimuladas.length + 1}`;
    consultasSimuladas.push({ args, versao });
    return {
      ferramenta: "consultar_base_conhecimento",
      capacidade: "searchKnowledgeBase",
      fonte: "base_conhecimento",
      success: true,
      reused: false,
      appointment_confirmed: false,
      dados: { base_version: versao, records },
    };
  };
  const callbackRespostaSimulada = (texto: string, fatosRecebidos: FatoRecuperado[]) => {
    respostasSimuladas.push({ texto, fatosRecebidos });
    return texto;
  };
  const callbackAgendaSimulada = (medicoId: string) => {
    leiturasAgendaSimuladas.push(medicoId);
    // Escala habitual igual não produz disponibilidade: esta leitura está vazia.
    return { consulta_realizada: true, medicoId, vagas: [] };
  };
  function registrar(direction: RegistroMensagem["direction"], body: string, status: string) {
    const id = `mensagem-ficticia-${++sequencia}`;
    mensagens.push({
      id,
      conversa_id: CONVERSA,
      direction,
      body,
      status,
      created_at: new Date(Date.parse(INICIO) + sequencia * 1000).toISOString(),
      is_teste: true,
    });
    return id;
  }
  function turno(
    mensagem: string,
    resposta: string,
    opcoes: {
      lerAgenda?: boolean;
      medicoAgenda?: typeof ALEX;
      candidatosAgenda?: typeof MEDICOS_AGENDA;
      statusResposta?: string;
      records?: ReturnType<typeof catalogoFicticio>;
    } = {},
  ) {
    const id = registrar("in", mensagem, "received");
    const anterior = conhecimentoDaMesmaSessao(conhecimento, CLINICA, sessao);
    const pesquisa = consultaDoNovoTurno({ mensagem, anterior });
    const fatos: FatoRecuperado[] = [];
    const consultas: ConsultaDoTurno[] = [];
    if (pesquisa) {
      const resultado = callbackCatalogoSimulado(pesquisa.args, opcoes.records);
      incorporarResultadoOficial({
        clinicaId: CLINICA,
        nome: resultado.ferramenta,
        args: pesquisa.args,
        resultado,
        fatos,
        consultas,
      });
    }
    const referencia = pesquisa
      ? lembrarConsultaComprovada({
          clinicaId: CLINICA,
          sessionId: sessao,
          args: pesquisa.args,
          fatos,
          anterior,
        })
      : null;
    const selecao = resolverSelecaoContextual({
      mensagem,
      clinicaId: CLINICA,
      sessaoId: sessao,
      fatosOficiais: fatos,
      selecaoAnterior: normalizarSelecaoContextual(anterior?.selecao),
      agora: INICIO,
    });
    const historico = historicoParaConsultaAgenda(mensagens, {
      conversaId: CONVERSA,
      inicioSessao,
      corteMemoria: 0,
      teste: true,
      idsDoTurno: new Set([id]),
      incluirIds: true,
    });
    const ctx: ContextoConsultaAgenda = {
      mensagemAtual: mensagem,
      mensagemAtualId: id,
      historico,
      clinicaId: CLINICA,
      sessaoId: sessao,
      selecaoRevalidada: selecao.selecao,
      interesseAnterior: normalizarInteresseConsultaAgenda(anterior?.interesseAgenda),
      // Replica o estado antes de a agenda resolver um UUID: catálogo != agenda.
      medicoEscolhido: { id: null, nome: null },
      disponibilidadeJaConsultada: false,
    };
    const interesseConfirmado = interesseEmConsultarAgenda(ctx);
    const interesse = atualizarInteresseConsultaAgenda(ctx);
    if (referencia) {
      referencia.selecao = selecao.selecao;
      referencia.interesseAgenda = interesse;
    }
    // A memória passa pelo mesmo formato JSON da persistência entre turnos.
    conhecimento = referencia ? JSON.parse(JSON.stringify(referencia)) : null;
    const medico = opcoes.medicoAgenda ?? ALEX;
    const autorizacao = autorizarConsultaAgenda(
      ctx,
      medico,
      opcoes.candidatosAgenda ?? MEDICOS_AGENDA,
    );
    const agenda =
      opcoes.lerAgenda && autorizacao.permitido ? callbackAgendaSimulada(medico.id) : null;
    const saidaId = registrar(
      "out",
      callbackRespostaSimulada(resposta, fatos),
      opcoes.statusResposta ?? "sent",
    );
    return {
      id,
      saidaId,
      fatos,
      consultas,
      pesquisa,
      referencia,
      selecao,
      ctx,
      interesseConfirmado,
      interesse,
      autorizacao,
      agenda,
    };
  }
  function iniciarAteEscolha(statusOferta = "sent") {
    const informacao = turno(
      "vocês têm cardiologista?",
      "Dr. Alex Louza e Dr. Bruno Costa atendem em Cardiologia.",
    );
    const pix = turno(
      "aceita PIX?",
      "As formas cadastradas são dinheiro e cartão. Qual médico prefere para verificar vagas?",
      { statusResposta: statusOferta },
    );
    const escolha = turno(
      "vou fazer com o dr Alex",
      "Você prefere Cardiologia ou Cardiologia Infantil, e qual dia deseja?",
    );
    return { informacao, pix, escolha };
  }
  return {
    turno,
    iniciarAteEscolha,
    mensagens,
    consultasSimuladas,
    leiturasAgendaSimuladas,
    respostasSimuladas,
    resetar() {
      sessao = "sessao-integracao-resetada";
      inicioSessao = new Date(Date.parse(INICIO) + (sequencia + 1) * 1000).toISOString();
      // Deliberadamente mantém o JSON antigo: o helper deve negar pelo escopo.
    },
  };
}

describe("integração da seleção e leitura da agenda com fontes reconsultadas", () => {
  it("cardiologia → PIX → Alex → modalidade/dia preserva a origem do aceite e só permite leitura", () => {
    const j = criarJornada();
    const { informacao, pix, escolha } = j.iniciarAteEscolha();
    expect(informacao.interesseConfirmado).toBe(false);
    expect(pix.pesquisa?.continuidade).toBe(true);
    expect(pix.interesseConfirmado).toBe(false);
    expect(escolha.selecao.estado).toBe("esclarecer_modalidade");
    expect(escolha.selecao.selecao?.medicoNome).toBe("Alex Louza");
    expect(escolha.selecao.aceiteAgendamento).toBe(false);
    expect(escolha.interesse).toMatchObject({
      mensagemPacienteId: escolha.id,
      ofertaMensagemId: pix.saidaId,
    });
    expect(j.leiturasAgendaSimuladas).toHaveLength(0);
    const ultimo = j.turno(
      "cardiologia quarta",
      "Vou consultar a disponibilidade para Cardiologia com Dr. Alex Louza.",
      { lerAgenda: true },
    );
    expect(ultimo.selecao.selecao?.modalidade?.nome.toLowerCase()).toBe("cardiologia");
    expect(ultimo.interesseConfirmado).toBe(true);
    expect(ultimo.interesse).toEqual(escolha.interesse);
    expect(ultimo.ctx.historico.map((m) => m.id)).toContain(pix.saidaId);
    expect(ultimo.ctx.historico.map((m) => m.id)).not.toContain(ultimo.id);
    expect(ultimo.autorizacao.permitido).toBe(true);
    expect(autorizarConsultaAgenda(ultimo.ctx, BRUNO, MEDICOS_AGENDA).permitido).toBe(false);
    expect(j.leiturasAgendaSimuladas).toEqual([ALEX.id]);
    expect(ultimo.agenda?.vagas).toEqual([]);
    expect(ultimo.selecao.aceiteAgendamento).toBe(false);
    expect(ultimo.selecao.selecao).not.toHaveProperty("slot_inicio");
    expect(ultimo.referencia).not.toHaveProperty("appointment_confirmed");
    expect(j.consultasSimuladas).toHaveLength(4);
    expect(ultimo.fatos.every((f) => f.versao === "publicacao-simulada-4")).toBe(true);
    expect(j.respostasSimuladas.at(-1)?.fatosRecebidos).toBe(ultimo.fatos);
  });

  it("oferta entregue sobre 'dele' + sim usa nome canônico revalidado, sem UUID do catálogo", () => {
    const j = criarJornada();
    j.iniciarAteEscolha();
    j.turno("cardiologia quarta", "Posso verificar as vagas dele?");
    const atual = j.turno("sim", "Vou consultar a agenda.", { lerAgenda: true });
    expect(atual.ctx.medicoEscolhido?.id).toBeNull();
    expect(atual.ctx.selecaoRevalidada?.medicoId).toBeNull();
    expect(atual.autorizacao.permitido).toBe(true);
    expect(j.leiturasAgendaSimuladas).toEqual([ALEX.id]);
    expect(autorizarConsultaAgenda(atual.ctx, BRUNO, MEDICOS_AGENDA).permitido).toBe(false);
    expect(
      autorizarConsultaAgenda(atual.ctx, ALEX, [
        ALEX,
        { ...ALEX, id: "33333333-3333-4333-8333-333333333333" },
      ]).permitido,
    ).toBe(false);
    expect(
      autorizarConsultaAgenda({ ...atual.ctx, mensagemAtualId: null }, ALEX, MEDICOS_AGENDA)
        .permitido,
    ).toBe(false);
  });

  it.each(["não consulte a agenda", "agora não", "qual o preço?"])(
    "revoga leitura após %s e não a recupera só com o dia",
    (mensagem) => {
      const j = criarJornada();
      j.iniciarAteEscolha();
      const recusado = j.turno(mensagem, "Qual dia você deseja?");
      expect(recusado.interesseConfirmado).toBe(false);
      expect(recusado.interesse).toBeNull();
      const posterior = j.turno("quarta", "Entendido.", { lerAgenda: true });
      expect(posterior.autorizacao.permitido).toBe(false);
      expect(j.leiturasAgendaSimuladas).toHaveLength(0);
    },
  );

  it("mudança de médico não carrega autorização do Alex para Bruno", () => {
    const j = criarJornada();
    j.iniciarAteEscolha();
    const troca = j.turno("prefiro o dr Bruno", "Qual dia você prefere?", {
      lerAgenda: true,
      medicoAgenda: BRUNO,
    });
    expect(troca.selecao.selecao?.medicoNome).toBe("Bruno Costa");
    expect(troca.interesse).toBeNull();
    expect(troca.autorizacao.permitido).toBe(false);
    const posterior = j.turno("quarta", "Entendido.", { lerAgenda: true, medicoAgenda: BRUNO });
    expect(posterior.autorizacao.permitido).toBe(false);
    expect(j.leiturasAgendaSimuladas).toHaveLength(0);
  });

  it.each(["cardiologia quarta", "sim"])(
    "reset impede herdar leitura por %s mesmo com JSON antigo",
    (mensagem) => {
      const j = criarJornada();
      j.iniciarAteEscolha();
      j.turno("cardiologia quarta", "Posso verificar as vagas dele?");
      j.resetar();
      const atual = j.turno(mensagem, "Vamos iniciar um novo teste.", { lerAgenda: true });
      expect(atual.ctx.historico).toEqual([]);
      expect(atual.selecao.selecao).toBeNull();
      expect(atual.interesse).toBeNull();
      expect(atual.autorizacao.permitido).toBe(false);
      expect(j.leiturasAgendaSimuladas).toHaveLength(0);
    },
  );

  it("oferta não entregue e catálogo que deixou de conter o profissional não validam continuidade", () => {
    const falhou = criarJornada();
    const { escolha, pix } = falhou.iniciarAteEscolha("failed");
    expect(escolha.ctx.historico.map((m) => m.id)).not.toContain(pix.saidaId);
    expect(escolha.interesse).toBeNull();
    const semOferta = falhou.turno("cardiologia quarta", "Entendido.", { lerAgenda: true });
    expect(semOferta.autorizacao.permitido).toBe(false);
    const removido = criarJornada();
    removido.iniciarAteEscolha();
    const semFonte = removido.turno("cardiologia quarta", "Preciso confirmar o profissional.", {
      records: catalogoFicticio().slice(1),
      lerAgenda: true,
    });
    expect(semFonte.selecao.selecao).toBeNull();
    expect(semFonte.interesse).toBeNull();
    expect(semFonte.autorizacao.permitido).toBe(false);
  });

  it("preferência e horário habitual não autorizam 'sim' sem uma oferta de agenda", () => {
    const j = criarJornada();
    j.iniciarAteEscolha();
    j.turno("cardiologia quarta", "Dr. Alex Louza atende quarta às 13h. Entendeu as informações?");
    const atual = j.turno("sim", "Certo.", { lerAgenda: true });
    expect(atual.interesse).toBeNull();
    expect(atual.autorizacao.permitido).toBe(false);
    expect(j.leiturasAgendaSimuladas).toHaveLength(0);
  });
});
