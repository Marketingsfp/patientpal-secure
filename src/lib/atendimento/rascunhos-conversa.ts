/**
 * Rascunhos por conversa (Fase 5 — consistência e privacidade).
 *
 * O texto digitado pertence sempre a UMA conversa. Ao trocar de paciente, o
 * campo de mensagem passa a mostrar o rascunho daquele paciente (ou vazio) —
 * nunca o texto escrito para outra pessoa.
 */

export type Rascunhos = Record<string, string>;

export function lerRascunho(mapa: Rascunhos, conversaId: string | null | undefined): string {
  if (!conversaId) return "";
  return mapa[conversaId] ?? "";
}

export function gravarRascunho(
  mapa: Rascunhos,
  conversaId: string | null | undefined,
  texto: string,
): Rascunhos {
  if (!conversaId) return mapa;
  if (!texto) {
    if (!(conversaId in mapa)) return mapa;
    const copia = { ...mapa };
    delete copia[conversaId];
    return copia;
  }
  if (mapa[conversaId] === texto) return mapa;
  return { ...mapa, [conversaId]: texto };
}

export function limparRascunho(mapa: Rascunhos, conversaId: string | null | undefined): Rascunhos {
  return gravarRascunho(mapa, conversaId, "");
}

/**
 * Uma ação (enviar, transferir, encerrar, agendar) só pode ser aplicada
 * quando o alvo continua sendo a conversa selecionada e o conteúdo dela já
 * terminou de carregar.
 */
export function acaoPermitida(params: {
  alvo: string | null | undefined;
  selecionadaAgora: string | null | undefined;
  carregando: boolean;
  /** Conversa indicada pelo endereço aberto agora (quando houver). */
  selecaoAtual?: string | null;
}): boolean {
  const { alvo, selecionadaAgora, carregando, selecaoAtual } = params;
  if (!alvo || !selecionadaAgora) return false;
  if (carregando) return false;
  if (selecaoAtual && alvo !== selecaoAtual) return false;
  return alvo === selecionadaAgora;
}

