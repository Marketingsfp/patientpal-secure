/**
 * FASE 4 — CONTEXT BUILDER DA NINA (puro, testável).
 *
 * Monta SOMENTE o contexto necessário para uma rodada de conversa:
 *
 *   System Instructions
 * + mensagens relevantes (janela recente, com limite)
 * + conhecimento recuperado da planilha (só o trecho retornado pelo retrieval)
 * + dados necessários do paciente (campos mínimos, nunca o CRM inteiro)
 * + resultados das tools desta conversa
 *
 * O que NUNCA é enviado automaticamente: planilha inteira, histórico inteiro,
 * CRM inteiro, Agenda inteira. Cada fonte entra por retrieval/tool, sob limite.
 */

export type MensagemContexto = {
  role: string;
  content: string | null;
  /** Id físico da mensagem (quando vem do histórico gravado). */
  id?: string | null;
  tool_calls?: Array<{ id: string; function?: { name?: string; arguments?: string } }>;
  tool_call_id?: string;
};

/** Campos mínimos do paciente (CRM) que podem ir ao modelo. */
export type PacienteContexto = {
  primeiro_nome?: string | null;
  identificado?: boolean;
  validado?: boolean;
  tem_agendamento_futuro?: boolean;
};

export type LimitesContexto = {
  /** Máximo de mensagens do histórico enviadas por rodada. */
  maxMensagens: number;
  /** Máximo de caracteres por mensagem do histórico. */
  maxCaracteresMensagem: number;
  /** Máximo de resultados de tools reenviados como contexto. */
  maxResultadosTool: number;
};

export const LIMITES_PADRAO: LimitesContexto = {
  maxMensagens: 20,
  maxCaracteresMensagem: 4000,
  maxResultadosTool: 8,
};

export type EntradaContexto = {
  /** Blocos de instrução (prompt base, agenda, base de conhecimento, estado). */
  systemBlocos: Array<string | null | undefined | false>;
  /** Histórico já carregado da conversa (pode vir maior que o limite). */
  historico: MensagemContexto[];
  /** Mensagem atual do paciente. */
  mensagemAtual: string;
  /**
   * Ids físicos das mensagens que compõem a mensagem atual deste turno. O
   * histórico já contém essas mensagens gravadas; sem isso elas apareceriam
   * duas vezes no contexto. A deduplicação é por ID: mensagens de texto igual
   * enviadas em turnos diferentes continuam preservadas.
   */
  idsMensagemAtual?: readonly string[] | null;
  /** Somente os campos mínimos do paciente. */
  paciente?: PacienteContexto | null;
  /** Conhecimento já recuperado (resultado do retrieval, não a planilha). */
  conhecimento?: unknown;
  /** Resultados de tools já executadas neste turno. */
  resultadosTool?: Array<{ ferramenta: string; resultado: unknown }>;
  limites?: Partial<LimitesContexto>;
};

export type ContextoMontado = {
  messages: MensagemContexto[];
  /** Métricas para debug/telemetria interna. */
  metricas: {
    mensagens_historico_disponiveis: number;
    mensagens_historico_enviadas: number;
    resultados_tool_enviados: number;
    tem_conhecimento: boolean;
    tem_paciente: boolean;
    truncou_mensagem: boolean;
  };
};

function cortar(texto: string, max: number): { texto: string; cortou: boolean } {
  if (texto.length <= max) return { texto, cortou: false };
  return { texto: `${texto.slice(0, max)}…`, cortou: true };
}

/**
 * Janela de mensagens relevantes: as últimas `maxMensagens`, sem quebrar o
 * par assistant(tool_calls) → tool. Se a janela começar num resultado de tool
 * órfão, ele é descartado (o modelo não aceita `tool` sem a chamada).
 */
export function selecionarMensagensRelevantes(
  historico: MensagemContexto[],
  maxMensagens: number,
): MensagemContexto[] {
  const janela = historico.slice(-Math.max(0, maxMensagens));
  let inicio = 0;
  while (inicio < janela.length && janela[inicio]?.role === "tool") inicio += 1;
  return janela.slice(inicio);
}

/**
 * Remove do histórico as mensagens que JÁ são a mensagem atual deste turno.
 * Critério primário: o ID físico. Sem ID, cai para um critério estreito — a
 * última mensagem do histórico, do paciente, com o mesmo texto: a que acabou
 * de ser gravada. Uma repetição legítima em outro turno é sempre seguida da
 * resposta da Nina, então não é atingida.
 */
export function removerMensagemAtualDuplicada(
  historico: MensagemContexto[],
  mensagemAtual: string,
  ids?: readonly string[] | null,
): { mensagens: MensagemContexto[]; removidas: number } {
  const alvo = new Set((ids ?? []).filter((i) => typeof i === "string" && i.length > 0));
  if (alvo.size > 0) {
    const mensagens = historico.filter((m) => !(m.id && alvo.has(m.id)));
    return { mensagens, removidas: historico.length - mensagens.length };
  }
  const ultimo = historico[historico.length - 1];
  if (
    ultimo &&
    ultimo.role === "user" &&
    typeof ultimo.content === "string" &&
    ultimo.content.trim() === mensagemAtual.trim() &&
    mensagemAtual.trim() !== ""
  ) {
    return { mensagens: historico.slice(0, -1), removidas: 1 };
  }
  return { mensagens: historico, removidas: 0 };
}

export function montarContexto(entrada: EntradaContexto): ContextoMontado {
  const limites = { ...LIMITES_PADRAO, ...(entrada.limites ?? {}) };
  const system = entrada.systemBlocos
    .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
    .join("\n\n");

  let truncou = false;
  const relevantes = selecionarMensagensRelevantes(entrada.historico, limites.maxMensagens).map(
    (m) => {
      if (typeof m.content !== "string") return m;
      const c = cortar(m.content, limites.maxCaracteresMensagem);
      if (c.cortou) truncou = true;
      return { ...m, content: c.texto };
    },
  );

  const blocosExtra: MensagemContexto[] = [];

  if (entrada.paciente && (entrada.paciente.identificado || entrada.paciente.primeiro_nome)) {
    blocosExtra.push({
      role: "system",
      content: `DADOS DO PACIENTE (CRM, somente o necessário): ${JSON.stringify(entrada.paciente)}`,
    });
  }

  if (entrada.conhecimento) {
    blocosExtra.push({
      role: "system",
      content: `CONHECIMENTO RECUPERADO DA BASE OFICIAL (use apenas isto como fato): ${JSON.stringify(
        entrada.conhecimento,
      )}`,
    });
  }

  const resultados = (entrada.resultadosTool ?? []).slice(-limites.maxResultadosTool);
  for (const r of resultados) {
    blocosExtra.push({
      role: "system",
      content: `RESULTADO DA FERRAMENTA ${r.ferramenta}: ${JSON.stringify(r.resultado)}`,
    });
  }

  return {
    messages: [
      { role: "system", content: system },
      ...blocosExtra,
      ...relevantes,
      { role: "user", content: entrada.mensagemAtual },
    ],
    metricas: {
      mensagens_historico_disponiveis: entrada.historico.length,
      mensagens_historico_enviadas: relevantes.length,
      resultados_tool_enviados: resultados.length,
      tem_conhecimento: Boolean(entrada.conhecimento),
      tem_paciente: Boolean(entrada.paciente?.identificado),
      truncou_mensagem: truncou,
    },
  };
}
