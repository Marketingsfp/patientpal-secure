import { useEffect, useState } from "react";
import { useAuth } from "./use-auth";
import { useClinica } from "./use-clinica";
import { supabase } from "@/integrations/supabase/client";

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
    (async () => {
      if (!user?.id || !clinicaAtual) {
        setMedicoId(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data: byUser } = await supabase
        .from("medicos")
        .select("id")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("user_id", user.id)
        .eq("ativo", true)
        .maybeSingle();
      let mid = byUser?.id ?? null;
      if (!mid && user.email) {
        const { data: byEmail } = await supabase
          .from("medicos")
          .select("id")
          .eq("clinica_id", clinicaAtual.clinica_id)
          .ilike("email", user.email)
          .eq("ativo", true)
          .maybeSingle();
        mid = byEmail?.id ?? null;
      }
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