import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Plus, Building2 } from "lucide-react";
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
  const [form, setForm] = useState({ nome: "", cnpj: "", cidade: "", estado: "", telefone: "" });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const { data: clinicaId, error } = await supabase.rpc("criar_clinica_com_admin", {
      _nome: form.nome,
      _cnpj: form.cnpj || undefined,
      _telefone: form.telefone || undefined,
      _cidade: form.cidade || undefined,
      _estado: form.estado || undefined,
    });
    setLoading(false);
    if (error || !clinicaId) { toast.error(error?.message ?? "Erro ao criar clínica"); return; }
    toast.success("Clínica criada!");
    setOpen(false);
    setForm({ nome: "", cnpj: "", cidade: "", estado: "", telefone: "" });
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
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Nova clínica</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova clínica</DialogTitle></DialogHeader>
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
                <Button type="submit" disabled={loading}>{loading ? "Criando..." : "Criar"}</Button>
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
            <Card key={m.id}>
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}