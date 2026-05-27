import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

type Tipo = "receita" | "despesa";

export interface LancamentoSavedData {
  valor: number;
  forma_pagamento: string | null;
  parcelas: number | null;
  bandeira_cartao: string | null;
  emitir_nfse: boolean;
  pagamentos_detalhe?: Array<{ forma: string; pago: number; troco: number; recebido: number }>;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tipo: Tipo;
  onSaved?: () => void;
  onSavedWithData?: (data: LancamentoSavedData) => void;
  initialDescricao?: string;
  initialValor?: string;
  agendamentoId?: string | null;
  initialFormaPagamento?: string;
}

export function LancamentoDialog({ open, onOpenChange, tipo, onSaved, onSavedWithData, initialDescricao, initialValor, agendamentoId, initialFormaPagamento }: Props) {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
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
  const [valorRecebido, setValorRecebido] = useState("");
  const [pagamentoMisto, setPagamentoMisto] = useState(false);
  const [pagamentos, setPagamentos] = useState<Array<{ forma: string; recebido: string }>>([
    { forma: "dinheiro", recebido: "" },
  ]);

  useEffect(() => {
    if (!open || !clinicaAtual) return;
    if (initialDescricao !== undefined) setDescricao(initialDescricao);
    if (initialValor !== undefined) setValor(initialValor);
    if (initialFormaPagamento !== undefined) {
      if (initialFormaPagamento === "__misto__") {
        setPagamentoMisto(true);
        setFormaPagamento("");
      } else {
        setFormaPagamento(initialFormaPagamento);
      }
    }
    (async () => {
      const [{ data: cats }, { data: cs }] = await Promise.all([
        supabase.from("fin_categorias").select("id, nome").eq("clinica_id", clinicaAtual.clinica_id).eq("tipo", tipo).eq("ativo", true).order("nome"),
        supabase.from("fin_contas").select("id, nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
      ]);
      const lista = cats ?? [];
      setCategorias(lista);
      const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const particular = lista.find((c) => norm(c.nome) === "particular");
      if (particular) setCategoriaId((cur) => cur || particular.id);
      const listaContas = cs ?? [];
      setContas(listaContas);
      const caixa = listaContas.find((c) => norm(c.nome) === "caixa");
      if (caixa) setContaId((cur) => cur || caixa.id);
    })();
  }, [open, clinicaAtual, tipo]);

  const formatBRL = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const valorNum = Number(valor || 0);
  const recebidoNum = Number(valorRecebido || 0);
  const trocoDinheiro = formaPagamento === "dinheiro" && recebidoNum > valorNum
    ? recebidoNum - valorNum
    : 0;
  // Compute "pago" (effective amount applied to total) and "troco" per row.
  // Cash: pago = min(recebido, remaining-before-this-row); excess = troco.
  // Other forms: pago = recebido, troco = 0.
  const linhasCalc = (() => {
    let restante = valorNum;
    return pagamentos.map((p) => {
      const rec = Number(p.recebido || 0);
      let pago = 0, troco = 0;
      if (p.forma === "dinheiro") {
        pago = Math.min(rec, Math.max(0, restante));
        troco = Math.max(0, rec - pago);
      } else {
        pago = rec;
      }
      restante = Math.max(0, restante - pago);
      return { pago, troco };
    });
  })();
  const totalPagoMisto = linhasCalc.reduce((s, l) => s + l.pago, 0);
  const restanteMisto = Math.max(0, valorNum - totalPagoMisto);
  const trocoMisto = linhasCalc.reduce((s, l) => s + l.troco, 0);
  const FORMAS_LABEL: Record<string, string> = {
    dinheiro: "Dinheiro",
    pix: "Pix",
    cartao_credito: "Cartão Crédito",
    cartao_debito: "Cartão Débito",
    boleto: "Boleto",
    convenio: "Convênio",
    transferencia: "Transferência",
  };

  const handleSave = async () => {
    if (!clinicaAtual) return;
    if (!descricao.trim() || !valor) {
      toast.error("Descrição e valor são obrigatórios");
      return;
    }
    setSaving(true);
    if (agendamentoId && tipo === "receita") {
      const { data: jaPago } = await supabase
        .from("fin_lancamentos")
        .select("id")
        .eq("agendamento_id", agendamentoId)
        .eq("tipo", "receita")
        .limit(1)
        .maybeSingle();
      if (jaPago) {
        toast.error("Este agendamento já possui um pagamento registrado.");
        setSaving(false);
        onOpenChange(false);
        return;
      }
    }
    const isCredito = formaPagamento === "cartao_credito";
    if (isCredito && !bandeiraCartao) {
      toast.error("Selecione a bandeira do cartão");
      setSaving(false);
      return;
    }
    if (!pagamentoMisto && formaPagamento === "dinheiro") {
      if (!valorRecebido || recebidoNum <= 0) {
        toast.error(`Informe o valor recebido em dinheiro (≥ ${formatBRL(valorNum)})`);
        setSaving(false);
        return;
      }
      if (recebidoNum + 0.005 < valorNum) {
        toast.error(`Valor recebido (${formatBRL(recebidoNum)}) é menor que o total (${formatBRL(valorNum)})`);
        setSaving(false);
        return;
      }
    }
    let formaFinal: string | null = formaPagamento || null;
    let obsExtra = "";
    if (pagamentoMisto) {
      const validIdx = pagamentos
        .map((p, i) => ({ p, i }))
        .filter(({ p, i }) => p.forma && linhasCalc[i].pago > 0);
      if (validIdx.length === 0) {
        toast.error("Adicione ao menos uma forma de pagamento");
        setSaving(false); return;
      }
      const dinheiroInvalido = validIdx.find(({ p, i }) => {
        if (p.forma !== "dinheiro") return false;
        const rec = Number(p.recebido || 0);
        return rec <= 0 || rec + 0.005 < linhasCalc[i].pago;
      });
      if (dinheiroInvalido) {
        toast.error("Informe o valor recebido em dinheiro em todas as linhas (deve cobrir o valor pago).");
        setSaving(false); return;
      }
      const total = validIdx.reduce((s, { i }) => s + linhasCalc[i].pago, 0);
      if (Math.abs(total - valorNum) > 0.01) {
        toast.error(`Soma das formas (${formatBRL(total)}) difere do valor (${formatBRL(valorNum)})`);
        setSaving(false); return;
      }
      formaFinal = "misto";
      obsExtra = "Pagamento misto: " + validIdx.map(({ p, i }) => {
        const { pago, troco } = linhasCalc[i];
        const base = `${FORMAS_LABEL[p.forma] ?? p.forma} ${formatBRL(pago)}`;
        if (p.forma === "dinheiro" && troco > 0) {
          return `${base} (recebido ${formatBRL(Number(p.recebido))}, troco ${formatBRL(troco)})`;
        }
        return base;
      }).join("; ");
    } else if (formaPagamento === "dinheiro" && recebidoNum > 0) {
      obsExtra = `Recebido ${formatBRL(recebidoNum)}, troco ${formatBRL(trocoDinheiro)}`;
    }
    const obsFinal = [observacoes.trim(), obsExtra].filter(Boolean).join(" | ") || null;
    const { data: lancInserido, error } = await supabase.from("fin_lancamentos").insert({
      clinica_id: clinicaAtual.clinica_id,
      tipo,
      descricao: descricao.trim(),
      valor: Number(valor),
      data,
      categoria_id: categoriaId || null,
      conta_id: contaId || null,
      forma_pagamento: formaFinal,
      bandeira_cartao: isCredito ? bandeiraCartao : null,
      parcelas: isCredito ? Number(parcelas) || 1 : null,
      emitir_nfse: emitirNfse,
      observacoes: obsFinal,
      status: "confirmado",
      agendamento_id: agendamentoId ?? null,
      criado_por: user?.id ?? null,
    } as never).select("id").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${tipo === "receita" ? "Receita" : "Despesa"} registrada`);
    // Integração com Caixa: registra movimento na sessão aberta do usuário.
    // Se não houver sessão aberta, abre uma automaticamente com valor 0.
    try {
      if (user?.id && Number(valor) > 0) {
        let { data: sess } = await supabase
          .from("caixa_sessoes")
          .select("id")
          .eq("clinica_id", clinicaAtual.clinica_id)
          .eq("user_id", user.id)
          .eq("status", "aberto")
          .maybeSingle();
        if (!sess) {
          const nome = (user.user_metadata as { nome?: string } | null)?.nome ?? user.email ?? null;
          const { data: novaSess, error: errSess } = await supabase
            .from("caixa_sessoes")
            .insert({
              clinica_id: clinicaAtual.clinica_id,
              user_id: user.id,
              user_nome: nome,
              valor_abertura: 0,
              status: "aberto",
              observacoes: "Aberto automaticamente pelo sistema",
            } as never)
            .select("id")
            .single();
          if (errSess) throw errSess;
          sess = novaSess;
          // movimento de abertura
          await supabase.from("caixa_movimentos").insert({
            sessao_id: sess!.id,
            clinica_id: clinicaAtual.clinica_id,
            user_id: user.id,
            tipo: "abertura",
            valor: 0,
            descricao: "Abertura automática",
          } as never);
        }
        await supabase.from("caixa_movimentos").insert({
          sessao_id: sess!.id,
          clinica_id: clinicaAtual.clinica_id,
          user_id: user.id,
          tipo: tipo === "receita" ? "recebimento" : "despesa",
          valor: Number(valor),
          descricao: descricao.trim(),
          forma_pagamento: formaFinal,
          lancamento_id: lancInserido?.id ?? null,
        } as never);
      }
    } catch (e) {
      console.error("Falha ao registrar no caixa:", e);
    }
    onSavedWithData?.({
      valor: Number(valor),
      forma_pagamento: formaFinal,
      parcelas: isCredito ? (Number(parcelas) || 1) : null,
      bandeira_cartao: isCredito ? bandeiraCartao : null,
      emitir_nfse: emitirNfse,
      pagamentos_detalhe: pagamentoMisto
        ? pagamentos
            .map((p, i) => ({
              forma: p.forma,
              pago: linhasCalc[i].pago,
              troco: linhasCalc[i].troco,
              recebido: Number(p.recebido || 0),
            }))
            .filter((x) => x.forma && x.pago > 0)
        : undefined,
    });
    setDescricao(""); setValor(""); setObservacoes(""); setCategoriaId(""); setContaId(""); setFormaPagamento("");
    setBandeiraCartao(""); setParcelas("1"); setEmitirNfse(false);
    setValorRecebido(""); setPagamentoMisto(false);
    setPagamentos([{ forma: "dinheiro", recebido: "" }]);
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className={tipo === "receita" ? "text-success" : "text-destructive"}>
            Nova {tipo === "receita" ? "Receita" : "Despesa"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto pr-1 -mr-1 flex-1 min-h-0">
          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Consulta João Silva" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor *</Label>
              <CurrencyInput
                value={valor}
                onChange={setValor}
                disabled={!!initialValor}
                readOnly={!!initialValor}
              />
              {!!initialValor && (
                <p className="text-xs text-muted-foreground">Definido pelo procedimento</p>
              )}
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
              <Select
                value={formaPagamento}
                onValueChange={(v) => {
                  setFormaPagamento(v);
                  if (v !== "cartao_credito") { setBandeiraCartao(""); setParcelas("1"); }
                  if (v !== "dinheiro") setValorRecebido("");
                }}
                disabled={pagamentoMisto}
              >
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
          {!pagamentoMisto && formaPagamento === "dinheiro" && (
            <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3">
              <div className="space-y-1.5">
                <Label>Valor recebido <span className="text-destructive">*</span></Label>
                <CurrencyInput value={valorRecebido} onChange={setValorRecebido} />
              </div>
              <div className="space-y-1.5">
                <Label>Troco</Label>
                <Input value={formatBRL(trocoDinheiro)} disabled readOnly className="font-medium" />
              </div>
              {recebidoNum > 0 && recebidoNum < valorNum && (
                <p className="col-span-2 text-xs text-destructive">
                  Valor recebido é menor que o total. Faltam {formatBRL(valorNum - recebidoNum)}.
                </p>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 rounded-md border p-3">
            <Checkbox
              id="pgto-misto"
              checked={pagamentoMisto}
              onCheckedChange={(v) => {
                const on = !!v;
                setPagamentoMisto(on);
                if (on) {
                  setFormaPagamento("");
                  setBandeiraCartao(""); setParcelas("1"); setValorRecebido("");
                }
              }}
            />
            <Label htmlFor="pgto-misto" className="cursor-pointer">Dividir em mais de uma forma de pagamento</Label>
          </div>
          {pagamentoMisto && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              {pagamentos.map((p, idx) => {
                const restanteAntes = Math.max(0, valorNum - linhasCalc.slice(0, idx).reduce((s, l) => s + l.pago, 0));
                const trocoP = linhasCalc[idx].troco;
                return (
                  <div key={idx} className="space-y-2 rounded border bg-background p-2">
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">Forma</Label>
                        <Select
                          value={p.forma}
                          onValueChange={(v) => setPagamentos((xs) => xs.map((q, i) => i === idx ? { ...q, forma: v } : q))}
                        >
                          <SelectTrigger><SelectValue placeholder="Forma" /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(FORMAS_LABEL).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Recebido</Label>
                        <CurrencyInput
                          value={p.recebido}
                          onChange={(v) => setPagamentos((xs) => xs.map((q, i) => i === idx ? { ...q, recebido: v } : q))}
                          placeholder="0,00"
                        />
                      </div>
                      <div className="flex gap-1">
                        {restanteAntes > 0 && (
                          <Button type="button" variant="outline" size="sm" onClick={() => setPagamentos((xs) => xs.map((q, i) => i === idx ? { ...q, recebido: restanteAntes.toFixed(2) } : q))}>
                            Restante
                          </Button>
                        )}
                        {pagamentos.length > 1 && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => setPagamentos((xs) => xs.filter((_, i) => i !== idx))}>×</Button>
                        )}
                      </div>
                    </div>
                    {p.forma === "dinheiro" && trocoP > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Troco: <strong>{formatBRL(trocoP)}</strong>
                      </div>
                    )}
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPagamentos((xs) => [...xs, { forma: "", recebido: "" }])}
              >
                + Adicionar forma
              </Button>
              <div className="flex justify-between text-sm pt-2 border-t">
                <span>Total pago: <strong>{formatBRL(totalPagoMisto)}</strong></span>
                <span className={restanteMisto > 0 ? "text-destructive font-medium" : "text-success font-medium"}>
                  {restanteMisto > 0 ? `Falta: ${formatBRL(restanteMisto)}` : (totalPagoMisto > valorNum ? `Excedente: ${formatBRL(totalPagoMisto - valorNum)}` : "Quitado")}
                </span>
              </div>
              {trocoMisto > 0 && (
                <p className="text-xs text-muted-foreground">Troco total: {formatBRL(trocoMisto)}</p>
              )}
            </div>
          )}
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
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? "Salvando..." : (
              <>
                <Printer className="h-4 w-4" />
                Salvar e imprimir
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
