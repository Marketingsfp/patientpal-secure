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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/medicos")({
  component: MedicosPage,
  head: () => ({ meta: [{ title: "Médicos — ClinicaOS" }] }),
});

interface Medico {
  id: string; nome: string; crm: string; crm_uf: string;
  percentual_repasse_padrao: number;
  valor_repasse_padrao: number | null;
  tipo_repasse: "percentual" | "valor";
  ativo: boolean;
  medico_especialidades: { especialidade: { id: string; nome: string } | null }[];
}
interface Especialidade { id: string; nome: string }

function MedicosPage() {
  const { clinicaAtual } = useClinica();
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [esps, setEsps] = useState<Especialidade[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nome: "", crm: "", crm_uf: "",
    especialidades: [] as string[],
    tipo_repasse: "percentual" as "percentual" | "valor",
    percentual: "50",
    valor: "",
  });

  const load = async () => {
    if (!clinicaAtual) return;
    const { data } = await supabase
      .from("medicos")
      .select("id, nome, crm, crm_uf, percentual_repasse_padrao, valor_repasse_padrao, tipo_repasse, ativo, medico_especialidades(especialidade:especialidades(id, nome))")
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
    const { data: novo, error } = await supabase.from("medicos").insert({
      clinica_id: clinicaAtual.clinica_id,
      nome: form.nome,
      crm: form.crm,
      crm_uf: form.crm_uf.toUpperCase(),
      especialidade_id: form.especialidades[0] || null,
      tipo_repasse: form.tipo_repasse,
      percentual_repasse_padrao: form.tipo_repasse === "percentual" ? parseFloat(form.percentual || "0") : 0,
      valor_repasse_padrao: form.tipo_repasse === "valor" ? parseFloat(form.valor || "0") : null,
    }).select("id").single();
    if (error || !novo) { setLoading(false); toast.error(error?.message ?? "Erro"); return; }
    if (form.especialidades.length) {
      const rows = form.especialidades.map((eid) => ({ medico_id: novo.id, especialidade_id: eid }));
      const { error: e2 } = await supabase.from("medico_especialidades").insert(rows);
      if (e2) { setLoading(false); toast.error(e2.message); return; }
    }
    setLoading(false);
    toast.success("Médico cadastrado!");
    setOpen(false);
    setForm({ nome: "", crm: "", crm_uf: "", especialidades: [], tipo_repasse: "percentual", percentual: "50", valor: "" });
    void load();
  };

  const toggleEsp = (id: string) => {
    setForm((f) => ({
      ...f,
      especialidades: f.especialidades.includes(id)
        ? f.especialidades.filter((x) => x !== id)
        : [...f.especialidades, id],
    }));
  };

  const fmtRepasse = (m: Medico) =>
    m.tipo_repasse === "valor"
      ? `R$ ${Number(m.valor_repasse_padrao ?? 0).toFixed(2)}`
      : `${m.percentual_repasse_padrao}%`;

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
                <Label>Especialidades</Label>
                <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                  {esps.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma especialidade cadastrada.</p>}
                  {esps.map((e) => (
                    <label key={e.id} className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox
                        checked={form.especialidades.includes(e.id)}
                        onCheckedChange={() => toggleEsp(e.id)}
                      />
                      {e.nome}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tipo de repasse</Label>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="tipo_repasse" checked={form.tipo_repasse === "percentual"}
                      onChange={() => setForm({ ...form, tipo_repasse: "percentual" })} />
                    Percentual (%)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="tipo_repasse" checked={form.tipo_repasse === "valor"}
                      onChange={() => setForm({ ...form, tipo_repasse: "valor" })} />
                    Valor fixo (R$)
                  </label>
                </div>
              </div>
              {form.tipo_repasse === "percentual" ? (
                <div className="space-y-2">
                  <Label>% repasse padrão</Label>
                  <Input type="number" min={0} max={100} step={0.01} value={form.percentual}
                    onChange={(e) => setForm({ ...form, percentual: e.target.value })} />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Valor repasse padrão (R$)</Label>
                  <Input type="number" min={0} step={0.01} value={form.valor}
                    onChange={(e) => setForm({ ...form, valor: e.target.value })} />
                </div>
              )}
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
                <TableHead>Especialidades</TableHead>
                <TableHead className="text-right">Repasse</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {medicos.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.nome}</TableCell>
                  <TableCell>{m.crm}/{m.crm_uf}</TableCell>
                  <TableCell>{m.medico_especialidades?.map((me) => me.especialidade?.nome).filter(Boolean).join(", ") || "—"}</TableCell>
                  <TableCell className="text-right">{fmtRepasse(m)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}