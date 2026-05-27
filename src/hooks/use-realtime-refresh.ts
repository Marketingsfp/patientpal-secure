import { useEffect } from "react";
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
  useEffect(() => {
    if (!enabled || tables.length === 0) return;
    const channelName = `rt:${tables.join("+")}:${Math.random().toString(36).slice(2, 8)}`;
    const ch = supabase.channel(channelName);
    for (const t of tables) {
      ch.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: t },
        () => onChange(),
      );
    }
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tables.join("|"), onChange]);
}