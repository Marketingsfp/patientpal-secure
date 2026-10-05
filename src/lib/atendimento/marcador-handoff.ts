/**
 * FASE 2 — Apresentação compacta do marcador de handoff na timeline.
 *
 * O handoff da Nina grava em `whatsapp_mensagens` uma mensagem de sistema com
 * motivo, posição na fila e o resumo inteiro. Esse conteúdo já é exibido pelo
 * card roxo "Resumo da Nina" (fonte canônica: `atend_handoff_resumos`), então
 * na timeline ele vira apenas uma marcação cronológica curta.
 *
 * Nada é apagado do banco: a mensagem original continua persistida e visível
 * na auditoria/detalhes técnicos. Aqui é só camada de apresentação, e vale
 * igualmente para conversas antigas.
 */

import {
  textoOperacional,
  motivoParaAtendimento,
  MOTIVO_TRANSFERENCIA_AUSENTE,
} from "./texto-interno-apresentacao";

const PREFIXO_HANDOFF = "🔁 Conversa transferida da Nina para atendimento humano";

/** Identifica o marcador extenso de handoff gravado como mensagem de sistema. */
export function ehMarcadorHandoff(body: string | null | undefined): boolean {
  return (body ?? "").trimStart().startsWith(PREFIXO_HANDOFF);
}

/** Aviso interno redundante: a reserva já tem seu evento de atribuição. */
export function nomeReservaIndividual(body: string | null | undefined): string | null {
  return (
    /^Conversa reservada na fila individual de ([^.\n]+)\.(?: A IA parou de responder\.)?$/.exec(
      (body ?? "").trim(),
    )?.[1] ?? null
  );
}

/**
 * Texto que a timeline deve mostrar para uma mensagem de sistema.
 * Para o marcador de handoff mantém a causa, sem posição na fila nem resumo.
 * Outros registros técnicos ficam ocultos.
 */
export function textoMarcadorSistema(body: string | null | undefined): string {
  const texto = (body ?? "").trim();
  if (nomeReservaIndividual(texto)) return "";
  const motivo =
    motivoParaAtendimento(/·\s*Motivo:\s*([^·\n]+)/.exec(texto)?.[1]) ??
    MOTIVO_TRANSFERENCIA_AUSENTE;
  if (/^🧾 Handoff realizado pela Nina/.test(texto)) {
    const protocolo = textoOperacional(/·\s*Protocolo:\s*([^·\n]+)/.exec(texto)?.[1]);
    const destino = textoOperacional(/·\s*Destino:\s*([^·\n]+)/.exec(texto)?.[1]);
    return (
      "Encaminhamento para atendimento humano" +
      (protocolo ? ` · Protocolo ${protocolo}` : "") +
      (destino ? ` · Destino: ${destino}` : "") +
      ` · Motivo: ${motivo}`
    );
  }
  if (!ehMarcadorHandoff(texto)) return textoOperacional(texto) ?? "";

  // A causa continua visível mesmo sem evento agrupado ou resumo disponível.
  const setor = textoOperacional(/·\s*Setor:\s*([^·\n]+)/.exec(texto)?.[1]);
  const urgente = /·\s*URGENTE/.test(texto);

  return (
    "Transferida para atendimento humano" +
    (setor ? ` · ${setor}` : "") +
    (urgente ? " · URGENTE" : "") +
    ` · Motivo: ${motivo}`
  );
}
