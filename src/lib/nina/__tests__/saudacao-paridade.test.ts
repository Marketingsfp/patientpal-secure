import { describe, expect, it } from "bun:test";
import { estadoVazio } from "../fluxo-estado-normalizar";
import {
  avaliarSaudacao,
  garantirSessaoAtiva,
  marcarSaudacaoConcluida,
  recuperarSaudacaoEntregue,
  type MensagemSaudacaoEntregue,
} from "../saudacao-sessao";
import { extrairRegrasPublicadas } from "../confidence/regras-publicadas";
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

describe("Apresentação e continuidade iguais nos dois ambientes", () => {
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
