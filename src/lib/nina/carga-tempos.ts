type Evento = { trace_id?: string; node_id: string; started_at?: string; metadata?: any };

/** Mede pares do mesmo lote/ferramenta/tentativa; eventos incompletos não viram zero. */
export function temposEtapasCarga(eventos: Evento[]) {
  const abertos = new Map<string, number>();
  const modelo: number[] = [],
    ferramentas: number[] = [];
  let incompletos = 0;
  for (const e of [...eventos].sort(
    (a, b) => Date.parse(a.started_at ?? "") - Date.parse(b.started_at ?? ""),
  )) {
    const tipo = e.node_id.startsWith("MODEL_")
      ? "MODEL"
      : e.node_id.startsWith("TOOL_")
        ? "TOOL"
        : null;
    const em = Date.parse(e.started_at ?? "");
    if (!tipo || !e.trace_id || !Number.isFinite(em)) continue;
    const chave = `${e.trace_id}:${tipo}:${tipo === "TOOL" ? (e.metadata?.ferramenta ?? "") : (e.metadata?.tentativa ?? "")}`;
    if (e.node_id === `${tipo}_STARTED`) {
      if (abertos.has(chave)) incompletos++;
      abertos.set(chave, em);
    } else if ([`${tipo}_FINISHED`, `${tipo}_FAILED`].includes(e.node_id)) {
      const inicio = abertos.get(chave);
      if (inicio != null && em >= inicio) {
        (tipo === "MODEL" ? modelo : ferramentas).push(em - inicio);
        abertos.delete(chave);
      } else incompletos++;
    }
  }
  const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  return {
    modeloMs: media(modelo),
    ferramentasMs: media(ferramentas),
    chamadasMedidas: modelo.length,
    ferramentasMedidas: ferramentas.length,
    intervalosIncompletos: incompletos + abertos.size,
  };
}

export function picoIntervalosCarga(intervalos: { inicio: number; fim: number }[]) {
  const eventos = intervalos
    .filter((i) => Number.isFinite(i.inicio) && Number.isFinite(i.fim) && i.fim > i.inicio)
    .flatMap((i) => [
      { em: i.inicio, delta: 1 },
      { em: i.fim, delta: -1 },
    ])
    .sort((a, b) => a.em - b.em || a.delta - b.delta);
  let atual = 0,
    pico = 0;
  for (const e of eventos) {
    atual += e.delta;
    pico = Math.max(pico, atual);
  }
  return pico;
}
