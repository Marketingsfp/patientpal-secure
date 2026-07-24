import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  applyAcrescimoCartao,
  findRegra,
  computeValor,
  isConvenioFuncionarioNome,
  type CbRegra,
  type CbAcrescimoCartao,
} from "@/lib/cb-regras";

interface Procedimento {
  id: string;
  nome: string;
  valor_padrao: number | null;
  valor_dinheiro_pix: number | null;
  tipo: string | null;
}

interface OrcamentoAberto { id: string; numero: number; valor_total: number | null; }

/** Convênio ativo do paciente (via titular ou dependente). */
interface ConvenioPaciente {
  convenioId: string;
  convenioNome: string;
  acrescimo: CbAcrescimoCartao | null;
  regras: CbRegra[];
}

/** Linha exibida no bloco "Formas de pagamento". */
interface LinhaPreco {
  chave: string;
  rotulo: string;
  valorDinheiro: number;
  valorCartao: number;
  gratuito?: boolean;
  destaque?: boolean;
}

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
  const [saving, setSaving] = useState(false);

  const [procIdsOdonto, setProcIdsOdonto] = useState<Set<string> | null>(null);
  const [procQuery, setProcQuery] = useState("");
  const [procResults, setProcResults] = useState<Procedimento[]>([]);
  const [procSel, setProcSel] = useState<Procedimento | null>(null);
  const [convenios, setConvenios] = useState<ConvenioPaciente[]>([]);
  const [loadingConv, setLoadingConv] = useState(false);

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

  // Carrega convênios ativos do paciente + regras da Odontologia.
  useEffect(() => {
    if (!open || !especialidadeOdontoId || !pacienteId) { setConvenios([]); return; }
    let cancel = false;
    void (async () => {
      setLoadingConv(true);
      try {
        // 1) Contratos ativos do paciente (titular)
        const { data: titRows } = await supabase
          .from("contratos_assinatura")
          .select("id,convenio_id,cb_convenios(nome,acrescimo_cartao_modo,acrescimo_cartao_percentual,acrescimo_cartao_valor)")
          .eq("clinica_id", clinicaId)
          .eq("status", "ativo")
          .eq("paciente_id", pacienteId);
        // 2) Contratos como dependente
        const { data: depRows } = await supabase
          .from("contrato_dependentes")
          .select("contratos_assinatura!inner(id,clinica_id,status,convenio_id,cb_convenios(nome,acrescimo_cartao_modo,acrescimo_cartao_percentual,acrescimo_cartao_valor))")
          .eq("paciente_id", pacienteId)
          .eq("ativo", true);
        const contratosDep = ((depRows ?? []) as any[])
          .map((d) => d.contratos_assinatura)
          .filter((c: any) => c && c.clinica_id === clinicaId && c.status === "ativo");
        const todos = [...((titRows ?? []) as any[]), ...contratosDep];
        // Dedupe por convenio_id, ignora contratos sem convênio
        const porConvenio = new Map<string, any>();
        for (const c of todos) {
          if (!c?.convenio_id || porConvenio.has(c.convenio_id)) continue;
          porConvenio.set(c.convenio_id, c);
        }
        if (porConvenio.size === 0) { if (!cancel) setConvenios([]); return; }

        // 3) Regras da especialidade Odontologia por convênio
        const conveniosIds = Array.from(porConvenio.keys());
        const { data: regrasRaw } = await supabase
          .from("cb_convenio_regras")
          .select("id,convenio_id,especialidade_id,procedimento_id,tipo,modo,valor,valor_cartao,percentual,percentual_cartao,prioridade,ativo,carencia_mensalidades,gratuito,limite_qtd,limite_periodo,limite_escopo,excedente_modo,excedente_percentual,excedente_valor,grupo_gratuidade")
          .in("convenio_id", conveniosIds)
          .eq("ativo", true);
        const regrasByConv = new Map<string, CbRegra[]>();
        for (const r of ((regrasRaw ?? []) as CbRegra[])) {
          const arr = regrasByConv.get(r.convenio_id) ?? [];
          arr.push(r);
          regrasByConv.set(r.convenio_id, arr);
        }

        const lista: ConvenioPaciente[] = Array.from(porConvenio.values()).map((c: any) => {
          const cb = c.cb_convenios ?? {};
          const acr: CbAcrescimoCartao | null = cb.acrescimo_cartao_modo
            ? {
                modo: cb.acrescimo_cartao_modo,
                percentual: Number(cb.acrescimo_cartao_percentual) || 0,
                valor: Number(cb.acrescimo_cartao_valor) || 0,
              }
            : null;
          return {
            convenioId: c.convenio_id,
            convenioNome: cb.nome ?? "Convênio",
            acrescimo: acr,
            regras: regrasByConv.get(c.convenio_id) ?? [],
          };
        });
        if (!cancel) setConvenios(lista);
      } finally {
        if (!cancel) setLoadingConv(false);
      }
    })();
    return () => { cancel = true; };
  }, [open, clinicaId, pacienteId, especialidadeOdontoId]);

  useEffect(() => {
    if (!open) {
      setAlvo("novo");
      setProcQuery(""); setProcResults([]); setProcSel(null);
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
        .select("id, nome, valor_padrao, valor_dinheiro_pix, tipo")
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
    setProcSel(p);
    setProcQuery(p.nome);
    setProcResults([]);
  };

  const totalOrcs = useMemo(() => orcs.length, [orcs]);

  // Deriva as linhas de preço a partir do procedimento selecionado + convênios.
  const linhasPreco = useMemo<LinhaPreco[]>(() => {
    if (!procSel) return [];
    const baseCartao = Number(procSel.valor_padrao) || 0;
    const baseDinheiro = Number(procSel.valor_dinheiro_pix ?? procSel.valor_padrao) || 0;
    const linhas: LinhaPreco[] = [
      { chave: "din", rotulo: "Dinheiro", valorDinheiro: baseDinheiro, valorCartao: baseDinheiro },
      { chave: "cartaopix", rotulo: "Cartão / PIX", valorDinheiro: baseCartao, valorCartao: baseCartao },
    ];
    const tipoNorm = (procSel.tipo ?? "").toLowerCase() || null;
    for (const c of convenios) {
      const regra = findRegra(c.regras, especialidadeOdontoId, tipoNorm, procSel.id);
      if (!regra) continue; // só lista se houver benefício aplicável
      if (regra.gratuito) {
        linhas.push({
          chave: `conv-${c.convenioId}`,
          rotulo: `${c.convenioNome} — gratuito`,
          valorDinheiro: 0,
          valorCartao: 0,
          gratuito: true,
          destaque: true,
        });
        continue;
      }
      const v = computeValor(regra, baseDinheiro, baseCartao);
      if (!v) continue;
      const acrCartao = isConvenioFuncionarioNome(c.convenioNome)
        ? v.outros
        : applyAcrescimoCartao(v.outros, c.acrescimo, c.convenioNome);
      linhas.push({
        chave: `conv-${c.convenioId}`,
        rotulo: c.convenioNome,
        valorDinheiro: v.dinheiro,
        valorCartao: acrCartao,
        destaque: true,
      });
    }
    return linhas;
  }, [procSel, convenios, especialidadeOdontoId]);

  const salvar = async () => {
    if (!procSel) return toast.error("Selecione um serviço odontológico");
    const valor = Number(procSel.valor_dinheiro_pix ?? procSel.valor_padrao) || 0;
    if (!(valor > 0)) return toast.error("Este serviço não possui valor cadastrado");
    const valorCartao = Number(procSel.valor_padrao ?? procSel.valor_dinheiro_pix) || 0;
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
        procedimento_id: procSel.id,
        descricao: procSel.nome,
        quantidade: 1,
        valor_unitario: valor,
        valor_total: valor,
        ordem,
        dentes: [dente],
        // Grava Dinheiro, PIX e Cartão. PIX é agrupado com Cartão (regra da clínica),
        // por isso PIX recebe o mesmo valor do Cartão de Crédito.
        valores_formas: {
          Dinheiro: valor,
          PIX: valorCartao,
          "Cartão de Crédito": valorCartao,
        },
      });
      if (e2) throw e2;
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
            <Label>Serviço odontológico</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                value={procQuery}
                onChange={(e) => { setProcQuery(e.target.value); setProcSel(null); }}
                placeholder="Buscar serviço cadastrado em Odontologia…"
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
            {!procSel && (
              <p className="text-xs text-muted-foreground">
                Digite ao menos 2 letras para buscar. Só aparecem serviços vinculados à especialidade Odontologia.
              </p>
            )}
          </div>

          {procSel && (
            <div className="space-y-2 rounded-md border p-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{procSel.nome}</div>
                {loadingConv && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 text-xs">
                <div className="text-muted-foreground">Forma</div>
                <div className="text-muted-foreground text-right">Dinheiro</div>
                <div className="text-muted-foreground text-right">Cartão/PIX</div>
                {linhasPreco.map((l) => (
                  <div key={l.chave} className="contents">
                    <div className={l.destaque ? "font-medium text-emerald-700" : ""}>{l.rotulo}</div>
                    <div className="text-right tabular-nums">
                      {l.gratuito ? "—" : `R$ ${l.valorDinheiro.toFixed(2)}`}
                    </div>
                    <div className="text-right tabular-nums">
                      {l.gratuito ? "—" : `R$ ${l.valorCartao.toFixed(2)}`}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground pt-1">
                O item é lançado no orçamento pelo valor cheio; a forma de pagamento é escolhida no fechamento.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !procSel}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Salvando…</> : "Incluir no orçamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}