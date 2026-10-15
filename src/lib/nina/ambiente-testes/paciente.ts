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
  /** Teto de tokens (entrada + saída) somados de uma rodada inteira. */
  tokensRodada: 3_000_000,
} as const;

export type AcaoPaciente = { acao: "enviar" | "encerrar"; mensagem: string; motivo: string };

export type TurnoConversa = { autor: "paciente" | "clinica"; texto: string };

export const SCHEMA_PACIENTE = {
  type: "object",
  additionalProperties: false,
  required: ["acao", "mensagem", "motivo"],
  properties: {
    acao: { type: "string", enum: ["enviar", "encerrar"] },
    mensagem: { type: "string" },
    motivo: { type: "string" },
  },
} as const;

export function instrucoesPaciente(modo: ModoPaciente, assunto: string): string {
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
export function lerAcaoPaciente(bruto: string): AcaoPaciente {
  const texto = String(bruto ?? "").trim();
  const json = /\{[\s\S]*\}/.exec(texto)?.[0];
  if (json) {
    try {
      const v = JSON.parse(json) as Partial<AcaoPaciente>;
      const acao = v.acao === "encerrar" ? "encerrar" : "enviar";
      const mensagem = String(v.mensagem ?? "")
        .trim()
        .slice(0, LIMITES_AMBIENTE.caracteresMensagem);
      if (acao === "enviar" && !mensagem)
        return { acao: "encerrar", mensagem: "", motivo: "mensagem vazia" };
      return { acao, mensagem, motivo: String(v.motivo ?? "").slice(0, 300) };
    } catch {
      // segue para o texto puro
    }
  }
  if (!texto) return { acao: "encerrar", mensagem: "", motivo: "resposta vazia do modelo" };
  return {
    acao: "enviar",
    mensagem: texto.slice(0, LIMITES_AMBIENTE.caracteresMensagem),
    motivo: "resposta fora do formato",
  };
}

/** Turnos limitados ao intervalo permitido. */
export function turnosPermitidos(pedido: number | null | undefined): number {
  const n = Math.round(Number(pedido) || LIMITES_AMBIENTE.turnosPadrao);
  return Math.min(LIMITES_AMBIENTE.turnosMax, Math.max(LIMITES_AMBIENTE.turnosMin, n));
}
