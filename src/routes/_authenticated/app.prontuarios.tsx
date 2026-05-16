import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileHeart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimpleCrud } from "@/components/simple-crud/SimpleCrud";

export const Route = createFileRoute("/_authenticated/app/prontuarios")({
  component: ProntuariosPage,
  head: () => ({ meta: [{ title: "Prontuários — ClinicaOS" }] }),
});

interface Prontuario {
  id: string; data: string; paciente_id: string; medico_id: string | null;
  queixa_principal: string | null; hipotese_diagnostica: string | null;
  conduta: string | null; prescricao: string | null;
  historia_doenca: string | null; exame_fisico: string | null; observacoes: string | null;
}
type Form = Omit<Prontuario, "id">;
const EMPTY: Form = {
  data: new Date().toISOString().slice(0,16), paciente_id: "", medico_id: null,
  queixa_principal: "", hipotese_diagnostica: "", conduta: "", prescricao: "",
  historia_doenca: "", exame_fisico: "", observacoes: "",
};

function ProntuariosPage() {
  const { clinicaAtual } = useClinica();
  const [pacientes, setPacientes] = useState<{ id: string; nome: string }[]>([]);
  const [medicos, setMedicos] = useState<{ id: string; nome: string }[]>([]);
  useEffect(() => { (async () => {
    if (!clinicaAtual) return;
    const [p, m] = await Promise.all([
      supabase.from("pacientes").select("id, nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
      supabase.from("medicos").select("id, nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
    ]);
    setPacientes(p.data ?? []); setMedicos(m.data ?? []);
  })(); }, [clinicaAtual?.clinica_id]);

  const pacNome = (id: string) => pacientes.find(p => p.id === id)?.nome ?? "—";
  const medNome = (id: string | null) => id ? (medicos.find(m => m.id === id)?.nome ?? "—") : "—";

  return (
    <SimpleCrud<Prontuario, Form>
      table="prontuarios"
      selectColumns="id, data, paciente_id, medico_id, queixa_principal, hipotese_diagnostica, conduta, prescricao, historia_doenca, exame_fisico, observacoes"
      title="Prontuários"
      subtitle="Histórico clínico dos pacientes."
      icon={<FileHeart className="h-6 w-6 text-primary" />}
      orderBy={{ column: "data", ascending: false }}
      columns={[
        { key: "data", header: "Data", render: r => new Date(r.data).toLocaleString("pt-BR") },
        { key: "pac", header: "Paciente", render: r => pacNome(r.paciente_id) },
        { key: "med", header: "Profissional", render: r => medNome(r.medico_id) },
        { key: "queixa", header: "Queixa principal", render: r => <span className="text-sm text-muted-foreground line-clamp-1">{r.queixa_principal ?? "—"}</span> },
      ]}
      emptyForm={EMPTY}
      toForm={r => ({
        data: r.data.slice(0,16), paciente_id: r.paciente_id, medico_id: r.medico_id,
        queixa_principal: r.queixa_principal ?? "", hipotese_diagnostica: r.hipotese_diagnostica ?? "",
        conduta: r.conduta ?? "", prescricao: r.prescricao ?? "",
        historia_doenca: r.historia_doenca ?? "", exame_fisico: r.exame_fisico ?? "", observacoes: r.observacoes ?? "",
      })}
      toPayload={f => ({
        data: new Date(f.data).toISOString(), paciente_id: f.paciente_id, medico_id: f.medico_id || null,
        queixa_principal: f.queixa_principal || null, hipotese_diagnostica: f.hipotese_diagnostica || null,
        conduta: f.conduta || null, prescricao: f.prescricao || null,
        historia_doenca: f.historia_doenca || null, exame_fisico: f.exame_fisico || null, observacoes: f.observacoes || null,
      })}
      renderForm={(f, set) => (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1 col-span-2">
              <Label>Paciente *</Label>
              <Select value={f.paciente_id} onValueChange={v => set({ ...f, paciente_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>{pacientes.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Data</Label>
              <Input type="datetime-local" value={f.data} onChange={e => set({ ...f, data: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Profissional</Label>
            <Select value={f.medico_id ?? ""} onValueChange={v => set({ ...f, medico_id: v || null })}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>{medicos.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Queixa principal</Label><Textarea rows={2} value={f.queixa_principal ?? ""} onChange={e => set({ ...f, queixa_principal: e.target.value })} /></div>
          <div className="space-y-1"><Label>História da doença</Label><Textarea rows={2} value={f.historia_doenca ?? ""} onChange={e => set({ ...f, historia_doenca: e.target.value })} /></div>
          <div className="space-y-1"><Label>Exame físico</Label><Textarea rows={2} value={f.exame_fisico ?? ""} onChange={e => set({ ...f, exame_fisico: e.target.value })} /></div>
          <div className="space-y-1"><Label>Hipótese diagnóstica</Label><Textarea rows={2} value={f.hipotese_diagnostica ?? ""} onChange={e => set({ ...f, hipotese_diagnostica: e.target.value })} /></div>
          <div className="space-y-1"><Label>Conduta</Label><Textarea rows={2} value={f.conduta ?? ""} onChange={e => set({ ...f, conduta: e.target.value })} /></div>
          <div className="space-y-1"><Label>Prescrição</Label><Textarea rows={3} value={f.prescricao ?? ""} onChange={e => set({ ...f, prescricao: e.target.value })} /></div>
          <div className="space-y-1"><Label>Observações</Label><Textarea rows={2} value={f.observacoes ?? ""} onChange={e => set({ ...f, observacoes: e.target.value })} /></div>
        </div>
      )}
    />
  );
}