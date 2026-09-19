import type { EstadoManualPresenca } from "./presenca-manual";

export type CronometroPausa = {
  clinicaId: string;
  userId: string;
  versao: number;
  inicio: string | null;
};

type AtualizacaoCronometro = {
  clinicaId: string;
  userId: string;
  versao: number;
  estado: EstadoManualPresenca | null;
  em?: string | null;
  /** undefined = leitura indisponível; null = nenhum período em andamento. */
  cronometroPausaInicio?: string | null;
};

export function atualizarCronometroPausa(
  atual: CronometroPausa | null,
  entrada: AtualizacaoCronometro,
): CronometroPausa {
  const mesmoEscopo = atual?.clinicaId === entrada.clinicaId && atual?.userId === entrada.userId;
  if (mesmoEscopo && entrada.versao < atual.versao) return atual;
  let inicio = mesmoEscopo ? atual.inicio : null;
  if (entrada.estado === "ONLINE" || entrada.estado === "OFFLINE") inicio = null;
  else if (entrada.cronometroPausaInicio !== undefined) inicio = entrada.cronometroPausaInicio;
  else if (entrada.estado === "PAUSA" && !inicio) inicio = entrada.em ?? null;
  return { clinicaId: entrada.clinicaId, userId: entrada.userId, versao: entrada.versao, inicio };
}

export function formatarTempoPausa(inicio: string, agora: number): string {
  const timestamp = Date.parse(inicio);
  const segundos = Number.isFinite(timestamp) ? Math.max(0, Math.floor((agora - timestamp) / 1000)) : 0;
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  return [horas, minutos, segundos % 60].map(n => String(n).padStart(2, "0")).join(":");
}
