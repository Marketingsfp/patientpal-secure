import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface Procedimento {
  id: string; nome: string;
  valor_padrao: number | null; valor_dinheiro_pix: number | null;
}

interface OrcamentoAberto { id: string; numero: number; valor_total: number | null; }

interface Props {
  open: boolean;
  onClose: () => void;
  clinicaId: string;
  pacienteId: string;
  pacienteNome: string;
  pacienteTelefone: string | null;
  especialidadeOdontoId: string | null;
  userId: string | null;
  /** Dente FDI que será marcado no item criado. */
  dente: number;
  /** Recarregar odontograma/orcamentos após incluir. */
  onCreated: () => void;
}

/**
 * Diálogo rápido para incluir o dente selecionado em um orçamento (existente ou novo).
 * Fase 3 — integração odontograma × plano de tratamento.
 */
export function AddToOrcamentoDialog({
  open, onClose, clinicaId, pacienteId, pacienteNome, pacienteTelefone,
  especialidadeOdontoId, userId, dente, onCreated,
}: Props) {
  const [orcs, setOrcs] = useState<OrcamentoAberto[]>([]);
  const [alvo, setAlvo] = useState<"novo" | string>("novo");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState(0);
  const [saving, setSaving] = useState(false);

  // Busca procedimento odonto (opcional, para preencher desc/valor)
  const [procIdsOdonto, setProcIdsOdonto] = useState<Set<string> | null>(null);
  const [procQuery, setProcQuery] = useState("");
  const [procResults, setProcResults] = useState<Procedimento[]>([]);
  const [procId, setProcId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from("orcamentos")
      .select("id, numero, valor_total")
      .eq("clinica_id", clinicaId)
      .eq("paciente_id", pacienteId)
      .eq("especialidade_id", especialidadeOdontoId!)
      .eq("status", "aberto")
      .order("created_at", { ascending: false });
    setOrcs(((data ?? []) as OrcamentoAberto[]));
  }, [clinicaId, pacienteId, especialidadeOdontoId]);

  useEffect(() => {
    if (!open || !especialidadeOdontoId) return;
    void carregar();
    void (async () => {
      const { data } = await supabase
        .from("procedimento_especialidades")
        .select("procedimento_id")
        .eq("clinica_id", clinicaId)
        .eq("especialidade_id", especialidadeOdontoId);
      setProcIdsOdonto(new Set(((data ?? []) as { procedimento_id: string }[]).map((r) => r.procedimento_id)));
    })();
  }, [open, carregar, clinicaId, especialidadeOdontoId]);

  useEffect(() => {
    if (!open) {
      setAlvo("novo"); setDescricao(""); setValor(0);
      setProcQuery(""); setProcResults([]); setProcId(null);
    }
  }, [open]);

  useEffect(() => {
    let cancel = false;
    if (!open || procQuery.trim().length < 2 || !procIdsOdonto || procIdsOdonto.size === 0) {
      setProcResults([]); return;
    }
    const t = setTimeout(async () => {
      const { sanitizePostgrestSearch } = await import("@/lib/sanitize-search");
      const safe = sanitizePostgrestSearch(procQuery);
      if (!safe) { setProcResults([]); return; }
      const { data } = await supabase
        .from("procedimentos")
        .select("id, nome, valor_padrao, valor_dinheiro_pix")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .in("id", Array.from(procIdsOdonto))
        .ilike("nome", `%${safe}%`)
        .limit(15);
      if (!cancel) setProcResults((data ?? []) as Procedimento[]);
    }, 200);
    return () => { cancel = true; clearTimeout(t); };
  }, [procQuery, open, clinicaId, procIdsOdonto]);

  const selecionarProc = (p: Procedimento) => {
    setProcId(p.id);
    setDescricao(p.nome);
    setValor(Number(p.valor_dinheiro_pix ?? p.valor_padrao ?? 0));
    setProcQuery(p.nome);
    setProcResults([]);
  };

  const totalOrcs = useMemo(() => orcs.length, [orcs]);

  const salvar = async () => {
    if (!descricao.trim()) return toast.error("Informe a descrição do item");
    if (!Number.isFinite(valor) || valor <= 0) return toast.error("Valor deve ser maior que zero");
    if (!especialidadeOdontoId) return toast.error("Especialidade Odontologia não configurada");
    setSaving(true);
    try {
      let orcamentoId = alvo === "novo" ? null : alvo;
      if (!orcamentoId) {
        const { data: novo, error: e1 } = await supabase
          .from("orcamentos")
          .insert({
            clinica_id: clinicaId,
            numero: 0,
            categoria: "demais",
            especialidade_id: especialidadeOdontoId,
            paciente_id: pacienteId,
            paciente_nome: pacienteNome,
            paciente_telefone: pacienteTelefone,
            forma_pagamento: "Dinheiro",
            validade_dias: 30,
            desconto: 0,
            valor_total: valor,
            criado_por: userId,
          })
          .select("id")
          .single();
        if (e1 || !novo) throw e1 ?? new Error("Falha ao criar orçamento");
        orcamentoId = novo.id;
      }
      // Descobre próxima ordem
      const { data: ordemRow } = await supabase
        .from("orcamento_itens")
        .select("ordem")
        .eq("orcamento_id", orcamentoId)
        .order("ordem", { ascending: false })
        .limit(1)
        .maybeSingle();
      const ordem = (ordemRow?.ordem ?? -1) + 1;
      const { error: e2 } = await supabase.from("orcamento_itens").insert({
        orcamento_id: orcamentoId,
        procedimento_id: procId,
        descricao: descricao.trim(),
        quantidade: 1,
        valor_unitario: valor,
        valor_total: valor,
        ordem,
        dentes: [dente],
      });
      if (e2) throw e2;
      // Se estava adicionando a um orçamento existente, atualiza total
      if (alvo !== "novo") {
        const { data: itensTot } = await supabase
          .from("orcamento_itens").select("valor_total").eq("orcamento_id", orcamentoId);
        const subtotal = (itensTot ?? []).reduce((s, i) => s + Number(i.valor_total || 0), 0);
        await supabase.from("orcamentos").update({ valor_total: subtotal }).eq("id", orcamentoId);
      }
      toast.success(`Dente ${dente} incluído no orçamento`);
      onCreated();
      onClose();
    } catch (e) {
      mostrarErro(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Incluir dente {dente} em orçamento</DialogTitle>
          <DialogDescription>
            Adiciona um item ao plano de tratamento marcando o dente {dente}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Destino</Label>
            <RadioGroup value={alvo} onValueChange={setAlvo} className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="novo" id="alvo-novo" />
                <span>Criar novo orçamento odontológico</span>
              </label>
              {orcs.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value={o.id} id={`alvo-${o.id}`} />
                  <span>
                    Adicionar ao orçamento #{o.numero}
                    <span className="text-xs text-muted-foreground ml-1">
                      · atual R$ {Number(o.valor_total ?? 0).toFixed(2)}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
            {totalOrcs === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum orçamento odontológico aberto — será criado um novo.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Procedimento (opcional — preenche descrição e valor)</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                value={procQuery}
                onChange={(e) => { setProcQuery(e.target.value); setProcId(null); }}
                placeholder="ex.: restauração, canal, extração…"
              />
              {procResults.length > 0 && (
                <div className="border rounded-md mt-1 max-h-56 overflow-auto bg-background shadow-sm">
                  {procResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selecionarProc(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-0"
                    >
                      <div className="font-medium">{p.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.valor_padrao ? `R$ ${Number(p.valor_padrao).toFixed(2)}` : "Valor variável"}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_160px] gap-3">
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="ex.: Restauração de resina" />
            </div>
            <div className="space-y-1">
              <Label>Valor</Label>
              <CurrencyInput
                value={valor ? valor.toFixed(2) : ""}
                onChange={(v) => setValor(v === "" ? 0 : Number(v))}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Salvando…</> : "Incluir no orçamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}