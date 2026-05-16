import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/medicos")({
  component: MedicosPage,
  head: () => ({ meta: [{ title: "Médicos — ClinicaOS" }] }),
});

interface Medico {
  id: string; nome: string; crm: string; crm_uf: string;
  percentual_repasse_padrao: number; ativo: boolean;
  especialidade: { nome: string } | null;
}
interface Especialidade { id: string; nome: string }

function MedicosPage() {
  const { clinicaAtual } = useClinica();
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [esps, setEsps] = useState<Especialidade[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nome: "", crm: "", crm_uf: "", especialidade_id: "", percentual: "70",
  });

  const load = async () => {
    if (!clinicaAtual) return;
    const { data } = await supabase
      .from("medicos")
      .select("id, nome, crm, crm_uf, percentual_repasse_padrao, ativo, especialidade:especialidades(nome)")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("nome");
    setMedicos((data as unknown as Medico[]) ?? []);
  };

  useEffect(() => {
    void load();
    supabase.from("especialidades").select("id, nome").order("nome").then(({ data }) => setEsps(data ?? []));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [clinicaAtual?.clinica_id]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    setLoading(true);
    const { error } = await supabase.from("medicos").insert({
      clinica_id: clinicaAtual.clinica_id,
      nome: form.nome,
      crm: form.crm,
      crm_uf: form.crm_uf.toUpperCase(),
      especialidade_id: form.especialidade_id || null,
      percentual_repasse_padrao: parseFloat(form.percentual),
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Médico cadastrado!");
    setOpen(false);
    setForm({ nome: "", crm: "", crm_uf: "", especialidade_id: "", percentual: "70" });
    void load();
  };

  if (!clinicaAtual) {
    return <p className="text-muted-foreground">Selecione uma clínica primeiro.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Médicos</h1>
          <p className="text-sm text-muted-foreground">{clinicaAtual.clinica.nome}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Novo médico</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo médico</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-2">
                  <Label>CRM *</Label>
                  <Input required value={form.crm} onChange={(e) => setForm({ ...form, crm: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>UF *</Label>
                  <Input required maxLength={2} value={form.crm_uf} onChange={(e) => setForm({ ...form, crm_uf: e.target.value.toUpperCase() })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Especialidade</Label>
                <Select value={form.especialidade_id} onValueChange={(v) => setForm({ ...form, especialidade_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {esps.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>% repasse padrão</Label>
                <Input type="number" min={0} max={100} step={0.01} value={form.percentual} onChange={(e) => setForm({ ...form, percentual: e.target.value })} />
              </div>
              <DialogFooter><Button type="submit" disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {medicos.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Nenhum médico cadastrado nesta clínica.
        </CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CRM</TableHead>
                <TableHead>Especialidade</TableHead>
                <TableHead className="text-right">% Repasse</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {medicos.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.nome}</TableCell>
                  <TableCell>{m.crm}/{m.crm_uf}</TableCell>
                  <TableCell>{m.especialidade?.nome ?? "—"}</TableCell>
                  <TableCell className="text-right">{m.percentual_repasse_padrao}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}