/** Jornadas determinísticas: catálogo e texto da IA são callbacks simulados.
 * Não chamam modelo, banco, WhatsApp nem comprovam a qualidade de uma IA real.
 * Exercitam os helpers de produção, compartilhamento da fonte e motor completo. */
import { describe, expect, it } from "bun:test";
import {
  compararReferenciasConhecimento,
  conhecimentoDaMesmaSessao,
  consultaDoNovoTurno,
  lembrarConsultaComprovada,
  type ConhecimentoSessao,
} from "./conhecimento-sessao";
import { incorporarResultadoOficial, limitarRetornoParaModelo } from "./evidencias-turno";
import { decidirNoTurno, verificarRespostaFinalDoTurno, type EstadoDoTurno } from "./runtime";
import type { ConsultaDoTurno, FatoRecuperado } from "./evidencia";
import type { ResultadoBroker } from "../tool-broker";

const CLINICA = "clinica-ficticia",
  SESSAO = "sessao-ficticia";
const PROFISSIONAL = "Alex Almeida";
function registros(precoGeral = 120) {
  return [
    {
      id: "prof-alex",
      medico: PROFISSIONAL,
      procedimento: "Consulta — CARDIOLOGIA, CARDIOLOGIA INFANTIL",
      dia: "Quarta 13h, Quinta 08h, Sexta 13h, Sábado 08h",
      extras: {
        especialidades: ["Cardiologia", "Cardiologia Infantil"],
        formas_pagamento: [
          { forma: "Dinheiro", valor: precoGeral, condicao: "Consulta Cardiologia" },
          { forma: "Cartão", valor: 145, condicao: "Consulta Cardiologia" },
          { forma: "Dinheiro", valor: 160, condicao: "Consulta Cardiologia Infantil" },
          { forma: "Cartão", valor: 190, condicao: "Consulta Cardiologia Infantil" },
        ],
      },
    },
    {
      id: "prof-marina",
      medico: "Marina Costa",
      procedimento: "Consulta Cardiologia",
      dia: "Segunda 09h",
      extras: {
        formas_pagamento: [
          { forma: "Dinheiro", valor: precoGeral },
          { forma: "Cartão", valor: 145 },
        ],
      },
    },
    {
      id: "prof-bruno",
      medico: "Bruno Pereira",
      procedimento: "Consulta Cardiologia",
      dia: "Terça 10h",
      extras: {
        formas_pagamento: [
          { forma: "Dinheiro", valor: precoGeral },
          { forma: "Cartão", valor: 145 },
        ],
      },
    },
  ];
}
function retornoCatalogo(
  records: unknown[] = registros(),
  versao = "v1-publicada",
): ResultadoBroker {
  return {
    ferramenta: "consultar_base_conhecimento",
    capacidade: "searchKnowledgeBase",
    fonte: "base_conhecimento",
    success: true,
    reused: false,
    appointment_confirmed: false,
    dados: { base_version: versao, records },
  };
}
const RESPOSTA_GERAL =
  "Temos atendimento em Cardiologia sim!\nDr. Alex Almeida atende quartas e sextas às 13h, quintas e sábados às 08h.\nDra. Marina Costa atende segunda às 09h.\nDr. Bruno Pereira atende terça às 10h.\nA consulta de Cardiologia custa R$ 120,00 no dinheiro ou R$ 145,00 no cartão.\nCardiologia Infantil com Dr. Alex Almeida custa R$ 160,00 no dinheiro ou R$ 190,00 no cartão.";
const RESPOSTA_PIX =
  "Não aceitamos PIX para cardiologia. As formas de pagamento cadastradas são dinheiro (R$ 120,00) ou cartão (R$ 145,00) — para cardiologia infantil com Dr. Alex Almeida, são R$ 160,00 no dinheiro ou R$ 190,00 no cartão.";
const RESPOSTA_SELECAO =
  "Dr. Alex Almeida atende quartas e sextas às 13h, quintas e sábados às 08h. Você prefere cardiologia geral ou infantil?";

type EntradaTurno = {
  mensagem: string;
  resposta: string;
  anterior?: ConhecimentoSessao | null;
  retorno?: ResultadoBroker;
  clinicaId?: string;
  sessionId?: string;
  consultar?: boolean;
  estado?: Partial<EstadoDoTurno>;
};
function turno(e: EntradaTurno) {
  const clinicaId = e.clinicaId ?? CLINICA,
    sessionId = e.sessionId ?? SESSAO;
  const anterior = conhecimentoDaMesmaSessao(e.anterior, clinicaId, sessionId);
  const pesquisa = consultaDoNovoTurno({ mensagem: e.mensagem, anterior });
  const fatos: FatoRecuperado[] = [],
    consultas: ConsultaDoTurno[] = [];
  const ferramentas: EstadoDoTurno["ferramentas"] = [];
  let fonteRecebidaPelaIASimulada: unknown = null;
  const callbackCatalogoSimulado = (_args: unknown) => e.retorno ?? retornoCatalogo();
  // O callback recebe a mesma resposta oficial incorporada ao motor.
  const callbackIASimulada = (fonte: unknown) => {
    fonteRecebidaPelaIASimulada = fonte;
    return e.resposta;
  };
  let resultado: ResultadoBroker | null = null;
  if (pesquisa && e.consultar !== false) {
    resultado = callbackCatalogoSimulado(pesquisa.args);
    incorporarResultadoOficial({
      clinicaId,
      nome: resultado.ferramenta,
      args: pesquisa.args,
      resultado,
      fatos,
      consultas,
    });
    ferramentas.push({
      nome: resultado.ferramenta,
      capacidade: resultado.capacidade,
      fonte: resultado.fonte,
      success: resultado.success,
      erro: resultado.erro,
    });
  }
  const resposta = callbackIASimulada(resultado ? limitarRetornoParaModelo(resultado) : null);
  const memoria = pesquisa
    ? lembrarConsultaComprovada({ clinicaId, sessionId, args: pesquisa.args, fatos, anterior })
    : null;
  const estado: EstadoDoTurno = {
    texto: resposta,
    mensagemPaciente: e.mensagem,
    intent: "informacao",
    acao: "responder_informacao",
    tipoTurno: "INFORMACAO",
    clinicaId,
    conversaId: "conversa-teste",
    ferramentas,
    fatos,
    consultas,
    catalogoEncontrou: fatos.some((f) => f.fonte === "catalogo_publicado"),
    ambiente: "homologacao",
    agendamentoConfirmado: false,
    pacienteIdentificado: false,
    esclarecimentoUsado: false,
    handoffSolicitado: false,
    ...e.estado,
  };
  return {
    fatos,
    consultas,
    pesquisa,
    memoria,
    fonteRecebidaPelaIASimulada,
    estado,
    acao: decidirNoTurno(estado),
    resposta: verificarRespostaFinalDoTurno(estado, resposta),
  };
}

describe("jornada com fontes reconsultadas a cada turno", () => {
  it("informação geral → PIX → escolha do Dr. Alex → modalidade preserva fatos, preços e escala", () => {
    const passos = [
      ["Vocês têm cardiologista?", RESPOSTA_GERAL],
      ["Aceita PIX?", RESPOSTA_PIX],
      ["Vou fazer com o Dr. Alex", RESPOSTA_SELECAO],
      [
        "Infantil",
        "Cardiologia Infantil com Dr. Alex Almeida custa R$ 160,00 no dinheiro ou R$ 190,00 no cartão. Gostaria de verificar a disponibilidade?",
      ],
    ] as const;
    let anterior: ConhecimentoSessao | null = null;
    for (const [mensagem, resposta] of passos) {
      const atual = turno({ mensagem, resposta, anterior });
      expect(atual.consultas).toHaveLength(1);
      expect(atual.consultas[0]?.status).toBe("com_itens");
      expect(atual.resposta.claims?.semEvidencia).toEqual([]);
      expect(atual.resposta.hardBlockers).not.toContain("MISSING_REQUIRED_OFFICIAL_SOURCE");
      expect(atual.resposta.hardBlockers).not.toContain("INCONSISTENT_SCHEDULE");
      expect(atual.resposta.decision).toBe("ALLOW");
      expect(atual.fonteRecebidaPelaIASimulada).toEqual(retornoCatalogo());
      anterior = atual.memoria;
    }
  });

  it("sem consulta no segundo turno perde a prova; refazer consulta recupera os fatos corretos", () => {
    const primeiro = turno({ mensagem: "Vocês têm cardiologista?", resposta: RESPOSTA_GERAL });
    const semFonte = turno({
      mensagem: "Vou fazer com o Dr. Alex",
      resposta: RESPOSTA_SELECAO,
      anterior: primeiro.memoria,
      consultar: false,
    });
    expect(semFonte.fatos).toEqual([]);
    expect(semFonte.resposta.hardBlockers).toContain("MISSING_REQUIRED_OFFICIAL_SOURCE");
    expect(semFonte.resposta.claims?.semEvidencia.length).toBeGreaterThan(0);
    const recuperado = turno({
      mensagem: "Vou fazer com o Dr. Alex",
      resposta: RESPOSTA_SELECAO,
      anterior: primeiro.memoria,
    });
    expect(recuperado.resposta.claims?.semEvidencia).toEqual([]);
    expect(recuperado.resposta.hardBlockers).not.toContain("MISSING_REQUIRED_OFFICIAL_SOURCE");
  });

  it("memória guarda referências, não copia os valores antigos", () => {
    const primeiro = turno({ mensagem: "Vocês têm cardiologista?", resposta: RESPOSTA_GERAL });
    expect(primeiro.memoria?.referencias.some((r) => r.registro === "prof-alex")).toBe(true);
    expect(JSON.stringify(primeiro.memoria)).not.toContain("120");
    const nova = turno({
      mensagem: "Quanto custa?",
      resposta: "Cardiologia custa R$ 130,00 no dinheiro.",
      anterior: primeiro.memoria,
      retorno: retornoCatalogo(registros(130), "v2-publicada"),
    });
    const diferenca = compararReferenciasConhecimento(
      primeiro.memoria!.referencias,
      nova.memoria!.referencias,
    );
    expect(diferenca.alteradas).toContain("prof-alex");
    expect(nova.fatos.some((f) => f.campo === "preco" && f.valor === "120")).toBe(false);
    expect(nova.resposta.claims?.semEvidencia).toEqual([]);
    const antiga = turno({
      mensagem: "Quanto custa?",
      resposta: "Cardiologia custa R$ 120,00 no dinheiro.",
      anterior: primeiro.memoria,
      retorno: retornoCatalogo(registros(130), "v2-publicada"),
    });
    expect(antiga.resposta.claims?.semEvidencia.some((c) => c.tipo === "valor")).toBe(true);
  });

  it("médico removido da publicação não é recuperado a partir da mensagem anterior", () => {
    const anterior = turno({
      mensagem: "Vocês têm cardiologista?",
      resposta: RESPOSTA_GERAL,
    }).memoria;
    const atual = turno({
      mensagem: "Vou fazer com o Dr. Alex",
      resposta: RESPOSTA_SELECAO,
      anterior,
      retorno: retornoCatalogo(
        registros().filter((r) => r.id !== "prof-alex"),
        "v2-publicada",
      ),
    });
    expect(
      compararReferenciasConhecimento(anterior!.referencias, atual.memoria!.referencias)
        .naoRecuperadas,
    ).toContain("prof-alex");
    expect(atual.fatos.some((f) => f.chave?.medicoNome === PROFISSIONAL)).toBe(false);
    expect(atual.resposta.claims?.semEvidencia.some((c) => c.tipo === "profissional")).toBe(true);
  });

  it.each(["falha", "vazio", "malformado"] as const)(
    "consulta %s não reaproveita fatos do turno anterior",
    (tipo) => {
      const anterior = turno({
        mensagem: "Vocês têm cardiologista?",
        resposta: RESPOSTA_GERAL,
      }).memoria;
      const resultado =
        tipo === "falha"
          ? { ...retornoCatalogo(), success: false, erro: "timeout" }
          : tipo === "vazio"
            ? retornoCatalogo([])
            : { ...retornoCatalogo(), dados: { formato_desconhecido: true } };
      const atual = turno({
        mensagem: "Vou fazer com o Dr. Alex",
        resposta: RESPOSTA_SELECAO,
        anterior,
        retorno: resultado,
      });
      expect(atual.fatos).toEqual([]);
      expect(atual.memoria).toBeNull();
      expect(atual.resposta.decision).not.toBe("ALLOW");
    },
  );

  it.each([
    ["outra-clinica", SESSAO],
    [CLINICA, "sessao-apos-reset"],
  ] as const)("clínica/sessão %s %s não herda referência", (clinicaId, sessionId) => {
    const memoria = turno({
      mensagem: "Vocês têm cardiologista?",
      resposta: RESPOSTA_GERAL,
    }).memoria;
    expect(conhecimentoDaMesmaSessao(memoria, clinicaId, sessionId)).toBeNull();
    const atual = turno({
      mensagem: "Infantil",
      resposta: RESPOSTA_SELECAO,
      anterior: memoria,
      clinicaId,
      sessionId,
      consultar: false,
    });
    expect(atual.pesquisa?.continuidade).toBe(false);
    expect(atual.fatos).toEqual([]);
    expect(atual.resposta.decision).not.toBe("ALLOW");
  });

  it("histórico da assistente não substitui fonte compartilhada", () => {
    const atual = turno({
      mensagem: "Vou fazer com o Dr. Alex",
      resposta: RESPOSTA_SELECAO,
      consultar: false,
      estado: {
        evidenciasFluxo: {
          registroFerramentasCompleto: true,
          historicoCompleto: true,
          sessionId: SESSAO,
          historico: [{ role: "assistant", content: RESPOSTA_GERAL }],
        },
      },
    });
    expect(atual.fonteRecebidaPelaIASimulada).toBeNull();
    expect(atual.resposta.hardBlockers).toContain("MISSING_REQUIRED_OFFICIAL_SOURCE");
  });

  it("disponibilidade exige consulta atual de agenda; catálogo não fornece vagas", () => {
    const anterior = turno({
      mensagem: "Vocês têm cardiologista?",
      resposta: RESPOSTA_GERAL,
    }).memoria;
    const texto = "Temos vaga em 20/09 às 10:00 com Dr. Alex Almeida.";
    const semAgenda = turno({ mensagem: "Pode verificar as vagas?", resposta: texto, anterior });
    expect(semAgenda.resposta.hardBlockers).toContain("MISSING_REQUIRED_OFFICIAL_SOURCE");
    const resultado: ResultadoBroker = {
      ferramenta: "consultar_agenda",
      capacidade: "checkAvailability",
      fonte: "agenda",
      success: true,
      reused: false,
      appointment_confirmed: false,
      dados: {
        horarios: [
          {
            medico: PROFISSIONAL,
            medico_id: "medico-alex",
            data: "2026-09-20",
            hora: "10:00",
            inicio: "2026-09-20T10:00:00",
            fim: "2026-09-20T10:30:00",
          },
        ],
      },
    };
    incorporarResultadoOficial({
      clinicaId: CLINICA,
      nome: resultado.ferramenta,
      args: { medico: PROFISSIONAL, dia: "2026-09-20" },
      resultado,
      fatos: semAgenda.fatos,
      consultas: semAgenda.consultas,
    });
    semAgenda.estado.ferramentas.push({
      nome: resultado.ferramenta,
      capacidade: resultado.capacidade,
      fonte: resultado.fonte,
      success: true,
    });
    const comAgenda = verificarRespostaFinalDoTurno(semAgenda.estado, texto);
    expect(comAgenda.claims?.semEvidencia).toEqual([]);
    expect(comAgenda.hardBlockers).not.toContain("MISSING_REQUIRED_OFFICIAL_SOURCE");
  });

  it("confirmar reserva sem ID permanece bloqueado mesmo após consultar catálogo", () => {
    const atual = turno({
      mensagem: "Pode marcar",
      resposta: "Sua consulta foi agendada para amanhã às 10h.",
      estado: {
        acao: "criar_agendamento",
        tipoTurno: "OPERACAO",
        agendamentoConfirmado: true,
        estadoOperacional: { appointmentCreated: true, appointmentId: null },
      },
    });
    expect(atual.acao.decision).toBe("BLOCK_ACTION");
    expect(atual.resposta.hardBlockers).toContain("UNSUPPORTED_OPERATIONAL_CLAIM");
  });

  it.each(["falha", "vazio"] as const)(
    "nova consulta do mesmo escopo com %s retira os fatos anteriores daquele turno",
    (tipo) => {
      const atual = turno({ mensagem: "Vocês têm cardiologista?", resposta: RESPOSTA_GERAL });
      expect(atual.fatos.length).toBeGreaterThan(0);
      const resultado =
        tipo === "falha"
          ? { ...retornoCatalogo(), success: false, erro: "timeout" }
          : retornoCatalogo([]);
      incorporarResultadoOficial({
        clinicaId: CLINICA,
        nome: resultado.ferramenta,
        args: atual.pesquisa!.args,
        resultado,
        fatos: atual.fatos,
        consultas: atual.consultas,
      });
      expect(atual.fatos).toEqual([]);
      expect(atual.consultas.at(-1)?.status).toBe(tipo === "falha" ? "falha" : "vazio");
      const resposta = verificarRespostaFinalDoTurno(atual.estado, RESPOSTA_GERAL);
      expect(resposta.decision).not.toBe("ALLOW");
      expect(resposta.claims?.semEvidencia.length).toBeGreaterThan(0);
    },
  );

  it("campo removido da publicação atual não reutiliza preço nem prova de pagamento da versão anterior", () => {
    const anterior = turno({
      mensagem: "Vocês têm cardiologista?",
      resposta: RESPOSTA_GERAL,
    }).memoria;
    const semPagamento = registros().map((r) => ({
      ...r,
      extras: { especialidades: ["Cardiologia"], formas_pagamento: null },
    }));
    const atual = turno({
      mensagem: "Quanto custa?",
      resposta: "Cardiologia custa R$ 120,00 no dinheiro.",
      anterior,
      retorno: retornoCatalogo(semPagamento, "v2-publicada"),
    });
    expect(atual.fatos.some((f) => f.campo === "preco")).toBe(false);
    expect(atual.fatos.some((f) => f.campo === "formas_pagamento_declaradas")).toBe(false);
    expect(atual.resposta.claims?.semEvidencia.some((c) => c.tipo === "valor")).toBe(true);
  });
});
