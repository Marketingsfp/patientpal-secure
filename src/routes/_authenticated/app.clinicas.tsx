import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { CheckCircle2, Pencil, Plus, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/app/clinicas")({
  component: ClinicasPage,
  head: () => ({ meta: [{ title: "Clínicas — ClinicaOS" }] }),
});

function ClinicasPage() {
  const { user } = useAuth();
  const { memberships, refresh, setClinicaAtual } = useClinica();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", cnpj: "", cidade: "", estado: "", telefone: "" });

  const resetForm = () => {
    setEditingId(null);
    setForm({ nome: "", cnpj: "", cidade: "", estado: "", telefone: "" });
  };

  const openNew = () => {
    resetForm();
    setOpen(true);
  };

  const selectClinica = (clinicaId: string) => {
    setClinicaAtual(clinicaId);
    toast.success("Clínica selecionada");
  };

  const openEdit = async (clinicaId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clinicas")
      .select("nome, cnpj, cidade, estado, telefone")
      .eq("id", clinicaId)
      .single();
    setLoading(false);
    if (error || !data) { toast.error(error?.message ?? "Erro ao carregar clínica"); return; }
    setEditingId(clinicaId);
    setForm({
      nome: data.nome ?? "",
      cnpj: data.cnpj ?? "",
      cidade: data.cidade ?? "",
      estado: data.estado ?? "",
      telefone: data.telefone ?? "",
    });
    setOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    if (editingId) {
      const { error } = await supabase
        .from("clinicas")
        .update({
          nome: form.nome.trim(),
          cnpj: form.cnpj.trim() || null,
          telefone: form.telefone.trim() || null,
          cidade: form.cidade.trim() || null,
          estado: form.estado.trim() || null,
        })
        .eq("id", editingId);
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Clínica atualizada!");
      setOpen(false);
      resetForm();
      await refresh();
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
    setOpen(false);
    resetForm();
    await refresh();
    setClinicaAtual(clinicaId as unknown as string);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clínicas</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas unidades</p>
        </div>
        <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetForm(); }}>
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
                <div className="space-y-2">
                  <Label>CNPJ</Label>
                  <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-2">
                  <Label>Cidade</Label>
                  <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>UF</Label>
                  <Input maxLength={2} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })} />
                </div>
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
          {memberships.map((m) => (
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
                    <Badge variant="secondary" className="mt-2 capitalize">{m.role}</Badge>
                  </div>
                </div>
                <div className="mt-5 flex gap-2">
                  <Button className="flex-1" variant="secondary" onClick={() => selectClinica(m.clinica_id)}>
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Selecionar
                  </Button>
                  <Button variant="outline" onClick={() => openEdit(m.clinica_id)} disabled={loading}>
                    <Pencil className="h-4 w-4 mr-2" /> Editar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}