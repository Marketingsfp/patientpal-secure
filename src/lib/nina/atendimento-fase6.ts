/**
 * FASE 6 do novo fluxo de atendimento da Nina — máquina de estados explícita
 * e regras de handoff.
 *
 * A máquina NÃO transforma a Nina em script: ela só decide QUAL etapa está
 * ativa e quais regras/dados são obrigatórios ali. A linguagem continua
 * generativa. O objetivo é impedir salto de etapa crítica (pedir dados sem
 * intenção confirmada, agendar sem confirmação final, afirmar sucesso sem
 * registro real).
 *
 * Módulo PURO: deriva etapa a partir do estado + mensagem e devolve texto.
 */
import type { EstadoFluxoNina, EtapaFluxoNina } from "./fluxo-estado.server";
import { dadosFaltantes } from "./atendimento-fase3";
import { faltaParaConsultarAgenda } from "./atendimento-fase4";

function normalizar(texto: string): string {
  return (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PADROES_PEDIDO_HUMANO: RegExp[] = [
  /\b(atendente|humano|pessoa de verdade|uma pessoa|recepcao|recepcionista|secretaria|funcionari[oa])\b/,
  /\b(falar|conversar|quero falar) com (alguem|voces|a equipe|um atendente|uma atendente)\b/,
  /\bnao quero (falar com )?(rob(o|otizado)|ia|inteligencia artificial|bot)\b/,
];

export function pediuAtendenteHumano(mensagem: string): boolean {
  const t = normalizar(mensagem);
  return PADROES_PEDIDO_HUMANO.some((r) => r.test(t));
}

/** Motivos legítimos de transferência (regra de negócio da Fase 6). */
export const MOTIVOS_HANDOFF = [
  "paciente pediu atendente humano",
  "informação necessária não está na Base de Conhecimentos",
  "conflito entre informações",
  "ferramenta falhou sem recuperação possível",
  "assunto fora do escopo da Nina",
  "decisão que precisa de pessoa (exceção, cobrança, reclamação, urgência)",
  "Nina não compreendeu após tentativa razoável",
] as const;

export type ContextoFase6 = {
  mensagem: string;
  estado: EstadoFluxoNina;
  /** Primeira mensagem da conversa (sem histórico anterior). */
  primeiraMensagem: boolean;
  /** Intenções detectadas na Fase 1. */
  intencoes: readonly string[];
  /** Falha recente de criação de agendamento / tool sem recuperação. */
  falhaSemRecuperacao?: boolean;
};

/**
 * Deriva a etapa atual. Ordem de precedência: handoff > agendamento criado >
 * etapas do funil de agendamento > informação > identificação de intenção.
 */
export function derivarEtapa(ctx: ContextoFase6): EtapaFluxoNina {
  const { estado } = ctx;
  const a = estado.appointment;

  if (pediuAtendenteHumano(ctx.mensagem) || ctx.falhaSemRecuperacao) return "HANDOFF";
  if (a.appointment_id) return "APPOINTMENT_CONFIRMED";

  if (a.intent_confirmed) {
    if (dadosFaltantes(estado).length > 0) return "COLLECTING_PATIENT_DATA";
    if (a.slot_confirmed_by_patient) return "CREATING_APPOINTMENT";
    if (a.slot_inicio && a.date && a.time) return "WAITING_FINAL_CONFIRMATION";
    if (faltaParaConsultarAgenda(estado).length > 0) return "COLLECTING_BOOKING_PREFERENCES";
    return "CHECKING_AVAILABILITY";
  }

  if (a.slot_inicio || (a.date && a.time)) return "WAITING_SLOT_SELECTION";
  if (ctx.intencoes.includes("agendamento")) return "BOOKING_INTENT_PENDING";
  if (ctx.primeiraMensagem) return "GREETING";
  if (ctx.intencoes.length > 0) return "INFORMATION_RESPONSE";
  return "INTENT_IDENTIFICATION";
}

const REGRAS_POR_ETAPA: Record<string, string[]> = {
  GREETING: [
    "Cumprimente conforme o horário, apresente-se uma única vez e pergunte como pode ajudar. Não peça dado pessoal agora.",
  ],
  INTENT_IDENTIFICATION: [
    "A intenção ainda não está clara: faça UMA pergunta curta de clarificação. Não inicie agendamento nem coleta de dados.",
  ],
  INFORMATION_RESPONSE: [
    "Responda primeiro a dúvida com base na Base de Conhecimentos. Só depois, se fizer sentido, ofereça verificar disponibilidade.",
    "Perguntar preço, médico ou endereço NÃO é pedido de agendamento.",
  ],
  BOOKING_INTENT_PENDING: [
    "Há interesse, mas não confirmação. Pergunte se o paciente quer que você verifique a disponibilidade. Não peça dados ainda.",
  ],
  BOOKING_INTENT_CONFIRMED: [
    "Intenção de agendar confirmada: siga para os dados obrigatórios que ainda faltam.",
  ],
  COLLECTING_PATIENT_DATA: [
    "Peça SOMENTE os dados que ainda faltam. Nunca repita algo já informado ou já existente no cadastro.",
  ],
  COLLECTING_BOOKING_PREFERENCES: [
    "Faltam definições do atendimento (procedimento, profissional ou preferência de data). Pergunte só o que falta antes de consultar a agenda.",
  ],
  CHECKING_AVAILABILITY: [
    "Consulte a agenda real. Nunca invente vaga; nenhuma opção pode ser dita sem retorno da agenda.",
  ],
  WAITING_SLOT_SELECTION: [
    "Ofereça no máximo 3 opções reais e aguarde a escolha. Escolher horário NÃO cria agendamento.",
  ],
  WAITING_FINAL_CONFIRMATION: [
    "Mostre o resumo (paciente, atendimento, médico, data, horário, unidade) e pergunte se pode confirmar. Sem 'sim' explícito, nada é executado.",
  ],
  CREATING_APPOINTMENT: [
    "Execute a criação agora. Só afirme sucesso depois do retorno do sistema com o registro criado.",
    "Se o horário tiver sido ocupado, avise e ofereça novas opções reais.",
  ],
  APPOINTMENT_CONFIRMED: [
    "Agendamento já criado nesta conversa. Não crie outro para o mesmo pedido. Pergunte se pode ajudar em mais alguma coisa.",
  ],
  HANDOFF: [
    "Encaminhe para a equipe humana usando a ferramenta de transferência, com motivo e resumo interno.",
    "O resumo interno é para a equipe: motivo do contato, intenção, dados coletados, informações já passadas, pendências, motivo do handoff e próxima ação. NUNCA envie esse resumo ao paciente.",
    'Ao paciente, diga apenas algo como "Claro! Vou encaminhar seu atendimento para nossa equipe. 😊" e não insista em continuar com a IA.',
  ],
  COMPLETED: ["Conversa concluída. Só reabra o fluxo se o paciente trouxer nova solicitação."],
};

export type EntradaFase6 = ContextoFase6 & { etapa?: EtapaFluxoNina };

export function blocoPromptFase6(entrada: EntradaFase6): string {
  const etapa = entrada.etapa ?? derivarEtapa(entrada);
  const linhas: string[] = [
    `MÁQUINA DE ESTADOS DO ATENDIMENTO (FASE 6) — etapa atual: ${etapa}.`,
    "- Os estados controlam regras, dados obrigatórios, ordem das ações e validações. A linguagem continua natural: não recite etapas nem fale como robô.",
    "- É proibido pular etapa crítica: pedir dados sem intenção confirmada, oferecer vaga sem consultar a agenda, criar agendamento sem confirmação final ou afirmar sucesso sem retorno do sistema.",
    "- Se o paciente mudar de assunto, mude de etapa junto; não force o retorno ao agendamento.",
  ];

  for (const regra of REGRAS_POR_ETAPA[etapa] ?? []) linhas.push(`- ${regra}`);

  linhas.push(
    "TRANSFERÊNCIA PARA HUMANO — faça quando: " + MOTIVOS_HANDOFF.join("; ") + ".",
    "- Nunca invente informação para evitar transferir. Sem respaldo na Base, é melhor encaminhar.",
    "- Falta de dado do próprio paciente (nome, CPF, nascimento) NÃO é motivo de transferência: apenas peça o que falta.",
  );

  if (pediuAtendenteHumano(entrada.mensagem)) {
    linhas.push(
      "- O paciente pediu explicitamente uma pessoa: transfira agora, sem tentar resolver antes.",
    );
  }

  return linhas.join("\n");
}
