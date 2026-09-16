/**
 * FASE 1 — ESPERA DO PACIENTE (regras puras, sem banco).
 *
 * Toda mensagem enviada pela Nina inicia 30 minutos de espera. O conteúdo
 * não decide o encaminhamento: só a ausência de retorno e a responsabilidade
 * exclusiva da Nina. Conversas encerradas ou humanas são excluídas no servidor.
 */

export const TIMEOUT_RESPOSTA_PACIENTE_PADRAO_MINUTOS = 30;

/** Regra de atendimento: o mesmo prazo nos dois ambientes. */
export function timeoutRespostaPacienteMinutos(): number {
  return TIMEOUT_RESPOSTA_PACIENTE_PADRAO_MINUTOS;
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Perguntas de cortesia: também iniciam o prazo, com motivo genérico. */
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
  | "RESPOSTA_NINA_ENVIADA"
  | "PERGUNTA_DIRETA"
  | "DADO_OBRIGATORIO"
  | "ESCOLHA_OU_CONFIRMACAO"
  | null;

export type AvaliacaoEspera = {
  /** Houve uma resposta da Nina; aguarda eventual retorno do paciente. */
  aguardando: boolean;
  motivo: MotivoEspera;
};

/**
 * Decide se a mensagem enviada pela Nina abre uma espera pelo paciente.
 */
export function avaliarEsperaPaciente(respostaNina: string): AvaliacaoEspera {
  const texto = normalizar(String(respostaNina ?? "").trim());
  if (!texto) return { aguardando: false, motivo: null };

  // Os motivos antigos continuam úteis no histórico; nunca excluem uma resposta.

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

  return { aguardando: true, motivo: "RESPOSTA_NINA_ENVIADA" };
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

/**
 * FASE 2 — proteção contra corrida entre "o paciente respondeu" e
 * "o job foi verificar o prazo".
 *
 * O job leu um prazo (`esperado`) e, quando volta para agir, relê o estado
 * atual da conversa. Só é timeout de verdade se continuar existindo espera
 * pendente, com exatamente o mesmo prazo, e ele já ter vencido.
 */
export function timeoutAindaValido(args: {
  /** Prazo lido agora, direto do banco. */
  deadlineAtual: string | null | undefined;
  /** Prazo que o job tinha visto quando decidiu agir. */
  deadlineEsperado: string | null | undefined;
  agora: Date;
}): boolean {
  const { deadlineAtual, deadlineEsperado, agora } = args;
  // Paciente respondeu, conversa resolvida ou assumida: espera cancelada.
  if (!deadlineAtual) return false;
  // Pergunta nova criou outro ciclo: o prazo antigo não vale mais.
  if (deadlineEsperado && deadlineAtual !== deadlineEsperado) return false;
  return prazoVencido(deadlineAtual, agora);
}
