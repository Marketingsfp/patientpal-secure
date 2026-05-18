import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CreditCard, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/planos")({
  component: PlanosPage,
  head: () => ({ meta: [{ title: "Planos de Assinatura — ClinicaOS" }] }),
});

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
  const [list, setList] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("planos_assinatura")
      .select("*")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("nome");
    if (error) toast.error(error.message);
    setList((data ?? []) as Plano[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clinicaAtual?.clinica_id]);

  const novo = async () => {
    if (!clinicaAtual) return;
    const { error } = await supabase.from("planos_assinatura").insert({
      clinica_id: clinicaAtual.clinica_id,
      nome: "Novo plano",
      tipo: "outro",
      valor_mensal: 0, taxa_adesao: 0,
      max_dependentes: 0, max_agregados: 0,
      fidelidade_meses: 6, vigencia_meses: 12, num_parcelas: 12,
    });
    if (error) return toast.error(error.message);
    toast.success("Plano criado");
    load();
  };

  const salvar = async (p: Plano) => {
    const { id, ...rest } = p;
    const { error } = await supabase.from("planos_assinatura").update(rest).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Plano salvo");
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir este plano?")) return;
    const { error } = await supabase.from("planos_assinatura").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    load();
  };

  const upd = (id: string, patch: Partial<Plano>) =>
    setList((l) => l.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><CreditCard className="h-6 w-6 text-primary"/>Planos de Assinatura</h1>
        <Button onClick={novo}><Plus className="h-4 w-4 mr-2"/>Novo plano</Button>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}
      {!loading && list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum plano cadastrado.</p>
      ) : null}
      <div className="space-y-4">
        {list.map((p) => (
          <Card key={p.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <Input className="max-w-md font-semibold" value={p.nome} onChange={(e) => upd(p.id, { nome: e.target.value })}/>
                <div className="flex gap-2">
                  <Button size="sm" variant="default" onClick={() => salvar(p)}><Save className="h-4 w-4 mr-1"/>Salvar</Button>
                  <Button size="sm" variant="outline" onClick={() => excluir(p.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><Label>Tipo</Label>
                <Select value={p.tipo} onValueChange={(v) => upd(p.id, { tipo: v })}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cartao_consulta">Cartão Consulta</SelectItem>
                    <SelectItem value="cartao_desconto">Cartão Desconto</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Valor mensal (R$)</Label><CurrencyInput value={String(p.valor_mensal ?? "")} onChange={(v) => upd(p.id, { valor_mensal: Number(v) || 0 })}/></div>
              <div><Label>Taxa de adesão (R$)</Label><CurrencyInput value={String(p.taxa_adesao ?? "")} onChange={(v) => upd(p.id, { taxa_adesao: Number(v) || 0 })}/></div>
              <div><Label>Nº parcelas</Label><Input type="number" value={p.num_parcelas} onChange={(e) => upd(p.id, { num_parcelas: Number(e.target.value) })}/></div>
              <div><Label>Máx. dependentes</Label><Input type="number" value={p.max_dependentes} onChange={(e) => upd(p.id, { max_dependentes: Number(e.target.value) })}/></div>
              <div><Label>Máx. agregados</Label><Input type="number" value={p.max_agregados} onChange={(e) => upd(p.id, { max_agregados: Number(e.target.value) })}/></div>
              <div><Label>Fidelidade (meses)</Label><Input type="number" value={p.fidelidade_meses} onChange={(e) => upd(p.id, { fidelidade_meses: Number(e.target.value) })}/></div>
              <div><Label>Vigência (meses)</Label><Input type="number" value={p.vigencia_meses} onChange={(e) => upd(p.id, { vigencia_meses: Number(e.target.value) })}/></div>
              <div className="col-span-full"><Label>Benefícios</Label>
                <Textarea rows={3} value={p.descricao_beneficios ?? ""} onChange={(e) => upd(p.id, { descricao_beneficios: e.target.value })}/>
              </div>
              <div className="col-span-full"><Label>Modelo do contrato (use {`{{VALOR_MENSAL}}, {{PACIENTE_NOME}}, {{DEPENDENTES}}, {{CLINICA_NOME}}`} etc.)</Label>
                <Textarea rows={10} value={p.template_contrato ?? ""} onChange={(e) => upd(p.id, { template_contrato: e.target.value })}/>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}