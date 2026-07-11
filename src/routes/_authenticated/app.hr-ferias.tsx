import { createFileRoute } from "@tanstack/react-router";
import { SectionTabs, RH_TABS, RH_META } from "@/components/section-tabs";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Palmtree, Plus, Check, X } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { formatDatePura } from "@/lib/date-utils";

export const Route = createFileRoute("/_authenticated/app/hr-ferias")({
  component: FeriasPageWithTabs,
  head: () => ({ meta: [{ title: "Férias — ClinicaOS" }] }),
});

interface Contrato { id: string; funcionario_nome: string; data_admissao: string }
interface Ferias {
  id: string; contrato_id: string;
  periodo_aquisitivo_inicio: string; periodo_aquisitivo_fim: string;
  inicio: string | null; fim: string | null; dias: number | null;
  abono_pecuniario: boolean; status: string;
}

function FeriasPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("hr-ferias");
  const [rows, setRows] = useState<Ferias[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    contrato_id: "", periodo_aquisitivo_inicio: "", periodo_aquisitivo_fim: "",
    inicio: "", fim: "", dias: "30", abono_pecuniario: false,
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!clinicaAtual) return;
    setLoading(true);
    const [f, c] = await Promise.all([
      supabase.from("hr_ferias").select("*").eq("clinica_id", clinicaAtual.clinica_id).order("created_at", { ascending: false }),
      supabase.from("hr_contratos").select("id,funcionario_nome,data_admissao").eq("clinica_id", clinicaAtual.clinica_id).eq("status", "ativo").order("funcionario_nome"),
    ]);
    if (f.error) mostrarErro(f.error);
    setRows((f.data ?? []) as Ferias[]);
    setContratos((c.data ?? []) as Contrato[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [clinicaAtual?.clinica_id]);

  function openNew() {
    const hoje = new Date();
    const iniAq = new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate());
    setForm({
      contrato_id: "",
      periodo_aquisitivo_inicio: iniAq.toISOString().slice(0, 10),
      periodo_aquisitivo_fim: hoje.toISOString().slice(0, 10),
      inicio: "", fim: "", dias: "30", abono_pecuniario: false,
    });
    setOpen(true);
  }

  async function salvar() {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!clinicaAtual) return;
    if (!form.contrato_id) { toast.error("Selecione o funcionário"); return; }
    setSaving(true);
    const { error } = await supabase.from("hr_ferias").insert({
      clinica_id: clinicaAtual.clinica_id,
      contrato_id: form.contrato_id,
      periodo_aquisitivo_inicio: form.periodo_aquisitivo_inicio,
      periodo_aquisitivo_fim: form.periodo_aquisitivo_fim,
      inicio: form.inicio || null,
      fim: form.fim || null,
      dias: form.dias ? Number(form.dias) : null,
      abono_pecuniario: form.abono_pecuniario,
      status: "solicitada",
    });
    setSaving(false);
    if (error) { mostrarErro(error); return; }
    toast.success("Solicitação criada");
    setOpen(false);
    void load();
  }

  async function decidir(id: string, status: "aprovada" | "rejeitada") {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("hr_ferias").update({
      status, aprovado_por: user?.id, aprovado_em: new Date().toISOString(),
    }).eq("id", id);
    if (error) { mostrarErro(error); return; }
    toast.success("Solicitação atualizada");
    void load();
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Palmtree className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-xl font-bold">Férias</h1>
          <p className="text-sm text-muted-foreground">Solicitações e gestão de períodos de férias.</p>
        </div>
        {podeEscrever && (
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova solicitação</Button>
        )}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionário</TableHead>
              <TableHead>Período aquisitivo</TableHead>
              <TableHead>Gozo</TableHead>
              <TableHead className="w-16">Dias</TableHead>
              <TableHead className="w-20">Abono</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-32 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Nenhuma solicitação.</TableCell></TableRow>
            ) : rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{contratos.find(c => c.id === r.contrato_id)?.funcionario_nome ?? "—"}</TableCell>
                <TableCell className="text-sm">{formatDatePura(r.periodo_aquisitivo_inicio)} → {formatDatePura(r.periodo_aquisitivo_fim)}</TableCell>
                <TableCell className="text-sm">{r.inicio ? `${formatDatePura(r.inicio)} → ${formatDatePura(r.fim)}` : "—"}</TableCell>
                <TableCell>{r.dias ?? "—"}</TableCell>
                <TableCell>{r.abono_pecuniario ? "Sim" : "Não"}</TableCell>
                <TableCell><Badge variant={r.status === "aprovada" ? "default" : r.status === "rejeitada" ? "destructive" : "secondary"}>{r.status}</Badge></TableCell>
                <TableCell className="text-right space-x-1">
                  {r.status === "solicitada" && podeEscrever && (
                    <>
                      <Button size="icon" variant="ghost" onClick={() => decidir(r.id, "aprovada")}><Check className="h-4 w-4 text-emerald-600" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => decidir(r.id, "rejeitada")}><X className="h-4 w-4 text-destructive" /></Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova solicitação de férias</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Funcionário *</Label>
              <Select value={form.contrato_id} onValueChange={v => setForm({ ...form, contrato_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{contratos.map(c => <SelectItem key={c.id} value={c.id}>{c.funcionario_nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Aquisitivo início</Label><Input type="date" value={form.periodo_aquisitivo_inicio} onChange={e => setForm({ ...form, periodo_aquisitivo_inicio: e.target.value })} /></div>
              <div><Label>Aquisitivo fim</Label><Input type="date" value={form.periodo_aquisitivo_fim} onChange={e => setForm({ ...form, periodo_aquisitivo_fim: e.target.value })} /></div>
              <div><Label>Início gozo</Label><Input type="date" value={form.inicio} onChange={e => setForm({ ...form, inicio: e.target.value })} /></div>
              <div><Label>Fim gozo</Label><Input type="date" value={form.fim} onChange={e => setForm({ ...form, fim: e.target.value })} /></div>
              <div><Label>Dias</Label><Input type="number" value={form.dias} onChange={e => setForm({ ...form, dias: e.target.value })} /></div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.abono_pecuniario} onChange={e => setForm({ ...form, abono_pecuniario: e.target.checked })} />
                  Abono pecuniário (1/3)
                </label>
              </div>
            </div>
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
function FeriasPageWithTabs() {
  return (
    <>
      <SectionTabs title={RH_META.title} icon={RH_META.icon} tabs={RH_TABS} />
      <FeriasPage />
    </>
  );
}
