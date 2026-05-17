import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileText, Plus, Printer, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { printOrcamento } from "@/lib/print-orcamento";

export const Route = createFileRoute("/_authenticated/app/orcamentos")({
  component: OrcamentosPage,
  head: () => ({ meta: [{ title: "Orçamentos — ClinicaOS" }] }),
});

type Orc = {
  id: string;
  numero: number;
  paciente_nome: string;
  paciente_telefone: string | null;
  medico_nome: string | null;
  forma_pagamento: string | null;
  valor_total: number;
  status: string;
  created_at: string;
};

type Procedimento = {
  id: string;
  nome: string;
  valor_dinheiro_pix: number | null;
  valor_cartao: number | null;
  valor_dinheiro: number | null;
  valor_pix: number | null;
  valor_cartao_credito: number | null;
  valor_cartao_debito: number | null;
  valor_padrao: number | null;
};

type Item = {
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  procedimento_id: string | null;
};

const FORMAS = ["Dinheiro", "PIX", "Cartão de Crédito", "Cartão de Débito", "Boleto", "Outro"];
const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function OrcamentosPage() {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const [list, setList] = useState<Orc[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("orcamentos")
      .select("id, numero, paciente_nome, paciente_telefone, medico_nome, forma_pagamento, valor_total, status, created_at")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setList((data ?? []) as Orc[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clinicaAtual?.clinica_id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((o) =>
      o.paciente_nome.toLowerCase().includes(q) ||
      String(o.numero).includes(q) ||
      (o.medico_nome ?? "").toLowerCase().includes(q),
    );
  }, [list, query]);

  const remover = async (id: string) => {
    if (!confirm("Excluir este orçamento?")) return;
    const { error } = await supabase.from("orcamentos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Orçamento excluído");
    load();
  };

  const imprimir = async (id: string) => {
    if (!clinicaAtual) return;
    try { await printOrcamento(id, clinicaAtual.clinica_id); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10"><FileText className="h-6 w-6 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-bold">Orçamentos</h1>
            <p className="text-sm text-muted-foreground">Orçamentos rápidos com impressão térmica 80mm</p>
          </div>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Novo orçamento</Button>
      </div>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por paciente, número ou médico…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-3 py-2 w-20">Nº</th>
              <th className="px-3 py-2 w-32">Data</th>
              <th className="px-3 py-2">Paciente</th>
              <th className="px-3 py-2">Médico</th>
              <th className="px-3 py-2">Pagamento</th>
              <th className="px-3 py-2 text-right w-32">Total</th>
              <th className="px-3 py-2 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Carregando…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Nenhum orçamento</td></tr>
            ) : filtered.map((o) => (
              <tr key={o.id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2 font-mono">#{String(o.numero).padStart(5, "0")}</td>
                <td className="px-3 py-2">{new Date(o.created_at).toLocaleDateString("pt-BR")}</td>
                <td className="px-3 py-2 font-medium">{o.paciente_nome}</td>
                <td className="px-3 py-2 text-muted-foreground">{o.medico_nome ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{o.forma_pagamento ?? "—"}</td>
                <td className="px-3 py-2 text-right font-semibold">{BRL(Number(o.valor_total))}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => imprimir(o.id)} title="Imprimir"><Printer className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remover(o.id)} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && clinicaAtual && (
        <NovoOrcamentoDialog
          open={open}
          onClose={() => setOpen(false)}
          clinicaId={clinicaAtual.clinica_id}
          userId={user?.id ?? null}
          onCreated={async (id) => {
            setOpen(false);
            await load();
            try { await printOrcamento(id, clinicaAtual.clinica_id); }
            catch (e) { toast.error((e as Error).message); }
          }}
        />
      )}
    </div>
  );
}

function NovoOrcamentoDialog({
  open, onClose, clinicaId, userId, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  clinicaId: string;
  userId: string | null;
  onCreated: (id: string) => void;
}) {
  const [pacienteNome, setPacienteNome] = useState("");
  const [pacienteTelefone, setPacienteTelefone] = useState("");
  const [pacienteCpf, setPacienteCpf] = useState("");
  const [medicoNome, setMedicoNome] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("Dinheiro");
  const [desconto, setDesconto] = useState(0);
  const [validade, setValidade] = useState(30);
  const [observacoes, setObservacoes] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);

  // busca de procedimentos
  const [procQuery, setProcQuery] = useState("");
  const [procResults, setProcResults] = useState<Procedimento[]>([]);
  const [searchingProc, setSearchingProc] = useState(false);

  useEffect(() => {
    let cancel = false;
    if (procQuery.trim().length < 2) { setProcResults([]); return; }
    setSearchingProc(true);
    const t = setTimeout(async () => {
      const norm = procQuery.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const { data } = await supabase
        .from("procedimentos")
        .select("id, nome, valor_dinheiro_pix, valor_cartao, valor_dinheiro, valor_pix, valor_cartao_credito, valor_cartao_debito, valor_padrao")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .or(`nome.ilike.%${procQuery}%,nome.ilike.%${norm}%`)
        .limit(20);
      if (!cancel) { setProcResults((data ?? []) as Procedimento[]); setSearchingProc(false); }
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [procQuery, clinicaId]);

  const valorDoProc = (p: Procedimento) => {
    const f = formaPagamento;
    if (f === "Dinheiro") return Number(p.valor_dinheiro ?? p.valor_dinheiro_pix ?? p.valor_padrao ?? 0);
    if (f === "PIX") return Number(p.valor_pix ?? p.valor_dinheiro_pix ?? p.valor_padrao ?? 0);
    if (f === "Cartão de Crédito") return Number(p.valor_cartao_credito ?? p.valor_cartao ?? p.valor_padrao ?? 0);
    if (f === "Cartão de Débito") return Number(p.valor_cartao_debito ?? p.valor_cartao ?? p.valor_padrao ?? 0);
    return Number(p.valor_padrao ?? p.valor_dinheiro_pix ?? 0);
  };

  const adicionarProc = (p: Procedimento) => {
    setItens((arr) => [...arr, { descricao: p.nome, quantidade: 1, valor_unitario: valorDoProc(p), procedimento_id: p.id }]);
    setProcQuery("");
    setProcResults([]);
  };

  const adicionarManual = () => {
    setItens((arr) => [...arr, { descricao: "", quantidade: 1, valor_unitario: 0, procedimento_id: null }]);
  };

  const subtotal = itens.reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.valor_unitario || 0), 0);
  const total = Math.max(0, subtotal - Number(desconto || 0));

  const salvar = async () => {
    if (!pacienteNome.trim()) return toast.error("Informe o nome do paciente");
    if (itens.length === 0) return toast.error("Adicione ao menos um procedimento");
    setSaving(true);

    const { data: orc, error } = await supabase
      .from("orcamentos")
      .insert({
        clinica_id: clinicaId,
        numero: 0,
        paciente_nome: pacienteNome.trim(),
        paciente_telefone: pacienteTelefone.trim() || null,
        paciente_cpf: pacienteCpf.trim() || null,
        medico_nome: medicoNome.trim() || null,
        forma_pagamento: formaPagamento,
        validade_dias: validade,
        desconto: Number(desconto) || 0,
        valor_total: total,
        observacoes: observacoes.trim() || null,
        criado_por: userId,
      })
      .select("id")
      .single();

    if (error || !orc) { setSaving(false); return toast.error(error?.message ?? "Erro ao salvar"); }

    const itensPayload = itens.map((i, idx) => ({
      orcamento_id: orc.id,
      procedimento_id: i.procedimento_id,
      descricao: i.descricao,
      quantidade: Number(i.quantidade) || 1,
      valor_unitario: Number(i.valor_unitario) || 0,
      valor_total: (Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0),
      ordem: idx,
    }));
    const { error: e2 } = await supabase.from("orcamento_itens").insert(itensPayload);
    setSaving(false);
    if (e2) return toast.error(e2.message);
    toast.success("Orçamento criado");
    onCreated(orc.id);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo orçamento</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Paciente *</Label><Input value={pacienteNome} onChange={(e) => setPacienteNome(e.target.value)} /></div>
            <div className="space-y-1"><Label>Telefone</Label><Input value={pacienteTelefone} onChange={(e) => setPacienteTelefone(e.target.value)} /></div>
            <div className="space-y-1"><Label>CPF</Label><Input value={pacienteCpf} onChange={(e) => setPacienteCpf(e.target.value)} /></div>
            <div className="space-y-1"><Label>Médico/Profissional</Label><Input value={medicoNome} onChange={(e) => setMedicoNome(e.target.value)} /></div>
            <div className="space-y-1">
              <Label>Forma de pagamento</Label>
              <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FORMAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Validade (dias)</Label><Input type="number" min={1} value={validade} onChange={(e) => setValidade(Number(e.target.value) || 30)} /></div>
          </div>

          <div className="space-y-2 border-t pt-3">
            <Label>Adicionar procedimento</Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar procedimento da tabela…" value={procQuery} onChange={(e) => setProcQuery(e.target.value)} />
              {procResults.length > 0 && (
                <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-popover border rounded-md shadow-lg max-h-64 overflow-y-auto">
                  {procResults.map((p) => (
                    <button key={p.id} type="button" onClick={() => adicionarProc(p)}
                      className="w-full text-left px-3 py-2 hover:bg-muted flex justify-between items-center gap-2 border-b last:border-0">
                      <span className="text-sm">{p.nome}</span>
                      <span className="text-sm font-semibold text-primary whitespace-nowrap">{BRL(valorDoProc(p))}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchingProc && <div className="text-xs text-muted-foreground mt-1">Buscando…</div>}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={adicionarManual} className="gap-1"><Plus className="h-3 w-3" /> Item manual</Button>
          </div>

          {itens.length > 0 && (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-2 py-1.5">Descrição</th>
                    <th className="px-2 py-1.5 w-20">Qtd</th>
                    <th className="px-2 py-1.5 w-32">Valor unit.</th>
                    <th className="px-2 py-1.5 w-32 text-right">Total</th>
                    <th className="px-2 py-1.5 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((it, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-2 py-1"><Input value={it.descricao} onChange={(e) => setItens((a) => a.map((x, i) => i === idx ? { ...x, descricao: e.target.value } : x))} /></td>
                      <td className="px-2 py-1"><Input type="number" min={1} step="1" value={it.quantidade} onChange={(e) => setItens((a) => a.map((x, i) => i === idx ? { ...x, quantidade: Number(e.target.value) || 0 } : x))} /></td>
                      <td className="px-2 py-1"><Input type="number" step="0.01" value={it.valor_unitario} onChange={(e) => setItens((a) => a.map((x, i) => i === idx ? { ...x, valor_unitario: Number(e.target.value) || 0 } : x))} /></td>
                      <td className="px-2 py-1 text-right font-medium">{BRL(it.quantidade * it.valor_unitario)}</td>
                      <td className="px-2 py-1"><Button size="sm" variant="ghost" onClick={() => setItens((a) => a.filter((_, i) => i !== idx))}><Trash2 className="h-3 w-3 text-destructive" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t pt-3">
            <div className="space-y-1"><Label>Observações</Label><Textarea rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} /></div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-medium">{BRL(subtotal)}</span></div>
              <div className="flex justify-between items-center gap-2 text-sm">
                <span>Desconto</span>
                <Input type="number" step="0.01" className="w-32 text-right" value={desconto} onChange={(e) => setDesconto(Number(e.target.value) || 0)} />
              </div>
              <div className="flex justify-between text-lg font-bold border-t pt-2"><span>Total</span><span className="text-primary">{BRL(total)}</span></div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving} className="gap-2"><Printer className="h-4 w-4" /> Salvar e imprimir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}