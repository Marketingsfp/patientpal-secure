import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface PresencaFicha {
  user_id: string;
  nome: string;
  entrou_em: number; // epoch ms
}

/**
 * Presença colaborativa por ficha (agendamento).
 *
 * Cada usuário que "abre" um agendamento entra num canal Realtime
 * `ficha:<agendamentoId>` publicando seu nome. Outros usuários no mesmo
 * canal recebem a lista de quem está com a ficha aberta em tempo real,
 * permitindo alertar quando dois funcionários operam a mesma ficha.
 *
 * Ao desmontar (fechar diálogo, trocar de ficha, fechar aba), a presença
 * é encerrada — sem risco de lock órfão.
 */
export function useFichaPresence(agendamentoId: string | null | undefined): {
  outros: PresencaFicha[];
  todos: PresencaFicha[];
} {
  const { user } = useAuth();
  const [todos, setTodos] = useState<PresencaFicha[]>([]);

  useEffect(() => {
    if (!agendamentoId || !user?.id) {
      setTodos([]);
      return;
    }

    let cancelled = false;
    const userId = user.id;
    // Nome do usuário: metadata → email como fallback
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    let nome = String(
      meta.nome ?? meta.name ?? meta.full_name ?? user.email ?? "Usuário",
    ).toUpperCase();

    const channel = supabase.channel(`ficha:${agendamentoId}`, {
      config: { presence: { key: userId } },
    });

    const sync = () => {
      if (cancelled) return;
      const state = channel.presenceState() as Record<string, Array<PresencaFicha>>;
      const lista: PresencaFicha[] = [];
      Object.values(state).forEach((arr) => {
        if (arr && arr.length > 0) lista.push(arr[0]);
      });
      setTodos(lista);
    };

    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED" || cancelled) return;
        // Complementa o nome buscando o profile (assíncrono, opcional).
        try {
          const { data: prof } = await supabase
            .from("profiles")
            .select("nome")
            .eq("id", userId)
            .maybeSingle();
          const nomeProf = (prof as { nome?: string | null } | null)?.nome;
          if (nomeProf && nomeProf.trim()) nome = nomeProf.toUpperCase();
        } catch { /* noop */ }
        if (cancelled) return;
        await channel.track({ user_id: userId, nome, entrou_em: Date.now() } satisfies PresencaFicha);
      });

    return () => {
      cancelled = true;
      try { channel.untrack(); } catch { /* noop */ }
      supabase.removeChannel(channel);
    };
  }, [agendamentoId, user?.id, user?.email, user?.user_metadata]);

  const outros = todos.filter((p) => p.user_id !== user?.id);
  return { outros, todos };
}