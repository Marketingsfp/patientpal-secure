import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** Aviso na ficha: o paciente pediu atualização pela Área do Paciente. */
export function AvisoSolicitacaoPortal({ pacienteId, className = "" }: { pacienteId: string | null | undefined; className?: string }) {
  const { data } = useQuery({
    queryKey: ["portal-solic-paciente", pacienteId],
    enabled: !!pacienteId,
    queryFn: async () => {
      const { count } = await supabase
        .from("portal_solicitacoes_cadastro")
        .select("id", { count: "exact", head: true })
        .eq("paciente_id", pacienteId as string)
        .eq("status", "pendente");
      return count ?? 0;
    },
  });
  if (!data) return null;
  return (
    <div className={`flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm ${className}`}>
      <Inbox className="h-4 w-4 text-primary" />
      <span>O paciente pediu atualização de cadastro pela Área do Paciente.</span>
      <Link to="/app/clientes/solicitacoes-portal" className="ml-auto font-medium text-primary hover:underline">
        Ver pedido
      </Link>
    </div>
  );
}
