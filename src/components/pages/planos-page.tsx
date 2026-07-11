import { useEffect, useState } from "react";
import { CreditCard, Plus, Save, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Plano = {
  id: string;
  clinica_id: string;
  nome: string;
  tipo: string;
  valor_mensal: number;
  taxa_adesao: number;
  max_dependentes: number;
  max_agregados: number;
  fidelidade_meses: number;
  vigencia_meses: number;
  num_parcelas: number;
  descricao_beneficios: string | null;
  template_contrato: string | null;
  ativo: boolean;
};

export function PlanosPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("planos");
  const [list, setList] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Plano | null>(null);

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("planos_assinatura")
      .select("*")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("nome");
    if (error) mostrarErro(error);
    setList((data ?? []) as Plano[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clinicaAtual?.clinica_id]);

  const novo = async () => {
    if (!clinicaAtual || !podeEscrever) return;
    const { data, error } = await supabase.from("planos_assinatura").insert({
      clinica_id: clinicaAtual.clinica_id,
      nome: "Novo plano",
      tipo: "outro",
      valor_mensal: 0, taxa_adesao: 0,
      max_dependentes: 0, max_agregados: 0,
      fidelidade_meses: 6, vigencia_meses: 12, num_parcelas: 12,
    }).select().single();
    if (error) return mostrarErro(error);
    toast.success("Plano criado");
    await load();
    if (data) setEditing(data as Plano);
  };

  const salvar = async (p: Plano) => {
    if (!podeEscrever) return;
    const { id, ...rest } = p;
    const { error } = await supabase.from("planos_assinatura").update(rest).eq("id", id);
    if (error) return mostrarErro(error);
    toast.success("Plano salvo");
    setEditing(null);
    load();
  };

  const excluir = async (id: string) => {
    if (!podeEscrever) return;
    if (!confirm("Excluir este plano?")) return;
    const { error } = await supabase.from("planos_assinatura").delete().eq("id", id);
    if (error) return mostrarErro(error);
    toast.success("Excluído");
    load();
  };

  const updEdit = (patch: Partial<Plano>) =>
    setEditing((e) => (e ? { ...e, ...patch } : e));

  const tipoLabel = (t: string) =>
    t === "cartao_consulta" ? "Cartão Consulta" : t === "cartao_desconto" ? "Cartão Desconto" : "Outro";

  const fmtMoeda = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><CreditCard className="h-6 w-6 text-primary"/>Planos de Assinatura</h1>
        {podeEscrever && <Button onClick={novo}><Plus className="h-4 w-4 mr-2"/>Novo plano</Button>}
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Valor mensal</TableHead>
                <TableHead>Adesão</TableHead>
                <TableHead>Parcelas</TableHead>
                <TableHead>Vigência</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>
              ) : list.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Nenhum plano cadastrado.</TableCell></TableRow>
              ) : list.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.nome}</TableCell>
                  <TableCell><Badge variant="outline">{tipoLabel(p.tipo)}</Badge></TableCell>
                  <TableCell>{fmtMoeda(p.valor_mensal)}</TableCell>
                  <TableCell>{fmtMoeda(p.taxa_adesao)}</TableCell>
                  <TableCell>{p.num_parcelas}x</TableCell>
                  <TableCell>{p.vigencia_meses} meses</TableCell>
                  <TableCell className="text-right">
                    {podeEscrever && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(p)}><Pencil className="h-4 w-4"/></Button>
                        <Button size="sm" variant="ghost" onClick={() => excluir(p.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar plano</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-full"><Label>Nome</Label>
                <Input value={editing.nome} onChange={(e) => updEdit({ nome: e.target.value })}/>
              </div>
              <div><Label>Tipo</Label>
                <Select value={editing.tipo} onValueChange={(v) => updEdit({ tipo: v })}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cartao_consulta">Cartão Consulta</SelectItem>
                    <SelectItem value="cartao_desconto">Cartão Desconto</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Valor mensal (R$)</Label><CurrencyInput value={String(editing.valor_mensal ?? "")} onChange={(v) => updEdit({ valor_mensal: Number(v) || 0 })}/></div>
              <div><Label>Taxa de adesão (R$)</Label><CurrencyInput value={String(editing.taxa_adesao ?? "")} onChange={(v) => updEdit({ taxa_adesao: Number(v) || 0 })}/></div>
              <div><Label>Nº parcelas</Label><Input type="number" value={editing.num_parcelas} onChange={(e) => updEdit({ num_parcelas: Number(e.target.value) })}/></div>
              <div><Label>Máx. dependentes</Label><Input type="number" value={editing.max_dependentes} onChange={(e) => updEdit({ max_dependentes: Number(e.target.value) })}/></div>
              <div><Label>Máx. agregados</Label><Input type="number" value={editing.max_agregados} onChange={(e) => updEdit({ max_agregados: Number(e.target.value) })}/></div>
              <div><Label>Fidelidade (meses)</Label><Input type="number" value={editing.fidelidade_meses} onChange={(e) => updEdit({ fidelidade_meses: Number(e.target.value) })}/></div>
              <div><Label>Vigência (meses)</Label><Input type="number" value={editing.vigencia_meses} onChange={(e) => updEdit({ vigencia_meses: Number(e.target.value) })}/></div>
              <div className="col-span-full"><Label>Benefícios</Label>
                <Textarea rows={3} value={editing.descricao_beneficios ?? ""} onChange={(e) => updEdit({ descricao_beneficios: e.target.value })}/>
              </div>
              <div className="col-span-full"><Label>Modelo do contrato (use {`{{VALOR_MENSAL}}, {{PACIENTE_NOME}}, {{DEPENDENTES}}, {{CLINICA_NOME}}`} etc.)</Label>
                <Textarea rows={10} value={editing.template_contrato ?? ""} onChange={(e) => updEdit({ template_contrato: e.target.value })}/>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            {editing && podeEscrever ? <Button onClick={() => salvar(editing)}><Save className="h-4 w-4 mr-1"/>Salvar</Button> : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}