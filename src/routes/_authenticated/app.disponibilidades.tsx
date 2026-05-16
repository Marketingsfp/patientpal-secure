import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/disponibilidades")({
  component: Page,
  head: () => ({ meta: [{ title: "Horários médicos — ClinicaOS" }] }),
});

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface Disp { id: string; medico_id: string; dia_semana: number; hora_inicio: string; hora_fim: string; observacoes: string | null }
interface Medico { id: string; nome: string }

function Page() {
  const { clinicaAtual } = useClinica();
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [disps, setDisps] = useState<Disp[]>([]);
  const [filtro, setFiltro] = useState("");
  const [novo, setNovo] = useState({ medico_id: "", dia_semana: "1", hora_inicio: "08:00", hora_fim: "12:00" });

  const load = async () => {
    if (!clinicaAtual) return;
    const [m, d] = await Promise.all([
      supabase.from("medicos").select("id, nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
      supabase.from("medico_disponibilidades").select("id, medico_id, dia_semana, hora_inicio, hora_fim, observacoes").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("dia_semana").order("hora_inicio"),
    ]);
    setMedicos(m.data ?? []);
    setDisps((d.data as Disp[]) ?? []);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clinicaAtual?.clinica_id]);

  const adicionar = async () => {
    if (!clinicaAtual || !novo.medico_id) { toast.error("Selecione um médico"); return; }
    const { error } = await supabase.from("medico_disponibilidades").insert({
      clinica_id: clinicaAtual.clinica_id,
      medico_id: novo.medico_id,
      dia_semana: parseInt(novo.dia_semana),
      hora_inicio: novo.hora_inicio,
      hora_fim: novo.hora_fim,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Horário adicionado");
    void load();
  };

  const remover = async (id: string) => {
    const { error } = await supabase.from("medico_disponibilidades").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setDisps((xs) => xs.filter((x) => x.id !== id));
  };

  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica.</p>;

  const medicosFiltrados = medicos.filter((m) => !filtro || m.nome.toLowerCase().includes(filtro.toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Horários médicos</h1>
        <p className="text-sm text-muted-foreground">Disponibilidade semanal por médico — {clinicaAtual.clinica.nome}</p>
      </div>

      <Card>
        <CardContent className="py-4 flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-48">
            <label className="text-xs text-muted-foreground">Médico</label>
            <Select value={novo.medico_id} onValueChange={(v) => setNovo({ ...novo, medico_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {medicos.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Dia</label>
            <Select value={novo.dia_semana} onValueChange={(v) => setNovo({ ...novo, dia_semana: v })}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{DIAS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Início</label>
            <Input type="time" className="w-28" value={novo.hora_inicio} onChange={(e) => setNovo({ ...novo, hora_inicio: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Fim</label>
            <Input type="time" className="w-28" value={novo.hora_fim} onChange={(e) => setNovo({ ...novo, hora_fim: e.target.value })} />
          </div>
          <Button onClick={adicionar}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
        </CardContent>
      </Card>

      <Input placeholder="Filtrar médicos..." value={filtro} onChange={(e) => setFiltro(e.target.value)} className="max-w-sm" />

      <div className="space-y-3">
        {medicosFiltrados.map((m) => {
          const ds = disps.filter((d) => d.medico_id === m.id);
          if (ds.length === 0 && filtro) return null;
          return (
            <Card key={m.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">{m.nome}</h3>
                  <span className="text-xs text-muted-foreground">{ds.length} horário(s)</span>
                </div>
                {ds.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem horários cadastrados.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {ds.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 border rounded-md px-2 py-1 text-sm bg-muted/40">
                        <span className="font-medium">{DIAS[d.dia_semana]}</span>
                        <span>{d.hora_inicio.slice(0, 5)}–{d.hora_fim.slice(0, 5)}</span>
                        <button onClick={() => remover(d.id)} className="text-destructive hover:opacity-70" aria-label="Remover">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
