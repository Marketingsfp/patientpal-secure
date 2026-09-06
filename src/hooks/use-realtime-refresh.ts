import { useEffect, useId, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe a list of postgres tables and call `onChange` whenever any row
 * changes. Use to keep UI in sync in real time.
 *
 * Example:
 *   useRealtimeRefresh(["atend_conversas", "atend_pausas_log"], carregar);
 */
export type OpcoesRealtimeRefresh = {
  /**
   * Filtro do Postgres Changes aplicado no canal (ex.: `clinica_id=eq.<id>`).
   * Opcional: sem ele o comportamento é exatamente o de antes.
   */
  filtro?: string;
  /**
   * Recebe a linha do evento para o consumidor decidir se aquilo interessa.
   * Devolver `false` descarta o evento sem chamar `onChange`.
   */
  interessa?: (linha: Record<string, any>, tabela: string) => boolean;
};

export function useRealtimeRefresh(
  tables: string[],
  onChange: () => void,
  enabled = true,
  opcoes?: OpcoesRealtimeRefresh,
) {
  // Mantém a referência mais recente de onChange sem refazer a subscription
  // a cada render — antes, qualquer re-render do componente pai derrubava e
  // recriava o canal, deixando websockets zumbis pendurados.
  const cbRef = useRef(onChange);
  cbRef.current = onChange;
  const opcoesRef = useRef(opcoes);
  opcoesRef.current = opcoes;
  const stableId = useId();
  useEffect(() => {
    if (!enabled || tables.length === 0) return;
    const channelName = `rt:${tables.join("+")}:${opcoes?.filtro ?? ""}:${stableId}`;
    const ch = supabase.channel(channelName);
    for (const t of tables) {
      ch.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: t, ...(opcoes?.filtro ? { filter: opcoes.filtro } : {}) },
        (payload: any) => {
          const interessa = opcoesRef.current?.interessa;
          if (interessa) {
            const linha = (payload?.new && Object.keys(payload.new).length
              ? payload.new
              : payload?.old) ?? {};
            if (!interessa(linha, t)) return;
          }
          cbRef.current();
        },
      );
    }
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tables.join("|"), stableId, opcoes?.filtro]);
}
