/**
 * FASE 3 do novo fluxo de atendimento da Nina — entrada CONTROLADA no
 * agendamento.
 *
 * Regra central: só começa coleta de dados quando o paciente confirma que
 * quer agendar. Interesse ("quanto custa?", "tem cardiologista?", "que dias
 * atende?") nunca dispara pedido de dado pessoal.
 *
 * Módulo PURO: detecta a confirmação e lista os dados faltantes. Não grava
 * nada, não cria paciente e não chama ferramenta.
 */
import { detectarIntencoes, type IntencaoNina } from "./atendimento-fase1";
import type { EstadoFluxoNina } from "./fluxo-estado.server";
import {
  CAMPOS_CADASTRO,
  camposCadastroFaltantes,
  atendimentoDefinido,
  type CampoCadastro,
} from "./cadastro-paciente";

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
const PADROES_ACEITE_CURTO: RegExp[] = [
  /^(sim|isso|isso mesmo|ok|okay|claro|perfeito|pode ser|pode sim|quero|quero sim|bora|fechado|tudo bem|ta bom|esta bom|aceito|confirmo)[.! ]*$/,
];

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
    !confirmado && (intencoes.includes("disponibilidade") || intencoes.includes("agendamento"));

  return { confirmado, interesse, intencoes };
}

/** Campos obrigatórios para identificar/criar o paciente sem duplicar cadastro. */
export const CAMPOS_OBRIGATORIOS = CAMPOS_CADASTRO;
export type CampoObrigatorio = (typeof CAMPOS_OBRIGATORIOS)[number];

const ROTULO: Record<CampoObrigatorio, string> = {
  nome: "nome completo",
  telefone: "telefone com DDD",
  data_nascimento: "data de nascimento",
};

/** O que ainda falta, considerando o que já foi coletado nesta conversa. */
export function dadosFaltantes(estado: EstadoFluxoNina, telefone?: string | null): CampoCadastro[] {
  if (estado.patient.identified && estado.patient.id) return [];
  const pend = estado.patient.pending;
  return camposCadastroFaltantes({ ...pend, telefone: telefone || pend.telefone });
}

export function rotulos(campos: CampoObrigatorio[]): string {
  return campos.map((c) => ROTULO[c]).join(", ");
}
