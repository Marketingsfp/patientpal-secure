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
    total: null, ativos: null, inativos: null, novos30d: null,
    incompletos: null, semTelefone: null, semCpf: null,
    aniversariantes: null, associados: null, particulares: null,
    loading: true,
  });

  const load = useCallback(async () => {
    if (!clinicaId) return;
    setState((s) => ({ ...s, loading: true }));
    const base = () => supabase.from("pacientes").select("*", { count: "exact", head: true }).eq("clinica_id", clinicaId);
    const desde30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const hoje = new Date();
    const mmdd = `${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;

    const [total, ativos, inativos, novos, semTel, semCpfQ, aniv, associadosCount] = await Promise.all([
      base(),
      base().eq("ativo", true),
      base().eq("ativo", false),
      base().gte("created_at", desde30),
      base().is("telefone", null).is("telefone2", null),
      base().or("cpf.is.null,cpf_digits.is.null"),
      base().not("data_nascimento", "is", null).filter("data_nascimento", "like", `%-${mmdd}`),
      supabase.from("contratos_assinatura")
        .select("paciente_id", { count: "exact", head: true })
        .eq("clinica_id", clinicaId)
        .eq("status", "ativo"),
    ]);

    const t = total.count ?? null;
    const asc = associadosCount.count ?? null;
    setState({
      total: t,
      ativos: ativos.count ?? null,
      inativos: inativos.count ?? null,
      novos30d: novos.count ?? null,
      incompletos: null, // requer combinação; deixamos para bar visível
      semTelefone: semTel.count ?? null,
      semCpf: semCpfQ.count ?? null,
      aniversariantes: aniv.count ?? null,
      associados: asc,
      particulares: t !== null && asc !== null ? Math.max(0, t - asc) : null,
      loading: false,
    });
  }, [clinicaId]);

  useEffect(() => { void load(); }, [load]);

  return { ...state, refresh: () => void load() };
}