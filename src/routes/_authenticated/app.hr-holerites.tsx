import { createFileRoute } from "@tanstack/react-router";
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
import { FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { formatDatePura } from "@/lib/date-utils";

export const Route = createFileRoute("/_authenticated/app/hr-holerites")({
  component: HoleritesPage,
  head: () => ({ meta: [{ title: "Holerites — ClinicaOS" }] }),
});

interface Contrato { id: string; funcionario_nome: string; salario: number }
interface Item { descricao: string; valor: number }
interface Holerite {
  id: string; contrato_id: string; competencia: string;
  salario_base: number; total_proventos: number; total_descontos: number;
  liquido: number; status: string; pago_em: string | null;
  proventos: Item[]; descontos: Item[];
}

function HoleritesPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("hr-holerites");
  const [rows, setRows] = useState<Holerite[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [contratoId, setContratoId] = useState("");
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7) + "-01");
  const [salarioBase, setSalarioBase] = useState("0");
  const [proventos, setProventos] = useState<Item[]>([]);
  const [descontos, setDescontos] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!clinicaAtual) return;
    setLoading(true);
    const [h, c] = await Promise.all([
      supabase.from("hr_holerites").select("*").eq("clinica_id", clinicaAtual.clinica_id).order("competencia", { ascending: false }),
      supabase.from("hr_contratos").select("id,funcionario_nome,salario").eq("clinica_id", clinicaAtual.clinica_id).eq("status", "ativo").order("funcionario_nome"),
    ]);
    if (h.error) mostrarErro(h.error);
    setRows((h.data ?? []) as unknown as Holerite[]);
    setContratos((c.data ?? []) as Contrato[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [clinicaAtual?.clinica_id]);

  function openNew() {
    setContratoId("");
    setCompetencia(new Date().toISOString().slice(0, 7) + "-01");
    setSalarioBase("0");
    setProventos([{ descricao: "Salário base", valor: 0 }]);
    setDescontos([{ descricao: "INSS", valor: 0 }]);
    setOpen(true);
  }

  function selectContrato(id: string) {
    setContratoId(id);
    const c = contratos.find(x => x.id === id);
    if (c) {
      setSalarioBase(String(c.salario));
      setProventos([{ descricao: "Salário base", valor: c.salario }]);
    }
  }

  const totalProv = proventos.reduce((s, i) => s + Number(i.valor || 0), 0);
  const totalDesc = descontos.reduce((s, i) => s + Number(i.valor || 0), 0);
  const liquido = totalProv - totalDesc;

  async function salvar() {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!clinicaAtual || !contratoId) { toast.error("Selecione o funcionário"); return; }
    setSaving(true);
    const { error } = await supabase.from("hr_holerites").insert({
      clinica_id: clinicaAtual.clinica_id,
      contrato_id: contratoId,
      competencia,
      salario_base: Number(salarioBase),
      proventos: proventos as unknown as never,
      descontos: descontos as unknown as never,
      total_proventos: totalProv,
      total_descontos: totalDesc,
      liquido,
      status: "rascunho",
    });
    setSaving(false);
    if (error) { mostrarErro(error); return; }
    toast.success("Holerite criado");
    setOpen(false);
    void load();
  }

  async function marcarPago(id: string) {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    const { error } = await supabase.from("hr_holerites").update({
      status: "pago", pago_em: new Date().toISOString().slice(0, 10),
    }).eq("id", id);
    if (error) { mostrarErro(error); return; }
    toast.success("Holerite marcado como pago");
    void load();
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-xl font-bold">Holerites</h1>
          <p className="text-sm text-muted-foreground">Folha de pagamento mensal.</p>
        </div>
        {podeEscrever && (
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo</Button>
        )}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionário</TableHead>
              <TableHead className="w-32">Competência</TableHead>
              <TableHead className="w-32 text-right">Proventos</TableHead>
              <TableHead className="w-32 text-right">Descontos</TableHead>
              <TableHead className="w-32 text-right">Líquido</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Nenhum holerite gerado.</TableCell></TableRow>
            ) : rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{contratos.find(c => c.id === r.contrato_id)?.funcionario_nome ?? "—"}</TableCell>
                <TableCell>{formatDatePura(r.competencia).slice(3)}</TableCell>
                <TableCell className="text-right">{Number(r.total_proventos).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                <TableCell className="text-right text-destructive">- {Number(r.total_descontos).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                <TableCell className="text-right font-semibold">{Number(r.liquido).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                <TableCell><Badge variant={r.status === "pago" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                <TableCell className="text-right">
                  {r.status !== "pago" && podeEscrever && <Button size="sm" variant="outline" onClick={() => marcarPago(r.id)}>Pagar</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Novo holerite</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Funcionário *</Label>
                <Select value={contratoId} onValueChange={selectContrato}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{contratos.map(c => <SelectItem key={c.id} value={c.id}>{c.funcionario_nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Competência</Label><Input type="month" value={competencia.slice(0, 7)} onChange={e => setCompetencia(e.target.value + "-01")} /></div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-emerald-600">Proventos</Label>
                <Button size="sm" variant="ghost" onClick={() => setProventos([...proventos, { descricao: "", valor: 0 }])}><Plus className="h-3 w-3" /></Button>
              </div>
              {proventos.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_140px_auto] gap-2 mb-1">
                  <Input placeholder="Descrição" value={p.descricao} onChange={e => { const x = [...proventos]; x[i].descricao = e.target.value; setProventos(x); }} />
                  <Input type="number" step="0.01" value={p.valor} onChange={e => { const x = [...proventos]; x[i].valor = Number(e.target.value); setProventos(x); }} />
                  <Button size="icon" variant="ghost" onClick={() => setProventos(proventos.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-destructive">Descontos</Label>
                <Button size="sm" variant="ghost" onClick={() => setDescontos([...descontos, { descricao: "", valor: 0 }])}><Plus className="h-3 w-3" /></Button>
              </div>
              {descontos.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_140px_auto] gap-2 mb-1">
                  <Input placeholder="Descrição" value={p.descricao} onChange={e => { const x = [...descontos]; x[i].descricao = e.target.value; setDescontos(x); }} />
                  <Input type="number" step="0.01" value={p.valor} onChange={e => { const x = [...descontos]; x[i].valor = Number(e.target.value); setDescontos(x); }} />
                  <Button size="icon" variant="ghost" onClick={() => setDescontos(descontos.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
            <div className="bg-muted p-3 rounded grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div><div className="text-muted-foreground">Proventos</div><div className="font-semibold">{totalProv.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div></div>
              <div><div className="text-muted-foreground">Descontos</div><div className="font-semibold text-destructive">- {totalDesc.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div></div>
              <div><div className="text-muted-foreground">Líquido</div><div className="font-bold text-primary">{liquido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div></div>
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
