/**
 * Feature flag do modelo da Nina — NINA_GEMINI_37_ENABLED.
 *
 * Serve para ligar o modelo novo primeiro em homologação/uma clínica e voltar
 * atrás na hora, sem deploy: basta desligar a linha em `clinica_feature_flags`.
 *
 * ATUALIZAÇÃO (05/09/2026): o provedor de IA do Lovable NÃO publicou
 * `gemini-3.8-flash`. Por decisão do time, o alvo passou a ser
 * `google/gemini-3.7-flash`, que EXISTE na plataforma e aceita
 * `reasoning_effort` low/medium/high (validado por chamada real). Nada mais da
 * arquitetura mudou: gateway, reasoning router, context builder, tool broker,
 * Base de Conhecimentos, agenda, CRM e handoff seguem iguais.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Chave atual da flag. A antiga (…_38_…) continua aceita para não quebrar linhas já cadastradas. */
export const FLAG_NINA_GEMINI = "nina_gemini_37_enabled";
export const FLAG_NINA_GEMINI_LEGADA = "nina_gemini_38_enabled";

/** Model id real da plataforma. Não inventar id nem trocar em silêncio. */
export const MODELO_NINA_ALVO = "google/gemini-3.7-flash";
export const MODELO_ALVO_DISPONIVEL = true;

/** Modelos em uso hoje, preservados como estão (rollback imediato). */
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
export async function flagGeminiNovaAtiva(clinicaId: string | null): Promise<boolean> {
  if (
    process.env["NINA_GEMINI_37_ENABLED"] === "true" ||
    process.env["NINA_GEMINI_38_ENABLED"] === "true"
  ) {
    return true;
  }
  if (!clinicaId) return false;
  const { data, error } = await supabaseAdmin
    .from("clinica_feature_flags")
    .select("ativo")
    .eq("clinica_id", clinicaId)
    .in("flag_key", [FLAG_NINA_GEMINI, FLAG_NINA_GEMINI_LEGADA]);
  if (error || !data) return false;
  return data.some((linha) => Boolean((linha as { ativo?: boolean }).ativo));
}

export async function modeloNinaParaClinica(
  clinicaId: string | null,
  perfil: PerfilModelo,
): Promise<ResolucaoModelo> {
  const flagAtiva = await flagGeminiNovaAtiva(clinicaId);
  if (!flagAtiva) return { modelo: MODELO_ATUAL[perfil], origem: "atual", flagAtiva: false };
  if (!MODELO_ALVO_DISPONIVEL) {
    console.warn(
      `[nina-ai-gateway] ${FLAG_NINA_GEMINI} ligada, mas ${MODELO_NINA_ALVO} não existe no provedor. Mantendo ${MODELO_ATUAL[perfil]}.`,
    );
    return { modelo: MODELO_ATUAL[perfil], origem: "bloqueado", flagAtiva: true };
  }
  return { modelo: MODELO_NINA_ALVO, origem: "flag", flagAtiva: true };
}
