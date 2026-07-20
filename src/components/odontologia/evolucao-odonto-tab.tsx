import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { formatDatePura } from "@/lib/date-utils";

interface Evolucao {
  id: string;
  data: string;
  titulo: string | null;
  descricao: string;
  procedimento: string | null;
  dentes: number[] | null;
  created_at: string;
}

export function EvolucaoOdontoTab({ pacienteId, readOnly = false }: { pacienteId: string; readOnly?: boolean }) {
  const { clinicaAtual } = useClinica();
  const [rows, setRows] = useState<Evolucao[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    data: new Date().toISOString().slice(0, 10),
    titulo: "",
    descricao: "",
    procedimento: "",
    dentes: "",
  });

  useEffect(() => {
    if (!clinicaAtual || !pacienteId) return;
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pacienteId, clinicaAtual?.clinica_id]);

  async function carregar() {
    if (!clinicaAtual) return;
    const { data } = await supabase
      .from("odonto_evolucoes")
      .select("id, data, titulo, descricao, procedimento, dentes, created_at")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("paciente_id", pacienteId)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false });
    setRows((data as Evolucao[]) ?? []);
  }

  async function salvar() {
    if (!clinicaAtual || !form.descricao.trim()) {
      toast.error("Descrição obrigatória"); return;
    }
    setSaving(true);
    const dentesArr = form.dentes
      .split(/[,\s]+/).filter(Boolean).map(n => Number(n)).filter(n => Number.isFinite(n));
    const { error } = await supabase.from("odonto_evolucoes").insert({
      clinica_id: clinicaAtual.clinica_id,
      paciente_id: pacienteId,
      data: form.data,
      titulo: form.titulo || null,
      descricao: form.descricao.trim(),
      procedimento: form.procedimento || null,
      dentes: dentesArr.length ? dentesArr : null,
    });
    setSaving(false);
    if (error) return mostrarErro(error);
    toast.success("Evolução registrada");
    setForm({ data: new Date().toISOString().slice(0, 10), titulo: "", descricao: "", procedimento: "", dentes: "" });
    setOpen(false);
    void carregar();
  }

  async function excluir(id: string) {
    if (!confirm("Excluir esta evolução?")) return;
    const { error } = await supabase.from("odonto_evolucoes").delete().eq("id", id);
    if (error) return mostrarErro(error);
    toast.success("Evolução excluída");
    void carregar();
  }

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />Nova evolução</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova evolução clínica</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Data</Label><Input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></div>
                  <div><Label>Dentes (separar por vírgula)</Label><Input value={form.dentes} onChange={e => setForm({ ...form, dentes: e.target.value })} placeholder="ex.: 11, 12, 21" /></div>
                </div>
                <div><Label>Título</Label><Input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Resumo curto" /></div>
                <div><Label>Procedimento</Label><Input value={form.procedimento} onChange={e => setForm({ ...form, procedimento: e.target.value })} /></div>
                <div><Label>Descrição *</Label><Textarea rows={4} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={salvar} disabled={saving}>Registrar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground border rounded-md">
          <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Nenhuma evolução registrada.
        </div>
      ) : (
        <ol className="relative border-l border-muted ml-3 space-y-4">
          {rows.map(r => (
            <li key={r.id} className="ml-6">
              <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary" />
              <div className="border rounded-md p-3 bg-card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">{formatDatePura(r.data)}</p>
                    {r.titulo && <p className="font-medium">{r.titulo}</p>}
                    {r.procedimento && <p className="text-sm text-primary">{r.procedimento}</p>}
                    {r.dentes && r.dentes.length > 0 && (
                      <p className="text-xs text-muted-foreground">Dentes: {r.dentes.join(", ")}</p>
                    )}
                  </div>
                  {!readOnly && (
                    <Button size="icon" variant="ghost" onClick={() => excluir(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
                <p className="text-sm mt-2 whitespace-pre-wrap">{r.descricao}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}