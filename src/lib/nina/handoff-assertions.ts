/**
 * FASE 5 — Assertions determinísticas de handoff para o Test Runner.
 *
 * Módulo puro (sem rede e sem banco). O sistema — nunca o avaliador de IA —
 * decide se houve handoff, se o protocolo foi criado, se o formato é válido,
 * se a mensagem de transferência existe, se ela cita o protocolo, se o ciclo
 * foi concluído e se a memória da Nina foi resetada.
 *
 * Ao avaliador (GPT Sol) cabe apenas o julgamento subjetivo: naturalidade,
 * adequação ao contexto, clareza, promessa indevida e menção de setor.
 */

import type { CriterioAvaliado } from "./cenarios";

/** Fatos lidos do banco após o cenário terminar. */
export type FatosHandoff = {
  /** Alguma execução da Nina marcou handoff (ou o cliente sinalizou). */
  transferida: boolean;
  /** Número de protocolo persistido na conversa. */
  protocolo: string | null;
  /** Quantos protocolos distintos ficaram vinculados a este handoff. */
  protocolosDistintos: number;
  /** Mensagens de saída da conversa (Nina/sistema), em ordem. */
  mensagensSaida: string[];
  /** Status do ciclo de teste ao final. */
  cicloStatus: string | null;
  /** Motivo de encerramento do ciclo. */
  cicloEndReason: string | null;
  /** Carimbo do reset de memória do ciclo. */
  memoryResetAt: string | null;
  /** Setor estruturado de destino, quando existir. */
  departamentoNome?: string | null;
};

export type VerificacaoHandoff = {
  handoff_occurred: boolean;
  protocol_created: boolean;
  protocol_format_valid: boolean;
  protocol_unique: boolean;
  transfer_message_created: boolean;
  protocol_in_message: boolean;
  cycle_completed: boolean;
  memory_reset: boolean;
};

/** Formato oficial: prefixo em letras + hífen + número (ex.: MJ-14712). */
export const FORMATO_PROTOCOLO = /^[A-Z]{2,6}-\d{1,10}$/;

export function protocoloFormatoValido(protocolo: string | null | undefined): boolean {
  return typeof protocolo === "string" && FORMATO_PROTOCOLO.test(protocolo.trim());
}

/** Mensagem que comunica a transferência ao paciente (não é marcador técnico). */
export function ehMensagemDeTransferencia(texto: string): boolean {
  const t = texto.toLowerCase();
  if (t.startsWith("🧾")) return false; // marcador interno da timeline
  const fala = /(encaminh|transferir|transferindo|passar seu atendimento|nossa equipe|equipe )/.test(
    t,
  );
  return fala && /protocolo/.test(t);
}

export function verificarHandoff(f: FatosHandoff): VerificacaoHandoff {
  const protocolo = (f.protocolo ?? "").trim();
  const mensagem = f.mensagensSaida.find((m) => ehMensagemDeTransferencia(m ?? "")) ?? null;

  return {
    handoff_occurred: !!f.transferida,
    protocol_created: protocolo.length > 0,
    protocol_format_valid: protocoloFormatoValido(protocolo),
    protocol_unique: f.protocolosDistintos <= 1,
    transfer_message_created: !!mensagem,
    protocol_in_message: !!mensagem && !!protocolo && mensagem.includes(protocolo),
    cycle_completed: !!f.cicloStatus && f.cicloStatus !== "ativo",
    memory_reset: !!f.memoryResetAt,
  };
}

const ROTULOS: Record<keyof VerificacaoHandoff, { ok: string; falha: string }> = {
  handoff_occurred: {
    ok: "Handoff registrado pela Nina.",
    falha: "Nenhum handoff foi registrado.",
  },
  protocol_created: {
    ok: "Protocolo criado e persistido.",
    falha: "Handoff sem protocolo persistido.",
  },
  protocol_format_valid: {
    ok: "Protocolo no formato oficial.",
    falha: "Protocolo fora do formato oficial (ex.: MJ-14712).",
  },
  protocol_unique: {
    ok: "Apenas um protocolo para este handoff.",
    falha: "Mais de um protocolo foi gerado para o mesmo handoff.",
  },
  transfer_message_created: {
    ok: "Mensagem de transferência enviada ao paciente.",
    falha: "Nenhuma mensagem de transferência foi enviada ao paciente.",
  },
  protocol_in_message: {
    ok: "A mensagem informa o número de protocolo.",
    falha: "A mensagem de transferência não informa o protocolo.",
  },
  cycle_completed: { ok: "Ciclo de teste concluído.", falha: "Ciclo de teste continua ativo." },
  memory_reset: {
    ok: "Memória ativa da Nina resetada.",
    falha: "Sem prova de reset da memória da Nina.",
  },
};

/**
 * Converte as verificações em critérios avaliados, no mesmo formato usado pelo
 * restante do Test Runner. Só se aplica quando o cenário esperava handoff.
 */
export function criteriosDeHandoff(v: VerificacaoHandoff): CriterioAvaliado[] {
  return (Object.keys(ROTULOS) as (keyof VerificacaoHandoff)[]).map((chave) => ({
    tipo: "transferiu",
    valor: chave,
    ok: v[chave],
    detalhe: v[chave] ? ROTULOS[chave].ok : ROTULOS[chave].falha,
  }));
}

/**
 * Setor: só pode ser mencionado quando existe destino estruturado. Sem
 * destino, a mensagem deve falar em "nossa equipe".
 */
export function setorMencionadoCorretamente(args: {
  mensagem: string | null;
  departamentoNome?: string | null;
  setoresConhecidos: string[];
}): boolean {
  const msg = (args.mensagem ?? "").toLowerCase();
  if (!msg) return false;
  const destino = (args.departamentoNome ?? "").trim().toLowerCase();
  if (destino) return msg.includes(destino) || /nossa equipe/.test(msg);
  return !args.setoresConhecidos.some((s) => s.trim() && msg.includes(s.trim().toLowerCase()));
}
