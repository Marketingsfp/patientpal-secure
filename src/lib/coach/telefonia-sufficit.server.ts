/**
 * Conexão de diagnóstico com a telefonia Sufficit (Coach).
 *
 * Só servidor. O token nunca sai daqui: não vai para log, nem para resposta.
 * A amostra de chamadas contém telefone de paciente: é devolvida a quem pediu
 * e não é gravada nem registrada em lugar nenhum.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const CHAVES_SUFFICIT = [
  "sufficit_api_base",
  "sufficit_api_token",
  "sufficit_object_id",
] as const;
export type ChaveSufficit = (typeof CHAVES_SUFFICIT)[number];

const TEMPO_LIMITE_MS = 15_000;
const LIMITE_CORPO = 4000;

export type CredenciaisSufficit = { base: string; token: string; objectId: string };

export type EstadoConfigSufficit = Record<ChaveSufficit, boolean>;

export type ResultadoPing =
  | { ok: true; status: number; tempoMs: number }
  | { ok: false; erro: string; status?: number; tempoMs?: number };

export type ResultadoAmostra =
  | {
      ok: true;
      status: number;
      contentType: string | null;
      tempoMs: number;
      corpoCru: string;
      truncado: boolean;
      camposPrimeiroRegistro: string[] | null;
    }
  | { ok: false; erro: string; status?: number; tempoMs?: number };

async function lerChaves(clinicaId: string): Promise<Map<string, string>> {
  const { data, error } = await supabaseAdmin
    .from("integration_secrets")
    .select("chave, valor")
    .eq("clinica_id", clinicaId)
    .in("chave", [...CHAVES_SUFFICIT]);
  if (error) {
    console.error("[coach/sufficit] leitura de credenciais falhou:", error.message);
    throw new Error("Não foi possível ler a configuração da telefonia.");
  }
  const mapa = new Map<string, string>();
  for (const r of data ?? []) {
    const v = (r.valor ?? "").trim();
    if (v) mapa.set(r.chave, v);
  }
  return mapa;
}

/** Só presente/ausente de cada chave — nunca o valor. */
export async function estadoConfigSufficit(clinicaId: string): Promise<EstadoConfigSufficit> {
  const mapa = await lerChaves(clinicaId);
  return {
    sufficit_api_base: mapa.has("sufficit_api_base"),
    sufficit_api_token: mapa.has("sufficit_api_token"),
    sufficit_object_id: mapa.has("sufficit_object_id"),
  };
}

export async function lerCredenciaisSufficit(clinicaId: string): Promise<CredenciaisSufficit> {
  const mapa = await lerChaves(clinicaId);
  const faltando = CHAVES_SUFFICIT.filter((c) => !mapa.has(c));
  if (faltando.length) {
    throw new Error(
      `Configuração da telefonia incompleta. Falta cadastrar: ${faltando.join(", ")}.`,
    );
  }
  return {
    base: mapa.get("sufficit_api_base")!.replace(/\/+$/, ""),
    token: mapa.get("sufficit_api_token")!,
    objectId: mapa.get("sufficit_object_id")!,
  };
}

async function buscar(
  url: string,
  headers: Record<string, string>,
): Promise<{ res: Response; tempoMs: number } | { erro: string; tempoMs: number }> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  const inicio = Date.now();
  try {
    const res = await fetch(url, { method: "GET", headers, signal: controle.signal });
    return { res, tempoMs: Date.now() - inicio };
  } catch (e) {
    const tempoMs = Date.now() - inicio;
    if (controle.signal.aborted) {
      return { erro: "A Sufficit não respondeu em 15 segundos.", tempoMs };
    }
    // Só o tipo do erro: a mensagem de rede pode carregar a URL/cabeçalhos.
    console.error("[coach/sufficit] falha de rede:", (e as Error)?.name ?? "erro");
    return { erro: "Não foi possível conectar à Sufficit (falha de rede).", tempoMs };
  } finally {
    clearTimeout(timer);
  }
}

export async function pingSufficit(clinicaId: string): Promise<ResultadoPing> {
  let cred: CredenciaisSufficit;
  try {
    cred = await lerCredenciaisSufficit(clinicaId);
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
  const r = await buscar(`${cred.base}/health`, { Accept: "*/*" });
  if ("erro" in r) return { ok: false, erro: r.erro, tempoMs: r.tempoMs };
  // Corpo descartado: o diagnóstico é status + tempo.
  await r.res.body?.cancel().catch(() => {});
  return { ok: true, status: r.res.status, tempoMs: r.tempoMs };
}

function camposDoPrimeiro(json: unknown): string[] | null {
  let alvo: unknown = json;
  if (!Array.isArray(alvo) && alvo && typeof alvo === "object") {
    // Formatos comuns de envelope; sem supor nada além de "primeiro array encontrado".
    const arr = Object.values(alvo as Record<string, unknown>).find(Array.isArray);
    alvo = arr ?? alvo;
  }
  const primeiro = Array.isArray(alvo) ? alvo[0] : alvo;
  if (primeiro && typeof primeiro === "object" && !Array.isArray(primeiro)) {
    return Object.keys(primeiro as Record<string, unknown>);
  }
  return null;
}

export async function amostraChamadasSufficit(
  clinicaId: string,
  limite = 5,
): Promise<ResultadoAmostra> {
  let cred: CredenciaisSufficit;
  try {
    cred = await lerCredenciaisSufficit(clinicaId);
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
  const n = Math.min(Math.max(Math.trunc(limite) || 5, 1), 50);
  const url = `${cred.base}/telephony/calls?contextid=${encodeURIComponent(cred.objectId)}&limit=${n}`;
  const r = await buscar(url, {
    Authorization: `Bearer ${cred.token}`,
    Accept: "application/json",
  });
  if ("erro" in r) return { ok: false, erro: r.erro, tempoMs: r.tempoMs };

  let texto: string;
  try {
    texto = await r.res.text();
  } catch {
    return {
      ok: false,
      erro: "A resposta da Sufficit não pôde ser lida.",
      status: r.res.status,
      tempoMs: r.tempoMs,
    };
  }
  const contentType = r.res.headers.get("content-type");
  let campos: string[] | null = null;
  try {
    campos = camposDoPrimeiro(JSON.parse(texto));
  } catch {
    campos = null;
  }
  return {
    ok: true,
    status: r.res.status,
    contentType,
    tempoMs: r.tempoMs,
    corpoCru: texto.slice(0, LIMITE_CORPO),
    truncado: texto.length > LIMITE_CORPO,
    camposPrimeiroRegistro: campos,
  };
}

/**
 * Segredos de integração que a tela pode gravar/apagar. Lista fechada: o nome
 * da chave é parâmetro (reuso pelo Megazap), mas só entra o que estiver aqui.
 * O VALOR nunca é devolvido, registrado em log ou em mensagem de erro.
 */
export const SEGREDOS_GRAVAVEIS = ["sufficit_api_token"] as const;
export type SegredoGravavel = (typeof SEGREDOS_GRAVAVEIS)[number];

export type EstadoSegredo = { configurado: boolean; atualizadoEm: string | null };

export async function estadoSegredo(clinicaId: string, chave: SegredoGravavel): Promise<EstadoSegredo> {
  const { data, error } = await supabaseAdmin
    .from("integration_secrets")
    .select("updated_at")
    .eq("clinica_id", clinicaId)
    .eq("chave", chave)
    .maybeSingle();
  if (error) throw new Error("Não foi possível ler o estado do segredo.");
  return { configurado: !!data, atualizadoEm: data?.updated_at ?? null };
}

export async function salvarSegredo(
  clinicaId: string,
  chave: SegredoGravavel,
  valor: string,
): Promise<EstadoSegredo> {
  const { error } = await supabaseAdmin
    .from("integration_secrets")
    .upsert(
      { clinica_id: clinicaId, chave, valor, updated_at: new Date().toISOString() },
      { onConflict: "clinica_id,chave" },
    );
  // Sem detalhes do erro: podem ecoar o valor enviado.
  if (error) throw new Error("Não foi possível salvar o segredo. Tente novamente.");
  return estadoSegredo(clinicaId, chave);
}

export async function removerSegredo(clinicaId: string, chave: SegredoGravavel): Promise<EstadoSegredo> {
  const { error } = await supabaseAdmin
    .from("integration_secrets")
    .delete()
    .eq("clinica_id", clinicaId)
    .eq("chave", chave);
  if (error) throw new Error("Não foi possível remover o segredo. Tente novamente.");
  return { configurado: false, atualizadoEm: null };
}
