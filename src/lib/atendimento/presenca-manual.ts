/**
 * FASE 1 — fonte oficial do estado MANUAL de presença do atendente.
 *
 * Regra do OS ZAP: o estado do atendente só muda por ação explícita dele no
 * controle de presença. Inatividade, troca de aba, foco, heartbeat, queda de
 * conexão, recarregar ou fechar a página NÃO podem alterar essa escolha.
 *
 * Por isso existem duas informações separadas em `atend_agente_presenca`:
 *
 *   • escolha manual  → `estado_manual` (+ quem, quando e versão)
 *     É a fonte oficial. Só a operação autenticada do próprio atendente grava.
 *
 *   • estado técnico  → `status`, `aceita_novas`, `visto_em`
 *     Derivados da escolha manual; `visto_em` é só sinal de vida (heartbeat) e
 *     nunca é prova de que alguém escolheu Offline.
 *
 * Este arquivo tem apenas decisões puras (sem rede e sem banco), para poder
 * ser testado e reaproveitado pelo servidor e pela tela.
 */

export const ESTADOS_MANUAIS = ["ONLINE", "OFFLINE", "PAUSA", "PAUSA_SAIDA"] as const;
export type EstadoManualPresenca = (typeof ESTADOS_MANUAIS)[number];

export const ROTULO_ESTADO_MANUAL: Record<EstadoManualPresenca, string> = {
  ONLINE: "Online",
  OFFLINE: "Offline",
  PAUSA: "Em pausa",
  PAUSA_SAIDA: "Em pausa para saída",
};

/** Só aceita os estados permitidos — qualquer outra coisa é recusada. */
export function ehEstadoManual(v: unknown): v is EstadoManualPresenca {
  return typeof v === "string" && (ESTADOS_MANUAIS as readonly string[]).includes(v);
}

/** Pausa comum e pausa para saída: não recebem conversas novas, mas podem enviar mensagens. */
export function ehEstadoPausa(v: unknown): v is "PAUSA" | "PAUSA_SAIDA" {
  return v === "PAUSA" || v === "PAUSA_SAIDA";
}

/**
 * Tradução para os campos legados de presença. Só Online recebe conversas novas;
 * as duas pausas e o Offline não recebem. `aceita_novas` não decide elegibilidade
 * e permanece compatível com o legado.
 */
export function tecnicoDoEstadoManual(estado: EstadoManualPresenca): {
  status: "ONLINE" | "BUSY" | "OFFLINE";
  aceitaNovas: boolean;
} {
  switch (estado) {
    case "ONLINE":
      return { status: "ONLINE", aceitaNovas: true };
    case "PAUSA":
    case "PAUSA_SAIDA":
      return { status: "BUSY", aceitaNovas: false };
    default:
      return { status: "OFFLINE", aceitaNovas: false };
  }
}

/**
 * Registro antigo, sem escolha manual comprovada, NÃO vira escolha manual
 * automaticamente: o atendente precisa escolher antes de voltar a receber
 * conversas novas.
 */
export function precisaEscolherPresenca(estadoManual: string | null | undefined): boolean {
  return !ehEstadoManual(estadoManual);
}

/** Conflito de versão: outra aba/dispositivo gravou depois da leitura desta tela. */
export class ConflitoPresencaError extends Error {
  constructor(public readonly versaoAtual: number) {
    super("A presença foi alterada em outro lugar. Recarregue o controle de presença.");
    this.name = "ConflitoPresencaError";
  }
}

/**
 * Controle de concorrência otimista: a tela manda a versão que leu; se o banco
 * já está em outra, a gravação é recusada em vez de sobrescrever.
 */
export function versaoAceita(
  versaoNoBanco: number,
  versaoEnviada: number | null | undefined,
): boolean {
  if (versaoEnviada === null || versaoEnviada === undefined) return true;
  return versaoEnviada === versaoNoBanco;
}
