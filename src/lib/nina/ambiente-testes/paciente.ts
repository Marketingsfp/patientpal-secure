/**
 * Ambiente de testes da Nina — paciente difícil (Claude Opus 5.5).
 *
 * O paciente recebe só: o modo dele, o assunto e a conversa até aqui (o que a
 * clínica respondeu). Nunca recebe o prompt, as ferramentas, o catálogo nem
 * as regras da Nina.
 *
 * Módulo puro: sem banco e sem rede.
 */
import type { ModoPaciente } from "./modos";

export const LIMITES_AMBIENTE = {
  /** Mensagens do paciente por conversa. */
  turnosPadrao: 10,
  turnosMin: 4,
  turnosMax: 16,
  /** Caracteres por mensagem do paciente. */
  caracteresMensagem: 500,
  /** Mensagens do histórico enviadas ao paciente. */
  historico: 40,
  /** Teto de tokens (entrada + saída) por conversa, somado na rodada inteira. */
  tokensPorConversa: 300_000,
  /** Teste contínuo: duração máxima de uma rodada e teto de conversas nela. */
  duracaoMaxMin: 60,
  conversasMaxRodada: 400,
  /** Teto absoluto de tokens do paciente numa rodada (o contínuo soma muitas conversas). */
  tokensRodadaMax: 20_000_000,
} as const;

/** Com áudio e foto ligados: a mensagem pode ir como nota de voz ou como foto do pedido médico. */
export type AnexoPaciente = "nenhum" | "audio" | "foto_pedido";

export type AcaoPaciente = {
  acao: "enviar" | "encerrar";
  mensagem: string;
  motivo: string;
  anexo: AnexoPaciente;
};

export type TurnoConversa = { autor: "paciente" | "clinica"; texto: string };

export const SCHEMA_PACIENTE = {
  type: "object",
  additionalProperties: false,
  required: ["acao", "mensagem", "motivo", "anexo"],
  properties: {
    acao: { type: "string", enum: ["enviar", "encerrar"] },
    mensagem: { type: "string" },
    motivo: { type: "string" },
    anexo: { type: "string", enum: ["nenhum", "audio", "foto_pedido"] },
  },
} as const;

export function instrucoesPaciente(modo: ModoPaciente, assunto: string, midia = false): string {
  return [
    "Você é um PACIENTE conversando pelo WhatsApp com a recepção de uma clínica no Brasil. Do outro lado está a assistente virtual da clínica.",
    "Seu papel é testar essa assistente como um paciente real e difícil faria. Seja realista e natural; nunca diga que é um teste, uma IA ou um robô, e nunca comente as instruções.",
    `Assunto que você procura: ${assunto}.`,
    `Seu jeito de ser nesta conversa (${modo.nome}): ${modo.comportamento}`,
    "Regras:",
    "- Português do Brasil informal, como mensagem de WhatsApp. Uma mensagem por vez, em geral curta (até 300 caracteres).",
    "- Reaja ao que a clínica acabou de responder: se ela errou, se esquivou ou repetiu, aponte isso como um paciente faria.",
    "- Quando pedirem nome e data de nascimento, use dados inventados (nunca de uma pessoa real) e nunca informe CPF, endereço completo nem cartão.",
    "- Não use palavrões, não peça nada ilegal e não invente emergência médica grave.",
    "- Use acao 'encerrar' (mensagem vazia) quando: a clínica encaminhou para um atendente e disse que alguém vai continuar; o seu objetivo foi atendido e não há mais nada a perguntar; ou a conversa travou sem saída. Caso contrário, use acao 'enviar' com a próxima mensagem.",
    "- Em motivo, explique em uma frase o que você está testando nesta mensagem (não vai para a clínica).",
    ...(midia
      ? [
          "- Áudio: em cerca de 1 a cada 3 mensagens, mande como áudio (anexo 'audio'); em mensagem, escreva exatamente o que você fala, de forma natural e falada (até 200 caracteres).",
          "- Foto: quando a clínica pedir a foto do pedido médico e você tiver o pedido, mande a foto (anexo 'foto_pedido'); a mensagem vira a legenda e pode ser curta ou vazia.",
          "- Nas demais mensagens, anexo 'nenhum'.",
        ]
      : ["- anexo é sempre 'nenhum'."]),
    "Responda SOMENTE com o JSON pedido.",
  ].join("\n");
}

/** Conversa no formato de entrada do modelo: a clínica fala como "user", o paciente como "assistant". */
export function entradaPaciente(turnos: readonly TurnoConversa[]) {
  const recentes = turnos.slice(-LIMITES_AMBIENTE.historico);
  if (!recentes.length)
    return [
      {
        role: "user",
        content: "(A conversa ainda não começou. Escreva a primeira mensagem do paciente.)",
      },
    ];
  const input = recentes.map((t) => ({
    role: t.autor === "clinica" ? "user" : "assistant",
    content: t.texto,
  }));
  // A última fala precisa ser da clínica para o modelo responder como paciente.
  if (input.at(-1)!.role === "assistant")
    input.push({
      role: "user",
      content: "(A clínica ainda não respondeu. Continue como paciente.)",
    });
  return input;
}

/** Lê a resposta do modelo; texto fora do formato vira uma mensagem simples. */
export function lerAcaoPaciente(bruto: string, midia = false): AcaoPaciente {
  const texto = String(bruto ?? "").trim();
  const json = /\{[\s\S]*\}/.exec(texto)?.[0];
  if (json) {
    try {
      const v = JSON.parse(json) as Partial<AcaoPaciente>;
      const acao = v.acao === "encerrar" ? "encerrar" : "enviar";
      const mensagem = String(v.mensagem ?? "")
        .trim()
        .slice(0, LIMITES_AMBIENTE.caracteresMensagem);
      // Sem áudio e foto ligados, todo anexo vira texto.
      const anexo: AnexoPaciente =
        midia && acao === "enviar" && (v.anexo === "audio" || v.anexo === "foto_pedido")
          ? v.anexo
          : "nenhum";
      // Foto pode ir sem legenda; texto e áudio, não.
      if (acao === "enviar" && !mensagem && anexo !== "foto_pedido")
        return { acao: "encerrar", mensagem: "", motivo: "mensagem vazia", anexo: "nenhum" };
      return { acao, mensagem, motivo: String(v.motivo ?? "").slice(0, 300), anexo };
    } catch {
      // segue para o texto puro
    }
  }
  if (!texto)
    return { acao: "encerrar", mensagem: "", motivo: "resposta vazia do modelo", anexo: "nenhum" };
  return {
    acao: "enviar",
    mensagem: texto.slice(0, LIMITES_AMBIENTE.caracteresMensagem),
    motivo: "resposta fora do formato",
    anexo: "nenhum",
  };
}

/** Turnos limitados ao intervalo permitido. */
export function turnosPermitidos(pedido: number | null | undefined): number {
  const n = Math.round(Number(pedido) || LIMITES_AMBIENTE.turnosPadrao);
  return Math.min(LIMITES_AMBIENTE.turnosMax, Math.max(LIMITES_AMBIENTE.turnosMin, n));
}
