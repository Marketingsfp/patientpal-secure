import { normalizarConfig } from "./carga";

export const EXECUTOR_CARGA_PARALELA = "carga-v4-paralela";
export const EXECUTOR_CARGA_SERVIDOR = "carga-v5-servidor";
export function cargaServidor(config: any): boolean {
  return config?.executor === EXECUTOR_CARGA_SERVIDOR;
}
export const QUARENTENA_PARALELA_MS = 300_000;
export const LEASE_PARALELA_MS = 120_000;

export type ReservaParalela = {
  token: string;
  indice: number;
  leadId: string;
  inicio: number;
  expira: number;
};
export type TempoCarga = {
  leadId: string;
  reservadoEm: number;
  iniciadoEm?: number;
  finalizadoEm?: number;
  retomarApos?: number;
  falhas?: number;
  retries?: number;
};
export type ControleParalelo = {
  reservas: Record<string, ReservaParalela>;
  tempos: Record<string, TempoCarga>;
  proximoDisparo: number;
  pico: number;
  erro?: string | null;
};

export function cargaParalela(config: any): boolean {
  return config?.executor === EXECUTOR_CARGA_PARALELA || cargaServidor(config);
}

export function controleParalelo(config: any): ControleParalelo {
  const c = config?._cargaParalela;
  return {
    reservas: c?.reservas ?? {},
    tempos: c?.tempos ?? {},
    proximoDisparo: c?.proximoDisparo ?? 0,
    pico: c?.pico ?? 0,
    erro: c?.erro ?? null,
  };
}

export function reservasVivas(c: ControleParalelo, agora: number) {
  return Object.values(c.reservas).filter((r) => agora < r.expira + QUARENTENA_PARALELA_MS);
}

export function limiteParalelo(config: any) {
  return cargaParalela(config) ? normalizarConfig(config).conversasSimultaneas : 1;
}

/** No modo simultâneo os leads não aguardam um intervalo artificial entre si. */
export function intervaloDisparoParalelo(config: any) {
  const c = normalizarConfig(config);
  return c.modoEnvio === "simultaneo"
    ? 0
    : Math.max(c.intervaloMs, Math.ceil(60_000 / c.mensagensPorMinuto));
}

export function metricasParalelas(config: any, agora = Date.now()) {
  if (!cargaParalela(config)) return null;
  const c = controleParalelo(config);
  const tempos = Object.values(c.tempos);
  const primeiros = new Map<string, number>();
  for (const t of tempos) {
    if (t.iniciadoEm != null)
      primeiros.set(t.leadId, Math.min(primeiros.get(t.leadId) ?? Infinity, t.iniciadoEm));
  }
  const inicios = [...primeiros.values()];
  return {
    limite: limiteParalelo(config),
    emAndamento: reservasVivas(c, agora).length,
    pico: c.pico,
    primeirosDisparos: inicios.length,
    janelaPrimeirosDisparosMs:
      inicios.length > 1 ? Math.max(...inicios) - Math.min(...inicios) : null,
  };
}
