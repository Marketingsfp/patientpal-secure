/** Retry antigo só pode reabrir fechamento comprovadamente anterior à entrada física. */
export function entradaPermiteReabertura(
  entradaEm: string,
  conversa: {
    resolved_at?: string | null;
    closed_at?: string | null;
  },
): boolean {
  const entrada = Date.parse(entradaEm);
  const datas = [conversa.resolved_at, conversa.closed_at].filter((v): v is string => Boolean(v));
  if (!Number.isFinite(entrada) || !datas.length) return false;
  const fechamentos = datas.map((v) => Date.parse(v));
  return fechamentos.every(Number.isFinite) && Math.max(...fechamentos) < entrada;
}
