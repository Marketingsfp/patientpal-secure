import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays, CheckCircle2, UserCheck, UserX, Ban, Percent, Clock, Timer,
  Stethoscope, Building2, Wallet, TrendingUp, Receipt, BadgeDollarSign,
  Users, UserPlus, Repeat, Handshake, AlertTriangle, Activity, RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { HhpKpiCard, HhpKpiRow } from "@/design-system/hhp/kpi-card";
import type { HhpTone } from "@/design-system/hhp/tokens";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/painel-executivo")({
  component: PainelExecutivoPage,
  head: () => ({ meta: [{ title: "Painel Executivo — ClinicaOS" }] }),
});

// ---------- Types ----------
type Ag = {
  id: string; status: string; medico_id: string | null; paciente_id: string | null;
  inicio: string | null; fim: string | null; executado_em: string | null;
  fluxo_etapa: string | null; procedimento: string | null; tipo_atendimento: string | null;
  orcamento_id: string | null;
};
type Lanc = { id: string; tipo: string; status: string; valor: number; data: string; data_vencimento: string | null; empresa_id: string | null };
type Atend = { id: string; valor_total: number; valor_medico: number; valor_laudo: number | null; medico_id: string | null; status: string; procedimento: string | null; data: string };

type Bloco = {
  producao: {
    agendados: number; confirmados: number; compareceram: number; faltaram: number; cancelaram: number;
    ocupacaoPct: number; tempoMedioMin: number; capacidadeMin: number; agendadoMin: number;
    porMedico: { nome: string; total: number; realizados: number }[];
    porEspecialidade: { nome: string; total: number }[];
  };
  financeiro: {
    receitaPrevista: number; receitaRealizada: number; ticketMedio: number;
    despesaPrevista: number; despesaRealizada: number; resultado: number;
    porMedico: { nome: string; valor: number }[];
    porProcedimento: { nome: string; receita: number; custo: number; margem: number }[];
    receitaParticular: number; receitaConvenio: number;
  };
  comercial: {
    novos: number; recorrentes: number; conversaoOrcamento: number; orcamentosNoPeriodo: number;
  };
  qualidade: {
    noShowPct: number; atrasoMedioMin: number;
  };
};

const emptyBloco = (): Bloco => ({
  producao: { agendados: 0, confirmados: 0, compareceram: 0, faltaram: 0, cancelaram: 0, ocupacaoPct: 0, tempoMedioMin: 0, capacidadeMin: 0, agendadoMin: 0, porMedico: [], porEspecialidade: [] },
  financeiro: { receitaPrevista: 0, receitaRealizada: 0, ticketMedio: 0, despesaPrevista: 0, despesaRealizada: 0, resultado: 0, porMedico: [], porProcedimento: [], receitaParticular: 0, receitaConvenio: 0 },
  comercial: { novos: 0, recorrentes: 0, conversaoOrcamento: 0, orcamentosNoPeriodo: 0 },
  qualidade: { noShowPct: 0, atrasoMedioMin: 0 },
});

// ---------- Utils ----------
const hojeISO = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, d: number) => { const dt = new Date(`${iso}T00:00:00`); dt.setDate(dt.getDate() + d); return dt.toISOString().slice(0, 10); };
const money = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const int = (n: number) => n.toLocaleString("pt-BR");
const pctFmt = (v: number) => `${v.toFixed(1)}%`;

// ---------- Presets de período ----------
type Periodo = { de: string; ate: string };
const presets: { label: string; make: () => Periodo }[] = [
  { label: "Hoje", make: () => ({ de: hojeISO(), ate: hojeISO() }) },
  { label: "7d", make: () => ({ de: addDays(hojeISO(), -6), ate: hojeISO() }) },
  { label: "30d", make: () => ({ de: addDays(hojeISO(), -29), ate: hojeISO() }) },
  { label: "MTD", make: () => { const d = new Date(); const de = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; return { de, ate: hojeISO() }; } },
  { label: "YTD", make: () => { const d = new Date(); return { de: `${d.getFullYear()}-01-01`, ate: hojeISO() }; } },
  { label: "90d", make: () => ({ de: addDays(hojeISO(), -89), ate: hojeISO() }) },
];

// ---------- Carrega bloco ----------
async function carregarBloco(cid: string, periodo: Periodo): Promise<Bloco & { pacientesNovosSet: Set<string> }> {
  const ini = new Date(`${periodo.de}T00:00:00`).toISOString();
  const fim = new Date(`${periodo.ate}T23:59:59`).toISOString();

  const [agsR, lancR, atendR, medicosR, dispR, orcR, especR, medEspR] = await Promise.all([
    supabase.from("agendamentos").select("id,status,medico_id,paciente_id,inicio,fim,executado_em,fluxo_etapa,procedimento,tipo_atendimento,orcamento_id").eq("clinica_id", cid).gte("inicio", ini).lte("inicio", fim),
    supabase.from("fin_lancamentos").select("id,tipo,status,valor,data,data_vencimento,empresa_id").eq("clinica_id", cid).or(`and(data.gte.${periodo.de},data.lte.${periodo.ate}),and(data_vencimento.gte.${periodo.de},data_vencimento.lte.${periodo.ate})`),
    supabase.from("fin_atendimentos").select("id,valor_total,valor_medico,valor_laudo,medico_id,status,procedimento,data").eq("clinica_id", cid).gte("data", periodo.de).lte("data", periodo.ate),
    supabase.from("medicos").select("id,nome,especialidade_id,duracao_consulta_min").eq("clinica_id", cid).eq("ativo", true),
    supabase.from("medico_disponibilidades").select("dia_semana,hora_inicio,hora_fim,medico_id,ativo,vigencia_inicio,vigencia_fim").eq("clinica_id", cid).eq("ativo", true),
    supabase.from("orcamentos").select("id,status,paciente_id,created_at").eq("clinica_id", cid).gte("created_at", ini).lte("created_at", fim),
    supabase.from("especialidades").select("id,nome"),
    supabase.from("medico_especialidades").select("medico_id,especialidade_id"),
  ]);

  const ags = (agsR.data ?? []) as Ag[];
  const lancs = (lancR.data ?? []) as Lanc[];
  const atends = (atendR.data ?? []) as Atend[];
  const meds = (medicosR.data ?? []) as { id: string; nome: string; especialidade_id: string | null; duracao_consulta_min: number | null }[];
  const disps = (dispR.data ?? []) as { dia_semana: number; hora_inicio: string; hora_fim: string; medico_id: string; vigencia_inicio: string | null; vigencia_fim: string | null }[];
  const orcs = (orcR.data ?? []) as { id: string; status: string; paciente_id: string | null; created_at: string }[];
  const espLista = (especR.data ?? []) as { id: string; nome: string }[];
  const medEsp = (medEspR.data ?? []) as { medico_id: string; especialidade_id: string }[];

  const medNome = new Map(meds.map(m => [m.id, m.nome] as const));
  const espNome = new Map(espLista.map(e => [e.id, e.nome] as const));
  const medEspIdx: Record<string, string[]> = {};
  for (const me of medEsp) (medEspIdx[me.medico_id] ||= []).push(me.especialidade_id);

  // --- Produção ---
  const naoCancelados = ags.filter(a => a.status !== "cancelado");
  const realizadosArr = ags.filter(a => a.status === "realizado" || a.executado_em);
  const faltasArr = ags.filter(a => a.status === "faltou");
  const canceladosArr = ags.filter(a => a.status === "cancelado");
  const confirmadosArr = ags.filter(a => ["confirmado", "realizado", "faltou"].includes(a.status) || (a.fluxo_etapa && a.fluxo_etapa !== "aguardando"));

  // Capacidade em minutos no período (soma de janelas de disponibilidade por dia)
  const iniDt = new Date(`${periodo.de}T00:00:00`);
  const fimDt = new Date(`${periodo.ate}T00:00:00`);
  let capacidadeMin = 0;
  for (let dt = new Date(iniDt); dt <= fimDt; dt.setDate(dt.getDate() + 1)) {
    const dow = dt.getDay();
    const iso = dt.toISOString().slice(0, 10);
    for (const d of disps) {
      if (d.dia_semana !== dow) continue;
      if (d.vigencia_inicio && iso < d.vigencia_inicio) continue;
      if (d.vigencia_fim && iso > d.vigencia_fim) continue;
      const [h1, m1] = d.hora_inicio.split(":").map(Number);
      const [h2, m2] = d.hora_fim.split(":").map(Number);
      capacidadeMin += (h2 * 60 + m2) - (h1 * 60 + m1);
    }
  }

  let agendadoMin = 0;
  let tempoTotalMin = 0, tempoCount = 0;
  for (const a of naoCancelados) {
    if (!a.inicio || !a.fim) continue;
    const dur = (new Date(a.fim).getTime() - new Date(a.inicio).getTime()) / 60000;
    if (dur > 0 && dur < 24 * 60) {
      agendadoMin += dur;
      if (a.status === "realizado" || a.executado_em) { tempoTotalMin += dur; tempoCount++; }
    }
  }

  const porMedicoMap = new Map<string, { total: number; realizados: number }>();
  for (const a of ags) {
    if (!a.medico_id) continue;
    const cur = porMedicoMap.get(a.medico_id) ?? { total: 0, realizados: 0 };
    if (a.status !== "cancelado") cur.total++;
    if (a.status === "realizado" || a.executado_em) cur.realizados++;
    porMedicoMap.set(a.medico_id, cur);
  }
  const porMedico = [...porMedicoMap.entries()]
    .map(([id, v]) => ({ nome: medNome.get(id) ?? "—", ...v }))
    .sort((a, b) => b.total - a.total).slice(0, 12);

  const porEspMap = new Map<string, number>();
  for (const a of ags) {
    if (a.status === "cancelado" || !a.medico_id) continue;
    const espIds = medEspIdx[a.medico_id];
    if (!espIds || espIds.length === 0) continue;
    const eid = espIds[0]; // usa a primeira para evitar dupla contagem
    porEspMap.set(eid, (porEspMap.get(eid) ?? 0) + 1);
  }
  const porEspecialidade = [...porEspMap.entries()]
    .map(([id, total]) => ({ nome: espNome.get(id) ?? "—", total }))
    .sort((a, b) => b.total - a.total).slice(0, 12);

  // --- Financeiro ---
  const receitasPrev = lancs.filter(l => l.tipo === "receita" && l.status === "previsto");
  const receitasReal = lancs.filter(l => l.tipo === "receita" && l.status === "confirmado" && l.data >= periodo.de && l.data <= periodo.ate);
  const despesasPrev = lancs.filter(l => l.tipo === "despesa" && l.status === "previsto");
  const despesasReal = lancs.filter(l => l.tipo === "despesa" && l.status === "confirmado" && l.data >= periodo.de && l.data <= periodo.ate);
  const receitaPrevista = receitasPrev.reduce((s, l) => s + Number(l.valor || 0), 0);
  const receitaRealizada = receitasReal.reduce((s, l) => s + Number(l.valor || 0), 0);
  const despesaPrevista = despesasPrev.reduce((s, l) => s + Number(l.valor || 0), 0);
  const despesaRealizada = despesasReal.reduce((s, l) => s + Number(l.valor || 0), 0);
  const ticketMedio = atends.length > 0 ? atends.reduce((s, a) => s + Number(a.valor_total || 0), 0) / atends.length : 0;

  const finPorMedicoMap = new Map<string, number>();
  for (const a of atends) {
    if (!a.medico_id) continue;
    finPorMedicoMap.set(a.medico_id, (finPorMedicoMap.get(a.medico_id) ?? 0) + Number(a.valor_total || 0));
  }
  const finPorMedico = [...finPorMedicoMap.entries()]
    .map(([id, valor]) => ({ nome: medNome.get(id) ?? "—", valor }))
    .sort((a, b) => b.valor - a.valor).slice(0, 12);

  const procMap = new Map<string, { receita: number; custo: number }>();
  for (const a of atends) {
    const key = (a.procedimento ?? "—").trim() || "—";
    const cur = procMap.get(key) ?? { receita: 0, custo: 0 };
    cur.receita += Number(a.valor_total || 0);
    cur.custo += Number(a.valor_medico || 0) + Number(a.valor_laudo || 0);
    procMap.set(key, cur);
  }
  const porProcedimento = [...procMap.entries()]
    .map(([nome, v]) => ({ nome, receita: v.receita, custo: v.custo, margem: v.receita - v.custo }))
    .sort((a, b) => b.margem - a.margem).slice(0, 12);

  // Receita particular vs convênio (proxy via agendamentos.tipo_atendimento)
  const idsParticular = new Set(ags.filter(a => (a.tipo_atendimento ?? "particular") === "particular").map(a => a.id));
  const idsConvenio = new Set(ags.filter(a => ["convenio", "cartao_beneficio", "contrato"].includes(a.tipo_atendimento ?? "")).map(a => a.id));
  // fin_atendimentos não tem agendamento_id garantido; usamos empresa_id em lancs como proxy adicional
  // Simplificação v1: particular = atends sem procedimento de convênio conhecido; convênio = lancs com empresa_id.
  const receitaConvenio = receitasReal.filter(l => l.empresa_id).reduce((s, l) => s + Number(l.valor || 0), 0);
  const receitaParticular = Math.max(0, receitaRealizada - receitaConvenio);
  // idsParticular/idsConvenio ficam para futura conciliação — evita warning
  void idsParticular; void idsConvenio;

  // --- Comercial ---
  const pacIds = [...new Set(ags.map(a => a.paciente_id).filter(Boolean) as string[])];
  let pacientesNovosSet = new Set<string>();
  if (pacIds.length > 0) {
    const { data: hist } = await supabase
      .from("agendamentos").select("paciente_id")
      .eq("clinica_id", cid).in("paciente_id", pacIds).lt("inicio", ini);
    const existentes = new Set((hist ?? []).map((h: any) => h.paciente_id) as string[]);
    pacientesNovosSet = new Set(pacIds.filter(p => !existentes.has(p)));
  }
  const novos = pacientesNovosSet.size;
  const recorrentes = pacIds.length - novos;

  const orcAprovados = orcs.filter(o => o.status === "aprovado");
  let comAgend = 0;
  if (orcAprovados.length > 0) {
    const orcIds = orcAprovados.map(o => o.id);
    const { data: agsOrc } = await supabase
      .from("agendamentos").select("orcamento_id")
      .eq("clinica_id", cid).in("orcamento_id", orcIds);
    const setOrc = new Set(((agsOrc ?? []) as any[]).map(x => x.orcamento_id));
    comAgend = orcAprovados.filter(o => setOrc.has(o.id)).length;
  }
  const conversaoOrcamento = orcs.length > 0 ? (comAgend / orcs.length) * 100 : 0;

  // --- Qualidade ---
  const noShowDen = realizadosArr.length + faltasArr.length;
  const noShowPct = noShowDen > 0 ? (faltasArr.length / noShowDen) * 100 : 0;

  // Atraso médio: executado_em - inicio (só quando executado_em > inicio)
  let atrasoTotal = 0, atrasoCount = 0;
  for (const a of realizadosArr) {
    if (!a.inicio || !a.executado_em) continue;
    const diff = (new Date(a.executado_em).getTime() - new Date(a.inicio).getTime()) / 60000;
    if (diff > 0 && diff < 12 * 60) { atrasoTotal += diff; atrasoCount++; }
  }

  const ocupacaoPct = capacidadeMin > 0 ? (agendadoMin / capacidadeMin) * 100 : 0;
  const tempoMedioMin = tempoCount > 0 ? tempoTotalMin / tempoCount : 0;
  const atrasoMedioMin = atrasoCount > 0 ? atrasoTotal / atrasoCount : 0;

  return {
    producao: {
      agendados: naoCancelados.length, confirmados: confirmadosArr.length,
      compareceram: realizadosArr.length, faltaram: faltasArr.length, cancelaram: canceladosArr.length,
      ocupacaoPct, tempoMedioMin, capacidadeMin, agendadoMin,
      porMedico, porEspecialidade,
    },
    financeiro: {
      receitaPrevista, receitaRealizada, ticketMedio,
      despesaPrevista, despesaRealizada, resultado: receitaRealizada - despesaRealizada,
      porMedico: finPorMedico, porProcedimento,
      receitaParticular, receitaConvenio,
    },
    comercial: {
      novos, recorrentes, conversaoOrcamento, orcamentosNoPeriodo: orcs.length,
    },
    qualidade: {
      noShowPct, atrasoMedioMin,
    },
    pacientesNovosSet,
  };
}

// ---------- Delta helpers ----------
const delta = (atual: number, ant: number): number => {
  if (!ant) return 0;
  return Number((((atual - ant) / ant) * 100).toFixed(1));
};

// ---------- Page ----------
function PainelExecutivoPage() {
  const { clinicaAtual, loading } = useClinica();
  const podeFin = ["admin", "gestor", "financeiro"].includes(clinicaAtual?.role ?? "");

  const [periodo, setPeriodo] = useState<Periodo>(presets[2].make()); // 30d
  const [carregando, setCarregando] = useState(false);
  const [atual, setAtual] = useState<Bloco>(emptyBloco());
  const [anterior, setAnterior] = useState<Bloco>(emptyBloco());

  const periodoAnterior = useMemo<Periodo>(() => {
    const ms = new Date(`${periodo.ate}T00:00:00`).getTime() - new Date(`${periodo.de}T00:00:00`).getTime();
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
      setAtual(a); setAnterior(b);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clinicaAtual?.clinica_id, periodo.de, periodo.ate]);

  if (loading) return <p className="text-muted-foreground">Carregando…</p>;
  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica.</p>;

  const p = atual.producao, pa = anterior.producao;
  const f = atual.financeiro, fa = anterior.financeiro;
  const c = atual.comercial, ca = anterior.comercial;
  const q = atual.qualidade, qa = anterior.qualidade;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Painel Executivo</h1>
          <p className="text-sm text-muted-foreground">
            Produção, financeiro, comercial e qualidade — comparado com o período anterior.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">De</Label>
            <Input type="date" value={periodo.de} onChange={e => setPeriodo(p => ({ ...p, de: e.target.value }))} className="h-9 w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Até</Label>
            <Input type="date" value={periodo.ate} onChange={e => setPeriodo(p => ({ ...p, ate: e.target.value }))} className="h-9 w-40" />
          </div>
          <div className="flex gap-1">
            {presets.map(pr => (
              <Button key={pr.label} size="sm" variant="outline" onClick={() => setPeriodo(pr.make())}>{pr.label}</Button>
            ))}
          </div>
          <Button size="sm" variant="ghost" onClick={load} disabled={carregando}>
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Comparativo período */}
      <p className="text-xs text-muted-foreground">
        Comparando com {periodoAnterior.de} → {periodoAnterior.ate}.
      </p>

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
            <HhpKpiCard label="Agendados" value={int(p.agendados)} icon={CalendarDays} tone="info" delta={delta(p.agendados, pa.agendados)} />
            <HhpKpiCard label="Confirmados" value={int(p.confirmados)} icon={CheckCircle2} tone="success" delta={delta(p.confirmados, pa.confirmados)} />
            <HhpKpiCard label="Compareceram" value={int(p.compareceram)} icon={UserCheck} tone="success" delta={delta(p.compareceram, pa.compareceram)} />
            <HhpKpiCard label="Faltaram" value={int(p.faltaram)} icon={UserX} tone="danger" delta={delta(p.faltaram, pa.faltaram)} />
            <HhpKpiCard label="Cancelaram" value={int(p.cancelaram)} icon={Ban} tone="warning" delta={delta(p.cancelaram, pa.cancelaram)} />
            <HhpKpiCard label="Ocupação" value={pctFmt(p.ocupacaoPct)} icon={Percent} tone="info" hint={`${int(p.agendadoMin)} / ${int(p.capacidadeMin)} min`} />
          </HhpKpiRow>
          <HhpKpiRow>
            <HhpKpiCard label="Tempo médio" value={`${p.tempoMedioMin.toFixed(0)} min`} icon={Timer} tone="default" />
            <HhpKpiCard label="Especialidades" value={int(p.porEspecialidade.length)} icon={Stethoscope} tone="default" />
            <HhpKpiCard label="Médicos ativos" value={int(p.porMedico.length)} icon={Activity} tone="default" />
          </HhpKpiRow>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RankCard title="Consultas por médico" rows={p.porMedico.map(m => ({ nome: m.nome, valor: m.total, extra: `${m.realizados} realizadas` }))} />
            <RankCard title="Consultas por especialidade" rows={p.porEspecialidade.map(e => ({ nome: e.nome, valor: e.total }))} />
          </div>
        </TabsContent>

        {/* Financeiro */}
        {podeFin && (
        <TabsContent value="financeiro" className="space-y-6">
          <HhpKpiRow>
            <HhpKpiCard label="Receita realizada" value={money(f.receitaRealizada)} icon={Wallet} tone="success" delta={delta(f.receitaRealizada, fa.receitaRealizada)} />
            <HhpKpiCard label="Receita prevista" value={money(f.receitaPrevista)} icon={TrendingUp} tone="info" delta={delta(f.receitaPrevista, fa.receitaPrevista)} />
            <HhpKpiCard label="Ticket médio" value={money(f.ticketMedio)} icon={BadgeDollarSign} tone="info" delta={delta(f.ticketMedio, fa.ticketMedio)} />
            <HhpKpiCard label="Despesa realizada" value={money(f.despesaRealizada)} icon={Receipt} tone="warning" delta={delta(f.despesaRealizada, fa.despesaRealizada)} />
            <HhpKpiCard label="Resultado" value={money(f.resultado)} icon={TrendingUp} tone={f.resultado >= 0 ? "success" : "danger"} delta={delta(f.resultado, fa.resultado)} />
          </HhpKpiRow>
          <HhpKpiRow>
            <HhpKpiCard label="Receita particular" value={money(f.receitaParticular)} icon={Wallet} tone="default" />
            <HhpKpiCard label="Receita convênio" value={money(f.receitaConvenio)} icon={Handshake} tone="default" />
          </HhpKpiRow>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RankCard title="Receita por médico" rows={f.porMedico.map(m => ({ nome: m.nome, valor: money(m.valor) }))} />
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Procedimentos mais lucrativos</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Procedimento</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                      <TableHead className="text-right">Custo</TableHead>
                      <TableHead className="text-right">Margem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {f.porProcedimento.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-6">Sem dados no período.</TableCell></TableRow>
                    )}
                    {f.porProcedimento.map(pr => (
                      <TableRow key={pr.nome}>
                        <TableCell className="text-sm">{pr.nome}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(pr.receita)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{money(pr.custo)}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{money(pr.margem)}</TableCell>
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
            <HhpKpiCard label="Pacientes novos" value={int(c.novos)} icon={UserPlus} tone="success" delta={delta(c.novos, ca.novos)} />
            <HhpKpiCard label="Recorrentes" value={int(c.recorrentes)} icon={Repeat} tone="info" delta={delta(c.recorrentes, ca.recorrentes)} />
            <HhpKpiCard label="Orçamentos" value={int(c.orcamentosNoPeriodo)} icon={Receipt} tone="default" delta={delta(c.orcamentosNoPeriodo, ca.orcamentosNoPeriodo)} />
            <HhpKpiCard label="Conversão orçam." value={pctFmt(c.conversaoOrcamento)} icon={TrendingUp} tone="info" />
          </HhpKpiRow>
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Coortes de retenção (30/60/90 dias) e retorno médio entre consultas exigem materialized
              view dedicada — item pendente na especificação (Frente 1 §7.3, aguardando aprovação da
              migration).
            </CardContent>
          </Card>
        </TabsContent>

        {/* Qualidade */}
        <TabsContent value="qualidade" className="space-y-6">
          <HhpKpiRow>
            <HhpKpiCard label="No-show %" value={pctFmt(q.noShowPct)} icon={AlertTriangle} tone="danger" delta={delta(q.noShowPct, qa.noShowPct)} />
            <HhpKpiCard label="Atraso médio" value={`${q.atrasoMedioMin.toFixed(0)} min`} icon={Clock} tone="warning" delta={delta(q.atrasoMedioMin, qa.atrasoMedioMin)} />
            <HhpKpiCard label="Confirmação" value={pctFmt(p.agendados > 0 ? (p.confirmados / p.agendados) * 100 : 0)} icon={CheckCircle2} tone="success" />
          </HhpKpiRow>
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Tempo de espera e permanência dependem de <code>fluxo_checkpoints</code> em
              <code> agendamentos</code> (proposta pendente). Até lá, exibimos apenas atraso via
              <code> executado_em</code>.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Ranking card ----------
function RankCard({ title, rows }: { title: string; rows: { nome: string; valor: number | string; extra?: string }[] }) {
  const _tone: HhpTone = "default"; void _tone;
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Sem dados no período.</p>
        ) : (
          <div className="divide-y">
            {rows.map((r, i) => (
              <div key={`${r.nome}-${i}`} className="flex items-center justify-between py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="truncate">{r.nome}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {r.extra && <span className="text-xs text-muted-foreground">{r.extra}</span>}
                  <span className="font-semibold tabular-nums">{typeof r.valor === "number" ? int(r.valor) : r.valor}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}