import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
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
import { Badge } from "@/components/ui/badge";
import { MapPin, Plus, Pencil, Building2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";

const somenteDigitos = (value: string) => value.replace(/\D/g, "");
const formatarCnpj = (value: string) => {
  const d = somenteDigitos(value).slice(0, 14);
  if (d.length > 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length > 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  if (d.length > 5) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length > 2) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return d;
};
const formatarTelefone = (value: string) => {
  const d = somenteDigitos(value).slice(0, 11);
  if (d.length > 10) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length > 6) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length > 2) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return d.length ? `(${d}` : "";
};
const formatarCep = (value: string) => {
  const d = somenteDigitos(value).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

export const Route = createFileRoute("/_authenticated/app/unidades")({
  component: UnidadesPage,
  head: () => ({ meta: [{ title: "Unidades — ClinicaOS" }] }),
});

function UnidadesPage() {
  return (
    <div className="space-y-4 max-w-full">
      <div className="flex items-center gap-3">
        <MapPin className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-xl font-bold">Unidades</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre suas unidades com endereço e geolocalização para bater ponto.
          </p>
        </div>
      </div>

      <ClinicasTab />
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
  const [form, setForm] = useState({
    nome: "", cnpj: "", endereco: "", cidade: "", estado: "", cep: "", telefone: "",
    latitude: "", longitude: "", raio_metros: "200", ativo: true,
  });

  const resetForm = () => {
    setEditingId(null);
    setForm({
      nome: "", cnpj: "", endereco: "", cidade: "", estado: "", cep: "", telefone: "",
      latitude: "", longitude: "", raio_metros: "200", ativo: true,
    });
  };
  const openNew = () => { resetForm(); setOpen(true); };

  const selectClinica = (id: string) => { setClinicaAtual(id); toast.success("Clínica selecionada"); };

  const openEdit = async (id: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clinicas")
      .select("nome, cnpj, endereco, cidade, estado, cep, telefone, latitude, longitude, raio_metros, ativo")
      .eq("id", id).single();
    setLoading(false);
    if (error || !data) { mostrarErro(error); return; }
    setEditingId(id);
    setForm({
      nome: data.nome ?? "",
      cnpj: formatarCnpj(data.cnpj ?? ""),
      endereco: (data as any).endereco ?? "",
      cidade: data.cidade ?? "",
      estado: data.estado ?? "",
      cep: formatarCep((data as any).cep ?? ""),
      telefone: formatarTelefone(data.telefone ?? ""),
      latitude: (data as any).latitude?.toString() ?? "",
      longitude: (data as any).longitude?.toString() ?? "",
      raio_metros: (data as any).raio_metros?.toString() ?? "200",
      ativo: (data as any).ativo ?? true,
    });
    setOpen(true);
  };

  async function usarMinhaLocalizacao() {
    if (!navigator.geolocation) { toast.error("Geolocalização indisponível"); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setForm((f) => ({
        ...f,
        latitude: p.coords.latitude.toString(),
        longitude: p.coords.longitude.toString(),
      })),
      () => toast.error("Não foi possível obter localização"),
    );
  }

  const extras = () => ({
    endereco: form.endereco.trim() || null,
    cep: form.cep.trim() ? somenteDigitos(form.cep) : null,
    latitude: form.latitude ? Number(form.latitude) : null,
    longitude: form.longitude ? Number(form.longitude) : null,
    raio_metros: form.raio_metros ? Number(form.raio_metros) : 200,
    ativo: form.ativo,
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    if (editingId) {
      const { error } = await supabase.from("clinicas").update({
        nome: form.nome.trim(),
        cnpj: form.cnpj.trim() ? somenteDigitos(form.cnpj) : null,
        telefone: form.telefone.trim() ? somenteDigitos(form.telefone) : null,
        cidade: form.cidade.trim() || null,
        estado: form.estado.trim() || null,
        ...extras(),
      }).eq("id", editingId);
      setLoading(false);
      if (error) { mostrarErro(error); return; }
      toast.success("Clínica atualizada!");
      setOpen(false); resetForm(); await refresh();
      return;
    }
    const { data: clinicaId, error } = await supabase.rpc("criar_clinica_com_admin", {
      _nome: form.nome.trim(),
      _cnpj: form.cnpj.trim() ? somenteDigitos(form.cnpj) : undefined,
      _telefone: form.telefone.trim() ? somenteDigitos(form.telefone) : undefined,
      _cidade: form.cidade.trim() || undefined,
      _estado: form.estado.trim() || undefined,
    });
    if (error || !clinicaId) { mostrarErro(error); return; }
    // Persist extra fields (endereco, cep, geo, ativo) right after creation.
    const { error: updErr } = await supabase.from("clinicas").update(extras())
      .eq("id", clinicaId as unknown as string);
    setLoading(false);
    if (updErr) { mostrarErro(updErr); return; }
    toast.success("Clínica criada!");
    setOpen(false); resetForm(); await refresh();
    setClinicaAtual(clinicaId as unknown as string);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={(n) => { setOpen(n); if (!n) resetForm(); }}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Nova unidade</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? "Editar unidade" : "Nova unidade"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="unidade-nome">Nome *</Label>
                <Input id="unidade-nome" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2"><Label htmlFor="unidade-cnpj">CNPJ</Label>
                  <Input id="unidade-cnpj" inputMode="numeric" maxLength={18} placeholder="00.000.000/0000-00" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: formatarCnpj(e.target.value) })} /></div>
                <div className="space-y-2"><Label htmlFor="unidade-telefone">Telefone</Label>
                  <Input id="unidade-telefone" inputMode="tel" maxLength={15} placeholder="(00) 00000-0000" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: formatarTelefone(e.target.value) })} /></div>
              </div>
              <div className="space-y-2"><Label htmlFor="unidade-endereco">Endereço</Label>
                <Input id="unidade-endereco" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-2"><Label htmlFor="unidade-cidade">Cidade</Label>
                  <Input id="unidade-cidade" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="unidade-uf">UF</Label>
                  <Input id="unidade-uf" maxLength={2} value={form.estado}
                    onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })} /></div>
                <div className="space-y-2"><Label htmlFor="unidade-cep">CEP</Label>
                  <Input id="unidade-cep" inputMode="numeric" maxLength={9} placeholder="00000-000" value={form.cep} onChange={(e) => setForm({ ...form, cep: formatarCep(e.target.value) })} /></div>
              </div>
              <div className="border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <Label>Geolocalização (para bater ponto)</Label>
                  <Button type="button" size="sm" variant="outline" onClick={usarMinhaLocalizacao}>
                    Usar minha localização
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-2"><Label htmlFor="unidade-latitude" className="text-xs">Latitude</Label>
                    <Input id="unidade-latitude" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} /></div>
                  <div className="space-y-2"><Label htmlFor="unidade-longitude" className="text-xs">Longitude</Label>
                    <Input id="unidade-longitude" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} /></div>
                  <div className="space-y-2"><Label htmlFor="unidade-raio" className="text-xs">Raio (m)</Label>
                    <Input id="unidade-raio" type="number" value={form.raio_metros}
                      onChange={(e) => setForm({ ...form, raio_metros: e.target.value })} /></div>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.ativo}
                  onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
                Ativa
              </label>
              <DialogFooter>
                <Button type="submit" disabled={loading}>{loading ? "Salvando..." : editingId ? "Salvar" : "Criar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {memberships.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Nenhuma unidade ainda. Clique em <strong>Nova unidade</strong> para começar.
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
