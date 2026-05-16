import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { toast } from "sonner";

type Tipo = "receita" | "despesa";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tipo: Tipo;
  onSaved?: () => void;
}

export function LancamentoDialog({ open, onOpenChange, tipo, onSaved }: Props) {
  const { clinicaAtual } = useClinica();
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [contaId, setContaId] = useState<string>("");
  const [formaPagamento, setFormaPagamento] = useState<string>("");
  const [observacoes, setObservacoes] = useState("");
  const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([]);
  const [contas, setContas] = useState<{ id: string; nome: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !clinicaAtual) return;
    (async () => {
      const [{ data: cats }, { data: cs }] = await Promise.all([
        supabase.from("fin_categorias").select("id, nome").eq("clinica_id", clinicaAtual.clinica_id).eq("tipo", tipo).eq("ativo", true).order("nome"),
        supabase.from("fin_contas").select("id, nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
      ]);
      setCategorias(cats ?? []);
      setContas(cs ?? []);
    })();
  }, [open, clinicaAtual, tipo]);

  const handleSave = async () => {
    if (!clinicaAtual) return;
    if (!descricao.trim() || !valor) {
      toast.error("Descrição e valor são obrigatórios");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("fin_lancamentos").insert({
      clinica_id: clinicaAtual.clinica_id,
      tipo,
      descricao: descricao.trim(),
      valor: Number(valor),
      data,
      categoria_id: categoriaId || null,
      conta_id: contaId || null,
      forma_pagamento: formaPagamento || null,
      observacoes: observacoes || null,
      status: "confirmado",
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${tipo === "receita" ? "Receita" : "Despesa"} registrada`);
    setDescricao(""); setValor(""); setObservacoes(""); setCategoriaId(""); setContaId(""); setFormaPagamento("");
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className={tipo === "receita" ? "text-success" : "text-destructive"}>
            Nova {tipo === "receita" ? "Receita" : "Despesa"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Consulta João Silva" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor *</Label>
              <Input type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={categoriaId} onValueChange={setCategoriaId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger><SelectValue placeholder="Conta" /></SelectTrigger>
                <SelectContent>
                  {contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Forma pgto</Label>
              <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                <SelectTrigger><SelectValue placeholder="Forma" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="pix">Pix</SelectItem>
                  <SelectItem value="cartao_credito">Cartão Crédito</SelectItem>
                  <SelectItem value="cartao_debito">Cartão Débito</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="convenio">Convênio</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
