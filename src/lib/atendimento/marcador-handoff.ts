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

const PREFIXO_HANDOFF = "🔁 Conversa transferida da Nina para atendimento humano";

/** Identifica o marcador extenso de handoff gravado como mensagem de sistema. */
export function ehMarcadorHandoff(body: string | null | undefined): boolean {
  return (body ?? "").trimStart().startsWith(PREFIXO_HANDOFF);
}

/**
 * Texto que a timeline deve mostrar para uma mensagem de sistema.
 * Para o marcador de handoff devolve a versão compacta (sem motivo, sem
 * posição na fila e sem o resumo); para as demais, o texto original.
 */
export function textoMarcadorSistema(body: string | null | undefined): string {
  const texto = (body ?? "").trim();
  if (!ehMarcadorHandoff(texto)) return texto;

  // Setor é a única informação de roteamento que não está no card roxo.
  const setor = /·\s*Setor:\s*([^·\n]+)/.exec(texto)?.[1]?.trim();
  const urgente = /·\s*URGENTE/.test(texto);

  return (
    "Transferida para atendimento humano" +
    (setor ? ` · ${setor}` : "") +
    (urgente ? " · URGENTE" : "")
  );
}
