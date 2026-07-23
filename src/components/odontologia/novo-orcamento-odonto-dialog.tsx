import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
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

  // Seleção corrente no odontograma (dentes que receberão o próximo serviço)
  const [selecao, setSelecao] = useState<number[]>([]);
  // Controla se o painel de busca está aberto (aparece após clicar em dente ou botão)
  const [buscaAberta, setBuscaAberta] = useState(false);

  // Todos os procedimentos da especialidade Odontologia (para o combobox multi-select)
  const [procsOdonto, setProcsOdonto] = useState<Procedimento[]>([]);
  // Seleção corrente do combobox (procedimentos marcados, ainda não adicionados)
  const [procsSelecionados, setProcsSelecionados] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      // Médicos que atendem Odontologia (join via medico_especialidades)
      const { data: medRows } = await supabase
        .from("medicos")
        .select("id, nome, medico_especialidades!inner(especialidade_id)")
        .eq("clinica_id", clinicaId)
        .eq("medico_especialidades.especialidade_id", especialidadeOdontoId)
        .order("nome")
        .limit(500);
      setMedicos(((medRows ?? []) as { id: string; nome: string }[]).map((m) => ({ id: m.id, nome: m.nome })));

      // Procedimentos vinculados à especialidade Odontologia — carrega todos para lista suspensa
      const { data: peRows } = await supabase
        .from("procedimento_especialidades")
        .select("procedimento_id")
        .eq("clinica_id", clinicaId)
        .eq("especialidade_id", especialidadeOdontoId);
      const ids = ((peRows ?? []) as { procedimento_id: string }[]).map((r) => r.procedimento_id);
      if (ids.length === 0) { setProcsOdonto([]); return; }
      const { data: procRows } = await supabase
        .from("procedimentos")
        .select("id, nome, valor_padrao, valor_dinheiro, valor_pix, valor_dinheiro_pix, valor_cartao, valor_cartao_credito, valor_cartao_debito, preparo, valor_variavel")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .in("id", ids)
        .order("nome")
        .limit(1000);
      setProcsOdonto((procRows ?? []) as Procedimento[]);
    })();
  }, [open, clinicaId, especialidadeOdontoId]);

  useEffect(() => {
    if (!open) {
      // reset ao fechar
      setMedicoNome(""); setMedicoId(""); setFormasPagamento(["Dinheiro"]);
      setDesconto(0); setValidade(30); setObservacoes(""); setItens([]);
      setProcsSelecionados([]);
      setSelecao([]); setBuscaAberta(false);
    }
  }, [open]);

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

  // Adiciona os procedimentos selecionados no combobox — 1 item por dente x procedimento.
  // Ex.: 3 procedimentos em 2 dentes = 6 linhas independentes.
  const adicionarProcsSelecionados = () => {
    if (procsSelecionados.length === 0) { toast.info("Selecione ao menos um procedimento"); return; }
    const dentes = selecao.length > 0 ? [...selecao].sort((a, b) => a - b) : [null as number | null];
    const formas = formasPagamento.length ? formasPagamento : ["Dinheiro"];
    const novos: Item[] = [];
    let algumVariavel = false;
    for (const d of dentes) {
      for (const pid of procsSelecionados) {
        const p = procsOdonto.find((x) => x.id === pid);
        if (!p) continue;
        const valores: Record<string, number> = {};
        for (const f of formas) valores[f] = valorPorForma(p, f);
        novos.push({
          descricao: p.nome,
          quantidade: 1,
          valor_unitario: valorPorForma(p, formas[0]),
          procedimento_id: p.id,
          dentes: d != null ? [d] : [],
          valores_formas: valores,
        });
        if (p.valor_variavel) algumVariavel = true;
      }
    }
    if (novos.length === 0) return;
    // Novos itens ficam no topo da lista (mais recente primeiro)
    setItens((arr) => [...novos.reverse(), ...arr]);
    if (algumVariavel) toast.info("Algum procedimento tem valor variável — revise no fechamento.");
    setProcsSelecionados([]);
    setSelecao([]); setBuscaAberta(false);
  };

  const adicionarManual = () => {
    // Item sem dente: seleciona serviço(s) da lista de Odontologia, mas não vincula a dentes.
    setSelecao([]);
    setBuscaAberta(true);
  };

  const abrirBuscaComDente = (d: number) => {
    // Toggle: clicar de novo em um dente já selecionado remove ele
    setSelecao((cur) => {
      const set = new Set(cur);
      if (set.has(d)) set.delete(d); else set.add(d);
      const arr = Array.from(set).sort((a, b) => a - b);
      if (arr.length > 0) setBuscaAberta(true);
      else setBuscaAberta(false);
      return arr;
    });
  };

  const selecionarArcada = (tipo: "sup" | "inf") => {
    const sup = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
    const inf = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
    setSelecao(tipo === "sup" ? sup : inf);
    setBuscaAberta(true);
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
      if (!Number.isFinite(vu) || vu <= 0) return toast.error(`Item ${i + 1}: valor deve ser > 0 (procedimento sem valor cadastrado)`);
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
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo orçamento — Odontologia</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cabeçalho compacto */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Paciente</Label><Input value={pacienteNome} disabled /></div>
            <div className="space-y-1"><Label>Telefone</Label><Input value={pacienteTelefone ?? ""} disabled /></div>
            <div className="space-y-1">
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

          {/* Odontograma — seleção de dentes */}
          <div className="border rounded-md p-3 space-y-3 bg-muted/20">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <Label className="text-sm">Odontograma</Label>
                <p className="text-xs text-muted-foreground">
                  Clique nos dentes que receberão o serviço, ou selecione uma arcada inteira.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => selecionarArcada("sup")}>
                  Arcada superior
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => selecionarArcada("inf")}>
                  Arcada inferior
                </Button>
                <Button
                  type="button" size="sm" variant="ghost"
                  onClick={() => { setSelecao([]); setBuscaAberta(false); }}
                  disabled={selecao.length === 0}
                >
                  Limpar
                </Button>
              </div>
            </div>
            <div className="rounded-md bg-background p-2">
              <DentePicker
                inline
                value={selecao}
                onChange={(v) => { setSelecao(v); if (v.length > 0) setBuscaAberta(true); else setBuscaAberta(false); }}
              />
            </div>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div />
              <div className="flex gap-2">
                <Button
                  type="button" size="sm"
                  onClick={() => setBuscaAberta(true)}
                  disabled={selecao.length === 0}
                >
                  <Plus className="h-4 w-4 mr-1" /> Adicionar serviço aos dentes selecionados
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={adicionarManual}>
                  Serviço sem dente
                </Button>
              </div>
            </div>

            {buscaAberta && (
              <div className="border rounded-md p-3 bg-background space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Escolher procedimento(s) — Odontologia</Label>
                  <button
                    type="button"
                    onClick={() => { setBuscaAberta(false); setProcsSelecionados([]); }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                    aria-label="Fechar"
                  >
                    Fechar
                  </button>
                </div>
                {procsOdonto.length === 0 ? (
                  <p className="text-xs text-amber-600">
                    Nenhum procedimento cadastrado na especialidade Odontologia. Cadastre em Serviços.
                  </p>
                ) : (
                  <>
                    <SearchableMultiSelect
                      options={procsOdonto.map((p) => ({ value: p.id, label: p.nome }))}
                      value={procsSelecionados}
                      onChange={setProcsSelecionados}
                      placeholder="Selecione um ou mais procedimentos…"
                      searchPlaceholder="Filtrar por nome…"
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        onClick={adicionarProcsSelecionados}
                        disabled={procsSelecionados.length === 0}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar {procsSelecionados.length > 0 ? `(${procsSelecionados.length})` : ""}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Lista de itens */}
          {itens.length > 0 && (
            <div className="border rounded-md">
              <div className="px-3 py-2 border-b bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Serviços incluídos ({itens.length})
              </div>
              <div className="divide-y">
                {itens.map((it, idx) => {
                  const valDin = Number(it.valores_formas?.["Dinheiro"] ?? it.valores_formas?.["PIX"] ?? it.valor_unitario ?? 0);
                  const valCart = Number(it.valores_formas?.["Cartão de Crédito"] ?? it.valores_formas?.["Cartão de Débito"] ?? it.valor_unitario ?? 0);
                  const sub = Number(it.quantidade || 0) * Number(it.valor_unitario || 0);
                  return (
                    <div key={idx} className="p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-2">
                          {it.procedimento_id != null && (
                            <div className="flex items-start gap-2 flex-wrap">
                              <div className="flex flex-wrap gap-1 min-w-[120px]">
                                {it.dentes.length === 0 ? (
                                  <span className="text-xs text-muted-foreground italic">sem dente</span>
                                ) : (
                                  it.dentes.map((d) => (
                                    <Badge key={d} variant="secondary" className="font-mono text-[11px]">{d}</Badge>
                                  ))
                                )}
                                <DentePicker value={it.dentes} onChange={(v) => atualizarItem(idx, "dentes", v)} />
                              </div>
                            </div>
                          )}
                          <div className="grid grid-cols-1 md:grid-cols-[1fr_70px_120px_120px] gap-2 items-center">
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
                            {it.procedimento_id == null ? (
                              <div className="space-y-0.5 md:col-span-2">
                                <div className="text-[10px] text-muted-foreground">Valor unitário</div>
                                <CurrencyInput
                                  value={it.valor_unitario ? it.valor_unitario.toFixed(2) : ""}
                                  onChange={(v) => atualizarItem(idx, "valor_unitario", v === "" ? 0 : Number(v))}
                                />
                              </div>
                            ) : (
                              <>
                                <div className="space-y-0.5">
                                  <div className="text-[10px] text-muted-foreground">Dinheiro/PIX</div>
                                  <div className="text-sm tabular-nums">R$ {valDin.toFixed(2)}</div>
                                </div>
                                <div className="space-y-0.5">
                                  <div className="text-[10px] text-muted-foreground">Cartão</div>
                                  <div className="text-sm tabular-nums">R$ {valCart.toFixed(2)}</div>
                                </div>
                              </>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Subtotal deste item: <span className="font-medium text-foreground">R$ {sub.toFixed(2)}</span>
                          </div>
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => remover(idx)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
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