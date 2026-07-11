import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileSignature } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { SimpleCrud } from "@/components/simple-crud/SimpleCrud";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";
import { PacienteNomeCell, cachePacienteNome } from "@/components/paciente-nome";

export const Route = createFileRoute("/_authenticated/app/documentos")({
  component: DocumentosPage,
  head: () => ({ meta: [{ title: "Documentos — ClinicaOS" }] }),
});

type Tipo = "atestado" | "receita" | "laudo" | "declaracao" | "contrato" | "outro";
const TIPO_LABEL: Record<Tipo, string> = { atestado: "Atestado", receita: "Receita", laudo: "Laudo", declaracao: "Declaração", contrato: "Contrato", outro: "Outro" };
interface Row { id: string; titulo: string; tipo: Tipo; conteudo: string; assinado: boolean; paciente_id: string | null; medico_id: string | null; modelo_id: string | null; }
interface Form { titulo: string; tipo: Tipo; conteudo: string; assinado: boolean; paciente_id: string | null; medico_id: string | null; modelo_id: string | null; }

function DocumentosPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("documentos");
  const [medicos, setMedicos] = useState<{ id: string; nome: string }[]>([]);
  const [modelos, setModelos] = useState<{ id: string; nome: string; tipo: Tipo; conteudo: string }[]>([]);
  const [pacienteSel, setPacienteSel] = useState<PatientOption | null>(null);
  useEffect(() => { (async () => {
    if (!clinicaAtual) return;
    const [m, md] = await Promise.all([
      supabase.from("medicos").select("id, nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
      supabase.from("modelos_documentos").select("id, nome, tipo, conteudo").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
    ]);
    setMedicos(m.data ?? []); setModelos((md.data ?? []) as never);
  })(); }, [clinicaAtual?.clinica_id]);

  return (
    <SimpleCrud<Row, Form>
      table="documentos_emitidos"
      selectColumns="id, titulo, tipo, conteudo, assinado, paciente_id, medico_id, modelo_id"
      title="Documentos Emitidos"
      subtitle="Atestados, receitas e laudos gerados para pacientes."
      icon={<FileSignature className="h-6 w-6 text-primary" />}
      searchFields={["titulo"]}
      readOnly={!podeEscrever}
      columns={[
        { key: "tit", header: "Título", render: r => <span className="font-medium">{r.titulo}</span> },
        { key: "tipo", header: "Tipo", className: "w-32", render: r => <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{TIPO_LABEL[r.tipo]}</span> },
        { key: "pac", header: "Paciente", render: r => <PacienteNomeCell id={r.paciente_id} /> },
        { key: "ass", header: "Assinado", className: "w-28", render: r => r.assinado ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Sim</span> : <span className="text-xs text-muted-foreground">Não</span> },
      ]}
      emptyForm={{ titulo: "", tipo: "outro", conteudo: "", assinado: false, paciente_id: null, medico_id: null, modelo_id: null }}
      toForm={r => ({ titulo: r.titulo, tipo: r.tipo, conteudo: r.conteudo, assinado: r.assinado, paciente_id: r.paciente_id, medico_id: r.medico_id, modelo_id: r.modelo_id })}
      toPayload={f => ({
        titulo: f.titulo.trim(), tipo: f.tipo, conteudo: f.conteudo, assinado: f.assinado,
        assinado_em: f.assinado ? new Date().toISOString() : null,
        paciente_id: f.paciente_id, medico_id: f.medico_id, modelo_id: f.modelo_id,
      })}
      renderForm={(f, set) => (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-1">
            <Label>Usar modelo</Label>
            <Select value={f.modelo_id ?? ""} onValueChange={v => {
              const md = modelos.find(m => m.id === v);
              set({ ...f, modelo_id: v || null, tipo: md?.tipo ?? f.tipo, conteudo: md?.conteudo ?? f.conteudo, titulo: f.titulo || (md?.nome ?? "") });
            }}>
              <SelectTrigger><SelectValue placeholder="(Opcional)" /></SelectTrigger>
              <SelectContent>{modelos.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1 sm:col-span-2"><Label>Título *</Label><Input required value={f.titulo} onChange={e => set({ ...f, titulo: e.target.value })} /></div>
            <div className="space-y-1"><Label>Tipo</Label>
              <Select value={f.tipo} onValueChange={v => set({ ...f, tipo: v as Tipo })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(TIPO_LABEL) as Tipo[]).map(t => <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Paciente</Label>
              <PatientSearchInput
                value={pacienteSel && pacienteSel.id === f.paciente_id ? pacienteSel : (f.paciente_id ? { id: f.paciente_id, nome: "", cpf: null, telefone: null, data_nascimento: null, clinica_id: clinicaAtual?.clinica_id ?? "" } : null)}
                onSelect={(p) => {
                  setPacienteSel(p);
                  if (p) cachePacienteNome(p.id, p.nome);
                  set({ ...f, paciente_id: p?.id ?? null });
                }}
                placeholder="Digite nome, CPF, pasta ou nascimento…"
              />
            </div>
            <div className="space-y-1"><Label>Profissional</Label>
              <Select value={f.medico_id ?? ""} onValueChange={v => set({ ...f, medico_id: v || null })}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>{medicos.map((m) => <SelectItem key={m.id} value={m.id} className="uppercase">{m.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1"><Label>Conteúdo *</Label><Textarea rows={8} required value={f.conteudo} onChange={e => set({ ...f, conteudo: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.assinado} onCheckedChange={v => set({ ...f, assinado: !!v })} /> Assinado digitalmente</label>
        </div>
      )}
    />
  );
}