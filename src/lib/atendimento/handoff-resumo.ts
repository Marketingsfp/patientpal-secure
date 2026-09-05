/**
 * Resumo automático da Nina no handoff para atendimento humano.
 *
 * Este arquivo guarda SOMENTE as regras puras (formato, saneamento e
 * apresentação). A montagem do contexto e a chamada ao modelo ficam em
 * `handoff-resumo.server.ts`; a exibição, em `ResumoHandoffCard.tsx`.
 *
 * Regra inegociável: o resumo é interno. Ele nunca vira mensagem do WhatsApp
 * e nunca inventa dado — o que o modelo devolver fora do que existe na
 * conversa é descartado aqui.
 */

export type IntencaoHandoff =
  | "agendamento"
  | "consulta"
  | "exame"
  | "alteracao_agendamento"
  | "cancelamento"
  | "valores"
  | "horario_funcionamento"
  | "endereco"
  | "documentos"
  | "duvida_administrativa"
  | "falar_com_atendente"
  | "financeiro"
  | "reclamacao"
  | "outro";

export const ROTULO_INTENCAO: Record<IntencaoHandoff, string> = {
  agendamento: "Agendamento",
  consulta: "Consulta",
  exame: "Exame",
  alteracao_agendamento: "Alteração de agendamento",
  cancelamento: "Cancelamento",
  valores: "Valores",
  horario_funcionamento: "Horário de funcionamento",
  endereco: "Endereço",
  documentos: "Documentos necessários",
  duvida_administrativa: "Dúvida administrativa",
  falar_com_atendente: "Falar com atendente",
  financeiro: "Financeiro",
  reclamacao: "Reclamação",
  outro: "Outro",
};

/** Agendamento REAL — só entra aqui a partir de registro do sistema. */
export interface AgendamentoConfirmado {
  medico?: string | null;
  servico?: string | null;
  data?: string | null;
  hora?: string | null;
  unidade?: string | null;
}

export interface ResumoHandoff {
  intencao: IntencaoHandoff;
  /** 1 frase: o que o paciente quer. */
  motivo_contato: string;
  /** Pares "Nome: João" já prontos para exibir. */
  informacoes: string[];
  /** O que a Nina efetivamente informou ao paciente. */
  ja_informado: string[];
  /** O que falta fazer. */
  pendencias: string[];
  /** Recomendação operacional curta (sugestão, nunca execução). */
  proxima_acao: string | null;
  /** Situação quando a Nina não conseguiu resolver. */
  situacao: string | null;
  /** Motivo da transferência, quando conhecido. */
  motivo_handoff: string | null;
  /** Preenchido apenas com registro real do sistema. */
  agendamento_confirmado: AgendamentoConfirmado | null;
}

const INTENCOES = new Set<string>(Object.keys(ROTULO_INTENCAO));

function texto(v: unknown, max = 240): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  if (!t) return null;
  // Frases de "não tenho essa informação" não têm valor operacional.
  if (/^(n[ãa]o (informado|há|ha|consta|se aplica)|nenhuma?( informa[çc][ãa]o)?|-|n\/a)$/i.test(t))
    return null;
  return t.slice(0, max);
}

function lista(v: unknown, maxItens = 6): string[] {
  const bruto = Array.isArray(v) ? v : typeof v === "string" ? v.split(/\n|;/) : [];
  const itens: string[] = [];
  for (const item of bruto) {
    const t = texto(item, 180);
    if (t && !itens.includes(t)) itens.push(t);
    if (itens.length >= maxItens) break;
  }
  return itens;
}

/**
 * Normaliza o que o modelo devolveu para o formato exibido, jogando fora
 * campos vazios, placeholders e qualquer agendamento "confirmado" que o
 * modelo tenha tentado afirmar por conta própria — esse dado só entra pelo
 * parâmetro `agendamentoReal`, vindo da agenda.
 */
export function normalizarResumo(
  bruto: unknown,
  extras?: { motivoHandoff?: string | null; agendamentoReal?: AgendamentoConfirmado | null },
): ResumoHandoff {
  const o = (bruto ?? {}) as Record<string, unknown>;
  const intencaoBruta = String(o.intencao ?? "").trim();
  const intencao: IntencaoHandoff = INTENCOES.has(intencaoBruta)
    ? (intencaoBruta as IntencaoHandoff)
    : "outro";
  const real = extras?.agendamentoReal ?? null;
  return {
    intencao,
    motivo_contato: texto(o.motivo_contato, 300) ?? "Não identificado pela conversa.",
    informacoes: lista(o.informacoes),
    ja_informado: lista(o.ja_informado),
    pendencias: lista(o.pendencias),
    proxima_acao: texto(o.proxima_acao, 300),
    situacao: texto(o.situacao, 300),
    motivo_handoff: texto(extras?.motivoHandoff ?? o.motivo_handoff, 240),
    agendamento_confirmado:
      real && (real.medico || real.servico || real.data) ? real : null,
  };
}

/** Blocos que realmente têm conteúdo — campo vazio não vai para a tela. */
export function blocosVisiveis(r: ResumoHandoff): Array<{ titulo: string; itens: string[] }> {
  const b: Array<{ titulo: string; itens: string[] }> = [];
  if (r.motivo_contato) b.push({ titulo: "Motivo do contato", itens: [r.motivo_contato] });
  if (r.situacao) b.push({ titulo: "Situação", itens: [r.situacao] });
  if (r.informacoes.length) b.push({ titulo: "Informações coletadas", itens: r.informacoes });
  if (r.ja_informado.length) b.push({ titulo: "Já informado pela Nina", itens: r.ja_informado });
  if (r.pendencias.length) b.push({ titulo: "Pendente", itens: r.pendencias });
  if (r.proxima_acao) b.push({ titulo: "Próxima ação sugerida", itens: [r.proxima_acao] });
  return b;
}

/** Instrução do modelo — centralizada para poder ser ajustada sem tocar em código de tela. */
export const PROMPT_RESUMO_HANDOFF = `Você resume, para a equipe INTERNA de uma clínica, uma conversa de WhatsApp que a assistente virtual Nina acabou de transferir para atendimento humano.

Responda APENAS um JSON com as chaves:
{"intencao","motivo_contato","informacoes","ja_informado","pendencias","proxima_acao","situacao"}

Regras obrigatórias:
- "intencao" deve ser um destes valores: ${Object.keys(ROTULO_INTENCAO).join(", ")}.
- "motivo_contato": UMA frase curta com o que o paciente quer.
- "informacoes": lista curta de dados que o PACIENTE realmente forneceu (ex.: "Nome: João da Silva", "Período: manhã"). Nunca invente nome, CPF, data, médico, procedimento, unidade ou convênio.
- "ja_informado": lista do que a NINA efetivamente disse ao paciente (valores, dias de atendimento, documentos...). Se ela não informou algo, não liste.
- "pendencias": lista curta e concreta do que falta fazer.
- "proxima_acao": UMA frase com a próxima ação operacional sugerida ao atendente.
- "situacao": use apenas quando a Nina NÃO conseguiu resolver (ex.: "A Nina não encontrou informação suficiente na base"). Caso contrário, string vazia.
- NUNCA afirme que algo foi agendado, confirmado, cancelado ou pago. Intenção não é ação concluída: escreva "deseja agendar", nunca "foi agendado".
- Nunca invente valores, médicos, horários ou dados pessoais. Sem informação, deixe a lista vazia.
- Ignore saudações e frases sem valor operacional ("olá", "bom dia").
- Português do Brasil, telegráfico, sem enrolação. Este texto NUNCA será enviado ao paciente.`;
