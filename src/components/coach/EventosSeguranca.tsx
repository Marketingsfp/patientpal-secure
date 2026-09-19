import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LABEL_EVENTO } from "@/lib/coach/seguranca-tela";
import type { TipoEventoSeguranca } from "@/lib/coach/seguranca-tela";

type Evento = {
  id: string;
  atendente: string;
  clinica_id: string | null;
  tela: string;
  tipo: string;
  created_at: string;
};

function quando(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Lista as tentativas de captura/cópia registradas durante treino e prova. */
export function EventosSeguranca({ clinicaId }: { clinicaId?: string | null }) {
  const [eventos, setEventos] = useState<Evento[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // O recorte por clínica é feito no banco: antes vinham 200 linhas de
      // todas as clínicas e a tela filtrava depois, escondendo as da clínica.
      let q = supabase
        .from("coach_eventos_seguranca")
        .select("id,atendente,clinica_id,tela,tipo,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (clinicaId) q = q.eq("clinica_id", clinicaId);
      const { data } = await q;
      if (cancelled) return;
      setEventos((data ?? []) as Evento[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicaId]);

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-destructive" />
        <h3 className="text-sm font-semibold">Tentativas de cópia e print</h3>
        <span className="ml-auto text-xs text-muted-foreground">{eventos.length} registros</span>
      </div>

      {eventos.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Nenhuma tentativa registrada.
        </p>
      ) : (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 text-left font-medium">Atendente</th>
                <th className="py-2 text-left font-medium">Ocorrência</th>
                <th className="py-2 text-left font-medium">Tela</th>
                <th className="py-2 text-right font-medium">Quando</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{e.atendente}</td>
                  <td className="py-2">
                    {LABEL_EVENTO[e.tipo as TipoEventoSeguranca] ?? e.tipo}
                  </td>
                  <td className="py-2 capitalize text-muted-foreground">{e.tela}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {quando(e.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
