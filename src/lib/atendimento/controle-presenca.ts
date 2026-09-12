/**
 * FASE 3 — controle manual de presença do OS ZAP.
 *
 * Regras puras da tela (sem React, sem rede) para que o comportamento possa
 * ser testado: o que aparece selecionado, o que aparece "salvando", o que
 * acontece quando a gravação falha e o que aparece quando o atendente ainda
 * não escolheu nada.
 *
 * Princípios:
 * - O visual segue SEMPRE o último estado confirmado pelo servidor.
 * - Enquanto salva, nenhum botão muda de selecionado (nada de estado falso).
 * - Falha de gravação preserva o estado confirmado e permite tentar de novo.
 * - "Escolha sua disponibilidade" é uma pendência, não uma quarta opção.
 */
import type { EstadoManualPresenca } from "./presenca-manual";

export type ControlePresenca = {
  /** Último estado confirmado pelo servidor (null = nunca escolheu). */
  confirmado: EstadoManualPresenca | null;
  /** Estado cuja gravação está em andamento (null = nada salvando). */
  salvando: EstadoManualPresenca | null;
  /** Mensagem do último erro de gravação, se houver. */
  erro: string | null;
  /** Já terminou de ler o estado do servidor? */
  carregado: boolean;
};

export const CONTROLE_INICIAL: ControlePresenca = {
  confirmado: null,
  salvando: null,
  erro: null,
  carregado: false,
};

export const ROTULO_ESTADO_MANUAL: Record<EstadoManualPresenca, string> = {
  ONLINE: "Online",
  PAUSA: "Em pausa",
  OFFLINE: "Offline",
};

export const TEXTO_ESCOLHA_PENDENTE = "Escolha sua disponibilidade";

/** Terminou de carregar: aplica o que o servidor respondeu. */
export function aoCarregar(
  estado: ControlePresenca,
  confirmado: EstadoManualPresenca | null,
): ControlePresenca {
  return { confirmado, salvando: null, erro: null, carregado: true };
}

/** Clique numa opção: marca "salvando" sem mexer no que está selecionado. */
export function aoIniciarGravacao(
  estado: ControlePresenca,
  alvo: EstadoManualPresenca,
): ControlePresenca {
  return { ...estado, salvando: alvo, erro: null };
}

/** Servidor confirmou: só aqui o selecionado muda. */
export function aoConfirmar(
  estado: ControlePresenca,
  confirmado: EstadoManualPresenca,
): ControlePresenca {
  return { confirmado, salvando: null, erro: null, carregado: true };
}

/** Gravação falhou: preserva o confirmado e guarda o erro para nova tentativa. */
export function aoFalhar(estado: ControlePresenca, mensagem: string): ControlePresenca {
  return { ...estado, salvando: null, erro: mensagem || "Não foi possível salvar a presença." };
}

/** Uma opção só aparece selecionada quando o servidor confirmou. */
export function opcaoSelecionada(
  estado: ControlePresenca,
  opcao: EstadoManualPresenca,
): boolean {
  return estado.carregado && estado.confirmado === opcao;
}

/** Evita clique duplicado: durante qualquer gravação, tudo fica desabilitado. */
export function opcaoDesabilitada(estado: ControlePresenca): boolean {
  return estado.salvando !== null || !estado.carregado;
}

/** Pendência de escolha (não é um quarto estado selecionável). */
export function precisaEscolher(estado: ControlePresenca): boolean {
  return estado.carregado && estado.confirmado === null;
}

/** Texto exibido ao atendente, sem depender de cor. */
export function textoSituacao(estado: ControlePresenca): string {
  if (!estado.carregado) return "Carregando sua disponibilidade…";
  if (estado.salvando) return `Salvando ${ROTULO_ESTADO_MANUAL[estado.salvando]}…`;
  if (estado.erro) return estado.erro;
  if (!estado.confirmado) return TEXTO_ESCOLHA_PENDENTE;
  return `Você está ${ROTULO_ESTADO_MANUAL[estado.confirmado]}`;
}

/** Recebimento de novas conversas segue apenas a escolha salva. */
export function recebeNovasConversas(estado: ControlePresenca): boolean {
  return estado.carregado && estado.confirmado === "ONLINE";
}
