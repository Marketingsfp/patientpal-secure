import { useEffect, useMemo } from "react";
import { useClinica } from "@/hooks/use-clinica";

/**
 * Sprint Beauty — sistema de skin por clínica (Agenda V2).
 *
 * Aplica uma classe visual em <html> enquanto a Agenda V2 está montada,
 * trocando o accent color de todo o módulo via CSS variables
 * (`--clinic-accent`, `--clinic-accent-soft`, etc.).
 *
 * Regras:
 *  - PURAMENTE VISUAL. Nenhuma regra de negócio, query, mutation ou
 *    server function é tocada.
 *  - Mapeamento explícito por clínica pode ser adicionado em
 *    `EXPLICIT_SKIN_BY_CLINICA_ID`. Sem mapeamento, cai em um hash
 *    determinístico sobre o clinica_id, garantindo que a mesma clínica
 *    sempre receba o mesmo skin.
 *  - Escopo: a classe só é aplicada enquanto o componente que chama o
 *    hook está montado (cleanup no unmount).
 */

export type ClinicSkin = "azure" | "emerald" | "violet" | "orange";

const AVAILABLE_SKINS: ClinicSkin[] = ["azure", "emerald", "violet"];

/**
 * Preencha aqui os UUIDs das clínicas com o skin desejado.
 * Sem entrada, o skin é derivado por hash do clinica_id.
 * Ex.: EXPLICIT_SKIN_BY_CLINICA_ID["<uuid>"] = "emerald";
 */
const EXPLICIT_SKIN_BY_CLINICA_ID: Record<string, ClinicSkin> = {};

const ACCENT_HEX_BY_SKIN: Record<ClinicSkin, string> = {
  azure: "#0284c7",
  emerald: "#059669",
  violet: "#7c3aed",
  orange: "#ea580c",
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pickSkin(clinicaId: string | null): ClinicSkin {
  if (!clinicaId) return "azure";
  const explicit = EXPLICIT_SKIN_BY_CLINICA_ID[clinicaId];
  if (explicit) return explicit;
  return AVAILABLE_SKINS[hashString(clinicaId) % AVAILABLE_SKINS.length];
}

/**
 * Ativa o skin da clínica atual e retorna metadados úteis para colorir
 * o chip de clínica no header do módulo.
 */
export function useClinicSkin(): { skin: ClinicSkin; accent: string } {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const skin = useMemo(() => pickSkin(clinicaId), [clinicaId]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const classes: string[] = [];
    for (const s of ["azure", "emerald", "violet", "orange"] as ClinicSkin[]) {
      classes.push(`clinic-skin-${s}`);
    }
    html.classList.remove(...classes);
    html.classList.add(`clinic-skin-${skin}`);
    html.classList.add("agenda-v2-active");
    return () => {
      html.classList.remove(`clinic-skin-${skin}`);
      html.classList.remove("agenda-v2-active");
    };
  }, [skin]);

  return { skin, accent: ACCENT_HEX_BY_SKIN[skin] };
}