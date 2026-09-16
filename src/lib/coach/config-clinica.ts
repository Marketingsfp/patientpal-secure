/**
 * Configuração do Coach por clínica: scripts de agendamento, checklist,
 * base de serviços (TAP) e vozes. No projeto de origem isso ficava na
 * tabela `clinicas`; aqui vive em `coach_config_clinica`, sem tocar no
 * cadastro de clínicas do ClinicaOS.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CATALOGO_SERVICOS } from "@/lib/coach/servicos-catalogo";
import { CATALOGO_MENINO_JESUS } from "@/lib/coach/servicos-menino-jesus";
import { VOZ_CONFIG_PADRAO, type VozConfig } from "@/lib/coach/voz-config";

export type ScriptItem = { titulo: string; conteudo: string };

export type CoachConfig = {
  scripts: ScriptItem[];
  checklist: string[];
  tabelaServicos: string;
  vozConfig: VozConfig;
};

const VAZIO: CoachConfig = {
  scripts: [],
  checklist: [],
  tabelaServicos: "",
  vozConfig: VOZ_CONFIG_PADRAO,
};

/** Catálogo embutido usado como base quando a clínica ainda não subiu a dela. */
export function catalogoPadrao(nomeClinica: string | null | undefined): string {
  return /menino\s*jesus/i.test(nomeClinica ?? "") ? CATALOGO_MENINO_JESUS : CATALOGO_SERVICOS;
}

export function useCoachConfig(clinicaId: string | null, nomeClinica?: string | null) {
  const [config, setConfig] = useState<CoachConfig>(VAZIO);
  const [loading, setLoading] = useState(true);

  const recarregar = useCallback(async () => {
    if (!clinicaId) {
      setConfig(VAZIO);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("coach_config_clinica")
      .select("scripts,checklist,tabela_servicos,voz_config")
      .eq("clinica_id", clinicaId)
      .maybeSingle();
    setConfig({
      scripts: Array.isArray(data?.scripts) ? (data.scripts as unknown as ScriptItem[]) : [],
      checklist: Array.isArray(data?.checklist) ? (data.checklist as unknown as string[]) : [],
      tabelaServicos: data?.tabela_servicos?.trim() ? data.tabela_servicos : "",
      vozConfig:
        data?.voz_config && Object.keys(data.voz_config as object).length > 0
          ? (data.voz_config as unknown as VozConfig)
          : VOZ_CONFIG_PADRAO,
    });
    setLoading(false);
  }, [clinicaId]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const salvar = useCallback(
    async (patch: Partial<CoachConfig>) => {
      if (!clinicaId) return { error: "Selecione uma clínica." };
      const proximo = { ...config, ...patch };
      setConfig(proximo);
      const { error } = await supabase.from("coach_config_clinica").upsert(
        {
          clinica_id: clinicaId,
          scripts: proximo.scripts as never,
          checklist: proximo.checklist as never,
          tabela_servicos: proximo.tabelaServicos,
          voz_config: proximo.vozConfig as never,
        },
        { onConflict: "clinica_id" },
      );
      return { error: error?.message ?? null };
    },
    [clinicaId, config],
  );

  /** Base de conhecimento enviada à IA: a da clínica ou o catálogo embutido. */
  const tabelaParaIA = config.tabelaServicos.trim() || catalogoPadrao(nomeClinica);

  return { config, loading, salvar, recarregar, tabelaParaIA };
}
