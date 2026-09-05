/**
 * ENCERRAMENTO AUTOMÁTICO DA CONVERSA PELA NINA (módulo puro).
 *
 * Regra: quando o paciente indica CLARAMENTE que não precisa de mais nada,
 * a Nina envia a mensagem final e a conversa é resolvida pelo MESMO mecanismo
 * usado quando um atendente clica em "Resolver".
 *
 * Este arquivo não fala com banco: só interpreta a mensagem, valida bloqueios
 * do fluxo e garante o conteúdo obrigatório da mensagem final.
 */
import type { EstadoFluxoNina } from "./fluxo-estado-normalizar";
import { etapaTransacional } from "./sessao";

function normalizar(texto: string): string {
  return (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[,;!]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\s]+$/, "");
}

/** Frases que indicam, sem ambiguidade, que o atendimento terminou. */
const PADROES_FIM: RegExp[] = [
  /^nao$/,
  /^nao (obrigad[oa]|precisa|precisa nao|por enquanto)$/,
  /^(so|era so) isso( mesmo)?$/,
  /^(obrigad[oa])?( )?(e|eh) so( isso)?$/,
  /^obrigad[oa] (e|eh) so( isso)?$/,
  /^pode encerrar( a conversa)?$/,
  /^tudo (certo|ok|bem)$/,
  /^(ok )?obrigad[oa]( pela ajuda| por tudo)?$/,
  /^(nada mais|mais nada|por enquanto (e|eh) so)$/,
  /^(valeu|beleza|tchau|ate mais|ate breve)( obrigad[oa])?$/,
  /^nao( obrigad[oa])? (era|e|eh) (so|isso)( mesmo)?$/,
];

/** Nova solicitação junto com o agradecimento: NUNCA encerra. */
const PADROES_NOVA_SOLICITACAO: RegExp[] = [
  /\?/,
  /\b(mas|porem|so que|aproveitando|queria|quero|preciso|gostaria|consegue|tem como|qual|quais|quanto|quando|onde|endereco|valor|preco|horario|remarcar|cancelar|outro|outra|tambem)\b/,
];


export function pediuEncerramento(mensagem: string): boolean {
  const t = normalizar(mensagem);
  if (!t) return false;
  // Todos os padrões de fim são ancorados (^...$): a mensagem inteira precisa
  // ser a confirmação de que não há mais nada. Se vier qualquer coisa junto
  // ("obrigado, mas queria..."), nenhum padrão casa e a conversa continua.
  return PADROES_FIM.some((r) => r.test(t));
}

export type ContextoEncerramento = {
  mensagemPaciente: string;
  estado: EstadoFluxoNina;
  /** A Nina pediu transferência para humano neste turno. */
  handoffPendente?: boolean;
  /** Alguma ferramenta ficou pendente/sem resultado neste turno. */
  operacaoPendente?: boolean;
};

export type DecisaoEncerramento = {
  encerrar: boolean;
  motivo: string;
};

/**
 * Só encerra quando a intenção é clara E nenhuma operação está em andamento.
 * Dúvida sempre mantém a conversa aberta.
 */
export function decidirEncerramento(ctx: ContextoEncerramento): DecisaoEncerramento {
  if (!pediuEncerramento(ctx.mensagemPaciente))
    return { encerrar: false, motivo: "sem indicação clara de encerramento" };
  if (ctx.handoffPendente) return { encerrar: false, motivo: "handoff pendente" };
  if (ctx.operacaoPendente) return { encerrar: false, motivo: "operação pendente" };
  if (etapaTransacional(ctx.estado.flow.stage))
    return { encerrar: false, motivo: `fluxo em andamento (${ctx.estado.flow.stage})` };
  return { encerrar: true, motivo: "paciente confirmou que não precisa de mais nada" };
}

/** Mensagem final padrão (pode ser reescrita pelo modelo, mantendo os itens obrigatórios). */
export function mensagemFinalPadrao(nomeUnidade: string): string {
  return `Foi um prazer ajudar! 😊 A ${nomeUnidade} agradece o contato. Seu atendimento foi encerrado. Se precisar de algo mais, é só nos enviar uma nova mensagem. Até breve!`;
}

/** A resposta contém todos os itens obrigatórios da despedida? */
export function mensagemFinalCompleta(resposta: string, nomeUnidade: string): boolean {
  const t = normalizar(resposta);
  const unidade = normalizar(nomeUnidade);
  const temAgradecimento = /(agradec|obrigad|foi um prazer)/.test(t);
  const temUnidade = unidade ? t.includes(unidade) : true;
  const temEncerramento = /(atendimento foi encerrado|encerramos (o|este) atendimento|atendimento encerrado)/.test(
    t,
  );
  const temRetorno = /(nova mensagem|nos envi|é só (nos )?chamar|e so (nos )?chamar|mande uma mensagem)/.test(
    t,
  );
  return temAgradecimento && temUnidade && temEncerramento && temRetorno;
}

/** Garante a mensagem final: completa a resposta do modelo quando faltar algo. */
export function garantirMensagemFinal(resposta: string, nomeUnidade: string): string {
  const texto = (resposta ?? "").trim();
  if (texto && mensagemFinalCompleta(texto, nomeUnidade)) return texto;
  const padrao = mensagemFinalPadrao(nomeUnidade);
  return texto ? `${texto}\n\n${padrao}` : padrao;
}

/** Bloco de prompt para o modelo já escrever a despedida no formato correto. */
export function blocoPromptEncerramento(nomeUnidade: string): string {
  return [
    "ENCERRAMENTO DO ATENDIMENTO:",
    "- O paciente indicou que NÃO precisa de mais nada. Este turno é a despedida: não faça novas perguntas.",
    `- A mensagem final precisa conter: agradecimento, o nome ${nomeUnidade}, a informação de que o atendimento foi encerrado e o convite para enviar uma nova mensagem se precisar.`,
    `- Sugestão: "${mensagemFinalPadrao(nomeUnidade)}"`,
    "- Se ainda houver qualquer solicitação pendente do paciente, NÃO se despeça: continue o atendimento.",
  ].join("\n");
}
