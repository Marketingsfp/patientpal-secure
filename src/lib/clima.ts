// ============================================================================
// Clima diário — busca histórico de chuva/temperatura na Open-Meteo (API
// gratuita, sem chave) e mantém cache na tabela `clima_diario` do Supabase.
//
// Fluxo do relatório "Movimento × Clima":
//   1. Lê do banco os dias já armazenados para a clínica no período.
//   2. Para os dias que faltam (até hoje), consulta a Open-Meteo:
//      - archive-api → histórico consolidado (fica pronto ~2 dias após a data)
//      - forecast-api com past_days → cobre os dias mais recentes
//   3. Grava os dias novos no banco para não consultar a web de novo.
//
// Se a tabela `clima_diario` ainda não existir (migration não aplicada), o
// cache é ignorado silenciosamente e tudo funciona só com a API.
// ============================================================================

import { supabase } from "@/integrations/supabase/client";

export type ClimaDia = {
  data: string; // YYYY-MM-DD
  choveu: boolean;
  precipitacao_mm: number | null;
  temp_max: number | null;
  temp_min: number | null;
  weather_code: number | null;
};

// Dia é considerado "com chuva" a partir de 1 mm acumulado — abaixo disso é
// garoa sem impacto perceptível no movimento.
const LIMIAR_CHUVA_MM = 1.0;

const DAILY_VARS = "precipitation_sum,weather_code,temperature_2m_max,temperature_2m_min";

// Tabela fora dos types gerados do Supabase até a migration ser aplicada.
const tabelaClima = () => (supabase as any).from("clima_diario");

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function listarDias(ini: string, fim: string): string[] {
  const out: string[] = [];
  const d = new Date(ini + "T12:00:00");
  const end = new Date(fim + "T12:00:00");
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// --------------------------------------------------------------------------
// Localização da clínica: usa latitude/longitude do cadastro; sem elas,
// geocodifica a cidade (resultado fica em localStorage para não repetir).
// --------------------------------------------------------------------------
async function resolverCoordenadas(
  clinicaId: string,
): Promise<{ lat: number; lon: number } | null> {
  const { data: c } = await supabase
    .from("clinicas")
    .select("latitude, longitude, cidade, estado")
    .eq("id", clinicaId)
    .maybeSingle();
  if (c?.latitude != null && c?.longitude != null) {
    return { lat: Number(c.latitude), lon: Number(c.longitude) };
  }
  if (!c?.cidade) return null;

  const cacheKey = `clima.geo.${clinicaId}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch { /* ignora */ }

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(c.cidade)}&count=5&language=pt&format=json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const results: any[] = json?.results ?? [];
    const uf = (c.estado ?? "").trim().toLowerCase();
    const match =
      results.find(
        (r) => r.country_code === "BR" && uf && String(r.admin1 ?? "").toLowerCase().includes(uf),
      ) ?? results.find((r) => r.country_code === "BR") ?? results[0];
    if (!match) return null;
    const coords = { lat: match.latitude, lon: match.longitude };
    try { localStorage.setItem(cacheKey, JSON.stringify(coords)); } catch { /* ignora */ }
    return coords;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// Open-Meteo — normaliza a resposta { daily: { time[], ... } } em ClimaDia[]
// --------------------------------------------------------------------------
function parseDaily(json: any): ClimaDia[] {
  const d = json?.daily;
  if (!d?.time?.length) return [];
  const out: ClimaDia[] = [];
  for (let i = 0; i < d.time.length; i++) {
    const precip = d.precipitation_sum?.[i];
    // precipitação null = dia ainda não consolidado na fonte → descarta
    if (precip == null) continue;
    out.push({
      data: d.time[i],
      choveu: Number(precip) >= LIMIAR_CHUVA_MM,
      precipitacao_mm: Number(precip),
      temp_max: d.temperature_2m_max?.[i] ?? null,
      temp_min: d.temperature_2m_min?.[i] ?? null,
      weather_code: d.weather_code?.[i] ?? null,
    });
  }
  return out;
}

async function fetchArchive(lat: number, lon: number, ini: string, fim: string): Promise<ClimaDia[]> {
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${ini}&end_date=${fim}&daily=${DAILY_VARS}&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return parseDaily(await res.json());
}

async function fetchRecentes(lat: number, lon: number, diasAtras: number): Promise<ClimaDia[]> {
  const past = Math.min(Math.max(diasAtras, 1), 92); // limite da API
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=${DAILY_VARS}&past_days=${past}&forecast_days=1&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return parseDaily(await res.json());
}

// --------------------------------------------------------------------------
// API principal — retorna Map data(YYYY-MM-DD) → ClimaDia para o período.
// --------------------------------------------------------------------------
export async function getClimaPeriodo(
  clinicaId: string,
  ini: string,
  fim: string,
): Promise<Map<string, ClimaDia> | null> {
  const hoje = hojeISO();
  const fimReal = fim > hoje ? hoje : fim;
  if (ini > fimReal) return new Map();

  const mapa = new Map<string, ClimaDia>();

  // 1. Cache no banco
  try {
    const { data: rows } = await tabelaClima()
      .select("data, choveu, precipitacao_mm, temp_max, temp_min, weather_code")
      .eq("clinica_id", clinicaId)
      .gte("data", ini)
      .lte("data", fimReal);
    for (const r of (rows ?? []) as any[]) {
      mapa.set(r.data, {
        data: r.data,
        choveu: !!r.choveu,
        precipitacao_mm: r.precipitacao_mm != null ? Number(r.precipitacao_mm) : null,
        temp_max: r.temp_max != null ? Number(r.temp_max) : null,
        temp_min: r.temp_min != null ? Number(r.temp_min) : null,
        weather_code: r.weather_code,
      });
    }
  } catch { /* tabela pode não existir ainda — segue só com a API */ }

  const faltantes = listarDias(ini, fimReal).filter((d) => !mapa.has(d));
  if (faltantes.length === 0) return mapa;

  // 2. Busca na web o que falta
  const coords = await resolverCoordenadas(clinicaId);
  if (!coords) return mapa.size > 0 ? mapa : null;

  const novos = new Map<string, ClimaDia>();
  try {
    const arquivo = await fetchArchive(coords.lat, coords.lon, faltantes[0], faltantes[faltantes.length - 1]);
    for (const c of arquivo) if (faltantes.includes(c.data)) novos.set(c.data, c);

    // Dias recentes ainda não consolidados no archive → forecast/past_days
    const aindaFaltam = faltantes.filter((d) => !novos.has(d));
    if (aindaFaltam.length > 0) {
      const maisAntigo = aindaFaltam[0];
      const diasAtras = Math.ceil(
        (Date.parse(hoje + "T12:00:00") - Date.parse(maisAntigo + "T12:00:00")) / 86400000,
      ) + 1;
      if (diasAtras <= 92) {
        const recentes = await fetchRecentes(coords.lat, coords.lon, diasAtras);
        for (const c of recentes) {
          if (aindaFaltam.includes(c.data) && !novos.has(c.data)) novos.set(c.data, c);
        }
      }
    }
  } catch (e) {
    console.error("clima: falha ao consultar Open-Meteo", e);
  }

  for (const [d, c] of novos) mapa.set(d, c);

  // 3. Persiste os dias novos (exceto hoje, que ainda pode mudar)
  const persistir = Array.from(novos.values())
    .filter((c) => c.data < hoje)
    .map((c) => ({
      clinica_id: clinicaId,
      data: c.data,
      choveu: c.choveu,
      precipitacao_mm: c.precipitacao_mm,
      temp_max: c.temp_max,
      temp_min: c.temp_min,
      weather_code: c.weather_code,
    }));
  if (persistir.length > 0) {
    try {
      await tabelaClima().upsert(persistir, { onConflict: "clinica_id,data" });
    } catch { /* sem cache — tudo bem */ }
  }

  return mapa;
}
