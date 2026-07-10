import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Pencil, HeartPulse, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { SectionTabs, SERVICOS_TABS, SERVICOS_META } from "@/components/section-tabs";

export const Route = createFileRoute("/_authenticated/app/enfermagem-recursos")({
  component: EnfermagemRecursosPage,
  head: () => ({ meta: [{ title: "Enfermagem — Recursos — ClinicaOS" }] }),
});

type Recurso = {
  id: string;
  nome: string;
  descricao: string | null;
  duracao_padrao_min: number;
  ativo: boolean;
};
type Procedimento = { id: string; nome: string };

const emptyForm = () => ({
  nome: "",
  descricao: "",
  duracao_padrao_min: "30",
  ativo: true,
  procedimentos: [] as string[],
});

async function fetchAllProcedimentos(clinicaId: string): Promise<Procedimento[]> {
  const pageSize = 1000;
  const all: Procedimento[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("procedimentos")
      .select("id, nome")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true)
      .order("nome")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as Procedimento[];
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}

function EnfermagemRecursosPage() {
  const { clinicaAtual } = useClinica();
  const [recursos, setRecursos] = useState<Recurso[]>([]);
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [busca, setBusca] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!clinicaAtual) return;
    const { data } = await supabase
      .from("enfermagem_recursos")
      .select("id, nome, descricao, duracao_padrao_min, ativo")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("nome");
    setRecursos((data as Recurso[]) ?? []);
  };

  useEffect(() => {
    void load();
    if (clinicaAtual) {
      fetchAllProcedimentos(clinicaAtual.clinica_id)
        .then(setProcedimentos)
        .catch(() => toast.error("Não foi possível carregar os serviços."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaAtual?.clinica_id]);

  const openNovo = () => {
    setEditingId(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = async (r: Recurso) => {
    setEditingId(r.id);
    const { data: vincs } = await supabase
      .from("enfermagem_recurso_procedimentos")
      .select("procedimento_id")
      .eq("recurso_id", r.id);
    setForm({
      nome: r.nome,
      descricao: r.descricao ?? "",
      duracao_padrao_min: String(r.duracao_padrao_min ?? 30),
      ativo: r.ativo,
      procedimentos: (vincs ?? []).map((v: any) => v.procedimento_id),
    });
    setOpen(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    if (!form.nome.trim()) { toast.error("Informe o nome"); return; }
    const dur = parseInt(form.duracao_padrao_min || "30", 10);
    if (!Number.isFinite(dur) || dur <= 0 || dur > 480) {
      toast.error("Duração inválida (1–480 min)"); return;
    }
    setSaving(true);
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      nome: form.nome.trim(),
      descricao: form.descricao.trim() || null,
      duracao_padrao_min: dur,
      ativo: form.ativo,
    };
    let recursoId = editingId;
    if (editingId) {
      const { error } = await supabase
        .from("enfermagem_recursos").update(payload).eq("id", editingId);
      if (error) { setSaving(false); mostrarErro(error); return; }
      await supabase
        .from("enfermagem_recurso_procedimentos").delete().eq("recurso_id", editingId);
    } else {
      const { data: novo, error } = await supabase
        .from("enfermagem_recursos").insert(payload).select("id").single();
      if (error || !novo) { setSaving(false); mostrarErro(error); return; }
      recursoId = novo.id;
    }
    const procs = Array.from(new Set(form.procedimentos.filter(Boolean)));
    if (recursoId && procs.length) {
      const rows = procs.map((pid) => ({ recurso_id: recursoId!, procedimento_id: pid }));
      const { error: e2 } = await supabase
        .from("enfermagem_recurso_procedimentos").insert(rows);
      if (e2) { setSaving(false); mostrarErro(e2); return; }
    }
    setSaving(false);
    toast.success(editingId ? "Recurso atualizado" : "Recurso criado");
    setOpen(false);
    await load();
  };

  const remover = async (r: Recurso) => {
    if (!confirm(`Excluir "${r.nome}"? Agendamentos existentes ficarão sem recurso vinculado.`)) return;
    const { error } = await supabase.from("enfermagem_recursos").delete().eq("id", r.id);
    if (error) { mostrarErro(error); return; }
    toast.success("Removido");
    await load();
  };

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return recursos;
    return recursos.filter((r) => r.nome.toLowerCase().includes(q));
  }, [recursos, busca]);

  if (!clinicaAtual) {
    return <p className="text-muted-foreground">Selecione uma clínica primeiro.</p>;
  }

  return (
    <div className="space-y-6">
      <SectionTabs title={SERVICOS_META.title} icon={SERVICOS_META.icon} tabs={SERVICOS_TABS} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <HeartPulse className="h-6 w-6" /> Recursos de Enfermagem
          </h1>
          <p className="text-sm text-muted-foreground">
            Salas e exames realizados pela equipe de enfermagem — agendas compartilhadas entre todos os enfermeiros.
          </p>
        </div>
        <Button onClick={openNovo}>
          <Plus className="h-4 w-4 mr-2" /> Novo recurso
        </Button>
      </div>

      {recursos.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <HeartPulse className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Nenhum recurso cadastrado.
        </CardContent></Card>
      ) : (
        <Card>
          <div className="p-3 border-b">
            <Input placeholder="Buscar..." value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-md" />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="w-32">Duração</TableHead>
                <TableHead className="w-24">Ativo</TableHead>
                <TableHead className="w-24 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.nome}</TableCell>
                  <TableCell>{r.duracao_padrao_min} min</TableCell>
                  <TableCell>{r.ativo ? "Sim" : "Não"}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="icon" variant="ghost" onClick={() => void openEdit(r)} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => void remover(r)} aria-label="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar recurso" : "Novo recurso"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <Label>Nome *</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <Label>Duração padrão (min)</Label>
                <Input
                  type="number"
                  min={1}
                  max={480}
                  value={form.duracao_padrao_min}
                  onChange={(e) => setForm({ ...form, duracao_padrao_min: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} id="ativo" />
              <Label htmlFor="ativo">Recurso ativo (aparece na agenda)</Label>
            </div>
            <div className="border rounded-md p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Serviços que este recurso realiza</Label>
                  <p className="text-xs text-muted-foreground">Adicione os serviços/exames realizados por este recurso.</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={procedimentos.length === 0}
                  onClick={() => setForm({ ...form, procedimentos: [...form.procedimentos, ""] })}
                >
                  <Plus className="h-4 w-4 mr-1" /> Adicionar serviço
                </Button>
              </div>
              {procedimentos.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum serviço cadastrado na clínica.</p>
              ) : form.procedimentos.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum serviço selecionado.</p>
              ) : (
                <div className="space-y-2">
                  {form.procedimentos
                    .map((pid, idx) => {
                      const p = procedimentos.find((pp) => pp.id === pid);
                      return { pid, idx, label: p?.nome ?? "" };
                    })
                    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }))
                    .map(({ pid, idx }) => (
                      <div key={idx} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                        <SearchableSelect
                          options={procedimentos.map((p) => ({ value: p.id, label: p.nome }))}
                          value={pid}
                          onChange={(v) => {
                            if (v && form.procedimentos.some((x, i) => i !== idx && x === v)) {
                              toast.warning("Serviço já adicionado");
                              return;
                            }
                            setForm({
                              ...form,
                              procedimentos: form.procedimentos.map((x, i) => (i === idx ? v : x)),
                            });
                          }}
                          placeholder="Selecione"
                          searchPlaceholder="Buscar serviço..."
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            setForm({
                              ...form,
                              procedimentos: form.procedimentos.filter((_, i) => i !== idx),
                            })
                          }
                          aria-label="Remover serviço"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}