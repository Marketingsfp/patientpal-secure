/**
 * Feature flag do modelo da Nina — NINA_GEMINI_38_ENABLED.
 *
 * Serve para ligar o modelo novo primeiro em homologação/uma clínica e voltar
 * atrás na hora, sem deploy: basta desligar a linha em `clinica_feature_flags`.
 *
 * BLOQUEIO CONHECIDO (05/09/2026): o provedor de IA do Lovable NÃO oferece o
 * model id `gemini-3.8-flash`. Por isso `MODELO_NINA_ALVO` fica marcado como
 * indisponível: mesmo com a flag ligada, a Nina continua no modelo atual e o
 * servidor registra um aviso — não trocamos silenciosamente por outro modelo,
 * nem inventamos um id. Quando o provedor publicar o id, basta marcar
 * `MODELO_ALVO_DISPONIVEL = true`.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const FLAG_NINA_GEMINI_38 = "nina_gemini_38_enabled";

/** Model id pedido pelo time. Ainda não publicado pelo provedor. */
export const MODELO_NINA_ALVO = "google/gemini-3.8-flash";
export const MODELO_ALVO_DISPONIVEL = false;

/** Modelos em uso hoje, preservados como estão (comportamento atual). */
export const MODELO_ATUAL = {
  texto: "google/gemini-2.5-flash",
  voz: "google/gemini-3.1-flash-lite",
  whatsapp: "google/gemini-2.5-flash",
} as const;

export type PerfilModelo = keyof typeof MODELO_ATUAL;

export type ResolucaoModelo = {
  modelo: string;
  /** `flag` = modelo novo; `atual` = modelo legado; `bloqueado` = flag ligada mas modelo indisponível. */
  origem: "atual" | "flag" | "bloqueado" | "forcado";
  flagAtiva: boolean;
};

/** Lê a flag por clínica. Sem linha = desligado. Falha de leitura = desligado. */
export async function flagGemini38Ativa(clinicaId: string | null): Promise<boolean> {
  if (process.env["NINA_GEMINI_38_ENABLED"] === "true") return true;
  if (!clinicaId) return false;
  const { data, error } = await supabaseAdmin
    .from("clinica_feature_flags")
    .select("ativo")
    .eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_NINA_GEMINI_38)
    .maybeSingle();
  if (error || !data) return false;
  return Boolean(data.ativo);
}

export async function modeloNinaParaClinica(
  clinicaId: string | null,
  perfil: PerfilModelo,
): Promise<ResolucaoModelo> {
  const flagAtiva = await flagGemini38Ativa(clinicaId);
  if (!flagAtiva) return { modelo: MODELO_ATUAL[perfil], origem: "atual", flagAtiva: false };
  if (!MODELO_ALVO_DISPONIVEL) {
    console.warn(
      `[nina-ai-gateway] ${FLAG_NINA_GEMINI_38} ligada, mas ${MODELO_NINA_ALVO} não existe no provedor. Mantendo ${MODELO_ATUAL[perfil]}.`,
    );
    return { modelo: MODELO_ATUAL[perfil], origem: "bloqueado", flagAtiva: true };
  }
  return { modelo: MODELO_NINA_ALVO, origem: "flag", flagAtiva: true };
}
