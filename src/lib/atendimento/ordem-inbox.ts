/** Posição persistida do atendimento, independente da atividade das mensagens. */
export type ConversaOrdenavel = {
  id: string;
  inbox_entrada_em?: unknown;
  created_at?: unknown;
  resolved_at?: unknown;
  closed_at?: unknown;
};

function instante(valor: unknown): number {
  const n = valor ? Date.parse(String(valor)) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** Mesmo desempate do banco (UUID ascendente); nunca usa ultima_msg_em. */
export function compararEntradaInbox(
  a: ConversaOrdenavel,
  b: ConversaOrdenavel,
  ascendente = true,
): number {
  const entrada = (c: ConversaOrdenavel) => {
    const t = Date.parse(String(c.inbox_entrada_em ?? c.created_at ?? ""));
    // Mesmo nullsFirst=false do banco: metadado ausente fica no final.
    return Number.isFinite(t) ? t : ascendente ? Infinity : -Infinity;
  };
  const diferenca = entrada(a) - entrada(b);
  return (ascendente ? diferenca : -diferenca) || a.id.localeCompare(b.id);
}

export function ordenarInbox<T extends ConversaOrdenavel>(
  lista: T[],
  visualizacao: "recentes" | "resolvidas" | "espera" = "recentes",
  espera: Record<string, string> = {},
): T[] {
  const ordenada = [...lista].sort((a, b) => {
    if (visualizacao === "resolvidas") {
      const diferenca =
        instante(b.resolved_at ?? b.closed_at) - instante(a.resolved_at ?? a.closed_at);
      if (diferenca) return diferenca;
    } else if (visualizacao === "espera") {
      const ta = espera[a.id] ? instante(espera[a.id]) : Infinity;
      const tb = espera[b.id] ? instante(espera[b.id]) : Infinity;
      if (ta !== tb) return ta - tb;
    }
    // "recentes" é o identificador legado da fila: primeiro a entrar, primeiro na lista.
    // Os outros filtros mantêm o desempate do servidor.
    return compararEntradaInbox(a, b, visualizacao === "recentes");
  });
  return ordenada.every((c, i) => c === lista[i]) ? lista : ordenada;
}
