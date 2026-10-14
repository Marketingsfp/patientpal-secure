/**
 * Regras puras das travas de agenda do site (mesmos critérios da função de
 * banco horarios_disponiveis_publico). Horário local = America/Sao_Paulo,
 * UTC-3 fixo (sem horário de verão desde 2019). dia_semana: 0 = domingo.
 */

export type FaixaSite = {
  id: string;
  dia_semana: number;
  hora_inicio: string; // "HH:MM" ou "HH:MM:SS"
  hora_fim: string;
  vigencia_inicio: string | null; // "YYYY-MM-DD"
  vigencia_fim: string | null;
};

const OFFSET_MS = 3 * 3600 * 1000;

/** Data, dia da semana e hora locais (São Paulo) de um instante. */
export function localSP(iso: string): { data: string; dow: number; hora: string } {
  const d = new Date(new Date(iso).getTime() - OFFSET_MS);
  return {
    data: d.toISOString().slice(0, 10),
    dow: d.getUTCDay(),
    hora: d.toISOString().slice(11, 19),
  };
}

const hms = (h: string) => (h.length === 5 ? `${h}:00` : h.slice(0, 8));

/** Primeira faixa (por hora de início) que contém o instante; null se nenhuma. */
export function casarFaixa<T extends FaixaSite>(faixas: T[], iso: string): T | null {
  const l = localSP(iso);
  const ok = faixas
    .filter(
      (f) =>
        f.dia_semana === l.dow &&
        l.hora >= hms(f.hora_inicio) &&
        l.hora < hms(f.hora_fim) &&
        (!f.vigencia_inicio || l.data >= f.vigencia_inicio) &&
        (!f.vigencia_fim || l.data <= f.vigencia_fim),
    )
    .sort((a, b) => hms(a.hora_inicio).localeCompare(hms(b.hora_inicio)) || a.id.localeCompare(b.id));
  return ok[0] ?? null;
}

/** Início e fim (exclusivo), em UTC, do dia local de São Paulo. */
export function limitesDiaSP(iso: string): { de: string; ate: string } {
  const { data } = localSP(iso);
  const de = new Date(`${data}T00:00:00-03:00`);
  return { de: de.toISOString(), ate: new Date(de.getTime() + 86400000).toISOString() };
}

/** Verdadeiro se o instante cai antes do piso de antecedência mínima. */
export function antesDoPiso(iso: string, horas: number, agora = Date.now()): boolean {
  return horas > 0 && new Date(iso).getTime() < agora + horas * 3600000;
}

/**
 * Preferência do formulário que cai antes do piso é empurrada para o próximo
 * horário válido (piso arredondado para cima em múltiplos de 30 min).
 */
export function empurrarParaPiso(iso: string, horas: number, agora = Date.now()): string {
  if (!antesDoPiso(iso, horas, agora)) return iso;
  const passo = 30 * 60000;
  return new Date(Math.ceil((agora + horas * 3600000) / passo) * passo).toISOString();
}

/** Origens que contam como "site" (espelha site_agendamento_e_do_site). */
export function eDoSite(origem: string | null | undefined): boolean {
  return !!origem && (origem === "site_publico" || origem.startsWith("site-"));
}
