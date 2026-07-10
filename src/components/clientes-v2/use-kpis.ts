import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ClientesKpiTotais {
  total: number | null;
  ativos: number | null;
  inativos: number | null;
  novos30d: number | null;
  incompletos: number | null;
  semTelefone: number | null;
  semCpf: number | null;
  aniversariantes: number | null;
  associados: number | null;
  particulares: number | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * KPIs globais dos pacientes de uma clínica. Cada card faz um COUNT(*) via
 * head:true — barato e paralelo. Não usa a lista visível: valores são reais.
 */
export function useClientesKpis(clinicaId: string | null): ClientesKpiTotais {
  const [state, setState] = useState<Omit<ClientesKpiTotais, "refresh">>({
    total: null,
    ativos: null,
    inativos: null,
    novos30d: null,
    incompletos: null,
    semTelefone: null,
    semCpf: null,
    aniversariantes: null,
    associados: null,
    particulares: null,
    loading: true,
  });

  const load = useCallback(async () => {
    if (!clinicaId) return;
    setState((s) => ({ ...s, loading: true }));
    const { data, error } = await supabase.rpc("kpis_clientes_v2", { _clinica_id: clinicaId });
    if (error) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    const r = (Array.isArray(data) ? data[0] : data) as {
      total: number;
      ativos: number;
      inativos: number;
      novos30d: number;
      sem_telefone: number;
      sem_cpf: number;
      aniversariantes: number;
      associados: number;
    } | null;
    if (!r) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    const t = Number(r.total);
    const asc = Number(r.associados);
    setState({
      total: t,
      ativos: Number(r.ativos),
      inativos: Number(r.inativos),
      novos30d: Number(r.novos30d),
      incompletos: null,
      semTelefone: Number(r.sem_telefone),
      semCpf: Number(r.sem_cpf),
      aniversariantes: Number(r.aniversariantes),
      associados: asc,
      particulares: Math.max(0, t - asc),
      loading: false,
    });
  }, [clinicaId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, refresh: () => void load() };
}
