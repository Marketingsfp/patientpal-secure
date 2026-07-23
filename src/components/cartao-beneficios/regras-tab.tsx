import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, RefreshCw, Timer, Pencil } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { findRegra, computeValor, type CbRegra } from "@/lib/cb-regras";

type EspOpt = { id: string; nome: string };
type ProcOpt = { id: string; nome: string; codigo: string | null; tipo: string | null };

interface Props {
  clinicaId: string;
  convenioId: string | null; // null = convênio ainda não salvo
  convenioNome: string;
}

const TIPOS = ["consulta", "exame", "procedimento", "cirurgia"];

// Ordem e rótulos dos grupos de carência exibidos na tabela.
const CARENCIA_GROUPS: Array<{ value: number; label: string }> = [
  { value: 0, label: "Imediato" },
  { value: 1, label: "Após 1ª mensalidade" },
  { value: 2, label: "Após 2ª mensalidade" },
  { value: 3, label: "Após 3ª mensalidade" },
  { value: 6, label: "Após 6ª mensalidade" },
  { value: 12, label: "Após 12ª mensalidade" },
];
const carenciaLabel = (n: number | null | undefined) => {
  const v = Number(n ?? 0);
  return CARENCIA_GROUPS.find(g => g.value === v)?.label ?? `Após ${v}ª mensalidade`;
};
const carenciaShort = (n: number | null | undefined) => {
  const v = Number(n ?? 0);
  return v === 0 ? "Imediato" : `Após ${v}ª`;
};

// Detecta o convênio interno de funcionários (nome pode variar entre clínicas:
// "FUNCIONARIO", "CONVÊNIO FUNCIONARIO" etc.). Normaliza acentos e casing.
const isConvenioFuncionario = (nome: string) =>
  (nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .includes("FUNCIONARIO");

export function RegrasConvenioTab({ clinicaId, convenioId, convenioNome }: Props) {
  const [regras, setRegras] = useState<CbRegra[]>([]);
  const [especialidades, setEspecialidades] = useState<EspOpt[]>([]);
  const [procedimentos, setProcedimentos] = useState<ProcOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [reapplying, setReapplying] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [limiteIdx, setLimiteIdx] = useState<number | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);
  const [editRegra, setEditRegra] = useState<CbRegra | null>(null);
  const [filtroGratuito, setFiltroGratuito] = useState<"todos" | "sim" | "nao">("todos");
  const [filtroCarencia, setFiltroCarencia] = useState<string>("todos");
  const [filtroLimite, setFiltroLimite] = useState<"todos" | "com" | "sem">("todos");
  const [filtroEspecialidade, setFiltroEspecialidade] = useState<string>("todos");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroProcedimento, setFiltroProcedimento] = useState<string>("todos");
  const [filtroModo, setFiltroModo] = useState<string>("todos");
  const [filtroPrioridade, setFiltroPrioridade] = useState<string>("todos");

  const load = async () => {
    if (!convenioId) return;
    setLoading(true);
    const [{ data: r, error: e1 }, { data: e, error: e2 }] = await Promise.all([
      (supabase as any)
        .from("cb_convenio_regras")
        .select("id,convenio_id,especialidade_id,procedimento_id,tipo,modo,valor,percentual,valor_cartao,percentual_cartao,prioridade,ativo,limite_qtd,limite_periodo,limite_escopo,excedente_modo,excedente_percentual,excedente_valor,carencia_mensalidades,gratuito,grupo_gratuidade")
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
        .select("id,nome,codigo,tipo")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .order("nome")
        .range(from, from + PAGE - 1);
      if (error) { e3 = error; break; }
      const page = (data ?? []) as ProcOpt[];
      allProcs.push(...page);
      if (page.length < PAGE) break;
    }
    setLoading(false);
    if (e1) { mostrarErro(e1); return; }
    if (e2) { mostrarErro(e2); return; }
    if (e3) { mostrarErro(e3); return; }
    setRegras((r ?? []) as CbRegra[]);
    setEspecialidades((e ?? []) as EspOpt[]);
    setProcedimentos(allProcs);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [convenioId]);

  const espOpts = useMemo(
    () => [{ value: "__any__", label: "Qualquer especialidade" }, ...especialidades.map(e => ({ value: e.id, label: e.nome }))],
    [especialidades],
  );

  const procOpts = useMemo(
    () => [
      { value: "__any__", label: "Qualquer serviço", tipo: null as string | null },
      ...procedimentos.map(p => ({
        value: p.id,
        label: p.codigo ? `${p.codigo} — ${p.nome}` : p.nome,
        tipo: p.tipo,
      })),
    ],
    [procedimentos],
  );

  const procById = useMemo(() => {
    const m = new Map<string, string>();
    procedimentos.forEach(p => m.set(p.id, p.nome));
    return m;
  }, [procedimentos]);
  const espById = useMemo(() => {
    const m = new Map<string, string>();
    especialidades.forEach(e => m.set(e.id, e.nome));
    return m;
  }, [especialidades]);

  // ---- Exceções (apenas convênio FUNCIONARIO) ---------------------------
  // Uma exceção é um procedimento que NÃO recebe desconto neste convênio.
  // Gravamos como regra específica por procedimento com percentual = 0 e
  // prioridade alta — o motor (cb-regras.ts) já dá preferência a regras
  // com procedimento_id, então a exceção vence sobre regras por categoria.
  const isFuncionario = isConvenioFuncionario(convenioNome);
  const [excSel, setExcSel] = useState<string[]>([]);
  const [excSaving, setExcSaving] = useState(false);
  const excecoes = useMemo(
    () => regras.filter(r =>
      r.procedimento_id &&
      r.modo === "percentual_desconto" &&
      Number(r.percentual) === 0 &&
      !r.gratuito &&
      !r.limite_qtd
    ),
    [regras],
  );
  const excecoesProcIds = useMemo(
    () => new Set(excecoes.map(e => e.procedimento_id as string)),
    [excecoes],
  );
  const addExcecao = async () => {
    if (!convenioId || excSel.length === 0) return;
    const novos = excSel.filter(id => !excecoesProcIds.has(id));
    const jaExistiam = excSel.length - novos.length;
    if (novos.length === 0) {
      toast.info("Todos os serviços selecionados já estão nas exceções.");
      return;
    }
    setExcSaving(true);
    const payload = novos.map(procedimento_id => ({
      convenio_id: convenioId,
      clinica_id: clinicaId,
      procedimento_id,
      especialidade_id: null,
      tipo: null,
      modo: "percentual_desconto",
      valor: null,
      percentual: 0,
      prioridade: 999,
      ativo: true,
      gratuito: false,
      carencia_mensalidades: 0,
    }));
    const { error } = await (supabase as any).from("cb_convenio_regras").insert(payload);
    setExcSaving(false);
    if (error) { mostrarErro(error); return; }
    toast.success(
      jaExistiam > 0
        ? `${novos.length} exceção(ões) adicionada(s). ${jaExistiam} já existia(m).`
        : `${novos.length} exceção(ões) adicionada(s).`,
    );
    setExcSel([]);
    await load();
  };
  const removeExcecao = async (id: string) => {
    const { error } = await (supabase as any).from("cb_convenio_regras").delete().eq("id", id);
    if (error) { mostrarErro(error); return; }
    toast.success("Exceção removida.");
    await load();
  };

  const regrasFiltradas = useMemo(() => {
    const HIGH = "\uffff";
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const items = regras
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => {
        // Exceções do convênio FUNCIONARIO ficam apenas no bloco próprio.
        if (
          isFuncionario &&
          r.procedimento_id &&
          r.modo === "percentual_desconto" &&
          Number(r.percentual) === 0 &&
          !r.gratuito &&
          !r.limite_qtd
        ) return false;
        if (filtroGratuito === "sim" && !r.gratuito) return false;
        if (filtroGratuito === "nao" && r.gratuito) return false;
        if (filtroCarencia !== "todos" && Number(r.carencia_mensalidades ?? 0) !== Number(filtroCarencia)) return false;
        const hasLimit = r.limite_qtd != null && Number(r.limite_qtd) > 0;
        if (filtroLimite === "com" && !hasLimit) return false;
        if (filtroLimite === "sem" && hasLimit) return false;
        if (filtroEspecialidade !== "todos") {
          if (filtroEspecialidade === "__any__") { if (r.especialidade_id) return false; }
          else if (r.especialidade_id !== filtroEspecialidade) return false;
        }
        if (filtroTipo !== "todos") {
          if (filtroTipo === "__any__") { if (r.tipo) return false; }
          else if ((r.tipo ?? "").toLowerCase() !== filtroTipo) return false;
        }
        if (filtroProcedimento !== "todos") {
          if (filtroProcedimento === "__any__") { if (r.procedimento_id) return false; }
          else if (r.procedimento_id !== filtroProcedimento) return false;
        }
        if (filtroModo !== "todos" && r.modo !== filtroModo) return false;
        if (filtroPrioridade !== "todos" && Number(r.prioridade) !== Number(filtroPrioridade)) return false;
        return true;
      });
    items.sort((a, b) => {
      const sa = a.r.procedimento_id ? norm(procById.get(a.r.procedimento_id) ?? "") : HIGH;
      const sb = b.r.procedimento_id ? norm(procById.get(b.r.procedimento_id) ?? "") : HIGH;
      if (sa !== sb) return sa < sb ? -1 : 1;
      const ea = a.r.especialidade_id ? norm(espById.get(a.r.especialidade_id) ?? "") : HIGH;
      const eb = b.r.especialidade_id ? norm(espById.get(b.r.especialidade_id) ?? "") : HIGH;
      if (ea !== eb) return ea < eb ? -1 : 1;
      const ta = a.r.tipo ? norm(a.r.tipo) : HIGH;
      const tb = b.r.tipo ? norm(b.r.tipo) : HIGH;
      if (ta !== tb) return ta < tb ? -1 : 1;
      return 0;
    });
    return items;
  }, [regras, filtroGratuito, filtroCarencia, filtroLimite, filtroEspecialidade, filtroTipo, filtroProcedimento, filtroModo, filtroPrioridade, procById, espById, isFuncionario]);

  const prioridadesUsadas = useMemo(() => {
    const s = new Set<number>();
    regras.forEach(r => s.add(Number(r.prioridade) || 0));
    return Array.from(s).sort((a, b) => b - a);
  }, [regras]);

  const addRegra = () => {
    if (!convenioId) return;
    setNovoOpen(true);
  };

  const update = (idx: number, patch: Partial<CbRegra>) => {
    setRegras(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const remove = async (idx: number) => {
    const r = regras[idx];
    if (!confirm("Excluir esta regra?")) return;
    if (!r.id.startsWith("new-")) {
      const { error } = await (supabase as any).from("cb_convenio_regras").delete().eq("id", r.id);
      if (error) { mostrarErro(error); return; }
    }
    setRegras(prev => prev.filter((_, i) => i !== idx));
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
        valor_cartao: r.modo === "valor_fixo"
          ? (r.valor_cartao != null ? Number(r.valor_cartao) || 0 : Number(r.valor) || 0)
          : null,
        percentual_cartao: r.modo === "percentual_desconto"
          ? (r.percentual_cartao != null ? Number(r.percentual_cartao) || 0 : Number(r.percentual) || 0)
          : null,
        prioridade: Number(r.prioridade) || 1,
        ativo: r.ativo !== false,
        limite_qtd: r.limite_qtd != null ? Number(r.limite_qtd) : null,
        limite_periodo: r.limite_qtd != null ? (r.limite_periodo ?? "dia") : null,
        limite_escopo: r.limite_qtd != null ? (r.limite_escopo ?? "contrato") : null,
        excedente_modo: r.limite_qtd != null ? (r.excedente_modo ?? "percentual_particular") : null,
        excedente_percentual: r.limite_qtd != null && (r.excedente_modo ?? "percentual_particular") === "percentual_particular"
          ? Number(r.excedente_percentual ?? 50) : null,
        excedente_valor: r.limite_qtd != null && r.excedente_modo === "valor_fixo"
          ? Number(r.excedente_valor ?? 0) : null,
        carencia_mensalidades: Number(r.carencia_mensalidades ?? 0) || 0,
        gratuito: !!r.gratuito,
        grupo_gratuidade: r.grupo_gratuidade?.trim() ? r.grupo_gratuidade.trim() : null,
      };
      if (r.id.startsWith("new-")) {
        const { error } = await (supabase as any).from("cb_convenio_regras").insert(payload);
        if (error) { setLoading(false); mostrarErro(error); return; }
      } else {
        const { error } = await (supabase as any).from("cb_convenio_regras").update(payload).eq("id", r.id);
        if (error) { setLoading(false); mostrarErro(error); return; }
      }
    }
    setLoading(false);
    toast.success("Regras salvas.");
    await load();
    // Sincroniza automaticamente o cache procedimento_cb_convenio_valores
    // para outros consumidores (backup, relatórios). Não bloqueia o toast:
    // roda em background silencioso — sem confirm() e sem toast final.
    void reaplicar({ silent: true }).catch(() => {});
  };

  /**
   * Reaplica as regras do convênio a todos os serviços da clínica:
   * para cada serviço, resolve a especialidade (via procedimento_especialidades
   * para consultas N:N, ou via campo grupo) e o tipo, calcula o valor e
   * faz upsert em procedimento_cb_convenio_valores.
   */
  const reaplicar = async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!convenioId) return;
    if (!silent && !confirm(`Reaplicar as regras de "${convenioNome}" a todos os serviços? Valores manuais serão sobrescritos onde houver regra correspondente, e valores calculados por regras antigas (removidas ou alteradas) serão limpos.`)) return;
    if (!silent) {
      setReapplying(true);
      setProgress("Carregando serviços…");
    }
    try {
      // 1) carrega procedimentos (paginado, db-max-rows = 1000)
      const PAGE = 1000;
      const procs: any[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("procedimentos")
          .select("id,grupo,tipo,valor_dinheiro,valor_dinheiro_pix,valor_padrao,valor_pix,valor_cartao_credito,valor_cartao_debito,valor_cartao")
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
      const norm = (s: string) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const espByName = new Map<string, string>();
      especialidades.forEach(e => espByName.set(norm(e.nome), e.id));

      // 4) calcula valores
      if (!silent) setProgress(`Processando ${procs.length} serviços…`);
      const upserts: any[] = [];
      for (const p of procs) {
        const baseDin = Number(p.valor_dinheiro ?? p.valor_dinheiro_pix ?? p.valor_padrao) || 0;
        const baseOut = Number(
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
          const sc = (r.procedimento_id ? 100 : 0) + (r.especialidade_id ? 10 : 0) + (r.tipo ? 5 : 0) + (r.prioridade || 0) * 0.01;
          if (sc > bestScore) {
            const v = computeValor(r, baseDin, baseOut);
            if (v) { best = v; bestScore = sc; }
          }
        }
        if (best) {
          upserts.push({
            clinica_id: clinicaId,
            procedimento_id: p.id,
            convenio_id: convenioId,
            valor_dinheiro: best.dinheiro,
            valor_outros: best.outros,
            origem: "regra",
          });
        }
      }

      // 4.5) Limpa valores calculados por regra na rodada anterior — sem
      // isso, um procedimento que deixou de casar com qualquer regra (regra
      // removida ou alterada) ficava com o preço antigo indefinidamente.
      // Valores digitados manualmente (origem='manual') não são tocados.
      if (!silent) setProgress("Limpando valores calculados anteriores…");
      const { error: errClear } = await (supabase as any)
        .from("procedimento_cb_convenio_valores")
        .delete()
        .eq("clinica_id", clinicaId)
        .eq("convenio_id", convenioId)
        .eq("origem", "regra");
      if (errClear) throw errClear;

      // 5) upsert em lotes
      const BATCH = 500;
      for (let i = 0; i < upserts.length; i += BATCH) {
        const slice = upserts.slice(i, i + BATCH);
        if (!silent) setProgress(`Gravando ${i + slice.length}/${upserts.length}…`);
        const { error } = await (supabase as any)
          .from("procedimento_cb_convenio_valores")
          .upsert(slice, { onConflict: "procedimento_id,convenio_id" });
        if (error) throw error;
      }
      if (!silent) toast.success(`Regras aplicadas a ${upserts.length} serviços.`);
    } catch (err: any) {
      if (!silent) mostrarErro(err);
      else console.warn("[reaplicar silent]", err);
    } finally {
      if (!silent) {
        setReapplying(false);
        setProgress("");
      }
    }
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
      {isFuncionario && (
        <div className="border rounded-md p-3 bg-muted/30 space-y-3">
          <div>
            <div className="font-medium">Exceções (sem desconto)</div>
            <p className="text-xs text-muted-foreground">
              Serviços listados aqui são cobrados como <strong>particular</strong> para este convênio, ignorando qualquer regra por categoria ou especialidade.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1 min-w-0 space-y-1.5">
              <Label className="text-xs">Serviço</Label>
              <SearchableMultiSelect
                options={procOpts.filter(o => o.value !== "__any__").map(o => ({ value: o.value, label: o.label }))}
                value={excSel}
                onChange={setExcSel}
                placeholder="Selecione um ou mais serviços"
              />
            </div>
            <Button
              size="sm"
              onClick={addExcecao}
              disabled={excSel.length === 0 || excSaving}
            >
              <Plus className="h-4 w-4 mr-1" />
              {excSel.length > 1 ? `Adicionar exceções (${excSel.length})` : "Adicionar exceção"}
            </Button>
          </div>
          {excecoes.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Nenhuma exceção cadastrada.</p>
          ) : (
            <ul className="divide-y border rounded-md bg-background">
              {excecoes.map(e => (
                <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="truncate">{procById.get(e.procedimento_id as string) ?? "(serviço removido)"}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeExcecao(e.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">Regras de preço automáticas</div>
          <p className="text-sm text-muted-foreground">
            Cadastre regras por serviço específico, especialidade e/ou tipo. A regra mais específica e de maior prioridade vence (serviço &gt; especialidade+tipo &gt; especialidade &gt; tipo). Ao cadastrar um serviço, o valor deste convênio será preenchido automaticamente.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button variant="ghost" size="sm" onClick={addRegra}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar regra
          </Button>
          <Button variant="outline" size="sm" onClick={reaplicar} disabled={reapplying || regras.length === 0}>
            <RefreshCw className={`h-4 w-4 mr-1 ${reapplying ? "animate-spin" : ""}`} />
            {reapplying ? (progress || "Aplicando…") : "Reaplicar a todos os serviços"}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-end">
        <div className="text-xs text-muted-foreground">
          {regrasFiltradas.length} de {regras.length} regra(s)
        </div>
      </div>

      <div className="border rounded-md w-fit max-w-full">
        <Table className="w-auto [&_th]:px-2 [&_td]:px-2 [&_th:first-child]:pl-3 [&_td:first-child]:pl-3 [&_th:last-child]:pr-2 [&_td:last-child]:pr-2 [&_th]:border-r-0 [&_td]:border-r-0 [&_tbody_.lucide-chevron-down]:hidden [&_tbody_.lucide-chevrons-up-down]:hidden [&_thead_.lucide-chevron-down]:opacity-70">
          <TableHeader className="sticky top-0 z-10">
            <TableRow>
              <TableHead className="w-[160px]">
                <Select value={filtroEspecialidade} onValueChange={setFiltroEspecialidade}>
                  <SelectTrigger className="h-6 border-0 bg-transparent px-0 text-[11px] font-semibold uppercase tracking-wide focus:ring-0 focus:ring-offset-0 shadow-none gap-1">
                    <span className="inline-flex items-center gap-1">
                      Especialidade
                      {filtroEspecialidade !== "todos" && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="todos">Todas</SelectItem>
                    <SelectItem value="__any__">Qualquer especialidade</SelectItem>
                    {especialidades.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="w-[90px]">
                <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                  <SelectTrigger className="h-6 border-0 bg-transparent px-0 text-[11px] font-semibold uppercase tracking-wide focus:ring-0 focus:ring-offset-0 shadow-none gap-1">
                    <span className="inline-flex items-center gap-1">
                      Categoria
                      {filtroTipo !== "todos" && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    <SelectItem value="__any__">Qualquer</SelectItem>
                    {TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="w-[220px]">
                <Select value={filtroProcedimento} onValueChange={setFiltroProcedimento}>
                  <SelectTrigger className="h-6 border-0 bg-transparent px-0 text-[11px] font-semibold uppercase tracking-wide focus:ring-0 focus:ring-offset-0 shadow-none gap-1">
                    <span className="inline-flex items-center gap-1 truncate">
                      Serviço
                      {filtroProcedimento !== "todos" && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="__any__">Qualquer serviço</SelectItem>
                    {procedimentos.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.codigo ? `${p.codigo} — ${p.nome}` : p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="w-[100px]">
                <Select value={filtroModo} onValueChange={setFiltroModo}>
                  <SelectTrigger className="h-6 border-0 bg-transparent px-0 text-[11px] font-semibold uppercase tracking-wide focus:ring-0 focus:ring-offset-0 shadow-none gap-1">
                    <span className="inline-flex items-center gap-1">
                      Modo
                      {filtroModo !== "todos" && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="valor_fixo">Valor fixo</SelectItem>
                    <SelectItem value="percentual_desconto">% desconto</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="text-right w-[70px]">Valor / %</TableHead>
              <TableHead className="w-[52px] text-center">
                <Select value={filtroPrioridade} onValueChange={setFiltroPrioridade}>
                  <SelectTrigger className="h-6 border-0 bg-transparent px-0 text-[11px] font-semibold uppercase tracking-wide focus:ring-0 focus:ring-offset-0 shadow-none gap-1 justify-center">
                    <span className="inline-flex items-center gap-1">
                      Prio.
                      {filtroPrioridade !== "todos" && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    {prioridadesUsadas.map(p => (
                      <SelectItem key={p} value={String(p)}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="w-[100px]">
                <Select value={filtroLimite} onValueChange={(v) => setFiltroLimite(v as any)}>
                  <SelectTrigger className="h-6 border-0 bg-transparent px-0 text-[11px] font-semibold uppercase tracking-wide focus:ring-0 focus:ring-offset-0 shadow-none gap-1">
                    <span className="inline-flex items-center gap-1">
                      Limite
                      {filtroLimite !== "todos" && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="com">Com limite</SelectItem>
                    <SelectItem value="sem">Sem limite</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="w-[88px]">
                <Select value={filtroCarencia} onValueChange={setFiltroCarencia}>
                  <SelectTrigger className="h-6 border-0 bg-transparent px-0 text-[11px] font-semibold uppercase tracking-wide focus:ring-0 focus:ring-offset-0 shadow-none gap-1">
                    <span className="inline-flex items-center gap-1">
                      Carência
                      {filtroCarencia !== "todos" && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    {CARENCIA_GROUPS.map(g => (
                      <SelectItem key={g.value} value={String(g.value)}>{carenciaShort(g.value)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="text-center w-[64px] !px-1">
                <Select value={filtroGratuito} onValueChange={(v) => setFiltroGratuito(v as any)}>
                  <SelectTrigger className="h-6 border-0 bg-transparent px-0 text-[11px] font-semibold uppercase tracking-wide focus:ring-0 focus:ring-offset-0 shadow-none gap-1 justify-center">
                    <span className="inline-flex items-center gap-1">
                      Gratuito
                      {filtroGratuito !== "todos" && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="w-[64px] !px-0"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>
            ) : regras.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">Nenhuma regra. Clique em "Adicionar regra".</TableCell></TableRow>
            ) : regrasFiltradas.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">Nenhuma regra corresponde aos filtros.</TableCell></TableRow>
            ) : (
              regrasFiltradas.map(({ r, idx }) => (
              <TableRow key={r.id}>
                <TableCell>
                  <SearchableSelect
                    options={espOpts}
                    value={r.especialidade_id ?? "__any__"}
                    onChange={(v) => update(idx, { especialidade_id: v === "__any__" ? null : v })}
                    placeholder="Qualquer"
                    disabled
                    className="h-8 text-xs px-2 border-0 rounded-none shadow-none focus-visible:ring-0 bg-transparent disabled:opacity-100"
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={r.tipo ?? "__any__"}
                    onValueChange={(v) => update(idx, { tipo: v === "__any__" ? null : v })}
                    disabled
                  >
                    <SelectTrigger className="w-24 h-8 text-xs border-0 rounded-none shadow-none focus:ring-0 bg-transparent disabled:opacity-100"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">Qualquer</SelectItem>
                      {TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <SearchableSelect
                    options={procOpts}
                    value={r.procedimento_id ?? "__any__"}
                    onChange={(v) => update(idx, {
                      procedimento_id: v === "__any__" ? null : v,
                      // limpar filtros por especialidade/tipo quando escolhe serviço
                      ...(v !== "__any__" ? { especialidade_id: null, tipo: null } : {}),
                    })}
                    placeholder="Qualquer serviço"
                    disabled
                    className="h-8 text-xs px-2 border-0 rounded-none shadow-none focus-visible:ring-0 bg-transparent disabled:opacity-100"
                  />
                </TableCell>
                <TableCell>
                  <Select value={r.modo} onValueChange={(v) => update(idx, { modo: v })} disabled>
                    <SelectTrigger className="w-28 h-8 text-xs border-0 rounded-none shadow-none focus:ring-0 bg-transparent disabled:opacity-100"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="valor_fixo">Valor fixo</SelectItem>
                      <SelectItem value="percentual_desconto">% desconto</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right w-[80px]">
                  <div className="flex justify-end">
                    {r.modo === "valor_fixo" ? (
                      <CurrencyInput
                        className="w-20 h-8 text-right text-xs px-1 border-0 rounded-none shadow-none focus-visible:ring-0 bg-transparent disabled:opacity-100"
                        value={r.valor !== null ? Number(r.valor).toFixed(2) : ""}
                        onChange={(v) => update(idx, { valor: v ? parseFloat(v) : 0 })}
                        disabled
                      />
                    ) : (
                      <Input
                        className="w-20 h-8 text-right text-xs px-1 border-0 rounded-none shadow-none focus-visible:ring-0 bg-transparent disabled:opacity-100"
                        type="number" min="0" max="100" step="0.01"
                        value={r.percentual ?? ""}
                        onChange={(e) => update(idx, { percentual: e.target.value ? parseFloat(e.target.value) : 0 })}
                        disabled
                      />
                    )}
                  </div>
                </TableCell>
                <TableCell className="w-[60px] text-center">
                  <Input
                    className="w-12 h-8 text-xs text-center px-1 mx-auto border-0 rounded-none shadow-none focus-visible:ring-0 bg-transparent disabled:opacity-100"
                    type="number" min="1" max="100"
                    value={r.prioridade}
                    onChange={(e) => update(idx, { prioridade: parseInt(e.target.value) || 1 })}
                    disabled
                  />
                </TableCell>
                <TableCell className="w-[100px]">
                  <Button
                    size="sm"
                    variant={r.limite_qtd ? "secondary" : "ghost"}
                    className="text-[11px] h-7 px-2"
                    onClick={() => setLimiteIdx(idx)}
                    title="Configurar limite de uso"
                    disabled
                  >
                    <Timer className="h-3.5 w-3.5 mr-1" />
                    {r.limite_qtd
                      ? `${r.limite_qtd}/${r.limite_periodo ?? "dia"} ${r.limite_escopo === "paciente" ? "paciente" : r.limite_escopo === "titular_ou_dependente" ? "titular-ou-dep" : "contrato"}`
                      : "Sem limite"}
                  </Button>
                </TableCell>
                <TableCell className="w-[92px]">
                  <Select
                    value={String(r.carencia_mensalidades ?? 0)}
                    onValueChange={(v) => update(idx, { carencia_mensalidades: Number(v) })}
                    disabled
                  >
                    <SelectTrigger className="w-full h-8 text-xs px-2 border-0 rounded-none shadow-none focus:ring-0 bg-transparent disabled:opacity-100"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Imediato</SelectItem>
                      <SelectItem value="1">Após 1ª</SelectItem>
                      <SelectItem value="2">Após 2ª</SelectItem>
                      <SelectItem value="3">Após 3ª</SelectItem>
                      <SelectItem value="6">Após 6ª</SelectItem>
                      <SelectItem value="12">Após 12ª</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-center w-[52px] !px-1">
                  <div className="flex items-center justify-center" title="Marca como cortesia (valor 0, exibido como Gratuito)">
                    <Checkbox
                      checked={!!r.gratuito}
                      disabled
                    />
                  </div>
                </TableCell>
                <TableCell className="w-[64px] !px-0">
                  <div className="flex items-center gap-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setEditRegra(r)}
                      title="Editar regra"
                    >
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(idx)} title="Excluir regra">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-xs text-muted-foreground">
          Dica: prioridade maior vence em caso de empate. Regras por serviço específico sempre vencem regras por especialidade/categoria.
        </p>
        <Button size="sm" onClick={salvar} disabled={loading}>
          {loading ? "Salvando…" : "Salvar regras"}
        </Button>
      </div>

      <LimiteDialog
        idx={limiteIdx}
        regras={regras}
        onClose={() => setLimiteIdx(null)}
        onChange={(patch) => { if (limiteIdx != null) update(limiteIdx, patch); }}
        onSave={async () => { await salvar(); setLimiteIdx(null); }}
        saving={loading}
      />
      <NovaRegraDialog
        open={novoOpen}
        onClose={() => setNovoOpen(false)}
        convenioId={convenioId}
        clinicaId={clinicaId}
        espOpts={espOpts}
        procOpts={procOpts}
        onSaved={async () => { setNovoOpen(false); await load(); }}
      />
      <NovaRegraDialog
        open={editRegra != null}
        onClose={() => setEditRegra(null)}
        convenioId={convenioId}
        clinicaId={clinicaId}
        espOpts={espOpts}
        procOpts={procOpts}
        regra={editRegra}
        onSaved={async () => { setEditRegra(null); await load(); }}
      />
    </div>
  );
}

function LimiteDialog({
  idx, regras, onClose, onChange, onSave, saving,
}: {
  idx: number | null;
  regras: CbRegra[];
  onClose: () => void;
  onChange: (patch: Partial<CbRegra>) => void;
  onSave: () => void | Promise<void>;
  saving?: boolean;
}) {
  const open = idx != null;
  const r = idx != null ? regras[idx] : null;
  if (!r) {
    return (
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent />
      </Dialog>
    );
  }
  const hasLimit = r.limite_qtd != null && r.limite_qtd > 0;
  const modo = r.excedente_modo ?? "percentual_particular";
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Limite de uso desta regra</DialogTitle>
          <DialogDescription>
            Ex.: "1 consulta por contrato" ou "1 consulta por dia por contrato". Vazio = sem limite. Após salvar as regras, o limite passa a valer na agenda.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Quantidade</Label>
              <Input
                type="number" min="1"
                value={r.limite_qtd ?? ""}
                onChange={(e) => onChange({ limite_qtd: e.target.value ? Number(e.target.value) : null })}
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
                <SelectTrigger><SelectValue /></SelectTrigger>
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
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contrato">Contrato (titular + deps)</SelectItem>
                  <SelectItem value="paciente">Por paciente</SelectItem>
                  <SelectItem value="titular_ou_dependente">Titular ou dependente (exclusivo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {hasLimit && (
            <div className="grid grid-cols-2 gap-3 border-t pt-3">
              <div>
                <Label className="text-xs">Quando exceder, cobrar:</Label>
                <Select value={modo} onValueChange={(v) => onChange({ excedente_modo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentual_particular">% do valor particular</SelectItem>
                    <SelectItem value="valor_fixo">Valor fixo (R$)</SelectItem>
                    <SelectItem value="particular">Valor particular cheio (100%)</SelectItem>
                    <SelectItem value="regra_padrao_convenio">Aplicar regra padrão do convênio</SelectItem>
                    <SelectItem value="bloquear">Bloquear agendamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {modo === "percentual_particular" && (
                <div>
                  <Label className="text-xs">% do particular (0-100)</Label>
                  <Input
                    type="number" min="0" max="100"
                    value={r.excedente_percentual ?? 50}
                    onChange={(e) => onChange({ excedente_percentual: e.target.value ? Number(e.target.value) : 0 })}
                    placeholder="Ex.: 50"
                  />
                </div>
              )}
              {modo === "valor_fixo" && (
                <div>
                  <Label className="text-xs">Valor fixo (R$)</Label>
                  <Input
                    type="number" inputMode="decimal"
                    value={r.excedente_valor ?? ""}
                    onChange={(e) => onChange({ excedente_valor: e.target.value ? Number(e.target.value) : null })}
                    placeholder="Ex.: 50.00"
                  />
                </div>
              )}
            </div>
          )}
          <div className="border-t pt-3 space-y-1.5">
            <Label className="text-xs">Grupo de gratuidade (opcional)</Label>
            <Input
              value={r.grupo_gratuidade ?? ""}
              onChange={(e) => onChange({ grupo_gratuidade: e.target.value })}
              placeholder='Ex.: "mama-preventivo"'
            />
            <p className="text-[11px] text-muted-foreground">
              Regras com o mesmo grupo dividem a mesma cota. Ex.: uma regra grátis
              para Mamografia e outra para USG Mama, ambas com grupo
              "mama-preventivo" e limite 1/contrato → usar uma consome a outra.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void onSave()} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NovaRegraDialog({
  open, onClose, convenioId, clinicaId, espOpts, procOpts, onSaved, regra,
}: {
  open: boolean;
  onClose: () => void;
  convenioId: string;
  clinicaId: string;
  espOpts: Array<{ value: string; label: string }>;
  procOpts: Array<{ value: string; label: string; tipo: string | null }>;
  onSaved: () => void | Promise<void>;
  regra?: CbRegra | null;
}) {
  const emptyRegra = (): CbRegra => ({
    id: `new-${crypto.randomUUID()}`,
    convenio_id: convenioId,
    especialidade_id: null,
    procedimento_id: null,
    tipo: null,
    modo: "valor_fixo",
    valor: 0,
    percentual: null,
    valor_cartao: 0,
    percentual_cartao: null,
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
    grupo_gratuidade: null,
  });
  const [r, setR] = useState<CbRegra>(emptyRegra());
  const [saving, setSaving] = useState(false);
  const isEdit = !!regra && !regra.id.startsWith("new-");

  useEffect(() => {
    if (open) setR(regra ? { ...regra } : emptyRegra());
    /* eslint-disable-next-line */
  }, [open, convenioId, regra]);

  const upd = (patch: Partial<CbRegra>) => setR(prev => ({ ...prev, ...patch }));

  // Regra "base" por especialidade deste convênio para o procedimento selecionado.
  // Serve para avisar o operador (e pré-preencher) que ao salvar uma regra por
  // procedimento, ele está sobrescrevendo o preço cartão/PIX do convênio.
  const [regraBase, setRegraBase] = useState<{
    valor: number | null;
    valor_cartao: number | null;
    especialidade_nome: string;
  } | null>(null);
  const [valorCartaoTocado, setValorCartaoTocado] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!r.procedimento_id) { setRegraBase(null); return; }
    let cancel = false;
    (async () => {
      // especialidades do procedimento
      const { data: pes } = await (supabase as any)
        .from("procedimento_especialidades")
        .select("especialidade_id, especialidades(nome)")
        .eq("procedimento_id", r.procedimento_id);
      const espIds = (pes ?? []).map((x: any) => x.especialidade_id);
      if (!espIds.length) { if (!cancel) setRegraBase(null); return; }
      const { data: regras } = await (supabase as any)
        .from("cb_convenio_regras")
        .select("valor, valor_cartao, especialidade_id, prioridade")
        .eq("convenio_id", convenioId)
        .in("especialidade_id", espIds)
        .is("procedimento_id", null)
        .eq("modo", "valor_fixo")
        .eq("ativo", true)
        .eq("gratuito", false)
        .order("prioridade", { ascending: false });
      const escolhida = (regras ?? []).find(
        (x: any) => x.valor_cartao != null && Number(x.valor_cartao) > 0
      ) ?? (regras ?? [])[0];
      if (!escolhida) { if (!cancel) setRegraBase(null); return; }
      const espNome =
        (pes ?? []).find((x: any) => x.especialidade_id === escolhida.especialidade_id)
          ?.especialidades?.nome ?? "especialidade";
      if (cancel) return;
      setRegraBase({
        valor: escolhida.valor != null ? Number(escolhida.valor) : null,
        valor_cartao: escolhida.valor_cartao != null ? Number(escolhida.valor_cartao) : null,
        especialidade_nome: espNome,
      });
      // Pré-preenche valor_cartao se estiver vazio/zerado e o usuário ainda não digitou
      if (!isEdit && !valorCartaoTocado && (r.valor_cartao == null || Number(r.valor_cartao) === 0)) {
        if (escolhida.valor_cartao != null && Number(escolhida.valor_cartao) > 0) {
          setR(prev => ({ ...prev, valor_cartao: Number(escolhida.valor_cartao) }));
        }
      }
    })();
    return () => { cancel = true; };
    /* eslint-disable-next-line */
  }, [open, r.procedimento_id, convenioId]);

  const procOptsFiltrados = useMemo(() => {
    if (!r.tipo) return procOpts;
    const t = r.tipo.toLowerCase();
    return procOpts.filter(o => o.value === "__any__" || (o.tipo ?? "").toLowerCase() === t);
  }, [procOpts, r.tipo]);
  const hasLimit = r.limite_qtd != null && Number(r.limite_qtd) > 0;
  const excModo = r.excedente_modo ?? "percentual_particular";

  const preview = (() => {
    const v = computeValor(r, 100, 100);
    if (!v) return "—";
    if (r.modo === "valor_fixo") return `R$ ${v.dinheiro.toFixed(2)} (fixo)`;
    return `de R$100 → R$ ${v.dinheiro.toFixed(2)} (${r.percentual}% off)`;
  })();

  const salvarNovo = async () => {
    // Guarda: se o operador está criando/editando uma regra por procedimento e
    // deixou o valor cartão/PIX igual ao dinheiro (ou zero) enquanto existe uma
    // regra por especialidade do convênio com valor cartão diferente, confirma
    // antes de sobrescrever silenciosamente o benefício do cartão.
    if (
      r.modo === "valor_fixo" &&
      r.procedimento_id &&
      !r.gratuito &&
      regraBase &&
      regraBase.valor_cartao != null &&
      regraBase.valor_cartao > 0
    ) {
      const vc = r.valor_cartao != null ? Number(r.valor_cartao) : 0;
      const vd = Number(r.valor) || 0;
      const cartaoDivergente = Math.abs(vc - regraBase.valor_cartao) > 0.009;
      const cartaoIgualDinheiro = Math.abs(vc - vd) < 0.009;
      if (cartaoDivergente && (cartaoIgualDinheiro || vc === 0)) {
        const ok = window.confirm(
          `Atenção: a regra por especialidade (${regraBase.especialidade_nome}) deste convênio ` +
          `usa R$ ${regraBase.valor_cartao.toFixed(2)} no cartão/PIX. ` +
          `Você está salvando este serviço com R$ ${vc.toFixed(2)} no cartão/PIX, ` +
          `o que substitui o preço do convênio.\n\nDeseja continuar mesmo assim?`
        );
        if (!ok) return;
      }
    }
    setSaving(true);
    const payload: any = {
      clinica_id: clinicaId,
      convenio_id: convenioId,
      procedimento_id: r.procedimento_id ?? null,
      especialidade_id: r.procedimento_id ? null : r.especialidade_id,
      tipo: r.procedimento_id ? null : r.tipo,
      modo: r.modo,
      valor: r.modo === "valor_fixo" ? Number(r.valor) || 0 : null,
      percentual: r.modo === "percentual_desconto" ? Number(r.percentual) || 0 : null,
      valor_cartao: r.modo === "valor_fixo"
        ? (r.valor_cartao != null ? Number(r.valor_cartao) || 0 : Number(r.valor) || 0)
        : null,
      percentual_cartao: r.modo === "percentual_desconto"
        ? (r.percentual_cartao != null ? Number(r.percentual_cartao) || 0 : Number(r.percentual) || 0)
        : null,
      prioridade: Number(r.prioridade) || 1,
      ativo: r.ativo !== false,
      limite_qtd: hasLimit ? Number(r.limite_qtd) : null,
      limite_periodo: hasLimit ? (r.limite_periodo ?? "dia") : null,
      limite_escopo: hasLimit ? (r.limite_escopo ?? "contrato") : null,
      excedente_modo: hasLimit ? excModo : null,
      excedente_percentual: hasLimit && excModo === "percentual_particular"
        ? Number(r.excedente_percentual ?? 50) : null,
      excedente_valor: hasLimit && excModo === "valor_fixo"
        ? Number(r.excedente_valor ?? 0) : null,
      carencia_mensalidades: Number(r.carencia_mensalidades ?? 0) || 0,
      gratuito: !!r.gratuito,
      grupo_gratuidade: r.grupo_gratuidade?.trim() ? r.grupo_gratuidade.trim() : null,
    };
    const { error } = isEdit
      ? await (supabase as any).from("cb_convenio_regras").update(payload).eq("id", r.id)
      : await (supabase as any).from("cb_convenio_regras").insert(payload);
    setSaving(false);
    if (error) { mostrarErro(error); return; }
    toast.success(isEdit ? "Regra atualizada." : "Regra adicionada.");
    await onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar regra de preço" : "Nova regra de preço"}</DialogTitle>
          <DialogDescription>
            Preencha os dados da regra. Regras por serviço específico ignoram especialidade/categoria.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Especialidade</Label>
              <SearchableSelect
                options={espOpts}
                value={r.especialidade_id ?? "__any__"}
                onChange={(v) => upd({ especialidade_id: v === "__any__" ? null : v })}
                placeholder="Qualquer"
                disabled={!!r.procedimento_id}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria</Label>
              <Select
                value={r.tipo ?? "__any__"}
                onValueChange={(v) => {
                  const novoTipo = v === "__any__" ? null : v;
                  const patch: Partial<CbRegra> = { tipo: novoTipo };
                  // Se o serviço atual não pertencer à nova categoria, limpa
                  if (r.procedimento_id && novoTipo) {
                    const p = procOpts.find(o => o.value === r.procedimento_id);
                    if (p && (p.tipo ?? "").toLowerCase() !== novoTipo.toLowerCase()) {
                      patch.procedimento_id = null;
                    }
                  }
                  upd(patch);
                }}
                disabled={!!r.procedimento_id}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">Qualquer</SelectItem>
                  {TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Serviço específico (opcional)</Label>
            <SearchableSelect
              options={procOptsFiltrados}
              value={r.procedimento_id ?? "__any__"}
              onChange={(v) => upd({
                procedimento_id: v === "__any__" ? null : v,
                ...(v !== "__any__" ? { especialidade_id: null, tipo: null } : {}),
              })}
              placeholder="Qualquer serviço"
            />
            <p className="text-[11px] text-muted-foreground">
              Quando escolhido, esta regra vale apenas para este serviço.
              {r.tipo ? ` Mostrando apenas serviços da categoria "${r.tipo}".` : ""}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t pt-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Modo</Label>
              <Select value={r.modo} onValueChange={(v) => upd({ modo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="valor_fixo">Valor fixo</SelectItem>
                  <SelectItem value="percentual_desconto">% desconto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prioridade</Label>
              <Input
                type="number" min="1" max="100"
                value={r.prioridade}
                onChange={(e) => upd({ prioridade: parseInt(e.target.value) || 1 })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">
                {r.modo === "valor_fixo" ? "Valor dinheiro (R$)" : "% desconto dinheiro"}
              </Label>
              {r.modo === "valor_fixo" ? (
                <CurrencyInput
                  value={r.valor !== null ? Number(r.valor).toFixed(2) : ""}
                  onChange={(v) => upd({ valor: v ? parseFloat(v) : 0 })}
                />
              ) : (
                <Input
                  type="number" min="0" max="100" step="0.01"
                  value={r.percentual ?? ""}
                  onChange={(e) => upd({ percentual: e.target.value ? parseFloat(e.target.value) : 0 })}
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {r.modo === "valor_fixo" ? "Valor cartão/PIX (R$)" : "% desconto cartão/PIX"}
              </Label>
              {r.modo === "valor_fixo" ? (
                <CurrencyInput
                  value={r.valor_cartao != null ? Number(r.valor_cartao).toFixed(2) : ""}
                  onChange={(v) => { setValorCartaoTocado(true); upd({ valor_cartao: v ? parseFloat(v) : 0 }); }}
                />
              ) : (
                <Input
                  type="number" min="0" max="100" step="0.01"
                  value={r.percentual_cartao ?? ""}
                  onChange={(e) => upd({ percentual_cartao: e.target.value ? parseFloat(e.target.value) : 0 })}
                />
              )}
              <p className="text-[11px] text-muted-foreground">
                Usado quando o pagamento é em PIX, débito ou crédito.
              </p>
              {r.procedimento_id && regraBase && r.modo === "valor_fixo" && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  Regra do convênio para <b>{regraBase.especialidade_nome}</b>:{" "}
                  R$ {(regraBase.valor ?? 0).toFixed(2)} dinheiro
                  {regraBase.valor_cartao != null && (
                    <> / R$ {regraBase.valor_cartao.toFixed(2)} cartão·PIX</>
                  )}
                  . Esta regra por serviço <b>substitui</b> esses valores.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Carência</Label>
              <Select
                value={String(r.carencia_mensalidades ?? 0)}
                onValueChange={(v) => upd({ carencia_mensalidades: Number(v) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CARENCIA_GROUPS.map(g => (
                    <SelectItem key={g.value} value={String(g.value)}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cortesia</Label>
              <div className="flex items-center gap-2 h-9 px-3 rounded-md border">
                <Checkbox
                  checked={!!r.gratuito}
                  onCheckedChange={(v) => {
                    const on = v === true;
                    upd(on
                      ? { gratuito: true, modo: "valor_fixo", valor: 0, percentual: null, valor_cartao: 0, percentual_cartao: null }
                      : { gratuito: false });
                  }}
                />
                <span className="text-sm">Gratuito (valor 0)</span>
              </div>
            </div>
          </div>

          <div className="border-t pt-3 space-y-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase">Limite de uso (opcional)</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Quantidade</Label>
                <Input
                  type="number" min="1"
                  value={r.limite_qtd ?? ""}
                  onChange={(e) => upd({ limite_qtd: e.target.value ? Number(e.target.value) : null })}
                  placeholder="Sem limite"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Período</Label>
                <Select
                  value={r.limite_periodo ?? "dia"}
                  onValueChange={(v) => upd({ limite_periodo: v })}
                  disabled={!hasLimit}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dia">Por dia</SelectItem>
                    <SelectItem value="semana">Por semana</SelectItem>
                    <SelectItem value="mes">Por mês</SelectItem>
                    <SelectItem value="contrato">Por contrato</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Escopo</Label>
                <Select
                  value={r.limite_escopo ?? "contrato"}
                  onValueChange={(v) => upd({ limite_escopo: v })}
                  disabled={!hasLimit}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contrato">Contrato (titular + deps)</SelectItem>
                    <SelectItem value="paciente">Por paciente</SelectItem>
                    <SelectItem value="titular_ou_dependente">Titular ou dependente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {hasLimit && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Quando exceder, cobrar:</Label>
                  <Select value={excModo} onValueChange={(v) => upd({ excedente_modo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentual_particular">% do valor particular</SelectItem>
                      <SelectItem value="valor_fixo">Valor fixo (R$)</SelectItem>
                      <SelectItem value="particular">Valor particular cheio</SelectItem>
                      <SelectItem value="regra_padrao_convenio">Aplicar regra padrão do convênio</SelectItem>
                      <SelectItem value="bloquear">Bloquear agendamento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {excModo === "percentual_particular" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">% do particular (0-100)</Label>
                    <Input
                      type="number" min="0" max="100"
                      value={r.excedente_percentual ?? 50}
                      onChange={(e) => upd({ excedente_percentual: e.target.value ? Number(e.target.value) : 0 })}
                    />
                  </div>
                )}
                {excModo === "valor_fixo" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Valor fixo (R$)</Label>
                    <Input
                      type="number" inputMode="decimal"
                      value={r.excedente_valor ?? ""}
                      onChange={(e) => upd({ excedente_valor: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Grupo de gratuidade (opcional)</Label>
              <Input
                value={r.grupo_gratuidade ?? ""}
                onChange={(e) => upd({ grupo_gratuidade: e.target.value })}
                placeholder='Ex.: "mama-preventivo"'
              />
              <p className="text-[11px] text-muted-foreground">
                Regras com o mesmo grupo dividem a mesma cota (ex.: 1 exame grátis
                que pode ser Mamografia OU USG Mama).
              </p>
            </div>
          </div>

          <div className="border-t pt-3 text-xs text-muted-foreground">
            Prévia: <span className="font-medium text-foreground">{preview}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={() => void salvarNovo()} disabled={saving}>
            {saving ? "Salvando…" : (isEdit ? "Salvar alterações" : "Salvar regra")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
