/**
 * FASE 4 — sincronização entre abas e controle de concorrência da presença.
 *
 * A presença é escolhida manualmente e guardada no servidor. Com várias abas
 * abertas (ou a mesma aba reconectando), chegam informações fora de ordem:
 * resposta atrasada de uma consulta iniciada antes da mudança, aviso em tempo
 * real, retorno do heartbeat, recarga após reconexão.
 *
 * Regra única deste módulo: só vale a informação MAIS NOVA do MESMO escopo
 * (clínica + atendente). "Mais nova" é decidida pela versão gravada no
 * servidor; empate de versão é decidido pela ordem em que a tela pediu a
 * informação (sequência local crescente).
 *
 * Nada aqui grava presença. Heartbeat, reconexão e troca de aba nunca são
 * tratados como escolha.
 */
import type { EstadoManualPresenca } from "./presenca-manual";

export type EscopoPresenca = { clinicaId: string; userId: string };

/** Uma informação de presença chegando de qualquer origem. */
export type AtualizacaoPresenca = {
  clinicaId: string;
  userId: string;
  /** Escolha manual confirmada pelo servidor (null = ainda não escolheu). */
  estado: EstadoManualPresenca | null;
  /** Versão gravada no servidor; cresce a cada escolha. */
  versao: number;
  /** Ordem local do pedido que originou esta resposta (opcional). */
  seq?: number;
};

export type EstadoSincronizado = {
  estado: EstadoManualPresenca | null;
  versao: number;
  seq: number;
};

export const SINCRONIA_INICIAL: EstadoSincronizado = { estado: null, versao: -1, seq: -1 };

export type MotivoDescarte =
  | "outra_clinica"
  | "outro_atendente"
  | "versao_antiga"
  | "resposta_fora_de_ordem";

export type ResultadoSincronia =
  | { aceita: true; estado: EstadoSincronizado }
  | { aceita: false; motivo: MotivoDescarte; estado: EstadoSincronizado };

/**
 * Decide se uma informação recebida deve substituir o que a tela mostra.
 *
 * Descarta: outra clínica, outro atendente, versão menor que a conhecida e
 * resposta de um pedido anterior ao último já aplicado (mesma versão).
 */
export function aplicarAtualizacao(
  atual: EstadoSincronizado,
  escopo: EscopoPresenca,
  entrada: AtualizacaoPresenca,
): ResultadoSincronia {
  if (entrada.clinicaId !== escopo.clinicaId) {
    return { aceita: false, motivo: "outra_clinica", estado: atual };
  }
  if (entrada.userId !== escopo.userId) {
    return { aceita: false, motivo: "outro_atendente", estado: atual };
  }
  if (entrada.versao < atual.versao) {
    return { aceita: false, motivo: "versao_antiga", estado: atual };
  }
  const seq = entrada.seq ?? atual.seq;
  if (entrada.versao === atual.versao && seq < atual.seq) {
    return { aceita: false, motivo: "resposta_fora_de_ordem", estado: atual };
  }
  return {
    aceita: true,
    estado: { estado: entrada.estado, versao: entrada.versao, seq: Math.max(seq, atual.seq) },
  };
}

/** Conflito de versão ao gravar: a tela deve reler o estado oficial. */
export function precisaRelerOficial(conflito: boolean | undefined): boolean {
  return conflito === true;
}

/* ------------------------------------------------------------------ *
 * Aviso entre abas do mesmo navegador                                 *
 * ------------------------------------------------------------------ */

export const CANAL_PRESENCA = "atend.presenca.sync";

type Ouvinte = (a: AtualizacaoPresenca) => void;

/**
 * Abre UM canal entre abas. Devolve a função de encerramento, para o React
 * desmontar sem deixar assinatura duplicada (assinatura repetida geraria
 * releituras e gravações repetidas).
 */
export function ouvirOutrasAbas(ouvinte: Ouvinte): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const canal = new BroadcastChannel(CANAL_PRESENCA);
  canal.onmessage = (ev: MessageEvent) => {
    const d = ev.data as AtualizacaoPresenca | null;
    if (d && typeof d.clinicaId === "string" && typeof d.versao === "number") ouvinte(d);
  };
  return () => {
    canal.onmessage = null;
    canal.close();
  };
}

/** Avisa as outras abas que a escolha mudou. Não grava nada no servidor. */
export function avisarOutrasAbas(a: AtualizacaoPresenca): void {
  if (typeof BroadcastChannel === "undefined") return;
  const canal = new BroadcastChannel(CANAL_PRESENCA);
  try {
    canal.postMessage(a);
  } finally {
    canal.close();
  }
}
