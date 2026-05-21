import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MapPin, Plus, Pencil, Search, Building2, CheckCircle2 } from "lucide-react";
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
  const [tab, setTab] = useState<string>("clinicas");

  // default to "fisicas" once there's a selected clinica
  useEffect(() => {
    if (clinicaAtual) setTab((prev) => (prev === "clinicas" ? "fisicas" : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <MapPin className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-xl font-bold">Unidades</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie suas clínicas (entidades) e as unidades físicas de cada clínica.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="clinicas">Clínicas</TabsTrigger>
          <TabsTrigger value="fisicas" disabled={!clinicaAtual}>Unidades físicas</TabsTrigger>
        </TabsList>
        <TabsContent value="clinicas" className="mt-4">
          <ClinicasTab />
        </TabsContent>
        <TabsContent value="fisicas" className="mt-4">
          <UnidadesFisicasTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================== Clínicas ============================== */

function ClinicasTab() {
  const { user } = useAuth();
  const { memberships, refresh, setClinicaAtual, clinicaAtual } = useClinica();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", cnpj: "", cidade: "", estado: "", telefone: "" });

  const resetForm = () => {
    setEditingId(null);
    setForm({ nome: "", cnpj: "", cidade: "", estado: "", telefone: "" });
  };
  const openNew = () => { resetForm(); setOpen(true); };

  const selectClinica = (id: string) => { setClinicaAtual(id); toast.success("Clínica selecionada"); };

  const openEdit = async (id: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clinicas")
      .select("nome, cnpj, cidade, estado, telefone")
      .eq("id", id).single();
    setLoading(false);
    if (error || !data) { toast.error(error?.message ?? "Erro ao carregar clínica"); return; }
    setEditingId(id);
    setForm({
      nome: data.nome ?? "", cnpj: data.cnpj ?? "", cidade: data.cidade ?? "",
      estado: data.estado ?? "", telefone: data.telefone ?? "",
    });
    setOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    if (editingId) {
      const { error } = await supabase.from("clinicas").update({
        nome: form.nome.trim(),
        cnpj: form.cnpj.trim() || null,
        telefone: form.telefone.trim() || null,
        cidade: form.cidade.trim() || null,
        estado: form.estado.trim() || null,
      }).eq("id", editingId);
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Clínica atualizada!");
      setOpen(false); resetForm(); await refresh();
      return;
    }
    const { data: clinicaId, error } = await supabase.rpc("criar_clinica_com_admin", {
      _nome: form.nome.trim(),
      _cnpj: form.cnpj.trim() || undefined,
      _telefone: form.telefone.trim() || undefined,
      _cidade: form.cidade.trim() || undefined,
      _estado: form.estado.trim() || undefined,
    });
    setLoading(false);
    if (error || !clinicaId) { toast.error(error?.message ?? "Erro ao criar clínica"); return; }
    toast.success("Clínica criada!");
    setOpen(false); resetForm(); await refresh();
    setClinicaAtual(clinicaId as unknown as string);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={(n) => { setOpen(n); if (!n) resetForm(); }}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Nova clínica</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? "Editar clínica" : "Nova clínica"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>CNPJ</Label>
                  <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} /></div>
                <div className="space-y-2"><Label>Telefone</Label>
                  <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-2"><Label>Cidade</Label>
                  <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></div>
                <div className="space-y-2"><Label>UF</Label>
                  <Input maxLength={2} value={form.estado}
                    onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })} /></div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={loading}>{loading ? "Salvando..." : editingId ? "Salvar" : "Criar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {memberships.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Nenhuma clínica ainda. Clique em <strong>Nova clínica</strong> para começar.
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {memberships.map((m) => {
            const ativa = clinicaAtual?.clinica_id === m.clinica_id;
            return (
              <Card key={m.id} className="transition-shadow hover:shadow-md">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold truncate">{m.clinica.nome}</h3>
                      {(m.clinica.cidade || m.clinica.estado) && (
                        <p className="text-sm text-muted-foreground truncate">
                          {[m.clinica.cidade, m.clinica.estado].filter(Boolean).join(" / ")}
                        </p>
                      )}
                      <div className="mt-2 flex gap-2">
                        <Badge variant="secondary" className="capitalize">{m.role}</Badge>
                        {ativa && <Badge>Atual</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 flex gap-2">
                    <Button className="flex-1" variant="secondary" onClick={() => selectClinica(m.clinica_id)} disabled={ativa}>
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Selecionar
                    </Button>
                    <Button variant="outline" onClick={() => openEdit(m.clinica_id)} disabled={loading}>
                      <Pencil className="h-4 w-4 mr-2" /> Editar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ========================== Unidades físicas ========================== */

function UnidadesFisicasTab() {
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
      .from("unidades").select("*")
      .eq("clinica_id", clinicaAtual.clinica_id).order("nome");
    if (error) toast.error(error.message);
    else setRows((data ?? []) as Unidade[]);
    setLoading(false);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clinicaAtual?.clinica_id]);

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

  if (!clinicaAtual) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">
      Selecione uma clínica na aba <strong>Clínicas</strong> para gerenciar suas unidades físicas.
    </CardContent></Card>;
  }

  const filtered = rows.filter(r => r.nome.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova unidade física</Button>
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
            <div><Label>Nome *</Label>
              <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
            <div><Label>Endereço</Label>
              <Input value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Cidade</Label><Input value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} /></div>
              <div><Label>UF</Label><Input maxLength={2} value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value.toUpperCase() })} /></div>
              <div><Label>CEP</Label><Input value={form.cep} onChange={e => setForm({ ...form, cep: e.target.value })} /></div>
            </div>
            <div><Label>Telefone</Label>
              <Input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} /></div>
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
