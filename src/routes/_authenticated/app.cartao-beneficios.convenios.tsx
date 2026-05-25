import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ShieldCheck, Layers, Lightbulb } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type Faixa = {
  vidas_de: number;
  vidas_ate: number | null;
  valor_mensal: number;
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
  const [faixas, setFaixas] = useState<Faixa[]>([{ vidas_de: 1, vidas_ate: null, valor_mensal: 0 }]);
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
        .from("cb_convenio_faixas")
        .select("convenio_id, valor_mensal")
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
    setFaixas([{ vidas_de: 1, vidas_ate: null, valor_mensal: 0 }]);
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
    const { data: fs } = await supabase
      .from("cb_convenio_faixas")
      .select("vidas_de, vidas_ate, valor_mensal")
      .eq("convenio_id", c.id)
      .order("vidas_de");
    const list = (fs ?? []).map((f: any) => ({
      vidas_de: Number(f.vidas_de),
      vidas_ate: f.vidas_ate === null ? null : Number(f.vidas_ate),
      valor_mensal: Number(f.valor_mensal),
    }));
    setFaixas(list.length ? list : [{ vidas_de: 1, vidas_ate: null, valor_mensal: 0 }]);
    setOpen(true);
  };

  const save = async () => {
    if (!clinicaAtual) return;
    if (!nome.trim()) { toast.error("Informe o nome."); return; }
    if (!faixas.length) { toast.error("Adicione pelo menos uma faixa de preço."); return; }
    for (const f of faixas) {
      if (!f.vidas_de || f.vidas_de < 1) { toast.error("Campo 'De' inválido em uma faixa."); return; }
      if (f.vidas_ate !== null && f.vidas_ate < f.vidas_de) {
        toast.error("Campo 'Até' deve ser maior ou igual a 'De'."); return;
      }
    }
    setSaving(true);
    const valorMin = faixas.reduce((m, f) => Math.min(m, Number(f.valor_mensal) || 0), Number(faixas[0].valor_mensal) || 0);
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      ativo,
      valor_mensal: valorMin,
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
    // Substitui faixas de preço
    await supabase.from("cb_convenio_faixas").delete().eq("convenio_id", convenioId!);
    const rowsToInsert = faixas.map((f) => ({
      convenio_id: convenioId!,
      vidas_de: Number(f.vidas_de),
      vidas_ate: f.vidas_ate === null ? null : Number(f.vidas_ate),
      valor_mensal: Number(f.valor_mensal) || 0,
    }));
    if (rowsToInsert.length) {
      const { error: fErr } = await supabase.from("cb_convenio_faixas").insert(rowsToInsert);
      if (fErr) { setSaving(false); toast.error(fErr.message); return; }
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
          <Tabs defaultValue="info" className="w-full">
            <TabsList>
              <TabsTrigger value="info">Informações</TabsTrigger>
              <TabsTrigger value="faixas"><Layers className="h-4 w-4 mr-1" />Faixas de Preço</TabsTrigger>
            </TabsList>
            <TabsContent value="info" className="space-y-3 mt-3">
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
            </TabsContent>
            <TabsContent value="faixas" className="mt-3">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <Layers className="h-4 w-4" /> Faixas de Preço por Quantidade de Vidas
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Configure o valor mensal conforme a quantidade de vidas (titular + dependentes).
                    </p>
                  </div>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => {
                      const last = faixas[faixas.length - 1];
                      const nextDe = last ? (last.vidas_ate ?? last.vidas_de) + 1 : 1;
                      setFaixas([...faixas, { vidas_de: nextDe, vidas_ate: null, valor_mensal: 0 }]);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Adicionar Faixa
                  </Button>
                </div>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>De (pessoas)</TableHead>
                        <TableHead>Até (pessoas)</TableHead>
                        <TableHead className="text-right">Valor Mensal (R$)</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {faixas.map((f, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Input
                              type="number" min="1"
                              value={f.vidas_de}
                              onChange={(e) => {
                                const v = parseInt(e.target.value) || 1;
                                setFaixas(faixas.map((x, i) => i === idx ? { ...x, vidas_de: v } : x));
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number" min="1"
                              placeholder="∞"
                              value={f.vidas_ate ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const v = raw === "" ? null : (parseInt(raw) || null);
                                setFaixas(faixas.map((x, i) => i === idx ? { ...x, vidas_ate: v } : x));
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number" step="0.01" min="0"
                              className="text-right"
                              value={f.valor_mensal}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value) || 0;
                                setFaixas(faixas.map((x, i) => i === idx ? { ...x, valor_mensal: v } : x));
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => setFaixas(faixas.filter((_, i) => i !== idx))}
                              disabled={faixas.length === 1}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Exemplo: 1 pessoa = R$200, de 2 a 3 = R$350, 4+ = R$500. Deixe "Até" vazio para indicar "ou mais".
                </p>
              </div>
            </TabsContent>
          </Tabs>
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