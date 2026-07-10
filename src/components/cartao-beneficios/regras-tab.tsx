import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, RefreshCw, Timer, Gift } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { findRegra, computeValor, type CbRegra } from "@/lib/cb-regras";

type EspOpt = { id: string; nome: string };
type ProcOpt = { id: string; nome: string; codigo: string | null };

interface Props {
  clinicaId: string;
  convenioId: string | null; // null = convênio ainda não salvo
  convenioNome: string;
}

const TIPOS = ["consulta", "exame", "procedimento", "cirurgia"];

export function RegrasConvenioTab({ clinicaId, convenioId, convenioNome }: Props) {
  const [regras, setRegras] = useState<CbRegra[]>([]);
  const [especialidades, setEspecialidades] = useState<EspOpt[]>([]);
  const [procedimentos, setProcedimentos] = useState<ProcOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [reapplying, setReapplying] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [limiteIdx, setLimiteIdx] = useState<number | null>(null);

  const load = async () => {
    if (!convenioId) return;
    setLoading(true);
    const [{ data: r, error: e1 }, { data: e, error: e2 }] = await Promise.all([
      (supabase as any)
        .from("cb_convenio_regras")
        .select(
          "id,convenio_id,especialidade_id,procedimento_id,tipo,modo,valor,percentual,prioridade,ativo,limite_qtd,limite_periodo,limite_escopo,excedente_modo,excedente_percentual,excedente_valor,carencia_mensalidades,gratuito",
        )
        .eq("convenio_id", convenioId)
        .order("prioridade", { ascending: false }),
      supabase.from("especialidades").select("id,nome").eq("ativo", true).order("nome"),
    ]);
    // Paginar procedimentos — PostgREST corta em db-max-rows=1000, o que
    // ocultava serviços (ex.: "Preventivo") em clínicas com catálogo grande.
    const PAGE = 1000;
    const allProcs: ProcOpt[] = [];
    let e3: any = null;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("procedimentos")
        .select("id,nome,codigo")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .order("nome")
        .range(from, from + PAGE - 1);
      if (error) {
        e3 = error;
        break;
      }
      const page = (data ?? []) as ProcOpt[];
      allProcs.push(...page);
      if (page.length < PAGE) break;
    }
    setLoading(false);
    if (e1) {
      mostrarErro(e1);
      return;
    }
    if (e2) {
      mostrarErro(e2);
      return;
    }
    if (e3) {
      mostrarErro(e3);
      return;
    }
    setRegras((r ?? []) as CbRegra[]);
    setEspecialidades((e ?? []) as EspOpt[]);
    setProcedimentos(allProcs);
  };

  useEffect(() => {
    void load(); /* eslint-disable-next-line */
  }, [convenioId]);

  const espOpts = useMemo(
    () => [
      { value: "__any__", label: "Qualquer especialidade" },
      ...especialidades.map((e) => ({ value: e.id, label: e.nome })),
    ],
    [especialidades],
  );

  const procOpts = useMemo(
    () => [
      { value: "__any__", label: "Qualquer serviço" },
      ...procedimentos.map((p) => ({
        value: p.id,
        label: p.codigo ? `${p.codigo} — ${p.nome}` : p.nome,
      })),
    ],
    [procedimentos],
  );

  const addRegra = () => {
    if (!convenioId) return;
    setRegras((prev) => [
      {
        id: `new-${crypto.randomUUID()}`,
        convenio_id: convenioId,
        especialidade_id: null,
        procedimento_id: null,
        tipo: null,
        modo: "valor_fixo",
        valor: 0,
        percentual: null,
        prioridade: 10,
        ativo: true,
        limite_qtd: null,
        limite_periodo: null,
        limite_escopo: null,
        excedente_modo: null,
        excedente_percentual: null,
        excedente_valor: null,
        carencia_mensalidades: 0,
        gratuito: false,
      },
      ...prev,
    ]);
  };

  const update = (idx: number, patch: Partial<CbRegra>) => {
    setRegras((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const remove = async (idx: number) => {
    const r = regras[idx];
    if (!confirm("Excluir esta regra?")) return;
    if (!r.id.startsWith("new-")) {
      const { error } = await (supabase as any).from("cb_convenio_regras").delete().eq("id", r.id);
      if (error) {
        mostrarErro(error);
        return;
      }
    }
    setRegras((prev) => prev.filter((_, i) => i !== idx));
  };

  const salvar = async () => {
    if (!convenioId) return;
    setLoading(true);
    // upsert: para cada regra, insert ou update
    for (const r of regras) {
      const payload: any = {
        clinica_id: clinicaId,
        convenio_id: convenioId,
        // quando a regra é por serviço específico, ignora especialidade/tipo
        procedimento_id: r.procedimento_id ?? null,
        especialidade_id: r.procedimento_id ? null : r.especialidade_id,
        tipo: r.procedimento_id ? null : r.tipo,
        modo: r.modo,
        valor: r.modo === "valor_fixo" ? Number(r.valor) || 0 : null,
        percentual: r.modo === "percentual_desconto" ? Number(r.percentual) || 0 : null,
        prioridade: Number(r.prioridade) || 1,
        ativo: r.ativo !== false,
        limite_qtd: r.limite_qtd != null ? Number(r.limite_qtd) : null,
        limite_periodo: r.limite_qtd != null ? (r.limite_periodo ?? "dia") : null,
        limite_escopo: r.limite_qtd != null ? (r.limite_escopo ?? "contrato") : null,
        excedente_modo: r.limite_qtd != null ? (r.excedente_modo ?? "percentual_particular") : null,
        excedente_percentual:
          r.limite_qtd != null &&
          (r.excedente_modo ?? "percentual_particular") === "percentual_particular"
            ? Number(r.excedente_percentual ?? 50)
            : null,
        excedente_valor:
          r.limite_qtd != null && r.excedente_modo === "valor_fixo"
            ? Number(r.excedente_valor ?? 0)
            : null,
        carencia_mensalidades: Number(r.carencia_mensalidades ?? 0) || 0,
        gratuito: !!r.gratuito,
      };
      if (r.id.startsWith("new-")) {
        const { error } = await (supabase as any).from("cb_convenio_regras").insert(payload);
        if (error) {
          setLoading(false);
          mostrarErro(error);
          return;
        }
      } else {
        const { error } = await (supabase as any)
          .from("cb_convenio_regras")
          .update(payload)
          .eq("id", r.id);
        if (error) {
          setLoading(false);
          mostrarErro(error);
          return;
        }
      }
    }
    setLoading(false);
    toast.success("Regras salvas.");
    await load();
  };

  /**
   * Reaplica as regras do convênio a todos os serviços da clínica:
   * para cada serviço, resolve a especialidade (via procedimento_especialidades
   * para consultas N:N, ou via campo grupo) e o tipo, calcula o valor e
   * faz upsert em procedimento_cb_convenio_valores.
   */
  const reaplicar = async () => {
    if (!convenioId) return;
    if (
      !confirm(
        `Reaplicar as regras de "${convenioNome}" a todos os serviços? Valores manuais serão sobrescritos onde houver regra correspondente.`,
      )
    )
      return;
    setReapplying(true);
    setProgress("Carregando serviços…");
    try {
      // 1) carrega procedimentos (paginado, db-max-rows = 1000)
      const PAGE = 1000;
      const procs: any[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("procedimentos")
          .select(
            "id,grupo,tipo,valor_dinheiro,valor_dinheiro_pix,valor_padrao,valor_pix,valor_cartao_credito,valor_cartao_debito,valor_cartao",
          )
          .eq("clinica_id", clinicaId)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const page = data ?? [];
        procs.push(...page);
        if (page.length < PAGE) break;
      }

      // 2) carrega vínculos N:N de especialidades
      const { data: vinc, error: errVinc } = await supabase
        .from("procedimento_especialidades")
        .select("procedimento_id,especialidade_id")
        .eq("clinica_id", clinicaId);
      if (errVinc) throw errVinc;
      const vincMap = new Map<string, string[]>();
      (vinc ?? []).forEach((v: any) => {
        const arr = vincMap.get(v.procedimento_id) ?? [];
        arr.push(v.especialidade_id);
        vincMap.set(v.procedimento_id, arr);
      });

      // 3) índice especialidade por nome (normalizado)
      const norm = (s: string) =>
        (s ?? "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim();
      const espByName = new Map<string, string>();
      especialidades.forEach((e) => espByName.set(norm(e.nome), e.id));

      // 4) calcula valores
      setProgress(`Processando ${procs.length} serviços…`);
      const upserts: any[] = [];
      for (const p of procs) {
        const baseDin = Number(p.valor_dinheiro ?? p.valor_dinheiro_pix ?? p.valor_padrao) || 0;
        const baseOut =
          Number(
            p.valor_pix ?? p.valor_cartao_credito ?? p.valor_cartao_debito ?? p.valor_cartao,
          ) || 0;
        const tipo = (p.tipo ?? "").toLowerCase() || null;
        // tenta cada especialidade possível e usa a melhor regra
        const possibleEspIds: (string | null)[] = [];
        const nn = vincMap.get(p.id) ?? [];
        possibleEspIds.push(...nn);
        if (p.grupo) {
          const id = espByName.get(norm(p.grupo));
          if (id && !possibleEspIds.includes(id)) possibleEspIds.push(id);
        }
        if (possibleEspIds.length === 0) possibleEspIds.push(null);
        let best: ReturnType<typeof computeValor> = null;
        let bestScore = -1;
        for (const eid of possibleEspIds) {
          const r = findRegra(regras, eid, tipo, p.id);
          if (!r) continue;
          const sc =
            (r.procedimento_id ? 100 : 0) +
            (r.especialidade_id ? 10 : 0) +
            (r.tipo ? 5 : 0) +
            (r.prioridade || 0) * 0.01;
          if (sc > bestScore) {
            const v = computeValor(r, baseDin, baseOut);
            if (v) {
              best = v;
              bestScore = sc;
            }
          }
        }
        if (best) {
          upserts.push({
            clinica_id: clinicaId,
            procedimento_id: p.id,
            convenio_id: convenioId,
            valor_dinheiro: best.dinheiro,
            valor_outros: best.outros,
          });
        }
      }

      // 5) upsert em lotes
      const BATCH = 500;
      for (let i = 0; i < upserts.length; i += BATCH) {
        const slice = upserts.slice(i, i + BATCH);
        setProgress(`Gravando ${i + slice.length}/${upserts.length}…`);
        const { error } = await (supabase as any)
          .from("procedimento_cb_convenio_valores")
          .upsert(slice, { onConflict: "procedimento_id,convenio_id" });
        if (error) throw error;
      }
      toast.success(`Regras aplicadas a ${upserts.length} serviços.`);
    } catch (err: any) {
      mostrarErro(err);
    } finally {
      setReapplying(false);
      setProgress("");
    }
  };

  // Pré-visualização: aplica primeira regra encontrada num serviço fictício
  const sample = (r: CbRegra): string => {
    const v = computeValor(r, 100, 100);
    if (!v) return "—";
    if (r.modo === "valor_fixo") return `R$ ${v.dinheiro.toFixed(2)} (fixo)`;
    return `de R$100 → R$ ${v.dinheiro.toFixed(2)} (${r.percentual}% off)`;
  };

  if (!convenioId) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center border rounded-md">
        Salve o convênio antes de cadastrar regras de preço.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">Regras de preço automáticas</div>
          <p className="text-sm text-muted-foreground">
            Cadastre regras por serviço específico, especialidade e/ou tipo. A regra mais específica
            e de maior prioridade vence (serviço &gt; especialidade+tipo &gt; especialidade &gt;
            tipo). Ao cadastrar um serviço, o valor deste convênio será preenchido automaticamente.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button variant="ghost" size="sm" onClick={addRegra}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar regra
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={reaplicar}
            disabled={reapplying || regras.length === 0}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${reapplying ? "animate-spin" : ""}`} />
            {reapplying ? progress || "Aplicando…" : "Reaplicar a todos os serviços"}
          </Button>
        </div>
      </div>

      <div className="border rounded-md overflow-x-auto max-w-full">
        <Table className="min-w-[1400px]">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Especialidade</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="min-w-[220px]">Serviço</TableHead>
              <TableHead>Modo</TableHead>
              <TableHead className="text-right">Valor / %</TableHead>
              <TableHead className="w-20">Prioridade</TableHead>
              <TableHead>Exemplo</TableHead>
              <TableHead>Limite</TableHead>
              <TableHead>Carência</TableHead>
              <TableHead className="text-center">Gratuito</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-6">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : regras.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-6">
                  Nenhuma regra. Clique em "Adicionar regra".
                </TableCell>
              </TableRow>
            ) : (
              regras.map((r, idx) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <SearchableSelect
                      options={espOpts}
                      value={r.especialidade_id ?? "__any__"}
                      onChange={(v) =>
                        update(idx, { especialidade_id: v === "__any__" ? null : v })
                      }
                      placeholder="Qualquer"
                      disabled={!!r.procedimento_id}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={r.tipo ?? "__any__"}
                      onValueChange={(v) => update(idx, { tipo: v === "__any__" ? null : v })}
                      disabled={!!r.procedimento_id}
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__any__">Qualquer</SelectItem>
                        {TIPOS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <SearchableSelect
                      options={procOpts}
                      value={r.procedimento_id ?? "__any__"}
                      onChange={(v) =>
                        update(idx, {
                          procedimento_id: v === "__any__" ? null : v,
                          // limpar filtros por especialidade/tipo quando escolhe serviço
                          ...(v !== "__any__" ? { especialidade_id: null, tipo: null } : {}),
                        })
                      }
                      placeholder="Qualquer serviço"
                    />
                  </TableCell>
                  <TableCell>
                    <Select value={r.modo} onValueChange={(v) => update(idx, { modo: v })}>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="valor_fixo">Valor fixo</SelectItem>
                        <SelectItem value="percentual_desconto">% desconto</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.modo === "valor_fixo" ? (
                      <CurrencyInput
                        className="w-28 text-right"
                        value={r.valor !== null ? Number(r.valor).toFixed(2) : ""}
                        onChange={(v) => update(idx, { valor: v ? parseFloat(v) : 0 })}
                      />
                    ) : (
                      <Input
                        className="w-20 text-right"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={r.percentual ?? ""}
                        onChange={(e) =>
                          update(idx, {
                            percentual: e.target.value ? parseFloat(e.target.value) : 0,
                          })
                        }
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      className="w-16"
                      type="number"
                      min="1"
                      max="100"
                      value={r.prioridade}
                      onChange={(e) => update(idx, { prioridade: parseInt(e.target.value) || 1 })}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{sample(r)}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant={r.limite_qtd ? "secondary" : "ghost"}
                      className="text-xs h-7"
                      onClick={() => setLimiteIdx(idx)}
                      title="Configurar limite de uso"
                    >
                      <Timer className="h-3.5 w-3.5 mr-1" />
                      {r.limite_qtd
                        ? `${r.limite_qtd}/${r.limite_periodo ?? "dia"} ${r.limite_escopo === "paciente" ? "paciente" : r.limite_escopo === "titular_ou_dependente" ? "titular-ou-dep" : "contrato"}`
                        : "Sem limite"}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={String(r.carencia_mensalidades ?? 0)}
                      onValueChange={(v) => update(idx, { carencia_mensalidades: Number(v) })}
                    >
                      <SelectTrigger className="w-40 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Imediato</SelectItem>
                        <SelectItem value="2">Após 2ª mensalidade</SelectItem>
                        <SelectItem value="6">Após 6ª mensalidade</SelectItem>
                        <SelectItem value="1">Após 1ª mensalidade</SelectItem>
                        <SelectItem value="3">Após 3ª mensalidade</SelectItem>
                        <SelectItem value="12">Após 12ª mensalidade</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-center">
                    <div
                      className="flex items-center justify-center gap-1"
                      title="Marca como cortesia (valor 0, exibido como Gratuito)"
                    >
                      <Checkbox
                        checked={!!r.gratuito}
                        onCheckedChange={(v) => {
                          const on = v === true;
                          update(
                            idx,
                            on
                              ? { gratuito: true, modo: "valor_fixo", valor: 0, percentual: null }
                              : { gratuito: false },
                          );
                        }}
                      />
                      {r.gratuito && <Gift className="h-3.5 w-3.5 text-emerald-600" />}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => remove(idx)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-xs text-muted-foreground">
          Dica: prioridade maior vence em caso de empate. Regras por serviço específico sempre
          vencem regras por especialidade/categoria.
        </p>
        <Button size="sm" onClick={salvar} disabled={loading}>
          {loading ? "Salvando…" : "Salvar regras"}
        </Button>
      </div>

      <LimiteDialog
        idx={limiteIdx}
        regras={regras}
        onClose={() => setLimiteIdx(null)}
        onChange={(patch) => {
          if (limiteIdx != null) update(limiteIdx, patch);
        }}
      />
    </div>
  );
}

function LimiteDialog({
  idx,
  regras,
  onClose,
  onChange,
}: {
  idx: number | null;
  regras: CbRegra[];
  onClose: () => void;
  onChange: (patch: Partial<CbRegra>) => void;
}) {
  const open = idx != null;
  const r = idx != null ? regras[idx] : null;
  if (!r) {
    return (
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
      >
        <DialogContent />
      </Dialog>
    );
  }
  const hasLimit = r.limite_qtd != null && r.limite_qtd > 0;
  const modo = r.excedente_modo ?? "percentual_particular";
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Limite de uso desta regra</DialogTitle>
          <DialogDescription>
            Ex.: "1 consulta por contrato" ou "1 consulta por dia por contrato". Vazio = sem limite.
            Após salvar as regras, o limite passa a valer na agenda.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Quantidade</Label>
              <Input
                type="number"
                min="1"
                value={r.limite_qtd ?? ""}
                onChange={(e) =>
                  onChange({ limite_qtd: e.target.value ? Number(e.target.value) : null })
                }
                placeholder="Ex.: 1"
              />
            </div>
            <div>
              <Label className="text-xs">Período</Label>
              <Select
                value={r.limite_periodo ?? "dia"}
                onValueChange={(v) => onChange({ limite_periodo: v })}
                disabled={!hasLimit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dia">Por dia</SelectItem>
                  <SelectItem value="semana">Por semana</SelectItem>
                  <SelectItem value="mes">Por mês</SelectItem>
                  <SelectItem value="contrato">Por contrato</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Escopo</Label>
              <Select
                value={r.limite_escopo ?? "contrato"}
                onValueChange={(v) => onChange({ limite_escopo: v })}
                disabled={!hasLimit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contrato">Contrato (titular + deps)</SelectItem>
                  <SelectItem value="paciente">Por paciente</SelectItem>
                  <SelectItem value="titular_ou_dependente">
                    Titular ou dependente (exclusivo)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {hasLimit && (
            <div className="grid grid-cols-2 gap-3 border-t pt-3">
              <div>
                <Label className="text-xs">Quando exceder, cobrar:</Label>
                <Select value={modo} onValueChange={(v) => onChange({ excedente_modo: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentual_particular">% do valor particular</SelectItem>
                    <SelectItem value="valor_fixo">Valor fixo (R$)</SelectItem>
                    <SelectItem value="particular">Valor particular cheio (100%)</SelectItem>
                    <SelectItem value="bloquear">Bloquear agendamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {modo === "percentual_particular" && (
                <div>
                  <Label className="text-xs">% do particular (0-100)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={r.excedente_percentual ?? 50}
                    onChange={(e) =>
                      onChange({
                        excedente_percentual: e.target.value ? Number(e.target.value) : 0,
                      })
                    }
                    placeholder="Ex.: 50"
                  />
                </div>
              )}
              {modo === "valor_fixo" && (
                <div>
                  <Label className="text-xs">Valor fixo (R$)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={r.excedente_valor ?? ""}
                    onChange={(e) =>
                      onChange({ excedente_valor: e.target.value ? Number(e.target.value) : null })
                    }
                    placeholder="Ex.: 50.00"
                  />
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
