import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Id da especialidade "Odontologia".
 *
 * Usado pelo odontograma (para incluir um dente em orçamento) e pela tela de
 * orçamentos odontológicos (para filtrar e criar). Virou hook quando as duas
 * telas passaram a ser rotas separadas, para a busca não ficar duplicada em
 * dois arquivos e sair de sincronia.
 */
export function useEspecialidadeOdontoId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("especialidades")
        .select("id")
        .ilike("nome", "odontologia")
        .maybeSingle();
      setId(data?.id ?? null);
    })();
  }, []);
  return id;
}
