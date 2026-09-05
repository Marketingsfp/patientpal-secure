/**
 * FASE 4 do novo fluxo de atendimento da Nina — disponibilidade real,
 * escolha de horário e CONFIRMAÇÃO FINAL.
 *
 * Regras centrais:
 * - vaga vem SEMPRE da agenda do sistema (ferramentas), nunca da planilha
 *   nem do modelo;
 * - escolher um horário NÃO é confirmar: antes de gravar, a Nina mostra o
 *   resumo e pergunta "Posso confirmar esse agendamento?";
 * - sem resposta positiva clara, nenhuma operação é executada.
 *
 * Módulo PURO: só monta texto de prompt e lê o estado da conversa.
 */
import type { EstadoFluxoNina } from "./fluxo-estado.server";

function normalizar(texto: string): string {
  return (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Dados mínimos para consultar a agenda com sentido. */
export type DadoAgenda = "procedimento" | "profissional" | "preferencia_data";

export function faltaParaConsultarAgenda(estado: EstadoFluxoNina): DadoAgenda[] {
  const a = estado.appointment;
  const falta: DadoAgenda[] = [];
  if (!a.procedure && !a.specialty) falta.push("procedimento");
  if (!a.doctor_id && !a.doctor_name && !a.specialty) falta.push("profissional");
  if (!a.date) falta.push("preferencia_data");
  return falta;
}

/** "Quero as 09:00", "prefiro terça de manhã" — escolha, não confirmação. */
const PADROES_ESCOLHA: RegExp[] = [
  /\b\d{1,2}[:h]\d{0,2}\b/,
  /\b(o|a)\s+(primeiro|primeira|segundo|segunda opcao|terceiro|ultima)\b/,
  /\b(prefiro|quero|pode ser)\s+(a|as|o|na|no|de)?\s*(manha|tarde|noite|segunda|terca|quarta|quinta|sexta|sabado)\b/,
];

/** Confirmação FINAL, dada depois do resumo. */
const PADROES_CONFIRMACAO_FINAL: RegExp[] = [
  /^(sim|isso|isso mesmo|confirmo|confirma|confirmar|pode confirmar|pode marcar|ok|okay|perfeito|pode sim|tudo certo|esta certo|ta certo|correto|autorizo)[.! ]*$/,
  /\b(pode|podem)\s+confirmar\b/,
  /\bconfirmo\s+(o\s+)?agendamento\b/,
  /\b(esta|ta)\s+(certo|correto)\b/,
];

const PADROES_ALTERACAO: RegExp[] = [
  /\b(nao|outro|outra|trocar|mudar|alterar|corrigir|errado|errada)\b/,
];

export type LeituraFase4 = {
  escolheuHorario: boolean;
  confirmouFinal: boolean;
  pediuAlteracao: boolean;
};

export function lerMensagemFase4(mensagem: string): LeituraFase4 {
  const t = normalizar(mensagem);
  const pediuAlteracao = PADROES_ALTERACAO.some((r) => r.test(t));
  return {
    escolheuHorario: PADROES_ESCOLHA.some((r) => r.test(t)),
    confirmouFinal: !pediuAlteracao && PADROES_CONFIRMACAO_FINAL.some((r) => r.test(t)),
    pediuAlteracao,
  };
}

export type EntradaFase4 = {
  mensagem: string;
  estado: EstadoFluxoNina;
  nomeUnidade: string;
};

/** Resumo final mostrado ANTES de gravar o agendamento. */
export function textoResumo(estado: EstadoFluxoNina, nomeUnidade: string): string {
  const a = estado.appointment;
  const linhas = [
    `Paciente: ${estado.patient.first_name ?? "<nome completo do paciente>"}`,
    `Atendimento: ${a.procedure ?? a.specialty ?? "<procedimento>"}`,
    // Valor só aparece quando existe na planilha. Nunca estimar.
    ...(a.price ? [`Valor: ${a.price}`] : []),
    a.doctor_name ? `Médico: ${a.doctor_name}` : "Médico: <profissional>",
    `Data: ${a.date ?? "<data>"}`,
    `Horário: ${a.time ?? "<horário>"}`,
    `Unidade: ${nomeUnidade}`,
  ];
  return linhas.join("\n");
}


export function blocoPromptFase4({ mensagem, estado, nomeUnidade }: EntradaFase4): string {
  const leitura = lerMensagemFase4(mensagem);
  const falta = faltaParaConsultarAgenda(estado);
  const a = estado.appointment;
  const temVaga = Boolean(a.slot_inicio || (a.date && a.time));

  const linhas: string[] = [
    "DISPONIBILIDADE E CONFIRMAÇÃO (FASE 4):",
    "- A AGENDA do sistema é a única fonte de vaga. A planilha traz regras e dados oficiais, mas NUNCA confirma horário livre.",
    "- É PROIBIDO oferecer, sugerir ou supor qualquer horário que não tenha voltado agora das ferramentas de agenda. Não reaproveite horários de mensagens anteriores.",
  ];

  if (falta.length > 0) {
    linhas.push(
      `- Ainda falta definir antes de consultar a agenda: ${falta.join(", ")}. Pergunte apenas isso, em uma frase, e não pergunte o que já está definido.`,
    );
  } else {
    linhas.push(
      '- Já há dados suficientes para consultar a agenda. Se a consulta puder demorar, avise em uma frase: "Vou verificar os horários disponíveis para você. Só um instante. 😊"',
    );
  }

  linhas.push(
    "- Ao apresentar as vagas: no máximo 3 opções, em linguagem natural (ex.: \"Segunda-feira às 09:00\"), e termine com \"Qual você prefere?\". Nunca despeje uma lista longa nem mostre ids ou JSON.",
    "- Respeite a preferência do paciente (dia, período, profissional). Se não houver vaga na preferência, diga isso e ofereça as alternativas mais próximas devolvidas pela agenda.",
  );

  if (leitura.escolheuHorario && !leitura.confirmouFinal) {
    linhas.push(
      "- O paciente ESCOLHEU um horário. ESCOLHA NÃO É CONFIRMAÇÃO: não chame a ferramenta de agendar ainda.",
    );
  }

  if (temVaga && !leitura.confirmouFinal) {
    linhas.push(
      "- Antes de gravar, mostre o RESUMO exatamente neste formato e pergunte \"Posso confirmar esse agendamento?\":",
      textoResumo(estado, nomeUnidade),
    );
  }

  if (leitura.confirmouFinal) {
    linhas.push(
      "- O paciente CONFIRMOU o resumo. A próxima ação é CHAMAR a ferramenta de agendar (não escrever uma frase de sucesso). Só confirme depois de receber o identificador do agendamento.",
    );
  }

  if (leitura.pediuAlteracao) {
    linhas.push(
      "- O paciente pediu ALTERAÇÃO: volte apenas à etapa correspondente (procedimento, profissional, dia ou horário), mantenha o resto já definido e refaça o resumo antes de confirmar.",
    );
  }

  linhas.push(
    "- SEM confirmação positiva clara, NENHUMA operação é executada: não agende, não reserve e não diga que agendou.",
  );

  return linhas.join("\n");
}
