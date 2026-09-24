/**
 * Medição de memória do processo para investigar quedas do servidor por falta
 * de memória durante um turno da Nina.
 *
 * O log do servidor expira antes de uma queda ser investigada; por isso a
 * medição viaja nos eventos persistidos do turno. Só números, nunca conteúdo.
 * Nunca lança. Quando o runtime não informa a memória (função ausente ou
 * polyfill que devolve zero), o registro declara `memoria_medida: false` em
 * vez de gravar um zero enganoso.
 */
export type MedicaoMemoria = {
  memoria_medida: boolean;
  heap_usado_bytes: number | null;
  heap_total_bytes: number | null;
  rss_bytes: number | null;
};

type LeituraMemoria = { heapUsed?: unknown; heapTotal?: unknown; rss?: unknown };

function lerDoProcesso(): LeituraMemoria | null {
  if (typeof process === "undefined" || typeof process.memoryUsage !== "function") return null;
  return process.memoryUsage();
}

const bytesValidos = (valor: unknown): number | null =>
  typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? Math.round(valor) : null;

export function medirMemoriaProcesso(
  ler: () => LeituraMemoria | null = lerDoProcesso,
): MedicaoMemoria {
  let leitura: LeituraMemoria | null = null;
  try {
    leitura = ler();
  } catch {
    /* runtime sem medição de memória */
  }
  const heapUsado = bytesValidos(leitura?.heapUsed);
  return {
    memoria_medida: heapUsado !== null,
    heap_usado_bytes: heapUsado,
    heap_total_bytes: bytesValidos(leitura?.heapTotal),
    rss_bytes: bytesValidos(leitura?.rss),
  };
}
