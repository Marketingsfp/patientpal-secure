// Alçadas nominais do usuário logado — os poderes de autorizar que foram
// dados a ELE, pelo ID, e não ao cargo dele.
//
// Existe porque o poder de autorizar (isentar cobrança, dar desconto, liberar
// débito) sempre veio do cargo somado à marcação de gestão. Quando a diretoria
// precisa liberar UMA pessoa, promover de cargo daria a ela acesso a dinheiro
// e administração, e acrescentar o cargo à lista faria qualquer colega herdar
// o poder depois. A liberação nominal fica numa linha de `usuario_alcadas`,
// que aponta para o user_id e para mais ninguém.
//
// Esconder ou mostrar o diálogo de senha é conforto de tela; quem realmente
// barra é o gatilho do banco, que consulta a MESMA tabela.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import type { EscopoAutorizacao } from "@/lib/autorizacao-supervisor";

/**
 * Escopos liberados nominalmente para o usuário logado na clínica atual.
 *
 * Começa vazio e continua vazio se a consulta falhar: alçada é poder sobre
 * dinheiro, então erro de rede nunca pode CONCEDER. Na pior das hipóteses a
 * tela volta a pedir a senha do supervisor, que é o caminho de sempre.
 */
export function useAlcadasNominais(): { alcadas: Set<EscopoAutorizacao>; carregando: boolean } {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const userId = user?.id ?? null;
  const [alcadas, setAlcadas] = useState<Set<EscopoAutorizacao>>(() => new Set());
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!clinicaId || !userId) {
      setAlcadas(new Set());
      setCarregando(false);
      return;
    }
    let cancelado = false;
    setAlcadas(new Set());
    setCarregando(true);
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("usuario_alcadas")
          .select("escopo")
          .eq("clinica_id", clinicaId)
          .eq("user_id", userId);
        if (error) throw error;
        if (cancelado) return;
        setAlcadas(new Set((data ?? []).map((r) => r.escopo as EscopoAutorizacao)));
      } catch (e) {
        console.error("[useAlcadasNominais] falha ao ler alçadas nominais", e);
        if (!cancelado) setAlcadas(new Set());
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaId, userId]);

  return { alcadas, carregando };
}
