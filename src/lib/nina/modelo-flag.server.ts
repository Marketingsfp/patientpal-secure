/**
 * Modelo da Nina.
 *
 * DECISÃO (25/09/2026): a Nina usa somente `google/gemini-3.8-flash`, em todas as
 * clínicas e em todos os perfis. A flag por clínica (`nina_gemini_37_enabled`) e o
 * modelo legado `gemini-2.5-flash` foram retirados: nenhuma clínica sem a linha,
 * flag desligada ou falha de leitura do banco devolve mais o modelo antigo.
 * As linhas antigas da flag em `clinica_feature_flags` ficam sem efeito.
 */

import { MODELO_NINA_ALVO } from "./modelo-nina";

/** Model id real da plataforma (definido em `modelo-nina.ts`). */
export { MODELO_NINA_ALVO };

export type PerfilModelo = "texto" | "voz" | "whatsapp";

export type ResolucaoModelo = {
  modelo: string;
  /** `fixo` = modelo único da Nina; `forcado` = escolhido pelo chamador (testes). */
  origem: "fixo" | "forcado";
  flagAtiva: boolean;
};

export async function modeloNinaParaClinica(
  _clinicaId: string | null,
  _perfil: PerfilModelo,
): Promise<ResolucaoModelo> {
  return { modelo: MODELO_NINA_ALVO, origem: "fixo", flagAtiva: true };
}
