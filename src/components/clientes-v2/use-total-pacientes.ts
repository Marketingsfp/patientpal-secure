import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Total de pacientes da clínica em tempo (quase) real.
 * Usa COUNT exato via `head: true` — sem trafegar linhas — e faz polling a
 * cada 15s + refetch ao focar a aba. Respeita RLS.
 */
export function useTotalPacientes(clinicaId: string | null | undefined) {
  const q = useQuery({
    queryKey: ["clientes-total-live", clinicaId ?? null],
    enabled: !!clinicaId,
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("pacientes")
        .select("id", { count: "exact", head: true })
        .eq("clinica_id", clinicaId!);
      if (error) throw error;
      return count ?? 0;
    },
  });
  return { total: q.data ?? null, loading: q.isLoading, refetch: q.refetch };
}