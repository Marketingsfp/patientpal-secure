/**
 * Reporte rápido de erro em uma mensagem da Nina — regras puras (FASE 1).
 *
 * Registro apenas: não altera a mensagem, a conversa, o catálogo, o prompt
 * nem o comportamento da Nina, e nunca envia mensagem ao paciente.
 * O item nasce `pending`, aguardando revisão humana.
 */

/** Origem gravada em `nina_feedback_erros.origem` para o reporte de um clique. */
export const ORIGEM_ERRO_RAPIDO = "nina_message_quick_report" as const;

/** Classificação neutra: "Erro reportado — a classificar". */
export const CATEGORIA_A_CLASSIFICAR = "nao_classificado" as const;

export type MensagemParaReporte = {
  id: string;
  conversa_id: string | null;
  clinica_id?: string | null;
  direction: string | null;
  enviada_por: string | null;
  body: string | null;
  transcricao?: string | null;
};

export type ResultadoValidacao =
  | { ok: true; snapshot: string }
  | { ok: false; motivo: "mensagem_inexistente" | "conversa_divergente" | "autor_invalido" | "sem_conteudo"; mensagem: string };

/**
 * Confere que a mensagem existe, pertence à conversa informada e foi enviada
 * pela Nina. O conteúdo é o texto armazenado, preservado byte a byte
 * (sem resumo, correção ou normalização de quebras de linha).
 */
export function validarMensagemNina(
  mensagem: MensagemParaReporte | null | undefined,
  conversaId: string,
): ResultadoValidacao {
  if (!mensagem) {
    return {
      ok: false,
      motivo: "mensagem_inexistente",
      mensagem: "Mensagem não encontrada nesta clínica.",
    };
  }
  if (mensagem.conversa_id !== conversaId) {
    return {
      ok: false,
      motivo: "conversa_divergente",
      mensagem: "A mensagem não pertence à conversa informada.",
    };
  }
  const daNina = mensagem.direction === "out" && mensagem.enviada_por === "nina";
  if (!daNina) {
    return {
      ok: false,
      motivo: "autor_invalido",
      mensagem: "Só é possível reportar mensagens enviadas pela Nina.",
    };
  }
  const snapshot = mensagem.body ?? mensagem.transcricao ?? "";
  if (snapshot === "") {
    return { ok: false, motivo: "sem_conteudo", mensagem: "A mensagem não possui conteúdo de texto." };
  }
  return { ok: true, snapshot };
}

/** Payload de inserção do reporte rápido (sem motivo, categoria detalhada ou correção). */
export function montarRegistroErroRapido(params: {
  clinicaId: string;
  conversaId: string;
  mensagemId: string;
  snapshot: string;
  reporterUserId: string;
}) {
  return {
    clinica_id: params.clinicaId,
    conversa_id: params.conversaId,
    mensagem_id: params.mensagemId,
    mensagem_texto: params.snapshot,
    categoria: CATEGORIA_A_CLASSIFICAR,
    correcao: null,
    observacao: null,
    status: "pending" as const,
    origem: ORIGEM_ERRO_RAPIDO,
    reportado_por: params.reporterUserId,
  };
}

/** Violação de unicidade do índice parcial (reporte rápido pendente já existe). */
export function ehConflitoDuplicidade(erro: { code?: string | null } | null | undefined): boolean {
  return erro?.code === "23505";
}

/** Textos exibidos à atendente após o clique. */
export const TEXTO_REPORTE_SUCESSO = "Erro enviado para revisão.";
export const TEXTO_REPORTE_DUPLICADO = "Esta mensagem já foi enviada para revisão.";
export const TEXTO_REPORTE_FALHA = "Não foi possível registrar o erro. Tente novamente.";
export const ROTULO_REPORTE = "Reportar erro da Nina";

/**
 * O botão aparece só em mensagens cuja autoria é da Nina segundo o sistema
 * (`direction`/`enviada_por`) — nunca por conter a palavra "Nina" no texto.
 */
export function deveMostrarBotaoReporte(
  mensagem: Pick<MensagemParaReporte, "direction" | "enviada_por">,
): boolean {
  return mensagem.direction === "out" && mensagem.enviada_por === "nina";
}

/** Resultado do backend → aviso discreto correspondente. */
export function avisoReporte(
  resultado: { duplicado?: boolean } | null,
): { tipo: "sucesso" | "duplicado"; texto: string } {
  return resultado?.duplicado
    ? { tipo: "duplicado", texto: TEXTO_REPORTE_DUPLICADO }
    : { tipo: "sucesso", texto: TEXTO_REPORTE_SUCESSO };
}

/** Item vindo do reporte de um clique (X vermelho). */
export function ehReporteRapido(origem: string | null | undefined): boolean {
  return origem === ORIGEM_ERRO_RAPIDO;
}

/** Identificador da conversa exibido na revisão: código amigável + ID do sistema. */
export function rotuloConversaReporte(
  conversaId: string | null | undefined,
  numero?: number | null,
): string {
  if (!conversaId) return "—";
  return numero ? `#${numero} · ${conversaId}` : conversaId;
}

/**
 * Insere/atualiza um item na lista sem duplicar quando a resposta da
 * requisição e o evento em tempo real chegam para o mesmo registro.
 */
export function mesclarReporte<T extends { id: string; created_at?: string }>(
  itens: T[],
  novo: T,
): T[] {
  const i = itens.findIndex((x) => x.id === novo.id);
  if (i >= 0) {
    const copia = itens.slice();
    copia[i] = { ...itens[i], ...novo };
    return copia;
  }
  return [novo, ...itens];
}

