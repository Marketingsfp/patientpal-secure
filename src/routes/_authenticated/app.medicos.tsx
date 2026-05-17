import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, Stethoscope, Pencil, Download, Trash2 } from "lucide-react";
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
interface Procedimento { id: string; nome: string; grupo: string | null; tipo: string; valor_padrao: number }
interface ConvenioRow {
  id?: string;
  nome: string;
  tipo_repasse: "percentual" | "valor";
  percentual: string;
  valor: string;
  ativo: boolean;
}

const CONVENIOS_PADRAO: ConvenioRow[] = [
  { nome: "Cartão Consulta", tipo_repasse: "percentual", percentual: "50", valor: "", ativo: true },
  { nome: "Cartão Desconto", tipo_repasse: "percentual", percentual: "50", valor: "", ativo: true },
];

function MedicosPage() {
  const { clinicaAtual } = useClinica();
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [esps, setEsps] = useState<Especialidade[]>([]);
  const [procs, setProcs] = useState<Procedimento[]>([]);
  const [procFilter, setProcFilter] = useState("");
  const [procGrupo, setProcGrupo] = useState<string>("__todos__");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [espFilter, setEspFilter] = useState("");
  const [busca, setBusca] = useState("");
  const [convenios, setConvenios] = useState<ConvenioRow[]>(CONVENIOS_PADRAO);
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

  useEffect(() => {
    if (!clinicaAtual) return;
    supabase
      .from("procedimentos")
      .select("id, nome, grupo, tipo, valor_padrao")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("ativo", true)
      .order("nome")
      .then(({ data }) => setProcs((data as Procedimento[]) ?? []));
  }, [clinicaAtual?.clinica_id]);

  const resetForm = () => {
    setEditId(null);
    setConvenios(CONVENIOS_PADRAO.map((c) => ({ ...c })));
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

  const openEdit = async (m: Medico) => {
    setEditId(m.id);
    const { data: convs } = await supabase
      .from("medico_convenios")
      .select("id, nome, tipo_repasse, percentual, valor, ativo")
      .eq("medico_id", m.id)
      .order("created_at");
    if (convs && convs.length) {
      setConvenios(convs.map((c) => ({
        id: c.id,
        nome: c.nome,
        tipo_repasse: (c.tipo_repasse as "percentual" | "valor") ?? "percentual",
        percentual: c.percentual != null ? String(c.percentual) : "",
        valor: c.valor != null ? String(c.valor) : "",
        ativo: c.ativo ?? true,
      })));
    } else {
      setConvenios(CONVENIOS_PADRAO.map((c) => ({ ...c })));
    }
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
    if (medicoId) {
      await supabase.from("medico_convenios").delete().eq("medico_id", medicoId);
      const convRows = convenios
        .filter((c) => c.nome.trim())
        .map((c) => ({
          medico_id: medicoId!,
          nome: c.nome.trim(),
          tipo_repasse: c.tipo_repasse,
          percentual: c.tipo_repasse === "percentual" ? parseFloat(c.percentual || "0") : 0,
          valor: c.tipo_repasse === "valor" ? parseFloat(c.valor || "0") : null,
          ativo: c.ativo,
        }));
      if (convRows.length) {
        const { error: e3 } = await supabase.from("medico_convenios").insert(convRows);
        if (e3) { setLoading(false); toast.error(e3.message); return; }
      }
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
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editId ? "Editar médico" : "Novo médico"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Tabs defaultValue="dados">
                <TabsList className="grid grid-cols-6 w-full">
                  <TabsTrigger value="dados">Dados</TabsTrigger>
                  <TabsTrigger value="especialidades">Especialidades</TabsTrigger>
                  <TabsTrigger value="contato">Contato</TabsTrigger>
                  <TabsTrigger value="endereco">Endereço</TabsTrigger>
                  <TabsTrigger value="banco">Banco</TabsTrigger>
                  <TabsTrigger value="repasse">Repasse</TabsTrigger>
                </TabsList>

                <TabsContent value="dados" className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Nome completo *</Label>
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
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>CPF</Label>
                      <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>RG</Label>
                      <Input value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Data de nascimento</Label>
                      <Input type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Nacionalidade</Label>
                      <Input value={form.nacionalidade} onChange={(e) => setForm({ ...form, nacionalidade: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Estado civil</Label>
                      <Input value={form.estado_civil} onChange={(e) => setForm({ ...form, estado_civil: e.target.value })} />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="especialidades" className="space-y-2 pt-4">
                  <Label>Especialidades</Label>
                  <Input
                    placeholder="Filtrar especialidade..."
                    value={espFilter}
                    onChange={(e) => setEspFilter(e.target.value)}
                    className="h-8"
                  />
                  <div className="border rounded-md p-3 max-h-80 overflow-y-auto space-y-2">
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
                </TabsContent>

                <TabsContent value="contato" className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>E-mail</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
                  </div>
                </TabsContent>

                <TabsContent value="endereco" className="space-y-4 pt-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>CEP</Label>
                      <Input value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Logradouro</Label>
                      <Input value={form.logradouro} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Número</Label>
                      <Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Complemento</Label>
                      <Input value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Bairro</Label>
                      <Input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Cidade</Label>
                      <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>UF</Label>
                      <Input maxLength={2} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })} />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="banco" className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Banco</Label>
                      <Input value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Agência</Label>
                      <Input value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Conta</Label>
                      <Input value={form.conta} onChange={(e) => setForm({ ...form, conta: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Chave PIX</Label>
                      <Input value={form.pix_chave} onChange={(e) => setForm({ ...form, pix_chave: e.target.value })} />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="repasse" className="space-y-4 pt-4">
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
                  <div className="pt-4 border-t space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Convênios / Procedimentos</Label>
                        <p className="text-xs text-muted-foreground">Cartão Consulta, Cartão Desconto, fimose e outros procedimentos.</p>
                      </div>
                      <Button type="button" size="sm" variant="outline"
                        onClick={() => setConvenios((cs) => [...cs, { nome: "", tipo_repasse: "percentual", percentual: "50", valor: "", ativo: true }])}>
                        <Plus className="h-4 w-4 mr-1" /> Adicionar
                      </Button>
                    </div>
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {convenios.map((c, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 items-end border rounded-md p-2">
                          <div className="col-span-5 space-y-1">
                            <Label className="text-xs">Nome</Label>
                            <Input value={c.nome} placeholder="Ex: Fimose"
                              onChange={(e) => setConvenios((cs) => cs.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} />
                          </div>
                          <div className="col-span-3 space-y-1">
                            <Label className="text-xs">Tipo</Label>
                            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                              value={c.tipo_repasse}
                              onChange={(e) => setConvenios((cs) => cs.map((x, j) => j === i ? { ...x, tipo_repasse: e.target.value as "percentual" | "valor" } : x))}>
                              <option value="percentual">% Percentual</option>
                              <option value="valor">R$ Valor</option>
                            </select>
                          </div>
                          <div className="col-span-3 space-y-1">
                            <Label className="text-xs">{c.tipo_repasse === "percentual" ? "%" : "R$"}</Label>
                            <Input type="number" step="0.01" min={0}
                              value={c.tipo_repasse === "percentual" ? c.percentual : c.valor}
                              onChange={(e) => setConvenios((cs) => cs.map((x, j) => j === i ? (c.tipo_repasse === "percentual" ? { ...x, percentual: e.target.value } : { ...x, valor: e.target.value }) : x))} />
                          </div>
                          <div className="col-span-1">
                            <Button type="button" size="icon" variant="ghost"
                              onClick={() => setConvenios((cs) => cs.filter((_, j) => j !== i))} aria-label="Remover">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {convenios.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">Nenhum convênio. Clique em "Adicionar".</p>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
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