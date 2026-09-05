/**
 * FASE 3 do novo fluxo de atendimento da Nina — entrada CONTROLADA no
 * agendamento.
 *
 * Regra central: só começa coleta de dados quando o paciente confirma que
 * quer agendar. Interesse ("quanto custa?", "tem cardiologista?", "que dias
 * atende?") nunca dispara pedido de dado pessoal.
 *
 * Módulo PURO: detecta a confirmação e monta texto de prompt. Não grava
 * nada, não cria paciente e não chama ferramenta.
 */
import { detectarIntencoes, type IntencaoNina } from "./atendimento-fase1";
import type { EstadoFluxoNina } from "./fluxo-estado.server";

function normalizar(texto: string): string {
  return (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Pedido explícito de marcar. "Quanto custa" e "tem vaga?" NÃO entram aqui. */
const PADROES_CONFIRMACAO: RegExp[] = [
  /\b(quero|queria|gostaria de|preciso|pode|podes|poderia|vamos|vou)\s+(fazer\s+o\s+)?(agendar|agendamento|marcar|marca|remarcar)\b/,
  /\b(agenda|agende|marca|marque|marcar)\s+(pra|para)\s+(mim|nos)\b/,
  /\bquero\s+(esse|este|essa|esta|o|a)\s+(horario|hora|vaga|dia|data)\b/,
  /\b(pode|podem)\s+(confirmar|marcar|agendar)\b/,
  /\b(fazer|realizar)\s+o\s+agendamento\b/,
  /\bconfirmo\s+(o\s+)?(agendamento|horario|vaga)?\b/,
];

/** Respostas curtas de aceite a uma vaga já oferecida ("sim", "pode ser"). */
const PADROES_ACEITE_CURTO: RegExp[] =
  [/^(sim|isso|isso mesmo|ok|okay|claro|perfeito|pode ser|pode sim|quero|quero sim|bora|fechado|tudo bem|ta bom|esta bom|aceito|confirmo)[.! ]*$/];

export type ResultadoIntencaoAgendar = {
  confirmado: boolean;
  /** Demonstrou interesse (disponibilidade/vaga), mas não confirmou. */
  interesse: boolean;
  intencoes: IntencaoNina[];
};

export function avaliarIntencaoAgendar(
  mensagem: string,
  estado?: Pick<EstadoFluxoNina, "appointment"> | null,
): ResultadoIntencaoAgendar {
  const texto = normalizar(mensagem).trim();
  const intencoes = detectarIntencoes(mensagem);

  const jaConfirmadoAntes = Boolean(
    estado?.appointment?.intent_confirmed || estado?.appointment?.slot_confirmed_by_patient,
  );

  const explicito = PADROES_CONFIRMACAO.some((r) => r.test(texto));
  // "sim" só vale como confirmação quando havia uma vaga/oferta na mesa.
  const vagaNaMesa = Boolean(estado?.appointment?.slot_inicio || estado?.appointment?.date);
  const aceiteCurto = vagaNaMesa && PADROES_ACEITE_CURTO.some((r) => r.test(texto));

  const confirmado = jaConfirmadoAntes || explicito || aceiteCurto;
  const interesse =
    !confirmado &&
    (intencoes.includes("disponibilidade") || intencoes.includes("agendamento"));

  return { confirmado, interesse, intencoes };
}

/** Campos obrigatórios para identificar/criar o paciente sem duplicar cadastro. */
export const CAMPOS_OBRIGATORIOS = ["nome", "cpf", "data_nascimento"] as const;
export type CampoObrigatorio = (typeof CAMPOS_OBRIGATORIOS)[number];

const ROTULO: Record<CampoObrigatorio, string> = {
  nome: "nome completo",
  cpf: "CPF",
  data_nascimento: "data de nascimento",
};

/** O que ainda falta, considerando o que já foi coletado nesta conversa. */
export function dadosFaltantes(estado: EstadoFluxoNina): CampoObrigatorio[] {
  if (estado.patient.identified && estado.patient.id) return [];
  const pend = estado.patient.pending;
  return CAMPOS_OBRIGATORIOS.filter((c) => !pend[c]);
}

export function rotulos(campos: CampoObrigatorio[]): string {
  return campos.map((c) => ROTULO[c]).join(", ");
}

/** Itens do agendamento já definidos — não perguntar de novo. */
export function jaDefinido(estado: EstadoFluxoNina): string[] {
  const a = estado.appointment;
  const itens: string[] = [];
  if (a.procedure) itens.push(`procedimento: ${a.procedure}`);
  if (a.specialty) itens.push(`especialidade: ${a.specialty}`);
  if (a.doctor_name) itens.push(`profissional: ${a.doctor_name}`);
  if (a.date) itens.push(`data: ${a.date}`);
  if (a.time) itens.push(`horário: ${a.time}`);
  return itens;
}

export type EntradaFase3 = {
  mensagem: string;
  estado: EstadoFluxoNina;
};

export function blocoPromptFase3({ mensagem, estado }: EntradaFase3): string {
  const { confirmado, interesse } = avaliarIntencaoAgendar(mensagem, estado);
  const faltam = dadosFaltantes(estado);
  const definidos = jaDefinido(estado);

  const linhas: string[] = ["ENTRADA CONTROLADA NO AGENDAMENTO (FASE 3):"];

  if (!confirmado) {
    linhas.push(
      "- O paciente AINDA NÃO confirmou que quer agendar. É PROIBIDO pedir nome, CPF, data de nascimento ou telefone agora.",
      interesse
        ? '- Ele demonstrou interesse: pergunte em uma frase — "Você gostaria que eu verificasse a disponibilidade para realizar o agendamento?" — e aguarde a resposta.'
        : "- Responda apenas o que foi perguntado. No máximo ofereça, em uma frase curta, verificar a disponibilidade. Sem insistir.",
    );
  } else {
    linhas.push("- INTENÇÃO DE AGENDAR CONFIRMADA (estado BOOKING_INTENT_CONFIRMED).");
    if (estado.patient.identified && estado.patient.id) {
      linhas.push(
        `- O cadastro do paciente${estado.patient.first_name ? ` (${estado.patient.first_name})` : ""} JÁ existe e está vinculado a esta conversa. NÃO peça dados de novo e NÃO crie cadastro novo: siga para a vaga e o agendamento.`,
      );
    } else if (faltam.length === CAMPOS_OBRIGATORIOS.length) {
      linhas.push(
        `- Peça os dados obrigatórios do paciente em UMA única mensagem, começando por algo como "Perfeito! 😊 Para prosseguirmos com o agendamento, preciso de alguns dados do paciente:" e liste: ${rotulos(faltam)}.`,
        "- Não peça nada além disso. Sem endereço, e-mail, convênio ou telefone nesta etapa.",
      );
    } else {
      linhas.push(
        `- O paciente JÁ informou: ${CAMPOS_OBRIGATORIOS.filter((c) => !faltam.includes(c)).map((c) => ROTULO[c]).join(", ")}. Peça SOMENTE o que falta: ${rotulos(faltam)} (ex.: "Obrigada! Agora só preciso da sua ${ROTULO[faltam[0]!]}.").`,
        "- NÃO recomece a coleta e NÃO repita perguntas já respondidas.",
      );
    }
    linhas.push(
      "- CADASTRO ÚNICO: se já existir paciente correspondente, reutilize o cadastro encontrado. Nunca crie um segundo cadastro para a mesma pessoa.",
    );
  }

  if (definidos.length > 0) {
    linhas.push(`- Já definido nesta conversa, NÃO pergunte de novo: ${definidos.join(" | ")}.`);
  } else {
    linhas.push(
      "- Se o paciente já disser procedimento, médico, unidade, data ou período na própria mensagem, aproveite essas informações; pergunte apenas o que ainda faltar.",
    );
  }

  return linhas.join("\n");
}
