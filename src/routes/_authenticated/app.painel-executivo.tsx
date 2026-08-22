import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  UserCheck,
  UserX,
  Ban,
  Percent,
  Clock,
  Timer,
  Stethoscope,
  Building2,
  Wallet,
  TrendingUp,
  Receipt,
  BadgeDollarSign,
  FileText,
  UserPlus,
  Repeat,
  Handshake,
  AlertTriangle,
  Activity,
  RefreshCw,
  Undo2,
  BarChart3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { logAction } from "@/hooks/use-crud";
import { mostrarErro } from "@/lib/traduzir-erro";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HhpKpiCard, HhpKpiRow } from "@/design-system/hhp/kpi-card";
import type { HhpTone } from "@/design-system/hhp/tokens";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateInputBR } from "@/components/ui/date-input-br";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDatePura } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
export const Route = createFileRoute("/_authenticated/app/painel-executivo")({
  component: PainelExecutivoPage,
  head: () => ({ meta: [{ title: "Painel Executivo — ClinicaOS" }] }),
});

// ---------- Types ----------
type Bloco = {
  producao: {
    agendados: number;
    confirmados: number;
    compareceram: number;
    faltaram: number;
    cancelaram: number;
    ocupacaoPct: number;
    tempoMedioMin: number;
    capacidadeMin: number;
    agendadoMin: number;
    porMedico: { nome: string; total: number; realizados: number }[];
    porEspecialidade: { nome: string; total: number }[];
  };
  financeiro: {
    receitaPrevista: number;
    receitaRealizada: number;
    ticketMedio: number;
    despesaPrevista: number;
    despesaRealizada: number;
    resultado: number;
    porMedico: { nome: string; valor: number; medicoId: string }[];
    porProcedimento: { nome: string; receita: number; custo: number; margem: number }[];
    receitaParticular: number;
    receitaConvenio: number;
  };
  comercial: {
    novos: number;
    recorrentes: number;
    conversaoOrcamento: number;
    orcamentosNoPeriodo: number;
  };
  /**
   * GRs (guias) emitidas no período — vem pronto do banco (RPC
   * `painel_grs_periodo`), porque a contagem no navegador é limitada a 1.000
   * linhas por consulta e a clínica emite muito mais que isso.
   * `pacientes` = pacientes distintos que geraram essas guias.
   */
  grs: {
    total: number;
    pacientes: number;
    novos: number;
    recorrentes: number;
  };
  qualidade: {
    noShowPct: number;
    atrasoMedioMin: number;
  };
};

const emptyBloco = (): Bloco => ({
  producao: {
    agendados: 0,
    confirmados: 0,
    compareceram: 0,
    faltaram: 0,
    cancelaram: 0,
    ocupacaoPct: 0,
    tempoMedioMin: 0,
    capacidadeMin: 0,
    agendadoMin: 0,
    porMedico: [],
    porEspecialidade: [],
  },
  financeiro: {
    receitaPrevista: 0,
    receitaRealizada: 0,
    ticketMedio: 0,
    despesaPrevista: 0,
    despesaRealizada: 0,
    resultado: 0,
    porMedico: [],
    porProcedimento: [],
    receitaParticular: 0,
    receitaConvenio: 0,
  },
  comercial: { novos: 0, recorrentes: 0, conversaoOrcamento: 0, orcamentosNoPeriodo: 0 },
  grs: { total: 0, pacientes: 0, novos: 0, recorrentes: 0 },
  qualidade: { noShowPct: 0, atrasoMedioMin: 0 },
});

// ---------- Utils ----------
const hojeISO = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, d: number) => {
  const dt = new Date(`${iso}T00:00:00`);
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
};
const money = (n: number) =>
  `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const int = (n: number) => n.toLocaleString("pt-BR");
const pctFmt = (v: number) => `${v.toFixed(1)}%`;

// ---------- Presets de período ----------
type Periodo = { de: string; ate: string };
const presets: { label: string; hint: string; make: () => Periodo }[] = [
  { label: "Hoje", hint: "Somente o dia de hoje", make: () => ({ de: hojeISO(), ate: hojeISO() }) },
  {
    label: "7d",
    hint: "Últimos 7 dias",
    make: () => ({ de: addDays(hojeISO(), -6), ate: hojeISO() }),
  },
  {
    label: "30d",
    hint: "Últimos 30 dias",
    make: () => ({ de: addDays(hojeISO(), -29), ate: hojeISO() }),
  },
  {
    label: "MTD",
    hint: "Mês atual (do dia 1 até hoje)",
    make: () => {
      const d = new Date();
      const de = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      return { de, ate: hojeISO() };
    },
  },
  {
    label: "YTD",
    hint: "Ano atual (de 1º de janeiro até hoje)",
    make: () => {
      const d = new Date();
      return { de: `${d.getFullYear()}-01-01`, ate: hojeISO() };
    },
  },
  {
    label: "90d",
    hint: "Últimos 90 dias",
    make: () => ({ de: addDays(hojeISO(), -89), ate: hojeISO() }),
  },
];

// ---------- Carrega bloco ----------
/**
 * Os indicadores do período vêm prontos do banco, pela RPC
 * `painel_executivo_periodo`
 * (supabase/migrations/20260822160000_painel_executivo_periodo.sql).
 *
 * Antes a tela buscava as linhas cruas e somava dentro do navegador — só que
 * cada consulta traz no máximo 1.000 linhas, e a clínica tem ~24.100
 * agendamentos e ~3.500 lançamentos em 30 dias. O painel contava apenas um
 * pedaço e não avisava: mostrava 999 agendamentos onde havia 24.123, e
 * R$ 93.204,40 de recebimentos onde havia R$ 367.442,46. É o mesmo motivo que
 * já tinha levado o card de GRs/Guias para o banco (`painel_grs_periodo`).
 *
 * As duas listas do botão "Estornar" (receita por médico e por procedimento)
 * continuam sendo lidas aqui: elas saem de `fin_atendimentos`, que tem poucas
 * centenas de linhas no total e é a tabela que o estorno realmente altera.
 */
type BlocoRpc = {
  producao?: Partial<Bloco["producao"]>;
  financeiro?: Partial<Bloco["financeiro"]>;
  comercial?: Partial<Bloco["comercial"]>;
  qualidade?: Partial<Bloco["qualidade"]>;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

async function carregarBloco(cid: string, periodo: Periodo): Promise<Bloco> {
  const ini = new Date(`${periodo.de}T00:00:00`).toISOString();
  const fim = new Date(`${periodo.ate}T23:59:59`).toISOString();

  const [blocoR, grsR, atendR, medicosR] = await Promise.all([
    supabase.rpc(
      "painel_executivo_periodo" as never,
      {
        p_clinica: cid,
        p_ini: ini,
        p_fim: fim,
        p_de: periodo.de,
        p_ate: periodo.ate,
      } as never,
    ),
    supabase.rpc(
      "painel_grs_periodo" as never,
      { p_clinica: cid, p_ini: ini, p_fim: fim } as never,
    ),
    supabase
      .from("fin_atendimentos")
      .select("valor_total,valor_medico,valor_laudo,medico_id,procedimento")
      .eq("clinica_id", cid)
      .gte("data", periodo.de)
      .lte("data", periodo.ate),
    supabase.from("medicos").select("id,nome").eq("clinica_id", cid).eq("ativo", true),
  ]);

  const vazio = emptyBloco();
  // Se a função ainda não existir no banco, o painel continua abrindo com zeros
  // em vez de quebrar a tela — mesma proteção já usada no card de GRs.
  const rpc = (blocoR.data ?? {}) as BlocoRpc;
  const rProd = rpc.producao ?? {};
  const rFin = rpc.financeiro ?? {};
  const rCom = rpc.comercial ?? {};
  const rQua = rpc.qualidade ?? {};

  const grLinha = (
    (grsR.data ?? []) as { grs: number; pacientes: number; novos: number; recorrentes: number }[]
  )[0];

  const atends = (atendR.data ?? []) as {
    valor_total: number | null;
    valor_medico: number | null;
    valor_laudo: number | null;
    medico_id: string | null;
    procedimento: string | null;
  }[];
  const medNome = new Map(
    ((medicosR.data ?? []) as { id: string; nome: string }[]).map((m) => [m.id, m.nome] as const),
  );

  // Receita por médico e por procedimento — base do botão "Estornar".
  const finPorMedicoMap = new Map<string, number>();
  for (const a of atends) {
    if (!a.medico_id) continue;
    finPorMedicoMap.set(a.medico_id, (finPorMedicoMap.get(a.medico_id) ?? 0) + num(a.valor_total));
  }
  const finPorMedico = [...finPorMedicoMap.entries()]
    .map(([id, valor]) => ({ nome: medNome.get(id) ?? "—", valor, medicoId: id }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 12);

  const procMap = new Map<string, { receita: number; custo: number }>();
  for (const a of atends) {
    const key = (a.procedimento ?? "—").trim() || "—";
    const cur = procMap.get(key) ?? { receita: 0, custo: 0 };
    cur.receita += num(a.valor_total);
    cur.custo += num(a.valor_medico) + num(a.valor_laudo);
    procMap.set(key, cur);
  }
  const porProcedimento = [...procMap.entries()]
    .map(([nome, v]) => ({ nome, receita: v.receita, custo: v.custo, margem: v.receita - v.custo }))
    .sort((a, b) => b.margem - a.margem)
    .slice(0, 12);

  return {
    producao: {
      agendados: num(rProd.agendados),
      confirmados: num(rProd.confirmados),
      compareceram: num(rProd.compareceram),
      faltaram: num(rProd.faltaram),
      cancelaram: num(rProd.cancelaram),
      ocupacaoPct: num(rProd.ocupacaoPct),
      tempoMedioMin: num(rProd.tempoMedioMin),
      capacidadeMin: num(rProd.capacidadeMin),
      agendadoMin: num(rProd.agendadoMin),
      porMedico: rProd.porMedico ?? vazio.producao.porMedico,
      porEspecialidade: rProd.porEspecialidade ?? vazio.producao.porEspecialidade,
    },
    financeiro: {
      receitaPrevista: num(rFin.receitaPrevista),
      receitaRealizada: num(rFin.receitaRealizada),
      ticketMedio: num(rFin.ticketMedio),
      despesaPrevista: num(rFin.despesaPrevista),
      despesaRealizada: num(rFin.despesaRealizada),
      resultado: num(rFin.resultado),
      porMedico: finPorMedico,
      porProcedimento,
      receitaParticular: num(rFin.receitaParticular),
      receitaConvenio: num(rFin.receitaConvenio),
    },
    comercial: {
      novos: num(rCom.novos),
      recorrentes: num(rCom.recorrentes),
      conversaoOrcamento: num(rCom.conversaoOrcamento),
      orcamentosNoPeriodo: num(rCom.orcamentosNoPeriodo),
    },
    grs: {
      total: num(grLinha?.grs),
      pacientes: num(grLinha?.pacientes),
      novos: num(grLinha?.novos),
      recorrentes: num(grLinha?.recorrentes),
    },
    qualidade: {
      noShowPct: num(rQua.noShowPct),
      atrasoMedioMin: num(rQua.atrasoMedioMin),
    },
  };
}

// ---------- Delta helpers ----------
/**
 * Variação percentual contra o período anterior.
 *
 * Devolve `undefined` quando o período anterior é zero: nesse caso não existe
 * base de comparação, e a variação seria infinita. Antes a função devolvia 0
 * nessa situação, o que fazia o card exibir um "0,0% vs. período anterior"
 * falso — parecia estabilidade quando na verdade não havia com o que comparar.
 * Quem consome trata `undefined` escondendo o número (`HhpKpiCard`) ou
 * avisando que não há base (`BigCard`).
 */
const delta = (atual: number, ant: number): number | undefined => {
  if (!ant) return undefined;
  return Number((((atual - ant) / ant) * 100).toFixed(1));
};

// ---------- Page ----------
function PainelExecutivoPage() {
  const { clinicaAtual, loading } = useClinica();
  const podeFin = ["admin", "gestor", "financeiro"].includes(clinicaAtual?.role ?? "");
  const podeEscrever = usePodeEscrever("painel-executivo");

  const [periodo, setPeriodo] = useState<Periodo>(presets[2].make()); // 30d
  const [carregando, setCarregando] = useState(false);
  const [atual, setAtual] = useState<Bloco>(emptyBloco());
  const [anterior, setAnterior] = useState<Bloco>(emptyBloco());
  const [estornoFiltro, setEstornoFiltro] = useState<
    | { tipo: "medico"; medicoId: string; label: string }
    | { tipo: "procedimento"; procedimento: string; label: string }
    | null
  >(null);

  const periodoAnterior = useMemo<Periodo>(() => {
    const ms =
      new Date(`${periodo.ate}T00:00:00`).getTime() - new Date(`${periodo.de}T00:00:00`).getTime();
    const dias = Math.round(ms / 86400000) + 1;
    return { de: addDays(periodo.de, -dias), ate: addDays(periodo.de, -1) };
  }, [periodo]);

  const load = async () => {
    if (!clinicaAtual) return;
    setCarregando(true);
    try {
      const [a, b] = await Promise.all([
        carregarBloco(clinicaAtual.clinica_id, periodo),
        carregarBloco(clinicaAtual.clinica_id, periodoAnterior),
      ]);
      setAtual(a);
      setAnterior(b);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [clinicaAtual?.clinica_id, periodo.de, periodo.ate]);

  if (loading) return <p className="text-muted-foreground">Carregando…</p>;
  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica.</p>;

  const p = atual.producao,
    pa = anterior.producao;
  const f = atual.financeiro,
    fa = anterior.financeiro;
  const c = atual.comercial,
    ca = anterior.comercial;
  const q = atual.qualidade,
    qa = anterior.qualidade;
  const g = atual.grs,
    gaAnt = anterior.grs;

  return (
    <div className="space-y-6">
      {/* Header */}
      <TooltipProvider delayDuration={200}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Painel Executivo</h1>
            <p className="text-sm text-muted-foreground">
              Indicadores estratégicos de produção, financeiro, comercial e qualidade
            </p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs text-muted-foreground dark:border-slate-700 dark:bg-slate-800">
              <BarChart3 className="h-3.5 w-3.5" />
              Comparando com o período anterior ({formatDatePura(periodoAnterior.de)} a{" "}
              {formatDatePura(periodoAnterior.ate)})
            </span>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                De
              </Label>
              <DateInputBR
                value={periodo.de}
                onChange={(e) => setPeriodo((p) => ({ ...p, de: e.target.value }))}
                className="h-9 w-40 focus-visible:ring-2 focus-visible:ring-primary/30"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Até
              </Label>
              <DateInputBR
                value={periodo.ate}
                onChange={(e) => setPeriodo((p) => ({ ...p, ate: e.target.value }))}
                className="h-9 w-40 focus-visible:ring-2 focus-visible:ring-primary/30"
              />
            </div>
            <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/60 p-1">
              {presets.map((pr) => {
                const alvo = pr.make();
                const ativo = alvo.de === periodo.de && alvo.ate === periodo.ate;
                return (
                  <Tooltip key={pr.label}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setPeriodo(pr.make())}
                        aria-pressed={ativo}
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                          ativo
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "text-muted-foreground hover:bg-background hover:text-foreground",
                        )}
                      >
                        {pr.label}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{pr.hint}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            <Button size="sm" variant="ghost" onClick={load} disabled={carregando}>
              <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </TooltipProvider>

      {/* Visão geral — cards resumo (número grande + 2 métricas de apoio + variação) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <BigCard
          title="Agendamentos"
          icon={CalendarDays}
          value={int(p.agendados)}
          delta={delta(p.agendados, pa.agendados)}
          subs={[
            { label: "Confirmados", value: int(p.confirmados) },
            { label: "Cancelados", value: int(p.cancelaram) },
          ]}
        />
        <BigCard
          title="Clientes atendidos"
          icon={UserCheck}
          value={int(p.compareceram)}
          delta={delta(p.compareceram, pa.compareceram)}
          subs={[
            { label: "Faltas", value: int(p.faltaram) },
            { label: "Ocupação", value: pctFmt(p.ocupacaoPct) },
          ]}
        />
        <BigCard
          title="GRs / Guias"
          icon={FileText}
          value={int(g.total)}
          delta={delta(g.total, gaAnt.total)}
          subs={[
            { label: "Pacientes", value: int(g.pacientes) },
            {
              label: "Novos / Recorrentes",
              value: `${int(g.novos)} / ${int(g.recorrentes)}`,
            },
          ]}
        />
        {podeFin ? (
          <BigCard
            title="Recebimentos"
            icon={Wallet}
            value={money(f.receitaRealizada)}
            delta={delta(f.receitaRealizada, fa.receitaRealizada)}
            subs={[
              { label: "Previsto", value: money(f.receitaPrevista) },
              { label: "Ticket médio", value: money(f.ticketMedio) },
            ]}
          />
        ) : (
          <BigCard
            title="Qualidade"
            icon={AlertTriangle}
            value={pctFmt(q.noShowPct)}
            delta={delta(q.noShowPct, qa.noShowPct)}
            subs={[
              { label: "Atraso médio", value: `${q.atrasoMedioMin.toFixed(0)} min` },
              { label: "Faltas", value: int(p.faltaram) },
            ]}
          />
        )}
        {podeFin && (
          <>
            <BigCard
              title="Pagamentos"
              icon={Receipt}
              value={money(f.despesaRealizada)}
              delta={delta(f.despesaRealizada, fa.despesaRealizada)}
              subs={[
                { label: "Previsto", value: money(f.despesaPrevista) },
                { label: "Resultado", value: money(f.resultado) },
              ]}
            />
            <BigCard
              title="Convênios e particular"
              icon={Handshake}
              value={money(f.receitaConvenio)}
              delta={delta(f.receitaConvenio, fa.receitaConvenio)}
              subs={[
                { label: "Particular", value: money(f.receitaParticular) },
                { label: "Convênio", value: money(f.receitaConvenio) },
              ]}
            />
          </>
        )}
        <BigCard
          title="Orçamentos"
          icon={BadgeDollarSign}
          value={int(c.orcamentosNoPeriodo)}
          delta={delta(c.orcamentosNoPeriodo, ca.orcamentosNoPeriodo)}
          subs={[
            { label: "Conversão", value: pctFmt(c.conversaoOrcamento) },
            { label: "Novos pacientes", value: int(c.novos) },
          ]}
        />
        <BigCard
          title="Qualidade"
          icon={Percent}
          value={pctFmt(p.agendados > 0 ? (p.confirmados / p.agendados) * 100 : 0)}
          delta={delta(q.noShowPct, qa.noShowPct)}
          deltaInvertido
          subs={[
            { label: "No-show", value: pctFmt(q.noShowPct) },
            { label: "Atraso médio", value: `${q.atrasoMedioMin.toFixed(0)} min` },
          ]}
        />
      </div>

      <Tabs defaultValue="producao" className="space-y-4">
        <TabsList>
          <TabsTrigger value="producao">Produção</TabsTrigger>
          {podeFin && <TabsTrigger value="financeiro">Financeiro</TabsTrigger>}
          <TabsTrigger value="comercial">Comercial</TabsTrigger>
          <TabsTrigger value="qualidade">Qualidade</TabsTrigger>
        </TabsList>

        {/* Produção */}
        <TabsContent value="producao" className="space-y-6">
          <HhpKpiRow>
            <HhpKpiCard
              label="Agendados"
              value={int(p.agendados)}
              icon={CalendarDays}
              tone="info"
              delta={delta(p.agendados, pa.agendados)}
            />
            <HhpKpiCard
              label="Confirmados"
              value={int(p.confirmados)}
              icon={CheckCircle2}
              tone="ok"
              delta={delta(p.confirmados, pa.confirmados)}
            />
            <HhpKpiCard
              label="Compareceram"
              value={int(p.compareceram)}
              icon={UserCheck}
              tone="ok"
              delta={delta(p.compareceram, pa.compareceram)}
            />
            <HhpKpiCard
              label="Faltaram"
              value={int(p.faltaram)}
              icon={UserX}
              tone="danger"
              delta={delta(p.faltaram, pa.faltaram)}
            />
            <HhpKpiCard
              label="Cancelaram"
              value={int(p.cancelaram)}
              icon={Ban}
              tone="warn"
              delta={delta(p.cancelaram, pa.cancelaram)}
            />
            <HhpKpiCard
              label="Ocupação"
              value={pctFmt(p.ocupacaoPct)}
              icon={Percent}
              tone="info"
              hint={`${int(p.agendadoMin)} / ${int(p.capacidadeMin)} min`}
            />
          </HhpKpiRow>
          <HhpKpiRow>
            <HhpKpiCard
              label="Tempo médio"
              value={`${p.tempoMedioMin.toFixed(0)} min`}
              icon={Timer}
              tone="default"
            />
            <HhpKpiCard
              label="Especialidades"
              value={int(p.porEspecialidade.length)}
              icon={Stethoscope}
              tone="default"
            />
            <HhpKpiCard
              label="Médicos ativos"
              value={int(p.porMedico.length)}
              icon={Activity}
              tone="default"
            />
          </HhpKpiRow>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RankCard
              title="Consultas por médico"
              rows={p.porMedico.map((m) => ({
                nome: m.nome,
                valor: m.total,
                extra: `${m.realizados} realizadas`,
              }))}
            />
            <RankCard
              title="Consultas por especialidade"
              rows={p.porEspecialidade.map((e) => ({ nome: e.nome, valor: e.total }))}
            />
          </div>
        </TabsContent>

        {/* Financeiro */}
        {podeFin && (
          <TabsContent value="financeiro" className="space-y-6">
            <HhpKpiRow>
              <HhpKpiCard
                label="Receita realizada"
                value={money(f.receitaRealizada)}
                icon={Wallet}
                tone="ok"
                delta={delta(f.receitaRealizada, fa.receitaRealizada)}
              />
              <HhpKpiCard
                label="Receita prevista"
                value={money(f.receitaPrevista)}
                icon={TrendingUp}
                tone="info"
                delta={delta(f.receitaPrevista, fa.receitaPrevista)}
              />
              <HhpKpiCard
                label="Ticket médio"
                value={money(f.ticketMedio)}
                icon={BadgeDollarSign}
                tone="info"
                delta={delta(f.ticketMedio, fa.ticketMedio)}
              />
              <HhpKpiCard
                label="Despesa realizada"
                value={money(f.despesaRealizada)}
                icon={Receipt}
                tone="warn"
                delta={delta(f.despesaRealizada, fa.despesaRealizada)}
              />
              <HhpKpiCard
                label="Resultado"
                value={money(f.resultado)}
                icon={TrendingUp}
                tone={f.resultado >= 0 ? "ok" : "danger"}
                delta={delta(f.resultado, fa.resultado)}
              />
            </HhpKpiRow>
            <HhpKpiRow>
              <HhpKpiCard
                label="Receita particular"
                value={money(f.receitaParticular)}
                icon={Wallet}
                tone="default"
              />
              <HhpKpiCard
                label="Receita convênio"
                value={money(f.receitaConvenio)}
                icon={Handshake}
                tone="default"
              />
            </HhpKpiRow>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <RankCard
                title="Receita por médico"
                rows={f.porMedico.map((m) => ({
                  nome: m.nome,
                  valor: money(m.valor),
                  actionLabel: "Estornar",
                  onAction: podeEscrever
                    ? () =>
                        setEstornoFiltro({ tipo: "medico", medicoId: m.medicoId, label: m.nome })
                    : undefined,
                }))}
              />
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Procedimentos mais lucrativos</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Procedimento</TableHead>
                        <TableHead className="text-right">Receita</TableHead>
                        <TableHead className="text-right">Custo</TableHead>
                        <TableHead className="text-right">Margem</TableHead>
                        <TableHead className="w-[1%]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {f.porProcedimento.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="text-center text-muted-foreground text-sm py-6"
                          >
                            Sem dados no período.
                          </TableCell>
                        </TableRow>
                      )}
                      {f.porProcedimento.map((pr) => (
                        <TableRow key={pr.nome}>
                          <TableCell className="text-sm">{pr.nome}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(pr.receita)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {money(pr.custo)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            {money(pr.margem)}
                          </TableCell>
                          <TableCell className="text-right">
                            {podeEscrever && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
                                onClick={() =>
                                  setEstornoFiltro({
                                    tipo: "procedimento",
                                    procedimento: pr.nome,
                                    label: pr.nome,
                                  })
                                }
                              >
                                <Undo2 className="h-3 w-3 mr-1" /> Estornar
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}

        {/* Comercial */}
        <TabsContent value="comercial" className="space-y-6">
          <HhpKpiRow>
            <HhpKpiCard
              label="Pacientes novos"
              value={int(c.novos)}
              icon={UserPlus}
              tone="ok"
              delta={delta(c.novos, ca.novos)}
            />
            <HhpKpiCard
              label="Recorrentes"
              value={int(c.recorrentes)}
              icon={Repeat}
              tone="info"
              delta={delta(c.recorrentes, ca.recorrentes)}
            />
            <HhpKpiCard
              label="Orçamentos"
              value={int(c.orcamentosNoPeriodo)}
              icon={Receipt}
              tone="default"
              delta={delta(c.orcamentosNoPeriodo, ca.orcamentosNoPeriodo)}
            />
            <HhpKpiCard
              label="Conversão orçam."
              value={pctFmt(c.conversaoOrcamento)}
              icon={TrendingUp}
              tone="info"
            />
          </HhpKpiRow>
          <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-6 text-center text-sm text-slate-500">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200/70">
              <BarChart3 className="h-5 w-5 text-slate-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-700">
              Análise de Retenção e Retorno de Pacientes
            </h3>
            <p className="mx-auto mt-1.5 max-w-xl leading-relaxed">
              Os dados de coorte de retenção (30, 60 e 90 dias) e tempo médio entre consultas estão
              sendo processados para esta unidade.
            </p>
          </div>
        </TabsContent>

        {/* Qualidade */}
        <TabsContent value="qualidade" className="space-y-6">
          <HhpKpiRow>
            <HhpKpiCard
              label="No-show %"
              value={pctFmt(q.noShowPct)}
              icon={AlertTriangle}
              tone="danger"
              delta={delta(q.noShowPct, qa.noShowPct)}
            />
            <HhpKpiCard
              label="Atraso médio"
              value={`${q.atrasoMedioMin.toFixed(0)} min`}
              icon={Clock}
              tone="warn"
              delta={delta(q.atrasoMedioMin, qa.atrasoMedioMin)}
            />
            <HhpKpiCard
              label="Confirmação"
              value={pctFmt(p.agendados > 0 ? (p.confirmados / p.agendados) * 100 : 0)}
              icon={CheckCircle2}
              tone="ok"
            />
          </HhpKpiRow>
          <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-6 text-center text-sm text-slate-500">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200/70">
              <Timer className="h-5 w-5 text-slate-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-700">
              Métricas de Tempo de Espera e Permanência
            </h3>
            <p className="mx-auto mt-1.5 max-w-xl leading-relaxed">
              O acompanhamento detalhado dos tempos de espera e permanência dos pacientes é
              atualizado automaticamente conforme os horários de atendimento registrados pela
              recepção.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {podeFin && clinicaAtual && estornoFiltro && (
        <EstornoDrawer
          clinicaId={clinicaAtual.clinica_id}
          periodo={periodo}
          filtro={estornoFiltro}
          onClose={() => setEstornoFiltro(null)}
          onDone={() => {
            setEstornoFiltro(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

// ---------- Ranking card ----------
function BigCard({
  title,
  icon: Icon,
  value,
  delta: d,
  deltaInvertido,
  subs,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  delta?: number;
  deltaInvertido?: boolean;
  subs: { label: string; value: string }[];
}) {
  const positivo = deltaInvertido ? (d ?? 0) <= 0 : (d ?? 0) >= 0;
  return (
    <Card className="overflow-hidden border-slate-200/70 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
        <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-slate-400" />
      </CardHeader>
      <CardContent className="px-4 py-3">
        <div className="text-3xl font-semibold tabular-nums leading-none tracking-tight text-slate-900">
          {value}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {subs.map((s) => (
            <div key={s.label} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">{s.label}</p>
              <p className="text-sm font-medium tabular-nums text-slate-800">{s.value}</p>
            </div>
          ))}
        </div>
        {typeof d === "number" ? (
          <p
            className={`mt-2.5 text-xs font-medium ${positivo ? "text-emerald-600" : "text-rose-600"}`}
          >
            {d > 0 ? "+" : ""}
            {d.toFixed(1)}% <span className="text-slate-400 font-normal">vs. período anterior</span>
          </p>
        ) : (
          // Período anterior zerado: não existe base de comparação. Antes isso
          // aparecia como "0,0%", que se lê como estabilidade e engana.
          <p className="mt-2.5 text-xs font-normal text-slate-400">Sem base de comparação</p>
        )}
      </CardContent>
    </Card>
  );
}

function RankCard({
  title,
  rows,
}: {
  title: string;
  rows: {
    nome: string;
    valor: number | string;
    extra?: string;
    actionLabel?: string;
    onAction?: () => void;
  }[];
}) {
  const _tone: HhpTone = "default";
  void _tone;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Sem dados no período.</p>
        ) : (
          <div className="divide-y">
            {rows.map((r, i) => (
              <div
                key={`${r.nome}-${i}`}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="truncate">{r.nome}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {r.extra && <span className="text-xs text-muted-foreground">{r.extra}</span>}
                  <span className="font-semibold tabular-nums">
                    {typeof r.valor === "number" ? int(r.valor) : r.valor}
                  </span>
                  {r.onAction && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
                      onClick={r.onAction}
                    >
                      <Undo2 className="h-3 w-3 mr-1" /> {r.actionLabel ?? "Estornar"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Estorno Drawer ----------
type EstornoRow = {
  id: string;
  data: string;
  paciente_nome: string;
  medico_nome: string;
  procedimento: string | null;
  valor_total: number;
  status: string;
  lancamento_id: string | null;
};

function EstornoDrawer({
  clinicaId,
  periodo,
  filtro,
  onClose,
  onDone,
}: {
  clinicaId: string;
  periodo: Periodo;
  filtro:
    | { tipo: "medico"; medicoId: string; label: string }
    | { tipo: "procedimento"; procedimento: string; label: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const podeEscrever = usePodeEscrever("painel-executivo");
  const [rows, setRows] = useState<EstornoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [alvo, setAlvo] = useState<EstornoRow | null>(null);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      let q = supabase
        .from("fin_atendimentos")
        .select("id,data,paciente_id,medico_id,procedimento,valor_total,status,lancamento_id")
        .eq("clinica_id", clinicaId)
        .gte("data", periodo.de)
        .lte("data", periodo.ate)
        .order("data", { ascending: false });
      if (filtro.tipo === "medico") q = q.eq("medico_id", filtro.medicoId);
      else q = q.eq("procedimento", filtro.procedimento);
      const { data, error } = await q;
      if (error) {
        mostrarErro(error);
        setRows([]);
        setLoading(false);
        return;
      }
      const atds = (data ?? []) as Array<{
        id: string;
        data: string;
        paciente_id: string | null;
        medico_id: string | null;
        procedimento: string | null;
        valor_total: number;
        status: string;
        lancamento_id: string | null;
      }>;
      const pacIds = [...new Set(atds.map((a) => a.paciente_id).filter(Boolean) as string[])];
      const medIds = [...new Set(atds.map((a) => a.medico_id).filter(Boolean) as string[])];
      const [pacR, medR] = await Promise.all([
        pacIds.length
          ? supabase.from("pacientes").select("id,nome").in("id", pacIds)
          : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
        medIds.length
          ? supabase.from("medicos").select("id,nome").in("id", medIds)
          : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
      ]);
      const pacMap = new Map(
        ((pacR.data ?? []) as { id: string; nome: string }[]).map((p) => [p.id, p.nome]),
      );
      const medMap = new Map(
        ((medR.data ?? []) as { id: string; nome: string }[]).map((m) => [m.id, m.nome]),
      );
      setRows(
        atds.map((a) => ({
          id: a.id,
          data: a.data,
          paciente_nome: a.paciente_id ? (pacMap.get(a.paciente_id) ?? "—") : "—",
          medico_nome: a.medico_id ? (medMap.get(a.medico_id) ?? "—") : "—",
          procedimento: a.procedimento,
          valor_total: Number(a.valor_total ?? 0),
          status: a.status,
          lancamento_id: a.lancamento_id,
        })),
      );
      setLoading(false);
    })();
  }, [clinicaId, periodo.de, periodo.ate, filtro]);

  const executar = async () => {
    if (!alvo) return;
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (motivo.trim().length < 5) {
      toast.error("Descreva o motivo (mínimo 5 caracteres).");
      return;
    }
    setSaving(true);
    try {
      // Bloqueia se repasse já pago
      const { data: atdInfo } = await supabase
        .from("fin_atendimentos")
        .select("repasse_pago,lancamento_id")
        .eq("id", alvo.id)
        .maybeSingle();
      const lancId = atdInfo?.lancamento_id ?? alvo.lancamento_id;
      // Checa também fin_lancamentos.repasse_pago (repasses de agenda são
      // marcados aqui, não em fin_atendimentos).
      let lancRepassePago = false;
      if (lancId) {
        const { data: lancRep } = await supabase
          .from("fin_lancamentos")
          .select("repasse_pago")
          .eq("id", lancId)
          .maybeSingle();
        lancRepassePago = !!(lancRep as { repasse_pago?: boolean } | null)?.repasse_pago;
      }
      if (atdInfo?.repasse_pago || lancRepassePago) {
        toast.error("Repasse já pago — estorne o pagamento do repasse primeiro.");
        return;
      }

      // 1) Cancela o lançamento financeiro, se existir
      if (lancId) {
        const { data: lanc } = await supabase
          .from("fin_lancamentos")
          .select("id,agendamento_id,valor")
          .eq("id", lancId)
          .maybeSingle();
        const { error: eL } = await supabase
          .from("fin_lancamentos")
          .update({ status: "cancelado" })
          .eq("id", lancId);
        if (eL) {
          mostrarErro(eL, "falha ao estornar lançamento");
          return;
        }

        // 2) Reabre o agendamento vinculado (se veio da agenda)
        if (lanc?.agendamento_id) {
          const { data: agAntes } = await supabase
            .from("agendamentos")
            .select("id,status,fluxo_etapa")
            .eq("id", lanc.agendamento_id)
            .maybeSingle();
          const { error: eA } = await supabase
            .from("agendamentos")
            .update({
              status: "agendado",
              fluxo_etapa: "aguardando_recepcao",
              fluxo_atualizado_em: new Date().toISOString(),
            })
            .eq("id", lanc.agendamento_id);
          if (eA) {
            mostrarErro(eA);
            return;
          }
          try {
            await logAction({
              table_name: "agendamentos",
              record_id: lanc.agendamento_id,
              action: "ESTORNO",
              clinica_id: clinicaId,
              dados_antes: agAntes ?? { id: lanc.agendamento_id },
              dados_depois: {
                id: lanc.agendamento_id,
                status: "agendado",
                fin_lancamentos_id_removido: lancId,
                valor_estornado: lanc.valor ?? null,
                motivo: motivo.trim(),
                origem: "painel-executivo",
              },
            });
          } catch {
            /* auditoria best-effort */
          }
        }
      }

      // 3) Cancela o atendimento financeiro
      const { error: eAtd } = await supabase
        .from("fin_atendimentos")
        .update({ status: "cancelado", observacoes: `[ESTORNO PAINEL] ${motivo.trim()}` })
        .eq("id", alvo.id);
      if (eAtd) {
        mostrarErro(eAtd, "falha ao cancelar atendimento");
        return;
      }

      // 4) Registra solicitação aprovada em estorno_solicitacoes (rastro)
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          await supabase.from("estorno_solicitacoes").insert({
            clinica_id: clinicaId,
            paciente_nome: alvo.paciente_nome,
            descricao: alvo.procedimento ?? null,
            valor: alvo.valor_total,
            motivo: motivo.trim(),
            status: "aprovado",
            solicitado_por: user.id,
            resolvido_por: user.id,
            resolvido_em: new Date().toISOString(),
            resposta: "Estorno executado a partir do Painel Executivo",
            lancamento_id: lancId ?? null,
            tipo: "devolucao",
          });
        }
      } catch {
        /* rastro best-effort */
      }

      toast.success("Atendimento estornado.");
      setRows((prev) => prev.map((r) => (r.id === alvo.id ? { ...r, status: "cancelado" } : r)));
      setAlvo(null);
      setMotivo("");
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const podeEstornar = (r: EstornoRow) => r.status !== "cancelado";

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-4 w-4 text-rose-700" />
            Estornar atendimento — {filtro.tipo === "medico" ? "Médico" : "Procedimento"}:{" "}
            {filtro.label}
          </DialogTitle>
          <DialogDescription>
            Período {periodo.de} → {periodo.ate}. O estorno cancela o lançamento financeiro, reabre
            o agendamento na agenda e marca o atendimento como cancelado.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Data</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Médico</TableHead>
                <TableHead>Procedimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[1%] text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                    Nenhum atendimento no período.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(`${r.data}T00:00:00`).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-sm font-medium uppercase">{r.paciente_nome}</TableCell>
                  <TableCell className="text-sm">{r.medico_nome}</TableCell>
                  <TableCell className="text-sm">{r.procedimento ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.valor_total)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={r.status === "cancelado" ? "secondary" : "outline"}
                      className="text-[10px]"
                    >
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {podeEscrever && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!podeEstornar(r)}
                        className="h-7 text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
                        onClick={() => {
                          setAlvo(r);
                          setMotivo("");
                        }}
                      >
                        <Undo2 className="h-3 w-3 mr-1" /> Estornar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Confirmação */}
      <Dialog
        open={!!alvo}
        onOpenChange={(v) => {
          if (!v && !saving) {
            setAlvo(null);
            setMotivo("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar estorno</DialogTitle>
            <DialogDescription>
              Esta ação cancela o lançamento financeiro, reabre o agendamento e marca o atendimento
              como cancelado.
            </DialogDescription>
          </DialogHeader>
          {alvo && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-0.5">
                <div>
                  <span className="text-muted-foreground">Paciente:</span>{" "}
                  <strong>{alvo.paciente_nome}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Médico:</span> {alvo.medico_nome}
                </div>
                <div>
                  <span className="text-muted-foreground">Procedimento:</span>{" "}
                  {alvo.procedimento ?? "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Valor:</span>{" "}
                  <strong>{money(alvo.valor_total)}</strong>
                </div>
              </div>
              <div>
                <Label>Motivo do estorno (obrigatório)</Label>
                <Textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="Descreva o motivo…"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {motivo.trim().length}/1000 — mínimo de 5 caracteres.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAlvo(null);
                setMotivo("");
              }}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void executar()}
              disabled={saving || motivo.trim().length < 5}
            >
              {saving ? "Estornando…" : "Confirmar estorno"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
