import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MapPin, Plus, Pencil, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/unidades")({
  component: UnidadesPage,
  head: () => ({ meta: [{ title: "Unidades — ClinicaOS" }] }),
});

interface Unidade {
  id: string; nome: string; endereco: string | null; cidade: string | null;
  estado: string | null; cep: string | null; telefone: string | null;
  latitude: number | null; longitude: number | null; raio_metros: number | null; ativo: boolean;
}

function UnidadesPage() {
  const { clinicaAtual } = useClinica();
  const [rows, setRows] = useState<Unidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Unidade | null>(null);
  const [form, setForm] = useState({
    nome: "", endereco: "", cidade: "", estado: "", cep: "", telefone: "",
    latitude: "", longitude: "", raio_metros: "200", ativo: true,
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!clinicaAtual) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("unidades")
      .select("*")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("nome");
    if (error) toast.error(error.message);
    else setRows((data ?? []) as Unidade[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [clinicaAtual?.clinica_id]);

  function openNew() {
    setEditing(null);
    setForm({ nome: "", endereco: "", cidade: "", estado: "", cep: "", telefone: "", latitude: "", longitude: "", raio_metros: "200", ativo: true });
    setOpen(true);
  }
  function openEdit(u: Unidade) {
    setEditing(u);
    setForm({
      nome: u.nome, endereco: u.endereco ?? "", cidade: u.cidade ?? "",
      estado: u.estado ?? "", cep: u.cep ?? "", telefone: u.telefone ?? "",
      latitude: u.latitude?.toString() ?? "", longitude: u.longitude?.toString() ?? "",
      raio_metros: u.raio_metros?.toString() ?? "200", ativo: u.ativo,
    });
    setOpen(true);
  }

  async function salvar() {
    if (!clinicaAtual) { toast.error("Selecione uma clínica"); return; }
    if (!form.nome.trim()) { toast.error("Informe o nome"); return; }
    setSaving(true);
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      nome: form.nome.trim(),
      endereco: form.endereco.trim() || null,
      cidade: form.cidade.trim() || null,
      estado: form.estado.trim() || null,
      cep: form.cep.trim() || null,
      telefone: form.telefone.trim() || null,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      raio_metros: form.raio_metros ? Number(form.raio_metros) : 200,
      ativo: form.ativo,
    };
    const { error } = editing
      ? await supabase.from("unidades").update(payload).eq("id", editing.id)
      : await supabase.from("unidades").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Unidade atualizada" : "Unidade criada");
    setOpen(false);
    void load();
  }

  async function usarMinhaLocalizacao() {
    if (!navigator.geolocation) { toast.error("Geolocalização indisponível"); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setForm(f => ({ ...f, latitude: p.coords.latitude.toString(), longitude: p.coords.longitude.toString() })),
      () => toast.error("Não foi possível obter localização"),
    );
  }

  const filtered = rows.filter(r => r.nome.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <MapPin className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-xl font-bold">Unidades</h1>
          <p className="text-sm text-muted-foreground">Unidades físicas da clínica (para ponto e atendimento).</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova</Button>
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Endereço</TableHead>
              <TableHead className="w-32">Cidade/UF</TableHead>
              <TableHead className="w-24">Situação</TableHead>
              <TableHead className="w-20 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Nenhuma unidade cadastrada.</TableCell></TableRow>
            ) : filtered.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.nome}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.endereco ?? "-"}</TableCell>
                <TableCell className="text-sm">{[r.cidade, r.estado].filter(Boolean).join("/") || "-"}</TableCell>
                <TableCell><Badge variant={r.ativo ? "default" : "secondary"}>{r.ativo ? "Ativa" : "Inativa"}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Editar unidade" : "Nova unidade"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div>
              <Label>Endereço</Label>
              <Input value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Cidade</Label><Input value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} /></div>
              <div><Label>UF</Label><Input maxLength={2} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value.toUpperCase() })} /></div>
              <div><Label>CEP</Label><Input value={form.cep} onChange={e => setForm({ ...form, cep: e.target.value })} /></div>
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} />
            </div>
            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <Label>Geolocalização (para bater ponto)</Label>
                <Button type="button" size="sm" variant="outline" onClick={usarMinhaLocalizacao}>Usar minha localização</Button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">Latitude</Label><Input value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })} /></div>
                <div><Label className="text-xs">Longitude</Label><Input value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })} /></div>
                <div><Label className="text-xs">Raio (m)</Label><Input type="number" value={form.raio_metros} onChange={e => setForm({ ...form, raio_metros: e.target.value })} /></div>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} />
              Ativa
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}