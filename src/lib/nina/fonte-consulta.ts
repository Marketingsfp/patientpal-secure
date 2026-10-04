export const FLAG_FONTE_CONSULTA = "nina_fonte_conhecimento";
export const FONTES_CONSULTA = ["clinica_os", "base_conhecimento"] as const;
export type FonteConsulta = (typeof FONTES_CONSULTA)[number];
export type SelecaoFonte = { fonte: FonteConsulta; revisao: string | null };
export const ROTULOS_FONTE: Record<FonteConsulta, string> = {
  clinica_os: "Clínica OS",
  base_conhecimento: "Base de conhecimento",
};

export function selecaoFonte(linha: { ativo?: boolean; config?: unknown; updated_at?: string } | null): SelecaoFonte {
  if (!linha || linha.ativo === false) return { fonte: "clinica_os", revisao: linha?.updated_at ?? null };
  const fonte = (linha.config as { fonte?: unknown } | null)?.fonte;
  if (fonte !== "clinica_os" && fonte !== "base_conhecimento")
    throw new Error("A fonte de consulta da Maria está inválida. Revise a configuração na base de conhecimento.");
  return { fonte, revisao: linha.updated_at ?? null };
}
