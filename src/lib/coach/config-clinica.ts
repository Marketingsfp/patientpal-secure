/**
 * Configuração do Coach por clínica: scripts de agendamento, checklist,
 * base de conhecimento e vozes. No projeto de origem isso ficava na tabela
 * `clinicas`; aqui vive em `coach_config_clinica`, sem tocar no cadastro de
 * clínicas do ClinicaOS.
 *
 * A base de conhecimento NÃO é mais digitada nem herdada de catálogo fixo:
 * ela é gerada a partir das tabelas do sistema (`base-conhecimento.dados.ts`)
 * e guardada em `tabela_servicos` apenas como cache, com a data da geração.
 * O texto que a gestora escreve virou `complemento`, anexado ao final.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { gerarBaseDoSistema } from "@/lib/coach/base-conhecimento.dados";
import { selecionarParaIA } from "@/lib/coach/base-conhecimento";
import { VOZ_CONFIG_PADRAO, parseVozConfig, type VozConfig } from "@/lib/coach/voz-sistema";

export type ScriptItem = { titulo: string; conteudo: string };

export type CoachConfig = {
  scripts: ScriptItem[];
  checklist: string[];
  /** Cache da base gerada do sistema. */
  baseSistema: string;
  /** Texto extra da gestora, anexado ao final da base. */
  complemento: string;
  baseGeradaEm: Date | null;
  vozConfig: VozConfig;
};

const VAZIO: CoachConfig = {
  scripts: [],
  checklist: [],
  baseSistema: "",
  complemento: "",
  baseGeradaEm: null,
  vozConfig: VOZ_CONFIG_PADRAO,
};

/** Depois disso a base é considerada velha e regenerada sozinha. */
const VALIDADE_MS = 24 * 60 * 60 * 1000;

export function baseVencida(geradaEm: Date | null, agora: Date = new Date()): boolean {
  if (!geradaEm) return true;
  return agora.getTime() - geradaEm.getTime() > VALIDADE_MS;
}

export function useCoachConfig(clinicaId: string | null, nomeClinica?: string | null) {
  const [config, setConfig] = useState<CoachConfig>(VAZIO);
  const [loading, setLoading] = useState(true);
  const [gerandoBase, setGerandoBase] = useState(false);
  const [erroBase, setErroBase] = useState<string | null>(null);
  const gerandoRef = useRef(false);

  const recarregar = useCallback(async () => {
    if (!clinicaId) {
      setConfig(VAZIO);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("coach_config_clinica")
      .select("scripts,checklist,tabela_servicos,complemento,base_gerada_em,voz_config")
      .eq("clinica_id", clinicaId)
      .maybeSingle();
    setConfig({
      scripts: Array.isArray(data?.scripts) ? (data.scripts as unknown as ScriptItem[]) : [],
      checklist: Array.isArray(data?.checklist) ? (data.checklist as unknown as string[]) : [],
      baseSistema: data?.tabela_servicos?.trim() ? data.tabela_servicos : "",
      complemento: data?.complemento ?? "",
      baseGeradaEm: data?.base_gerada_em ? new Date(data.base_gerada_em) : null,
      vozConfig:
        data?.voz_config && Object.keys(data.voz_config as object).length > 0
          ? parseVozConfig(data.voz_config)
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
          tabela_servicos: proximo.baseSistema,
          complemento: proximo.complemento,
          base_gerada_em: proximo.baseGeradaEm ? proximo.baseGeradaEm.toISOString() : null,
          voz_config: proximo.vozConfig as never,
        },
        { onConflict: "clinica_id" },
      );
      return { error: error?.message ?? null };
    },
    [clinicaId, config],
  );

  /** Relê as tabelas do sistema e atualiza o cache da clínica. */
  const atualizarBase = useCallback(async () => {
    if (!clinicaId || gerandoRef.current) return;
    gerandoRef.current = true;
    setGerandoBase(true);
    setErroBase(null);
    try {
      const { texto, geradoEm } = await gerarBaseDoSistema(clinicaId, nomeClinica);
      await salvar({ baseSistema: texto, baseGeradaEm: geradoEm });
    } catch (e) {
      setErroBase(e instanceof Error ? e.message : "Não foi possível atualizar a base.");
    } finally {
      gerandoRef.current = false;
      setGerandoBase(false);
    }
  }, [clinicaId, nomeClinica, salvar]);

  // Cache vazio ou com mais de 24h: regenera sozinho, sem a gestora pedir.
  useEffect(() => {
    if (loading || !clinicaId) return;
    if (!config.baseSistema.trim() || baseVencida(config.baseGeradaEm)) void atualizarBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, clinicaId, config.baseSistema, config.baseGeradaEm]);

  /**
   * Base pronta para a IA: seleção por assunto (a base inteira não cabe no
   * prompt) mais o complemento da gestora no final.
   */
  const baseParaIA = useCallback(
    (contexto?: string) =>
      selecionarParaIA(config.baseSistema, {
        contexto: contexto ?? "",
        complemento: config.complemento,
      }),
    [config.baseSistema, config.complemento],
  );

  return {
    config,
    loading,
    salvar,
    recarregar,
    atualizarBase,
    gerandoBase,
    erroBase,
    baseParaIA,
  };
}
