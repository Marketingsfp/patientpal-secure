import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileHeart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimpleCrud } from "@/components/simple-crud/SimpleCrud";
import { VoiceInput } from "@/components/voice-input";
import { Cid10Picker } from "@/components/cid10-picker";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";
import { PacienteNomeCell, cachePacienteNome } from "@/components/paciente-nome";

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
  const podeEscrever = usePodeEscrever("prontuarios");
  const [medicos, setMedicos] = useState<{ id: string; nome: string }[]>([]);
  const [pacienteSel, setPacienteSel] = useState<PatientOption | null>(null);
  useEffect(() => { (async () => {
    if (!clinicaAtual) return;
    const m = await supabase.from("medicos")
      .select("id, nome")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("ativo", true)
      .order("nome");
    setMedicos(m.data ?? []);
  })(); }, [clinicaAtual?.clinica_id]);

  const medNome = (id: string | null) => id ? (medicos.find(m => m.id === id)?.nome ?? "—") : "—";

  return (
    <SimpleCrud<Prontuario, Form>
      table="prontuarios"
      selectColumns="id, data, paciente_id, medico_id, queixa_principal, hipotese_diagnostica, conduta, prescricao, historia_doenca, exame_fisico, observacoes"
      title="Prontuários"
      subtitle="Histórico clínico dos pacientes."
      icon={<FileHeart className="h-6 w-6 text-primary" />}
      orderBy={{ column: "data", ascending: false }}
      readOnly={!podeEscrever}
      columns={[
        { key: "data", header: "Data", render: r => new Date(r.data).toLocaleString("pt-BR") },
        { key: "pac", header: "Paciente", render: r => <PacienteNomeCell id={r.paciente_id} /> },
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <Label>Paciente *</Label>
              <PatientSearchInput
                value={pacienteSel && pacienteSel.id === f.paciente_id ? pacienteSel : (f.paciente_id ? { id: f.paciente_id, nome: "", cpf: null, telefone: null, data_nascimento: null, clinica_id: clinicaAtual?.clinica_id ?? "" } : null)}
                onSelect={(p) => {
                  setPacienteSel(p);
                  if (p) cachePacienteNome(p.id, p.nome);
                  set({ ...f, paciente_id: p?.id ?? "" });
                }}
                placeholder="Digite nome, CPF, pasta ou nascimento…"
              />
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
              <SelectContent>{medicos.map((m) => <SelectItem key={m.id} value={m.id} className="uppercase">{m.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {([
            ["queixa_principal", "Queixa principal", 2],
            ["historia_doenca", "História da doença", 2],
            ["exame_fisico", "Exame físico", 2],
            ["hipotese_diagnostica", "Hipótese diagnóstica", 2],
            ["conduta", "Conduta", 2],
            ["prescricao", "Prescrição", 3],
            ["observacoes", "Observações", 2],
          ] as const).map(([key, label, rows]) => (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>{label}</Label>
                <div className="flex items-center gap-1">
                  {key === "hipotese_diagnostica" && (
                    <Cid10Picker
                      onPick={(texto) => {
                        const atual = ((f[key] ?? "") as string).trim();
                        const novo = atual ? `${atual} ${texto}` : texto;
                        set({ ...f, [key]: novo });
                      }}
                    />
                  )}
                  <VoiceInput
                    size="sm"
                    currentValue={(f[key] ?? "") as string}
                    onTranscript={(t) => set({ ...f, [key]: t })}
                    prompt={`Transcreva o áudio em português do Brasil como anotação médica do campo "${label}". Retorne apenas o texto.`}
                    title={`Ditar ${label}`}
                  />
                </div>
              </div>
              <Textarea
                rows={rows}
                value={(f[key] ?? "") as string}
                onChange={(e) => set({ ...f, [key]: e.target.value })}
              />
            </div>
          ))}
        </div>
      )}
    />
  );
}