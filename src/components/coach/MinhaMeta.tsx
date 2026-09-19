import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NOTA_MINIMA } from "@/lib/coach/treinamento-plano";
import { filtroDoAtendente } from "@/lib/coach/identidade";

type Meta = { meta_nota: number; meta_horas: number; observacao: string };

/** Mostra à atendente a meta definida pela gestora e o recado dela. */
export function MinhaMeta({
  atendente,
  clinicaId,
  userId,
}: {
  atendente: string;
  clinicaId: string | null;
  userId: string | null;
}) {
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!clinicaId) return;
      const { data } = await supabase
        .from("coach_desempenho_metas")
        .select("meta_nota,meta_horas,observacao")
        .eq("clinica_id", clinicaId)
        .or(filtroDoAtendente(userId, atendente))
        .limit(1)
        .maybeSingle();
      if (cancelled || !data) return;
      setMeta({
        meta_nota: Number(data.meta_nota) || NOTA_MINIMA,
        meta_horas: Number(data.meta_horas) || 1,
        observacao: data.observacao ?? "",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [atendente, clinicaId, userId]);

  if (!meta) return null;

  return (
    <div className="rounded-2xl border bg-primary/5 p-5">
      <p className="text-sm font-semibold flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" /> Minha meta
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Nota mínima <strong className="text-foreground">{meta.meta_nota.toFixed(1)}</strong> ·{" "}
        <strong className="text-foreground">{meta.meta_horas}h</strong> de treino
      </p>
      {meta.observacao && (
        <p className="mt-3 rounded-xl bg-background/70 p-3 text-sm whitespace-pre-wrap">
          {meta.observacao}
        </p>
      )}
    </div>
  );
}
