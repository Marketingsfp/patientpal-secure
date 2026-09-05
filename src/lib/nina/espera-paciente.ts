/**
 * FASE 1 — ESPERA DO PACIENTE (regras puras, sem banco).
 *
 * O objetivo é distinguir "a Nina falou" de "a Nina precisa de uma resposta
 * para continuar". Só o segundo caso liga o relógio.
 *
 * Não liga o relógio:
 * - informação pura ("o endereço da clínica é ...", preço, horário de funcionamento);
 * - despedida/encerramento ("qualquer coisa é só chamar");
 * - confirmação de algo já concluído ("seu agendamento está confirmado").
 *
 * Liga o relógio:
 * - pergunta necessária para seguir (dado obrigatório, escolha, esclarecimento,
 *   confirmação pendente do agendamento).
 */

export const TIMEOUT_RESPOSTA_PACIENTE_PADRAO_MINUTOS = 30;

/** Minutos de espera antes do prazo vencer. Nunca escrever "30" solto no código. */
export function timeoutRespostaPacienteMinutos(
  env?: Record<string, string | undefined>,
): number {
  const bruto = (env ?? (typeof process !== "undefined" ? process.env : {}))?.[
    "NINA_PATIENT_RESPONSE_TIMEOUT_MINUTES"
  ];
  const n = Number(bruto);
  if (!Number.isFinite(n) || n <= 0) return TIMEOUT_RESPOSTA_PACIENTE_PADRAO_MINUTOS;
  return Math.floor(n);
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Frases de despedida/encerramento — nunca abrem espera. */
const DESPEDIDAS = [
  "qualquer coisa e so chamar",
  "qualquer duvida e so chamar",
  "estou a disposicao",
  "fico a disposicao",
  "ate logo",
  "ate mais",
  "tenha um otimo dia",
  "tenha uma otima",
  "bom atendimento",
  "obrigada pelo contato",
  "obrigado pelo contato",
  "atendimento encerrado",
];

/**
 * Perguntas de cortesia. Sozinhas não seguram o atendimento — ninguém precisa
 * responder "posso ajudar em mais alguma coisa?" para o fluxo continuar.
 */
const CORTESIA = [
  "posso ajudar em mais alguma coisa",
  "posso te ajudar em mais alguma coisa",
  "mais alguma coisa",
  "algo mais",
  "precisa de mais alguma",
  "como posso te ajudar",
  "como posso ajudar",
  "em que posso ajudar",
  "tudo bem",
];

/** Sinais de pergunta necessária, mesmo sem "?" no texto. */
const PEDIDOS_OBRIGATORIOS = [
  "qual seu nome",
  "seu nome completo",
  "nome completo",
  "seu cpf",
  "informe o cpf",
  "data de nascimento",
  "qual exame",
  "qual procedimento",
  "qual especialidade",
  "qual horario",
  "que horario",
  "qual dia",
  "qual data",
  "qual medico",
  "algum medico",
  "prefere",
  "preferencia",
  "posso confirmar",
  "confirma para mim",
  "voce confirma",
  "pode confirmar",
  "me informe",
  "me envie",
  "poderia informar",
  "voce prefere",
  "qual das opcoes",
  "escolha",
];

export type MotivoEspera =
  | "PERGUNTA_DIRETA"
  | "DADO_OBRIGATORIO"
  | "ESCOLHA_OU_CONFIRMACAO"
  | null;

export type AvaliacaoEspera = {
  /** A Nina depende de uma resposta do paciente para continuar. */
  aguardando: boolean;
  motivo: MotivoEspera;
};

/**
 * Decide se a mensagem enviada pela Nina abre uma espera pelo paciente.
 */
export function avaliarEsperaPaciente(respostaNina: string): AvaliacaoEspera {
  const texto = normalizar(String(respostaNina ?? "").trim());
  if (!texto) return { aguardando: false, motivo: null };

  if (DESPEDIDAS.some((d) => texto.includes(d))) return { aguardando: false, motivo: null };

  const temPedido = PEDIDOS_OBRIGATORIOS.some((p) => texto.includes(p));
  if (temPedido) {
    const confirmacao = ["posso confirmar", "pode confirmar", "voce confirma", "confirma para mim"];
    return {
      aguardando: true,
      motivo: confirmacao.some((c) => texto.includes(c))
        ? "ESCOLHA_OU_CONFIRMACAO"
        : "DADO_OBRIGATORIO",
    };
  }

  // Interrogação real, descontando as perguntas de cortesia.
  const perguntas = texto
    .split(/(?<=\?)/)
    .map((t) => t.trim())
    .filter((t) => t.endsWith("?"));
  const relevantes = perguntas.filter((p) => !CORTESIA.some((c) => p.includes(c)));
  if (relevantes.length > 0) return { aguardando: true, motivo: "PERGUNTA_DIRETA" };

  return { aguardando: false, motivo: null };
}

export type PrazoEspera = {
  awaiting_patient_since: string;
  patient_response_deadline: string;
};

/** Calcula o par início/prazo a ser persistido na conversa. */
export function calcularPrazoEspera(agora: Date, minutos: number): PrazoEspera {
  return {
    awaiting_patient_since: agora.toISOString(),
    patient_response_deadline: new Date(agora.getTime() + minutos * 60_000).toISOString(),
  };
}

/** O prazo venceu? (usado pela fase seguinte; aqui só para leitura/teste). */
export function prazoVencido(deadlineISO: string | null | undefined, agora: Date): boolean {
  if (!deadlineISO) return false;
  const t = Date.parse(deadlineISO);
  if (!Number.isFinite(t)) return false;
  return agora.getTime() >= t;
}
