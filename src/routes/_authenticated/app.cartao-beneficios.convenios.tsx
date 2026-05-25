import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/app/cartao-beneficios/convenios")({
  component: ConveniosPage,
  head: () => ({ meta: [{ title: "Convênio — Cartão Benefícios" }] }),
});

type Convenio = {
  id: string;
  clinica_id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  valor_mensal: number;
  taxa_adesao: number;
  num_parcelas: number;
  max_dependentes: number;
  fidelidade_meses: number;
  vigencia_meses: number;
  beneficios: string | null;
  modelo_contrato: string | null;
};

function ConveniosPage() {
  const { clinicaAtual } = useClinica();
  const [rows, setRows] = useState<Convenio[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Convenio | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [taxaAdesao, setTaxaAdesao] = useState<number>(0);
  const [numParcelas, setNumParcelas] = useState<number>(12);
  const [maxDependentes, setMaxDependentes] = useState<number>(0);
  const [fidelidadeMeses, setFidelidadeMeses] = useState<number>(0);
  const [vigenciaMeses, setVigenciaMeses] = useState<number>(12);
  const [beneficiosTxt, setBeneficiosTxt] = useState("");
  const [modeloContrato, setModeloContrato] = useState("");
  const [valoresPorDep, setValoresPorDep] = useState<Record<number, number>>({ 0: 0 });
  const [valoresMin, setValoresMin] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Convenio | null>(null);

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("cb_convenios")
      .select("*")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("nome");
    if (error) toast.error(error.message);
    const list = (data ?? []) as Convenio[];
    setRows(list);
    if (list.length) {
      const { data: vs } = await supabase
        .from("cb_convenio_valores")
        .select("convenio_id, dependentes, valor_mensal")
        .in("convenio_id", list.map((c) => c.id));
      const minMap: Record<string, number> = {};
      (vs ?? []).forEach((v: any) => {
        const val = Number(v.valor_mensal);
        if (minMap[v.convenio_id] === undefined || val < minMap[v.convenio_id]) {
          minMap[v.convenio_id] = val;
        }
      });
      setValoresMin(minMap);
    } else {
      setValoresMin({});
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clinicaAtual?.clinica_id]);

  const openNew = () => {
    setEditing(null);
    setNome(""); setDescricao(""); setAtivo(true);
    setTaxaAdesao(0); setNumParcelas(12);
    setMaxDependentes(0); setFidelidadeMeses(0); setVigenciaMeses(12);
    setBeneficiosTxt(""); setModeloContrato("");
    setValoresPorDep({ 0: 0 });
    setOpen(true);
  };

  const openEdit = async (c: Convenio) => {
    setEditing(c);
    setNome(c.nome);
    setDescricao(c.descricao ?? "");
    setAtivo(c.ativo);
    setTaxaAdesao(Number(c.taxa_adesao ?? 0));
    setNumParcelas(c.num_parcelas ?? 12);
    setMaxDependentes(c.max_dependentes ?? 0);
    setFidelidadeMeses(c.fidelidade_meses ?? 0);
    setVigenciaMeses(c.vigencia_meses ?? 12);
    setBeneficiosTxt(c.beneficios ?? "");
    setModeloContrato(c.modelo_contrato ?? "");
    const { data: vs } = await supabase
      .from("cb_convenio_valores")
      .select("dependentes, valor_mensal")
      .eq("convenio_id", c.id);
    const map: Record<number, number> = {};
    const max = c.max_dependentes ?? 0;
    for (let i = 0; i <= max; i++) map[i] = 0;
    (vs ?? []).forEach((v: any) => { map[v.dependentes] = Number(v.valor_mensal); });
    setValoresPorDep(map);
    setOpen(true);
  };

  // Sincroniza linhas conforme maxDependentes muda
  useEffect(() => {
    setValoresPorDep((prev) => {
      const next: Record<number, number> = {};
      for (let i = 0; i <= maxDependentes; i++) next[i] = prev[i] ?? 0;
      return next;
    });
  }, [maxDependentes]);

  const save = async () => {
    if (!clinicaAtual) return;
    if (!nome.trim()) { toast.error("Informe o nome."); return; }
    setSaving(true);
    const valor0 = valoresPorDep[0] ?? 0;
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      ativo,
      valor_mensal: valor0,
      taxa_adesao: taxaAdesao,
      num_parcelas: numParcelas,
      max_dependentes: maxDependentes,
      fidelidade_meses: fidelidadeMeses,
      vigencia_meses: vigenciaMeses,
      beneficios: beneficiosTxt.trim() || null,
      modelo_contrato: modeloContrato.trim() || null,
    };
    let convenioId = editing?.id;
    if (editing) {
      const { error } = await supabase.from("cb_convenios").update(payload).eq("id", editing.id);
      if (error) { setSaving(false); toast.error(error.message); return; }
    } else {
      const { data, error } = await supabase.from("cb_convenios").insert(payload).select("id").single();
      if (error || !data) { setSaving(false); toast.error(error?.message ?? "Erro ao criar"); return; }
      convenioId = data.id;
    }
    // Substitui valores por dependente
    await supabase.from("cb_convenio_valores").delete().eq("convenio_id", convenioId!);
    const rowsToInsert = Object.entries(valoresPorDep)
      .filter(([d]) => Number(d) <= maxDependentes)
      .map(([d, v]) => ({ convenio_id: convenioId!, dependentes: Number(d), valor_mensal: Number(v) || 0 }));
    if (rowsToInsert.length) {
      const { error: vErr } = await supabase.from("cb_convenio_valores").insert(rowsToInsert);
      if (vErr) { setSaving(false); toast.error(vErr.message); return; }
    }
    setSaving(false);
    toast.success(editing ? "Convênio atualizado." : "Convênio criado.");
    setOpen(false);
    load();
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("cb_convenios").delete().eq("id", toDelete.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Convênio excluído.");
    setToDelete(null);
    load();
  };

  if (!clinicaAtual) return <p className="text-sm text-muted-foreground">Selecione uma clínica.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Tipos de cartão benefícios oferecidos pela clínica.
        </p>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo convênio</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>A partir de</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nenhum convênio cadastrado.</TableCell></TableRow>
              ) : rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell>{valoresMin[c.id] !== undefined ? `R$ ${valoresMin[c.id].toFixed(2)}` : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.descricao ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={c.ativo ? "default" : "outline"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setToDelete(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar convênio" : "Novo convênio"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Plano Família" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Taxa de adesão (R$)</Label>
                <Input type="number" step="0.01" min="0" value={taxaAdesao}
                  onChange={(e) => setTaxaAdesao(parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label>Nº parcelas</Label>
                <Input type="number" min="1" value={numParcelas}
                  onChange={(e) => setNumParcelas(parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <Label>Máx. dependentes</Label>
                <Input type="number" min="0" value={maxDependentes}
                  onChange={(e) => setMaxDependentes(parseInt(e.target.value) || 0)} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Fidelidade (meses)</Label>
                <Input type="number" min="0" value={fidelidadeMeses}
                  onChange={(e) => setFidelidadeMeses(parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <Label>Vigência (meses)</Label>
                <Input type="number" min="0" value={vigenciaMeses}
                  onChange={(e) => setVigenciaMeses(parseInt(e.target.value) || 0)} />
              </div>
            </div>
            <div className="border rounded-md p-3 space-y-2">
              <Label>Valor mensal por nº de dependentes (R$) *</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {Array.from({ length: maxDependentes + 1 }, (_, i) => i).map((dep) => (
                  <div key={dep} className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                      {dep === 0 ? "Só titular" : `${dep} dep.`}
                    </span>
                    <Input
                      type="number" step="0.01" min="0"
                      value={valoresPorDep[dep] ?? 0}
                      onChange={(e) => setValoresPorDep((prev) => ({
                        ...prev, [dep]: parseFloat(e.target.value) || 0,
                      }))}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Ajuste "Máx. dependentes" acima para adicionar/remover faixas.
              </p>
            </div>
            <div>
              <Label>Benefícios</Label>
              <Textarea value={beneficiosTxt} onChange={(e) => setBeneficiosTxt(e.target.value)} rows={4}
                placeholder="Liste os benefícios deste convênio" />
            </div>
            <div>
              <Label>Modelo do contrato (use {"{{VALOR_MENSAL}}"}, {"{{PACIENTE_NOME}}"}, {"{{DEPENDENTES}}"}, {"{{CLINICA_NOME}}"} etc.)</Label>
              <Textarea value={modeloContrato} onChange={(e) => setModeloContrato(e.target.value)} rows={6}
                placeholder="INSTRUMENTO PARTICULAR DE CONTRATO..." />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={ativo} onCheckedChange={setAtivo} />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir convênio?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Os benefícios vinculados a "{toDelete?.nome}" também serão excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}