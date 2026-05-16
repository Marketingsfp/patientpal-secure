import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, Stethoscope, Pencil, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { exportToExcel } from "@/lib/export-csv";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  cpf?: string | null; rg?: string | null; data_nascimento?: string | null;
  email?: string | null; telefone?: string | null;
  nacionalidade?: string | null; estado_civil?: string | null;
  cep?: string | null; logradouro?: string | null; numero?: string | null;
  complemento?: string | null; bairro?: string | null; cidade?: string | null; estado?: string | null;
  banco?: string | null; agencia?: string | null; conta?: string | null; pix_chave?: string | null;
  medico_especialidades: { especialidade: { id: string; nome: string } | null }[];
}
interface Especialidade { id: string; nome: string }

function MedicosPage() {
  const { clinicaAtual } = useClinica();
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [esps, setEsps] = useState<Especialidade[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [espFilter, setEspFilter] = useState("");
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState({
    nome: "", crm: "", crm_uf: "",
    especialidades: [] as string[],
    tipo_repasse: "percentual" as "percentual" | "valor",
    percentual: "50",
    valor: "",
    cpf: "", rg: "", data_nascimento: "", email: "", telefone: "",
    nacionalidade: "Brasileira", estado_civil: "",
    cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
    banco: "", agencia: "", conta: "", pix_chave: "",
  });

  const load = async () => {
    if (!clinicaAtual) return;
    const { data } = await supabase
      .from("medicos")
      .select("id, nome, crm, crm_uf, percentual_repasse_padrao, valor_repasse_padrao, tipo_repasse, ativo, cpf, rg, data_nascimento, email, telefone, nacionalidade, estado_civil, cep, logradouro, numero, complemento, bairro, cidade, estado, banco, agencia, conta, pix_chave, medico_especialidades(especialidade:especialidades(id, nome))")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("nome");
    setMedicos((data as unknown as Medico[]) ?? []);
  };

  useEffect(() => {
    void load();
    supabase.from("especialidades").select("id, nome").order("nome").then(({ data }) => setEsps(data ?? []));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [clinicaAtual?.clinica_id]);

  const resetForm = () => {
    setEditId(null);
    setForm({
      nome: "", crm: "", crm_uf: "", especialidades: [],
      tipo_repasse: "percentual", percentual: "50", valor: "",
      cpf: "", rg: "", data_nascimento: "", email: "", telefone: "",
      nacionalidade: "Brasileira", estado_civil: "",
      cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
      banco: "", agencia: "", conta: "", pix_chave: "",
    });
  };

  const openNew = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (m: Medico) => {
    setEditId(m.id);
    setForm({
      nome: m.nome,
      crm: m.crm,
      crm_uf: m.crm_uf,
      especialidades: m.medico_especialidades?.map((me) => me.especialidade?.id).filter(Boolean) as string[],
      tipo_repasse: m.tipo_repasse,
      percentual: String(m.percentual_repasse_padrao ?? ""),
      valor: m.valor_repasse_padrao != null ? String(m.valor_repasse_padrao) : "",
      cpf: m.cpf ?? "", rg: m.rg ?? "", data_nascimento: m.data_nascimento ?? "",
      email: m.email ?? "", telefone: m.telefone ?? "",
      nacionalidade: m.nacionalidade ?? "Brasileira", estado_civil: m.estado_civil ?? "",
      cep: m.cep ?? "", logradouro: m.logradouro ?? "", numero: m.numero ?? "",
      complemento: m.complemento ?? "", bairro: m.bairro ?? "", cidade: m.cidade ?? "", estado: m.estado ?? "",
      banco: m.banco ?? "", agencia: m.agencia ?? "", conta: m.conta ?? "", pix_chave: m.pix_chave ?? "",
    });
    setOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    setLoading(true);
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      nome: form.nome,
      crm: form.crm,
      crm_uf: form.crm_uf.toUpperCase(),
      especialidade_id: form.especialidades[0] || null,
      tipo_repasse: form.tipo_repasse,
      percentual_repasse_padrao: form.tipo_repasse === "percentual" ? parseFloat(form.percentual || "0") : 0,
      valor_repasse_padrao: form.tipo_repasse === "valor" ? parseFloat(form.valor || "0") : null,
      cpf: form.cpf || null,
      rg: form.rg || null,
      data_nascimento: form.data_nascimento || null,
      email: form.email || null,
      telefone: form.telefone || null,
      nacionalidade: form.nacionalidade || null,
      estado_civil: form.estado_civil || null,
      cep: form.cep || null,
      logradouro: form.logradouro || null,
      numero: form.numero || null,
      complemento: form.complemento || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      estado: form.estado ? form.estado.toUpperCase() : null,
      banco: form.banco || null,
      agencia: form.agencia || null,
      conta: form.conta || null,
      pix_chave: form.pix_chave || null,
    };
    let medicoId = editId;
    if (editId) {
      const { error } = await supabase.from("medicos").update(payload).eq("id", editId);
      if (error) { setLoading(false); toast.error(error.message); return; }
      await supabase.from("medico_especialidades").delete().eq("medico_id", editId);
    } else {
      const { data: novo, error } = await supabase.from("medicos").insert(payload).select("id").single();
      if (error || !novo) { setLoading(false); toast.error(error?.message ?? "Erro"); return; }
      medicoId = novo.id;
    }
    if (medicoId && form.especialidades.length) {
      const rows = form.especialidades.map((eid) => ({ medico_id: medicoId!, especialidade_id: eid }));
      const { error: e2 } = await supabase.from("medico_especialidades").insert(rows);
      if (e2) { setLoading(false); toast.error(e2.message); return; }
    }
    setLoading(false);
    toast.success(editId ? "Médico atualizado!" : "Médico cadastrado!");
    setOpen(false);
    resetForm();
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

  const handleExport = () => {
    if (medicos.length === 0) { toast.info("Sem dados para exportar."); return; }
    exportToExcel(
      medicos.map((m) => ({
        nome: m.nome,
        crm: `${m.crm}/${m.crm_uf}`,
        especialidades: m.medico_especialidades?.map((me) => me.especialidade?.nome).filter(Boolean).join(", ") || "",
        repasse: fmtRepasse(m),
        ativo: m.ativo ? "Sim" : "Não",
      })),
      `medicos-${new Date().toISOString().slice(0, 10)}`,
      [
        { key: "nome", label: "Nome" },
        { key: "crm", label: "CRM" },
        { key: "especialidades", label: "Especialidades" },
        { key: "repasse", label: "Repasse" },
        { key: "ativo", label: "Ativo" },
      ],
    );
  };

  if (!clinicaAtual) {
    return <p className="text-muted-foreground">Selecione uma clínica primeiro.</p>;
  }

  const medicosFiltrados = medicos.filter((m) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    const especs = m.medico_especialidades?.map((me) => me.especialidade?.nome ?? "").join(" ").toLowerCase() ?? "";
    return (
      m.nome.toLowerCase().includes(q) ||
      `${m.crm}/${m.crm_uf}`.toLowerCase().includes(q) ||
      especs.includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Médicos</h1>
          <p className="text-sm text-muted-foreground">{clinicaAtual.clinica.nome}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" /> Exportar Excel
          </Button>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Novo médico</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? "Editar médico" : "Novo médico"}</DialogTitle></DialogHeader>
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
                <Input
                  placeholder="Filtrar especialidade..."
                  value={espFilter}
                  onChange={(e) => setEspFilter(e.target.value)}
                  className="h-8"
                />
                <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                  {esps.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma especialidade cadastrada.</p>}
                  {esps
                    .filter((e) => e.nome.toLowerCase().includes(espFilter.toLowerCase()))
                    .map((e) => (
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
      </div>

      {medicos.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Nenhum médico cadastrado nesta clínica.
        </CardContent></Card>
      ) : (
        <Card>
          <div className="p-3 border-b">
            <Input
              placeholder="Buscar por nome, CRM ou especialidade…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="max-w-md"
            />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CRM</TableHead>
                <TableHead>Especialidades</TableHead>
                <TableHead className="text-right">Repasse</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {medicosFiltrados.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.nome}</TableCell>
                  <TableCell>{m.crm}/{m.crm_uf}</TableCell>
                  <TableCell>{m.medico_especialidades?.map((me) => me.especialidade?.nome).filter(Boolean).join(", ") || "—"}</TableCell>
                  <TableCell className="text-right">{fmtRepasse(m)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(m)} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}