/**
 * FASE 5 do novo fluxo de atendimento da Nina — execução real do agendamento
 * e conclusão da conversa.
 *
 * Regras centrais:
 * - o agendamento só é executado depois da confirmação explícita (Fase 4);
 * - a Nina só afirma sucesso com o identificador devolvido pela agenda:
 *   texto do modelo NÃO comprova operação;
 * - falha nunca vira confirmação; horário ocupado gera nova consulta;
 * - encerramento só quando o paciente indica que não precisa de mais nada.
 *
 * Módulo PURO: monta texto de prompt a partir do estado da conversa.
 */
import type { EstadoFluxoNina } from "./fluxo-estado.server";

function normalizar(texto: string): string {
  return (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "não, obrigado", "era só isso" — paciente sinaliza fim. */
const PADROES_ENCERRAMENTO: RegExp[] = [
  /^(nao|nao obrigad[oa]|era so isso|so isso|nada mais|por enquanto e so|e so isso)[.! ]*$/,
  /\b(era so isso|so isso mesmo|nada mais|obrigad[oa] por tudo|ate mais|tchau)\b/,
];

/** Nova solicitação depois do agendamento (mantém a conversa aberta). */
const PADROES_NOVA_SOLICITACAO: RegExp[] = [
  /\?\s*$/,
  /\b(quanto|valor|preco|onde|endereco|horario|preciso|posso|tem|como|quais|outro|outra|tambem)\b/,
];

export type LeituraFase5 = {
  pediuEncerramento: boolean;
  novaSolicitacao: boolean;
};

export function lerMensagemFase5(mensagem: string): LeituraFase5 {
  const t = normalizar(mensagem);
  const pediuEncerramento = PADROES_ENCERRAMENTO.some((r) => r.test(t));
  return {
    pediuEncerramento,
    novaSolicitacao: !pediuEncerramento && PADROES_NOVA_SOLICITACAO.some((r) => r.test(t)),
  };
}

export type EntradaFase5 = {
  mensagem: string;
  estado: EstadoFluxoNina;
  nomeUnidade: string;
  /** Base de Conhecimentos ativa: pode trazer preparo/documentos/antecedência. */
  baseAtiva: boolean;
};

export function blocoPromptFase5({
  mensagem,
  estado,
  nomeUnidade,
  baseAtiva,
}: EntradaFase5): string {
  const leitura = lerMensagemFase5(mensagem);
  const jaAgendado = Boolean(estado.appointment.appointment_id);

  const linhas: string[] = [
    "EXECUÇÃO DO AGENDAMENTO E ENCERRAMENTO (FASE 5):",
    "- Execute o agendamento SOMENTE depois da confirmação explícita do paciente ao resumo. Sem esse \"sim\", nenhuma operação é feita.",
    "- PROVA DE SUCESSO: só afirme que agendou depois que a ferramenta devolver sucesso com o identificador do agendamento. Sua própria frase NÃO comprova nada — nunca diga \"estou agendando\", \"vou agendar\" ou \"já está marcado\" antes disso.",
    `- Sucesso: responda "Pronto! 😊 Seu agendamento foi realizado com sucesso." e repita, em linhas curtas: atendimento, médico, data, horário e Unidade: ${nomeUnidade}.`,
  ];

  if (baseAtiva) {
    linhas.push(
      "- Se a Base de Conhecimentos tiver orientações oficiais para esse atendimento (antecedência de chegada, preparo, documentos), inclua-as de forma objetiva depois da confirmação. Não invente orientação que não esteja na Base.",
    );
  }

  linhas.push(
    "- Falha (retorno sem sucesso, erro de criação, validação ou erro interno): NÃO diga que agendou. Diga que não conseguiu concluir neste momento e siga o caminho seguro — tentar novamente ou encaminhar para um atendente.",
    '- Horário ocupado entre a escolha e a confirmação (indisponibilidade do slot): responda "Esse horário acabou de ficar indisponível. Posso verificar outra opção para você." e consulte a agenda de novo, oferecendo no máximo 3 alternativas reais.',
    '- Depois do sucesso, pergunte: "Posso te ajudar com mais alguma coisa?"',
  );

  if (jaAgendado) {
    linhas.push(
      "- Este agendamento JÁ foi criado nesta conversa. Não crie outro para o mesmo pedido; se o paciente quiser mudar, encaminhe conforme as regras de remarcação.",
    );
  }

  if (leitura.novaSolicitacao) {
    linhas.push(
      "- O paciente trouxe uma NOVA solicitação: continue o atendimento normalmente e não se despeça agora.",
    );
  }

  if (leitura.pediuEncerramento) {
    linhas.push(
      `- O paciente indicou que não precisa de mais nada: encerre com "Foi um prazer ajudar! 😊 A ${nomeUnidade} agradece o contato. Até breve!"`,
    );
  } else {
    linhas.push(
      "- Não se despeça enquanto o paciente não indicar que não precisa de mais nada.",
    );
  }

  return linhas.join("\n");
}
