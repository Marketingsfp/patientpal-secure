import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { printOrcamento } from "@/lib/print-orcamento";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Checkbox } from "@/components/ui/checkbox";
import { DentePicker } from "./dente-picker";

interface Procedimento {
  id: string;
  nome: string;
  valor_padrao: number | null;
  valor_dinheiro: number | null;
  valor_pix: number | null;
  valor_dinheiro_pix: number | null;
  valor_cartao: number | null;
  valor_cartao_credito: number | null;
  valor_cartao_debito: number | null;
  preparo: string | null;
  valor_variavel: boolean | null;
}

interface Item {
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  procedimento_id: string | null;
  dentes: number[];
  valores_formas: Record<string, number> | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  clinicaId: string;
  pacienteId: string;
  pacienteNome: string;
  pacienteTelefone: string | null;
  especialidadeOdontoId: string;
  userId: string | null;
  onCreated: (id: string) => void;
}

const FORMAS = ["Dinheiro", "PIX", "Cartão de Crédito", "Cartão de Débito"] as const;

function valorPorForma(p: Procedimento, f: string): number {
  if (f === "Dinheiro") return Number(p.valor_dinheiro ?? p.valor_dinheiro_pix ?? p.valor_padrao ?? 0);
  if (f === "PIX") return Number(p.valor_pix ?? p.valor_dinheiro_pix ?? p.valor_padrao ?? 0);
  if (f === "Cartão de Crédito") return Number(p.valor_cartao_credito ?? p.valor_cartao ?? p.valor_padrao ?? 0);
  if (f === "Cartão de Débito") return Number(p.valor_cartao_debito ?? p.valor_cartao ?? p.valor_padrao ?? 0);
  return Number(p.valor_padrao ?? p.valor_dinheiro_pix ?? 0);
}

export function NovoOrcamentoOdontoDialog({
  open, onClose, clinicaId, pacienteId, pacienteNome, pacienteTelefone,
  especialidadeOdontoId, userId, onCreated,
}: Props) {
  const [medicoNome, setMedicoNome] = useState("");
  const [medicos, setMedicos] = useState<{ id: string; nome: string }[]>([]);
  const [medicoId, setMedicoId] = useState("");
  const [formasPagamento, setFormasPagamento] = useState<string[]>(["Dinheiro"]);
  const [desconto, setDesconto] = useState(0);
  const [validade, setValidade] = useState(30);
  const [observacoes, setObservacoes] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);

  // IDs dos procedimentos vinculados à especialidade Odontologia (cache p/ busca)
  const [procIdsOdonto, setProcIdsOdonto] = useState<Set<string> | null>(null);

  // busca
  const [procQuery, setProcQuery] = useState("");
  const [procResults, setProcResults] = useState<Procedimento[]>([]);
  const [searchingProc, setSearchingProc] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const [{ data: medRows }, { data: peRows }] = await Promise.all([
        supabase.from("medicos").select("id, nome").eq("clinica_id", clinicaId).order("nome").limit(500),
        supabase.from("procedimento_especialidades")
          .select("procedimento_id")
          .eq("clinica_id", clinicaId)
          .eq("especialidade_id", especialidadeOdontoId),
      ]);
      setMedicos((medRows ?? []) as { id: string; nome: string }[]);
      const ids = new Set(((peRows ?? []) as { procedimento_id: string }[]).map((r) => r.procedimento_id));
      setProcIdsOdonto(ids);
    })();
  }, [open, clinicaId, especialidadeOdontoId]);

  useEffect(() => {
    if (!open) {
      // reset ao fechar
      setMedicoNome(""); setMedicoId(""); setFormasPagamento(["Dinheiro"]);
      setDesconto(0); setValidade(30); setObservacoes(""); setItens([]);
      setProcQuery(""); setProcResults([]);
    }
  }, [open]);

  useEffect(() => {
    let cancel = false;
    if (!open || procQuery.trim().length < 2 || !procIdsOdonto) { setProcResults([]); return; }
    if (procIdsOdonto.size === 0) { setProcResults([]); return; }
    setSearchingProc(true);
    const t = setTimeout(async () => {
      const norm = procQuery.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const ids = Array.from(procIdsOdonto);
      // PostgREST aceita listas grandes por vírgula; 180 IDs é seguro.
      const { sanitizePostgrestSearch } = await import("@/lib/sanitize-search");
      const safeQ = sanitizePostgrestSearch(procQuery);
      const safeNorm = sanitizePostgrestSearch(norm);
      let q = supabase
        .from("procedimentos")
        .select("id, nome, valor_padrao, valor_dinheiro, valor_pix, valor_dinheiro_pix, valor_cartao, valor_cartao_credito, valor_cartao_debito, preparo, valor_variavel")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .in("id", ids);
      if (safeQ.length > 0 || safeNorm.length > 0) {
        const parts: string[] = [];
        if (safeQ.length > 0) parts.push(`nome.ilike.%${safeQ}%`);
        if (safeNorm.length > 0 && safeNorm !== safeQ)
          parts.push(`nome.ilike.%${safeNorm}%`);
        q = q.or(parts.join(","));
      }
      const { data } = await q.limit(20);
      if (!cancel) { setProcResults((data ?? []) as Procedimento[]); setSearchingProc(false); }
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [procQuery, clinicaId, open, procIdsOdonto]);

  const selecionarMedico = (id: string) => {
    setMedicoId(id);
    const m = medicos.find((x) => x.id === id);
    setMedicoNome(m?.nome ?? "");
  };

  const toggleForma = (f: string) => {
    setFormasPagamento((cur) => {
      if (cur.includes(f)) return cur.filter((x) => x !== f);
      if (cur.length >= 2) { toast.info("Máximo de 2 formas de pagamento"); return cur; }
      return [...cur, f];
    });
  };

  const adicionarProc = (p: Procedimento) => {
    if (itens.some((it) => it.procedimento_id === p.id)) {
      toast.warning(`${p.nome} já foi adicionado`); setProcQuery(""); setProcResults([]); return;
    }
    const formas = formasPagamento.length ? formasPagamento : ["Dinheiro"];
    const valores: Record<string, number> = {};
    for (const f of formas) valores[f] = valorPorForma(p, f);
    setItens((arr) => [...arr, {
      descricao: p.nome,
      quantidade: 1,
      valor_unitario: valorPorForma(p, formas[0]),
      procedimento_id: p.id,
      dentes: [],
      valores_formas: valores,
    }]);
    if (p.valor_variavel) toast.info(`${p.nome} tem valor variável — informe o valor cobrado.`);
    setProcQuery(""); setProcResults([]);
  };

  const adicionarManual = () => {
    setItens((arr) => [...arr, { descricao: "", quantidade: 1, valor_unitario: 0, procedimento_id: null, dentes: [], valores_formas: null }]);
  };

  const atualizarItem = <K extends keyof Item>(idx: number, campo: K, valor: Item[K]) => {
    setItens((arr) => arr.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)));
  };

  const remover = (idx: number) => setItens((arr) => arr.filter((_, i) => i !== idx));

  const subtotal = itens.reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.valor_unitario || 0), 0);
  const total = Math.max(0, subtotal - Number(desconto || 0));

  const totaisPorForma = useMemo(() => {
    const out: Record<string, number> = {};
    const desc = Number(desconto) || 0;
    for (const f of formasPagamento) {
      const sub = itens.reduce((s, i) => {
        const v = Number(i.valores_formas?.[f] ?? i.valor_unitario ?? 0);
        return s + Number(i.quantidade || 0) * v;
      }, 0);
      out[f] = Math.max(0, Math.round((sub - desc) * 100) / 100);
    }
    return out;
  }, [formasPagamento, itens, desconto]);

  const salvar = async () => {
    if (itens.length === 0) return toast.error("Adicione ao menos um serviço");
    if (formasPagamento.length === 0) return toast.error("Selecione ao menos uma forma de pagamento");
    for (let i = 0; i < itens.length; i++) {
      const it = itens[i];
      if (!it.descricao?.trim()) return toast.error(`Item ${i + 1}: informe a descrição`);
      const qtd = Number(it.quantidade);
      if (!Number.isFinite(qtd) || qtd < 1 || qtd > 999) return toast.error(`Item ${i + 1}: quantidade 1..999`);
      const vu = Number(it.valor_unitario);
      if (!Number.isFinite(vu) || vu <= 0) return toast.error(`Item ${i + 1}: valor deve ser > 0`);
      if (it.dentes.length > 32) return toast.error(`Item ${i + 1}: máximo 32 dentes`);
    }
    if (Number(desconto) < 0) return toast.error("Desconto não pode ser negativo");
    if (Number(desconto) > subtotal) return toast.error("Desconto não pode ser maior que o subtotal");
    if (!Number.isFinite(Number(validade)) || Number(validade) < 1) return toast.error("Validade deve ser ≥ 1");

    setSaving(true);
    const valoresPag = formasPagamento.length > 1 ? { ...totaisPorForma } : null;

    const { data: orc, error } = await supabase
      .from("orcamentos")
      .insert({
        clinica_id: clinicaId,
        numero: 0,
        categoria: "demais",
        especialidade_id: especialidadeOdontoId,
        paciente_id: pacienteId,
        paciente_nome: pacienteNome,
        paciente_telefone: pacienteTelefone,
        medico_id: medicoId || null,
        medico_nome: medicoNome.trim() || null,
        forma_pagamento: formasPagamento.join(" + "),
        valores_pagamento: valoresPag,
        validade_dias: validade,
        desconto: Number(desconto) || 0,
        valor_total: total,
        observacoes: observacoes.trim() || null,
        criado_por: userId,
      })
      .select("id")
      .single();
    if (error || !orc) { setSaving(false); return mostrarErro(error); }

    const payload = itens.map((i, idx) => ({
      orcamento_id: orc.id,
      procedimento_id: i.procedimento_id,
      descricao: i.descricao,
      quantidade: Number(i.quantidade) || 1,
      valor_unitario: Number(i.valor_unitario) || 0,
      valor_total: (Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0),
      ordem: idx,
      valores_formas: i.valores_formas ?? null,
      dentes: i.dentes.length ? i.dentes : null,
    }));
    const { error: e2 } = await supabase.from("orcamento_itens").insert(payload);
    setSaving(false);
    if (e2) return mostrarErro(e2);
    toast.success("Orçamento odontológico criado");
    try { await printOrcamento(orc.id, clinicaId); } catch (e) { toast.error((e as Error).message); }
    onCreated(orc.id);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo orçamento — Odontologia</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Paciente</Label><Input value={pacienteNome} disabled /></div>
            <div className="space-y-1"><Label>Telefone</Label><Input value={pacienteTelefone ?? ""} disabled /></div>
            <div className="space-y-1 md:col-span-2">
              <Label>Dentista</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={medicoId}
                onChange={(e) => selecionarMedico(e.target.value)}
              >
                <option value="">— selecionar —</option>
                {medicos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
          </div>

          <div>
            <Label>Forma(s) de pagamento (até 2)</Label>
            <div className="flex flex-wrap gap-3 pt-1">
              {FORMAS.map((f) => (
                <label key={f} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={formasPagamento.includes(f)} onCheckedChange={() => toggleForma(f)} />
                  {f}
                </label>
              ))}
            </div>
          </div>

          <div className="border rounded-md p-3 space-y-3">
            <Label className="text-sm">Adicionar procedimento (só especialidade Odontologia)</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                value={procQuery}
                onChange={(e) => setProcQuery(e.target.value)}
                placeholder="Digite pelo menos 2 letras — ex.: restauração, canal, extração…"
              />
              {procIdsOdonto && procIdsOdonto.size === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Nenhum procedimento cadastrado com a especialidade Odontologia. Cadastre em Serviços.
                </p>
              )}
              {procResults.length > 0 && (
                <div className="border rounded-md mt-1 max-h-64 overflow-auto bg-background shadow-sm">
                  {procResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => adicionarProc(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-0"
                    >
                      <div className="font-medium">{p.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.valor_padrao ? `Padrão R$ ${Number(p.valor_padrao).toFixed(2)}` : "Valor variável"}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {searchingProc && <p className="text-xs text-muted-foreground mt-1">Buscando…</p>}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={adicionarManual}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar item manual
            </Button>
          </div>

          {itens.length > 0 && (
            <div className="border rounded-md divide-y">
              {itens.map((it, idx) => (
                <div key={idx} className="p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_90px_140px] gap-2">
                      <Input
                        value={it.descricao}
                        onChange={(e) => atualizarItem(idx, "descricao", e.target.value)}
                        placeholder="Descrição"
                      />
                      <Input
                        type="number" min={1} max={999}
                        value={it.quantidade}
                        onChange={(e) => atualizarItem(idx, "quantidade", Number(e.target.value))}
                      />
                      <CurrencyInput
                        value={it.valor_unitario ? it.valor_unitario.toFixed(2) : ""}
                        onChange={(v) => atualizarItem(idx, "valor_unitario", v === "" ? 0 : Number(v))}
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => remover(idx)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <DentePicker value={it.dentes} onChange={(v) => atualizarItem(idx, "dentes", v)} />
                    <span className="text-xs text-muted-foreground">
                      Subtotal: R$ {(Number(it.quantidade || 0) * Number(it.valor_unitario || 0)).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Desconto</Label>
              <CurrencyInput
                value={desconto ? desconto.toFixed(2) : ""}
                onChange={(v) => setDesconto(v === "" ? 0 : Number(v))}
              />
            </div>
            <div className="space-y-1">
              <Label>Validade (dias)</Label>
              <Input
                type="number" min={1}
                value={validade}
                onChange={(e) => setValidade(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label>Total</Label>
              <div className="border rounded-md px-3 py-2 text-sm font-semibold bg-muted/40">
                R$ {total.toFixed(2)}
              </div>
            </div>
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea rows={2} maxLength={1000} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar orçamento"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}