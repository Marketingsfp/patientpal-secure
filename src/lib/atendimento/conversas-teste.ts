/**
 * Modo treinamento — conversas de teste na tela de conversas.
 *
 * As conversas do console de homologação (`is_teste = true`) ficam fora do
 * atendimento real. Perfis autorizados podem ligar "Mostrar conversas de teste"
 * para vê-las na mesma lista, fila e contadores, com a etiqueta TESTE.
 *
 * Regras puras, sem acesso a banco:
 * - o servidor confere o perfil ativo e mantém o escopo de cada atendente;
 * - desligado, nada muda: todo filtro continua descartando teste;
 * - relatórios, métricas e distribuição automática nunca passam por aqui.
 */

/** Flag em `profiles.preferencias_ui.flags`, lembrada por usuário. */
export const FLAG_INBOX_MOSTRAR_TESTES = "inbox_mostrar_testes";

/** Motivo devolvido por `assumirConversa` para conversa de teste (etapa 2 trata a resposta). */
export const MOTIVO_CONVERSA_TESTE = "CONVERSA_TESTE";

/** Mensagem única de bloqueio: conversa de teste não recebe resposta pela tela real. */
export const MSG_CONVERSA_DE_TESTE =
  "Conversa de teste: a resposta da atendente fica para a próxima etapa do modo treinamento. Nada é enviado ao WhatsApp.";

export function perfilPodeSimularAtendimento(perfil: string | null | undefined): boolean {
  return perfil === "admin" || perfil === "supervisor" || perfil === "telefonia";
}

/** O controle só inclui testes com autorização confirmada pelo servidor. */
export function incluirTesteEfetivo(
  pedido: boolean | null | undefined,
  autorizado: boolean,
): boolean {
  return pedido === true && autorizado === true;
}

/** Linha de evento/registro que deve ser descartada na tela: teste sem o controle ligado. */
export function linhaDeTesteOculta(
  linha: { is_teste?: boolean | null } | null | undefined,
  incluirTeste: boolean | undefined,
): boolean {
  return linha?.is_teste === true && incluirTeste !== true;
}

/** Conversa que não pode ser respondida nem assumida pela tela real. */
export function conversaEhDeTeste(conv: { is_teste?: boolean | null } | null | undefined): boolean {
  return conv?.is_teste === true;
}

/** Junta a espera das conversas reais com a das de teste (a RPC filtra por igualdade). */
export function mesclarEsperaTeste(
  reais: Record<string, string>,
  testes: Record<string, string> | null | undefined,
  incluirTeste: boolean,
): Record<string, string> {
  if (!incluirTeste || !testes) return reais;
  return { ...reais, ...testes };
}
