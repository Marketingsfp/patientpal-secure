import { useEffect, useState } from "react";
import { useAuth } from "./use-auth";
import { useClinica } from "./use-clinica";
import { supabase } from "@/integrations/supabase/client";
import { makeCache } from "@/lib/cache/single-flight";

// Vários componentes da mesma tela usam este hook (agenda, cabeçalho, ações).
// Sem cache compartilhado, cada um repetia as mesmas 2 consultas em `medicos`.
const cacheMedicoId = makeCache<string | null>(60_000);

function buscarMedicoId(clinicaId: string, userId: string, email: string | null) {
  return cacheMedicoId.get(`${clinicaId}:${userId}`, async () => {
    const { data: byUser } = await supabase
      .from("medicos")
      .select("id")
      .eq("clinica_id", clinicaId)
      .eq("user_id", userId)
      .eq("ativo", true)
      .maybeSingle();
    if (byUser?.id) return byUser.id;
    if (!email) return null;
    const { data: byEmail } = await supabase
      .from("medicos")
      .select("id")
      .eq("clinica_id", clinicaId)
      .ilike("email", email)
      .eq("ativo", true)
      .maybeSingle();
    return byEmail?.id ?? null;
  });
}

/**
 * Identifica se o usuário logado está no perfil "médico" da clínica atual
 * (role === 'medico') e devolve o medico.id correspondente.
 */
export function useMedicoContext() {
  const { user } = useAuth();
  const { clinicaAtual } = useClinica();
  const [medicoId, setMedicoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isMedicoOnly = clinicaAtual?.role === "medico";

  useEffect(() => {
    let cancel = false;
    void (async () => {
      if (!user?.id || !clinicaAtual) {
        setMedicoId(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const mid = await buscarMedicoId(
        clinicaAtual.clinica_id,
        user.id,
        user.email ?? null,
      );
      if (!cancel) {
        setMedicoId(mid);
        setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [user?.id, user?.email, clinicaAtual?.clinica_id]);

  return { medicoId, isMedicoOnly, loading };
}