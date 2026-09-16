/**
 * Contexto do portal Coach dentro do ClinicaOS: quem é a pessoa logada,
 * qual é a clínica ativa, se ela é gestora do Coach e quem são as
 * atendentes daquela clínica (usuários com o módulo "coach" liberado).
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { useAcessoModulo } from "@/hooks/use-permissoes";
import { PRESETS } from "@/lib/permissoes-presets";

export type CoachContexto = {
  clinicaId: string | null;
  clinicaNome: string | null;
  clinicas: { id: string; nome: string }[];
  userId: string | null;
  /** Nome da pessoa logada — é o "atendente" do histórico do Coach. */
  atendente: string;
  gestor: boolean;
  loading: boolean;
};

export function useCoachContexto(): CoachContexto {
  const { user } = useAuth();
  const { clinicaAtual, memberships, loading: clinicaLoading } = useClinica();
  const acesso = useAcessoModulo("coach");
  const [nome, setNome] = useState("");
  const [carregandoNome, setCarregandoNome] = useState(true);

  useEffect(() => {
    let cancelado = false;
    if (!user?.id) {
      setNome("");
      setCarregandoNome(false);
      return;
    }
    setCarregandoNome(true);
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelado) return;
      setNome((data?.nome ?? user.email ?? "").trim());
      setCarregandoNome(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [user?.id, user?.email]);

  const clinicas = useMemo(
    () => memberships.map((m) => ({ id: m.clinica_id, nome: m.clinica.nome })),
    [memberships],
  );

  return {
    clinicaId: clinicaAtual?.clinica_id ?? null,
    clinicaNome: clinicaAtual?.clinica.nome ?? null,
    clinicas,
    userId: user?.id ?? null,
    atendente: nome,
    gestor: acesso === "write",
    loading: clinicaLoading || carregandoNome,
  };
}

export type AtendenteCoach = { nome: string; clinicaId: string | null; userId: string };

/** Perfis da clínica que enxergam o módulo Coach (tabela ou preset do perfil). */
async function perfisComCoach(clinicaId: string): Promise<Set<string>> {
  const { data: perfis } = await supabase
    .from("perfis_acesso")
    .select("id,chave")
    .eq("clinica_id", clinicaId);
  const lista = perfis ?? [];
  const ids = lista.map((p) => p.id);
  const configurados = new Map<string, string>();
  if (ids.length > 0) {
    const { data: permissoes } = await supabase
      .from("perfil_permissoes")
      .select("perfil_id,acesso")
      .eq("modulo", "coach")
      .in("perfil_id", ids);
    (permissoes ?? []).forEach((p) => configurados.set(p.perfil_id, p.acesso));
  }
  const ok = new Set<string>(["admin"]);
  for (const perfil of lista) {
    const configurado = configurados.get(perfil.id);
    if (configurado) {
      if (configurado !== "none") ok.add(perfil.chave);
      continue;
    }
    const preset = (PRESETS as Record<string, Record<string, string> | undefined>)[perfil.chave];
    if (preset && preset["coach"] && preset["coach"] !== "none") ok.add(perfil.chave);
  }
  return ok;
}

/** Atendentes = usuários ativos da clínica cujo perfil tem o módulo Coach. */
export function useAtendentesCoach(clinicaId: string | null) {
  const [atendentes, setAtendentes] = useState<AtendenteCoach[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    if (!clinicaId) {
      setAtendentes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      const [{ data: membros }, permitidos] = await Promise.all([
        supabase
          .from("clinica_memberships")
          .select("user_id,role")
          .eq("clinica_id", clinicaId)
          .eq("ativo", true),
        perfisComCoach(clinicaId),
      ]);
      const elegiveis = (membros ?? []).filter((m) => permitidos.has(m.role));
      const ids = elegiveis.map((m) => m.user_id);
      const nomes = new Map<string, string>();
      if (ids.length > 0) {
        const { data: perfis } = await supabase
          .from("profiles")
          .select("id,nome")
          .in("id", ids);
        (perfis ?? []).forEach((p) => nomes.set(p.id, p.nome));
      }
      if (cancelado) return;
      setAtendentes(
        elegiveis
          .map((m) => ({
            userId: m.user_id,
            nome: (nomes.get(m.user_id) ?? "").trim(),
            clinicaId,
          }))
          .filter((a) => a.nome.length > 0)
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      );
      setLoading(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaId]);

  return { atendentes, loading };
}
