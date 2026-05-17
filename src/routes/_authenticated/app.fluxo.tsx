import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, CheckCircle2, Workflow } from "lucide-react";
import { PendenciasAlert } from "@/components/PendenciasAlert";

export const Route = createFileRoute("/_authenticated/app/fluxo")({
  component: FluxoPage,
  head: () => ({ meta: [{ title: "Fluxo do paciente — ClinicaOS" }] }),
});

type Etapa =
  | "aguardando_recepcao"
  | "recepcao"
  | "caixa"
  | "triagem"
  | "atendimento"
  | "exame"
  | "finalizado";

const ETAPAS: { id: Etapa; label: string; cor: string }[] = [
  { id: "aguardando_recepcao", label: "Aguardando", cor: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
  { id: "recepcao", label: "Recepção", cor: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  { id: "caixa", label: "Caixa", cor: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  { id: "triagem", label: "Triagem (enfermagem)", cor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  { id: "atendimento", label: "Atendimento médico", cor: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  { id: "exame", label: "Exame", cor: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  { id: "finalizado", label: "Finalizado", cor: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300" },
];

type Ag = {
  id: string;
  paciente_id: string | null;
  paciente_nome: string;
  procedimento: string | null;
  inicio: string;
  fluxo_etapa: Etapa;
  medicos?: { nome: string } | null;
};

function proxima(e: Etapa, alvo: "atendimento" | "exame"): Etapa | null {
  const ordem: Etapa[] = ["aguardando_recepcao", "recepcao", "caixa", "triagem", alvo, "finalizado"];
  const i = ordem.indexOf(e);
  if (i < 0 || i >= ordem.length - 1) return null;
  return ordem[i + 1];
}
function anterior(e: Etapa): Etapa | null {
  const ordem: Etapa[] = ["aguardando_recepcao", "recepcao", "caixa", "triagem", "atendimento", "finalizado"];
  const ordemExame: Etapa[] = ["aguardando_recepcao", "recepcao", "caixa", "triagem", "exame", "finalizado"];
  const arr = e === "exame" ? ordemExame : ordem;
  const i = arr.indexOf(e);
  if (i <= 0) return null;
  return arr[i - 1];
}

function FluxoPage() {
  const { clinicaAtual } = useClinica();
  const [ags, setAgs] = useState<Ag[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const hoje = new Date().toISOString().slice(0, 10);
    const ini = `${hoje}T00:00:00`;
    const fim = `${hoje}T23:59:59`;
    const { data, error } = await supabase
      .from("agendamentos")
      .select("id, paciente_id, paciente_nome, procedimento, inicio, fluxo_etapa, medicos(nome)")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .gte("inicio", ini)
      .lte("inicio", fim)
      .order("inicio");
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setAgs((data ?? []) as unknown as Ag[]);
  }, [clinicaAtual]);

  useEffect(() => {
    void carregar();
    if (!clinicaAtual) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedReload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void carregar(); }, 400);
    };
    const ch = supabase
      .channel(`fluxo-${clinicaAtual.clinica_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agendamentos", filter: `clinica_id=eq.${clinicaAtual.clinica_id}` },
        debouncedReload,
      )
      .subscribe();
    return () => { if (timer) clearTimeout(timer); void supabase.removeChannel(ch); };
  }, [carregar, clinicaAtual]);

  async function setEtapa(id: string, etapa: Etapa) {
    const { error } = await supabase
      .from("agendamentos")
      .update({ fluxo_etapa: etapa, fluxo_atualizado_em: new Date().toISOString() } as never)
      .eq("id", id);
    if (error) toast.error(error.message);
  }

  const colunas = useMemo(() => {
    const m = new Map<Etapa, Ag[]>();
    ETAPAS.forEach((e) => m.set(e.id, []));
    for (const a of ags) m.get(a.fluxo_etapa)?.push(a);
    return m;
  }, [ags]);

  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica primeiro.</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Workflow className="h-6 w-6" /> Fluxo do paciente</h1>
          <p className="text-sm text-muted-foreground">
            Recepção → Caixa → Triagem (enfermagem) → Atendimento médico ou Exame. Avance o paciente em cada etapa.
          </p>
        </div>
        <Button variant="outline" onClick={carregar} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</Button>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-7">
        {ETAPAS.map((col) => {
          const items = colunas.get(col.id) ?? [];
          return (
            <div key={col.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <Badge className={`${col.cor} border-0`}>{col.label}</Badge>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="space-y-2 max-h-[70vh] overflow-auto pr-1">
                {items.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded">vazio</div>
                )}
                {items.map((a) => {
                  const h = new Date(a.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                  const isExame = /exame|raio|usg|ultra|tomo|ressona/i.test(a.procedimento ?? "");
                  const next = proxima(a.fluxo_etapa, isExame ? "exame" : "atendimento");
                  const prev = anterior(a.fluxo_etapa);
                  return (
                    <Card key={a.id} className="p-2.5 text-sm space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium leading-tight">{a.paciente_nome}</div>
                        <span className="text-xs text-muted-foreground tabular-nums">{h}</span>
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-2">
                        {a.procedimento ?? "—"}{a.medicos?.nome ? ` · ${a.medicos.nome}` : ""}
                      </div>
                      <div className="flex items-center gap-1 pt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          disabled={!prev}
                          onClick={() => prev && setEtapa(a.id, prev)}
                          title="Voltar etapa"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        {col.id === "triagem" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs flex-1" onClick={() => setEtapa(a.id, "atendimento")}>
                              <ChevronRight className="h-3 w-3 mr-1" /> Atendimento
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs flex-1" onClick={() => setEtapa(a.id, "exame")}>
                              <ChevronRight className="h-3 w-3 mr-1" /> Exame
                            </Button>
                          </>
                        )}
                        {col.id !== "triagem" && (
                          <Button
                            size="sm"
                            className="h-7 px-2 text-xs flex-1"
                            disabled={!next}
                            onClick={() => next && setEtapa(a.id, next)}
                          >
                            {col.id === "atendimento" || col.id === "exame" ? (
                              <><CheckCircle2 className="h-3 w-3 mr-1" /> Finalizar</>
                            ) : (
                              <>Avançar <ChevronRight className="h-3 w-3 ml-1" /></>
                            )}
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}