import { useEffect, useState } from "react";
import { useAuth } from "./use-auth";
import { useClinica } from "./use-clinica";
import { supabase } from "@/integrations/supabase/client";
import { makeCache } from "@/lib/cache/single-flight";

// A agenda consulta este escopo em vários pontos da mesma tela (lista de
// profissionais, colunas do dia, seleção dentro do agendamento). Sem cache
// compartilhado cada um repetiria a mesma consulta em `usuario_medicos`.
const cacheEscopo = makeCache<string[] | null>(60_000);

function buscarEscopo(clinicaId: string, userId: string) {
  return cacheEscopo.get(`${clinicaId}:${userId}`, async () => {
    const { data, error } = await supabase
      .from("usuario_medicos")
      .select("medico_id")
      .eq("clinica_id", clinicaId)
      .eq("user_id", userId);
    // Erro de rede/RLS não pode ampliar acesso, mas também não pode esconder a
    // agenda de quem nunca teve restrição: sem nenhuma linha o comportamento
    // continua sendo "vê todos", que é o de hoje para toda a equipe.
    if (error) return null;
    const ids = (data ?? []).map((r) => r.medico_id).filter(Boolean) as string[];
    return ids.length > 0 ? ids : null;
  });
}

/**
 * Lista de médicos que o usuário logado pode ver e agendar na clínica atual.
 *
 * - `null` significa "sem restrição": é o caso de praticamente toda a equipe,
 *   que não tem nenhum médico marcado e continua enxergando a clínica inteira.
 * - `string[]` lista os `medicos.id` liberados para quem foi restrito na tela
 *   de Equipe (por exemplo, uma secretária que atende só dois profissionais).
 *
 * A trava de verdade está nas políticas do banco (`medicos_do_usuario()`); este
 * hook existe para que a tela já apareça limpa, sem colunas e nomes que a
 * pessoa não pode abrir.
 */
export function useMedicosPermitidos(): {
  medicosPermitidos: string[] | null;
  restrito: boolean;
  loading: boolean;
} {
  const { user } = useAuth();
  const { clinicaAtual } = useClinica();
  const [ids, setIds] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      if (!user?.id || !clinicaAtual) {
        setIds(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const escopo = await buscarEscopo(clinicaAtual.clinica_id, user.id);
      if (!cancel) {
        setIds(escopo);
        setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [user?.id, clinicaAtual?.clinica_id]);

  return { medicosPermitidos: ids, restrito: ids !== null, loading };
}
