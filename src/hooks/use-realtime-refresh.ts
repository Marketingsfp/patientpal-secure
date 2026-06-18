import { useEffect, useId, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe a list of postgres tables and call `onChange` whenever any row
 * changes. Use to keep UI in sync in real time.
 *
 * Example:
 *   useRealtimeRefresh(["atend_conversas", "atend_pausas_log"], carregar);
 */
export function useRealtimeRefresh(
  tables: string[],
  onChange: () => void,
  enabled = true,
) {
  // Mantém a referência mais recente de onChange sem refazer a subscription
  // a cada render — antes, qualquer re-render do componente pai derrubava e
  // recriava o canal, deixando websockets zumbis pendurados.
  const cbRef = useRef(onChange);
  cbRef.current = onChange;
  const stableId = useId();
  useEffect(() => {
    if (!enabled || tables.length === 0) return;
    const channelName = `rt:${tables.join("+")}:${stableId}`;
    const ch = supabase.channel(channelName);
    for (const t of tables) {
      ch.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: t },
        () => cbRef.current(),
      );
    }
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tables.join("|"), stableId]);
}