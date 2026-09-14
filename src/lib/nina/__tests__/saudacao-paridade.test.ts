import { describe, expect, it } from "bun:test";
import { derivarEtapa } from "../atendimento-fase6";
import { estadoVazio, type EstadoFluxoNina } from "../fluxo-estado-normalizar";
import {
  avaliarSaudacao,
  contemApresentacaoPublicada,
  garantirSessaoAtiva,
  marcarSaudacaoConcluida,
  recuperarSaudacaoEntregue,
  type MensagemSaudacaoEntregue,
} from "../saudacao-sessao";
import { sinaisDaConversa } from "../confidence/obrigacoes";
import { montarContextoDoTurno } from "../confidence/runtime";
import { aplicabilidadeDaRegra, extrairRegrasPublicadas } from "../confidence/regras-publicadas";
import { PROMPT_PUBLICADO_V15 } from "../confidence/fixtures/prompt-publicado-v15";

const IDENTIDADE = { assistente: "Nina", estabelecimento: "Policlínica Menino Jesus" };
const INICIO = "2026-09-14T12:00:00.000Z";
const AGORA = "2026-09-14T12:02:00.000Z";
const SAUDACAO =
  "Olá, bom dia! Eu sou a Nina, atendente virtual da Policlínica Menino Jesus. Como posso te ajudar?";
const REGRAS = extrairRegrasPublicadas(PROMPT_PUBLICADO_V15, { escopo: "whatsapp" }).regras;
const regra = (id: string) => REGRAS.find((r) => r.identificador === id)!;

function sessao() {
  return garantirSessaoAtiva(estadoVazio(), { agoraISO: INICIO }).estado;
}

function entregue(teste = false): MensagemSaudacaoEntregue {
  return {
    id: "saudacao-enviada",
    conversa_id: "conversa-atual",
    direction: "out",
    body: SAUDACAO,
    status: "sent",
    created_at: "2026-09-14T12:01:00.000Z",
    is_teste: teste,
    enviada_por: "nina",
  };
}

function recuperar(
  mensagens: readonly MensagemSaudacaoEntregue[],
  estado = sessao(),
  teste = false,
  identidade = IDENTIDADE,
) {
  return recuperarSaudacaoEntregue(estado, mensagens, identidade, {
    conversaId: "conversa-atual",
    teste,
    agoraISO: AGORA,
  });
}

function verificarSegundoTurno(estado: EstadoFluxoNina, ambiente: "producao" | "homologacao") {
  const segunda = garantirSessaoAtiva(estado, { jaRespondeuNestaSessao: true, agoraISO: AGORA });
  expect(segunda.saudacaoObrigatoria).toBe(false);
  expect(segunda.novaSessao).toBe(false);
  const contexto = montarContextoDoTurno({
    mensagemPaciente: "voces tem cardiologista?",
    apresentacaoJaFeita: !segunda.saudacaoObrigatoria,
    ambiente,
    ferramentas: [],
    catalogoEncontrou: false,
    agendamentoConfirmado: false,
    pacienteIdentificado: false,
    esclarecimentoUsado: false,
    handoffSolicitado: false,
  });
  const sinais = sinaisDaConversa(contexto);
  expect(sinais.primeiraMensagem).toBe(false);
  expect(aplicabilidadeDaRegra(regra("CONV-02"), sinais)).toBe("nao_aplica");
  expect(aplicabilidadeDaRegra(regra("CONV-03"), sinais)).toBe("aplica");
  expect(
    derivarEtapa({
      estado: segunda.estado,
      mensagem: contexto.mensagemPaciente!,
      primeiraMensagem: sinais.primeiraMensagem!,
      intencoes: [],
    }),
  ).toBe("INTENT_IDENTIFICATION");
}

describe("Apresentação e continuidade iguais nos dois ambientes", () => {
  for (const ambiente of ["producao", "homologacao"] as const) {
    for (const papel of ["atendente virtual", "assistente virtual"]) {
      it(`${ambiente}: apresentação como ${papel} encerra a abertura antes do pedido concreto`, () => {
        const inicial = sessao();
        const diagnostico = avaliarSaudacao(
          SAUDACAO.replace("atendente virtual", papel),
          IDENTIDADE,
          { obrigatoria: true },
        );
        expect(diagnostico.saudacaoAusente).toBe(false);
        // Mesmo caminho do runtime: apenas apresentação reconhecida e entregue é marcada.
        const persistido = contemApresentacaoPublicada(
          SAUDACAO.replace("atendente virtual", papel),
          IDENTIDADE,
        )
          ? marcarSaudacaoConcluida(inicial)
          : inicial;
        verificarSegundoTurno(persistido, ambiente);
      });
    }

    it(`${ambiente}: recupera a apresentação entregue que a versão antiga não reconheceu`, () => {
      const inicial = sessao();
      const resultado = recuperar(
        [entregue(ambiente === "homologacao")],
        inicial,
        ambiente === "homologacao",
      );
      expect(resultado.recuperada).toBe(true);
      expect(resultado.mensagemId).toBe("saudacao-enviada");
      expect(inicial.greeting_completed).toBe(false);
      expect(resultado.estado.session_id).toBe(inicial.session_id);
      verificarSegundoTurno(resultado.estado, ambiente);
    });

    it(`${ambiente}: apresentação que responde ao pedido concreto não exige pergunta genérica de ajuda`, () => {
      const body =
        "Olá! Sou a Nina, atendente virtual da Policlínica Menino Jesus. A consulta de Cardiologia custa R$ 180,00.";
      expect(avaliarSaudacao(body, IDENTIDADE).completa).toBe(false);
      expect(contemApresentacaoPublicada(body, IDENTIDADE)).toBe(true);
      const inicial = sessao();
      const persistido = contemApresentacaoPublicada(body, IDENTIDADE)
        ? marcarSaudacaoConcluida(inicial)
        : inicial;
      verificarSegundoTurno(persistido, ambiente);
      const recuperado = recuperar(
        [{ ...entregue(ambiente === "homologacao"), body }],
        inicial,
        ambiente === "homologacao",
      );
      expect(recuperado.recuperada).toBe(true);
      verificarSegundoTurno(recuperado.estado, ambiente);
    });
  }

  it("reconhece a identidade publicada sem fixar o nome Nina ou o estabelecimento", () => {
    const identidade = { assistente: "Lia", estabelecimento: "Clínica Aurora" };
    const body = "Boa tarde! Sou a Lia, atendente virtual da Clínica Aurora. Como posso ajudar?";
    expect(avaliarSaudacao(body, identidade).completa).toBe(true);
    expect(recuperar([{ ...entregue(), body }], sessao(), false, identidade).recuperada).toBe(true);
  });
});

describe("Recuperação exige prova da apresentação da Nina nesta sessão", () => {
  const invalidas: Array<[string, Partial<MensagemSaudacaoEntregue>]> = [
    ["candidato com envio falho", { status: "failed" }],
    ["envio pendente", { status: "pending" }],
    ["status ausente", { status: null }],
    ["mensagem sem vínculo persistido", { id: null }],
    ["mensagem recebida do paciente", { direction: "in" }],
    ["mensagem humana", { enviada_por: "humano" }],
    ["autoria ausente", { enviada_por: null }],
    ["marcador interno", { status: "system", enviada_por: "sistema" }],
    ["outra conversa", { conversa_id: "outra" }],
    ["outro ambiente", { is_teste: true }],
    ["sessão anterior", { created_at: "2026-09-14T11:59:59.999Z" }],
    ["data ausente", { created_at: null }],
    ["data futura", { created_at: "2026-09-14T12:03:00.000Z" }],
    ["resposta qualquer", { body: "Temos cardiologista. A consulta custa R$ 180,00." }],
    ["saudação sem identidade", { body: "Olá, bom dia! Como posso ajudar?" }],
    [
      "atendente sem identificação virtual",
      { body: SAUDACAO.replace("atendente virtual", "atendente humana") },
    ],
    [
      "palavra que apenas contém o papel virtual",
      { body: SAUDACAO.replace("atendente virtual", "inassistente virtual") },
    ],
    ["outra atendente", { body: SAUDACAO.replace("Nina", "Lia") }],
    ["negação da identidade publicada", { body: SAUDACAO.replace("Eu sou", "Eu não sou") }],
    ["outro estabelecimento", { body: SAUDACAO.replace("Menino Jesus", "Aurora") }],
    [
      "citação da assistente sem apresentação",
      { body: "Olá, a Nina é a atendente virtual da Policlínica Menino Jesus. Podemos ajudar?" },
    ],
    ["nome publicado é apenas parte de outro nome", { body: SAUDACAO.replace("Nina", "Ninara") }],
  ];
  it.each(invalidas)("não recupera por %s", (_nome, patch) => {
    const inicial = sessao();
    const resultado = recuperar([{ ...entregue(), ...patch }], inicial);
    expect(resultado).toEqual({ estado: inicial, recuperada: false, mensagemId: null });
    expect(garantirSessaoAtiva(resultado.estado).saudacaoObrigatoria).toBe(true);
  });

  it.each(["sent", "delivered", "read"])("aceita apresentação com status %s", (status) => {
    expect(recuperar([{ ...entregue(), status }]).recuperada).toBe(true);
  });

  it("preserva estado concluído e não recupera sessão ou identidade incompleta", () => {
    const inicial = sessao();
    const concluido = marcarSaudacaoConcluida(inicial);
    expect(recuperar([entregue()], concluido).estado).toBe(concluido);
    expect(recuperar([entregue()], { ...inicial, session_id: null }).recuperada).toBe(false);
    expect(recuperar([entregue()], { ...inicial, session_started_at: null }).recuperada).toBe(
      false,
    );
    expect(
      recuperar([entregue()], inicial, false, { ...IDENTIDADE, assistente: "" }).recuperada,
    ).toBe(false);
    expect(
      recuperar([entregue()], inicial, false, { ...IDENTIDADE, estabelecimento: "" }).recuperada,
    ).toBe(false);
  });
});
