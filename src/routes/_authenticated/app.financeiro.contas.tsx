import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, Wallet, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/financeiro/contas")({
  component: Page,
  head: () => ({ meta: [{ title: "Contas — Financeiro" }] }),
});

interface Conta {
  id: string; nome: string; tipo: string; banco: string | null;
  agencia: string | null; conta: string | null; saldo_inicial: number; ativo: boolean;
  bandeira: string | null;
}
const EMPTY = { nome: "", tipo: "banco", banco: "", agencia: "", conta: "", saldo_inicial: "0", bandeira: "" };
const BANDEIRAS = [
  { value: "visa", label: "Visa", icon: "https://cdn.simpleicons.org/visa" },
  { value: "mastercard", label: "Mastercard", icon: "https://cdn.simpleicons.org/mastercard" },
  { value: "elo", label: "Elo", icon: "https://cdn.simpleicons.org/elo" },
  { value: "amex", label: "American Express", icon: "https://cdn.simpleicons.org/americanexpress" },
  { value: "hipercard", label: "Hipercard", icon: null },
  { value: "diners", label: "Diners", icon: "https://cdn.simpleicons.org/dinersclub" },
  { value: "outra", label: "Outra", icon: null },
];
function BandeiraIcon({ value, className = "h-4 w-6" }: { value: string | null | undefined; className?: string }) {
  const b = BANDEIRAS.find((x) => x.value === value);
  if (!b?.icon) return <CreditCard className={className} />;
  return <img src={b.icon} alt={b.label} className={`${className} object-contain`} />;
}
const tipoUsaBandeira = (t: string) => t === "cartao" || t === "maquininha";
const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Page() {
  const { clinicaAtual } = useClinica();
  const [items, setItems] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Conta | null>(null);
  const [form, setForm] = useState(EMPTY);

  const load = async () => {
    if (!clinicaAtual) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("fin_contas").select("id, nome, tipo, banco, agencia, conta, saldo_inicial, ativo, bandeira")
      .eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome");
    if (error) mostrarErro(error); else setItems((data ?? []) as Conta[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [clinicaAtual?.clinica_id]);

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (c: Conta) => { setEditing(c); setForm({
    nome: c.nome, tipo: c.tipo, banco: c.banco ?? "", agencia: c.agencia ?? "",
    conta: c.conta ?? "", saldo_inicial: String(c.saldo_inicial), bandeira: c.bandeira ?? "",
  }); setOpen(true); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    setSaving(true);
    const payload = {
      clinica_id: clinicaAtual.clinica_id, nome: form.nome.trim(), tipo: form.tipo as "banco" | "caixa" | "cartao" | "maquininha" | "outro",
      banco: form.banco.trim() || null, agencia: form.agencia.trim() || null,
      conta: form.conta.trim() || null, saldo_inicial: Number(form.saldo_inicial || 0),
      bandeira: tipoUsaBandeira(form.tipo) ? (form.bandeira || null) : null,
    };
    const { error } = editing
      ? await supabase.from("fin_contas").update(payload).eq("id", editing.id)
      : await supabase.from("fin_contas").insert(payload);
    setSaving(false);
    if (error) { mostrarErro(error); return; }
    toast.success("Salvo"); setOpen(false); await load();
  };

  const remove = async (c: Conta) => {
    if (!confirm(`Excluir "${c.nome}"?`)) return;
    const { error } = await supabase.from("fin_contas").update({ ativo: false }).eq("id", c.id);
    if (error) mostrarErro(error); else { toast.success("Removida"); await load(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold">Contas</h1>
          <p className="text-sm text-muted-foreground">Contas bancárias, caixa e cartões</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew} disabled={!clinicaAtual}><Plus className="h-4 w-4 mr-2" />Nova conta</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Editar" : "Nova"} conta</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2"><Label>Nome *</Label>
                <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v, bandeira: tipoUsaBandeira(v) ? form.bandeira : "" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="banco">Banco</SelectItem>
                      <SelectItem value="caixa">Caixa</SelectItem>
                      <SelectItem value="cartao">Cartão</SelectItem>
                      <SelectItem value="maquininha">Maquininha</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select></div>
                <div className="space-y-2"><Label>Saldo inicial</Label>
                  <CurrencyInput value={form.saldo_inicial} onChange={(v) => setForm({ ...form, saldo_inicial: v })} /></div>
              </div>
              {tipoUsaBandeira(form.tipo) && (
                <div className="space-y-2">
                  <Label>Bandeira *</Label>
                  <Select value={form.bandeira} onValueChange={(v) => setForm({ ...form, bandeira: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione a bandeira" /></SelectTrigger>
                    <SelectContent>
                      {BANDEIRAS.map((b) => (
                        <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-2"><Label>Banco</Label>
                  <Input value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} /></div>
                <div className="space-y-2"><Label>Agência</Label>
                  <Input value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })} /></div>
                <div className="space-y-2"><Label>Conta</Label>
                  <Input value={form.conta} onChange={(e) => setForm({ ...form, conta: e.target.value })} /></div>
              </div>
              <DialogFooter><Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {loading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Carregando...</CardContent></Card>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma conta cadastrada.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <Card key={c.id}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><Wallet className="h-5 w-5" /></div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{c.nome}</h3>
                    <Badge variant="secondary" className="mt-1">{c.tipo}</Badge>
                    {c.bandeira && (
                      <p className="text-xs text-muted-foreground mt-1 uppercase">{BANDEIRAS.find((b) => b.value === c.bandeira)?.label ?? c.bandeira}</p>
                    )}
                    {c.banco && <p className="text-sm text-muted-foreground mt-2">{c.banco} {c.agencia && `Ag. ${c.agencia}`} {c.conta && `Cc. ${c.conta}`}</p>}
                    <p className="text-sm mt-2">Saldo inicial: <strong>{fmt(Number(c.saldo_inicial))}</strong></p>
                    <div className="mt-3 flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
