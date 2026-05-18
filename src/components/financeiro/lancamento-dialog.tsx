import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { toast } from "sonner";

type Tipo = "receita" | "despesa";

export interface LancamentoSavedData {
  valor: number;
  forma_pagamento: string | null;
  parcelas: number | null;
  bandeira_cartao: string | null;
  emitir_nfse: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tipo: Tipo;
  onSaved?: () => void;
  onSavedWithData?: (data: LancamentoSavedData) => void;
  initialDescricao?: string;
  initialValor?: string;
}

export function LancamentoDialog({ open, onOpenChange, tipo, onSaved, onSavedWithData, initialDescricao, initialValor }: Props) {
  const { clinicaAtual } = useClinica();
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [contaId, setContaId] = useState<string>("");
  const [formaPagamento, setFormaPagamento] = useState<string>("");
  const [bandeiraCartao, setBandeiraCartao] = useState<string>("");
  const [parcelas, setParcelas] = useState<string>("1");
  const [emitirNfse, setEmitirNfse] = useState<boolean>(false);
  const [observacoes, setObservacoes] = useState("");
  const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([]);
  const [contas, setContas] = useState<{ id: string; nome: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !clinicaAtual) return;
    if (initialDescricao !== undefined) setDescricao(initialDescricao);
    if (initialValor !== undefined) setValor(initialValor);
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
    const isCredito = formaPagamento === "cartao_credito";
    if (isCredito && !bandeiraCartao) {
      toast.error("Selecione a bandeira do cartão");
      setSaving(false);
      return;
    }
    const { error } = await supabase.from("fin_lancamentos").insert({
      clinica_id: clinicaAtual.clinica_id,
      tipo,
      descricao: descricao.trim(),
      valor: Number(valor),
      data,
      categoria_id: categoriaId || null,
      conta_id: contaId || null,
      forma_pagamento: formaPagamento || null,
      bandeira_cartao: isCredito ? bandeiraCartao : null,
      parcelas: isCredito ? Number(parcelas) || 1 : null,
      emitir_nfse: emitirNfse,
      observacoes: observacoes || null,
      status: "confirmado",
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${tipo === "receita" ? "Receita" : "Despesa"} registrada`);
    onSavedWithData?.({
      valor: Number(valor),
      forma_pagamento: formaPagamento || null,
      parcelas: isCredito ? (Number(parcelas) || 1) : null,
      bandeira_cartao: isCredito ? bandeiraCartao : null,
      emitir_nfse: emitirNfse,
    });
    setDescricao(""); setValor(""); setObservacoes(""); setCategoriaId(""); setContaId(""); setFormaPagamento("");
    setBandeiraCartao(""); setParcelas("1"); setEmitirNfse(false);
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
              <CurrencyInput value={valor} onChange={setValor} />
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
              <Select value={formaPagamento} onValueChange={(v) => { setFormaPagamento(v); if (v !== "cartao_credito") { setBandeiraCartao(""); setParcelas("1"); } }}>
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
          {formaPagamento === "cartao_credito" && (
            <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3">
              <div className="space-y-1.5">
                <Label>Bandeira *</Label>
                <Select value={bandeiraCartao} onValueChange={setBandeiraCartao}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="visa">Visa</SelectItem>
                    <SelectItem value="mastercard">Mastercard</SelectItem>
                    <SelectItem value="elo">Elo</SelectItem>
                    <SelectItem value="amex">American Express</SelectItem>
                    <SelectItem value="hipercard">Hipercard</SelectItem>
                    <SelectItem value="diners">Diners</SelectItem>
                    <SelectItem value="outra">Outra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Parcelas</Label>
                <Select value={parcelas} onValueChange={setParcelas}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}x {n === 1 ? "(à vista)" : `de ${(Number(valor || 0) / n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-md border p-3">
            <Checkbox id="emitir-nfse" checked={emitirNfse} onCheckedChange={(v) => setEmitirNfse(!!v)} />
            <Label htmlFor="emitir-nfse" className="cursor-pointer">Emitir nota fiscal (NFS-e) para este lançamento</Label>
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
