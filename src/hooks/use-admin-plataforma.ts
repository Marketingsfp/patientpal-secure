/**
 * "Este usuário é administrador da plataforma?"
 *
 * Existe porque os catálogos globais (especialidades, categorias de serviço)
 * valem para TODAS as clínicas: gestor de clínica pode criar e editar, mas
 * apagar continua restrito à plataforma. A tela usa isso só para não oferecer
 * um botão que o banco vai recusar — a barreira real é a política de RLS.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useAdminPlataforma(): boolean {
  const { data } = useQuery({
    queryKey: ["admin-plataforma"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return false;
      const { data, error } = await supabase.rpc("is_platform_admin", { _user_id: uid });
      if (error) return false;
      return Boolean(data);
    },
    staleTime: 5 * 60_000,
  });
  return data === true;
}
