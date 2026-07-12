import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, Download, Users, UserPlus, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { exportToExcel } from "@/lib/export-csv";

import { DateInputBR } from "@/components/ui/date-input-br";
export const Route = createFileRoute("/_authenticated/app/cartao-beneficios/relatorios")({
  component: RelatoriosPage,
  head: () => ({ meta: [{ title: "Relatórios — Cartão Benefícios" }] }),
});

const BRL = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Contrato = { id: string; numero: number; paciente_id: string; paciente_nome: string; plano_id: string; valor_mensal: number; taxa_adesao: number; status: string; data_inicio: string; assinado_em: string | null };
type Plano = { id: string; nome: string; tipo: string; valor_mensal: number };
type Mens = { id: string; contrato_id: string; numero_parcela: number; valor: number; status: string; pago_em: string | null; vencimento: string };
type Dep = { id: string; contrato_id: string; paciente_id: string; paciente_nome: string; tipo: string; ativo: boolean };
type Pac = { id: string; data_nascimento: string | null };
type Atend = { id: string; paciente_id: string | null; data: string };
type Lanc = { id: string; tipo: string; valor: number; data: string; descricao?: string | null };

function idade(dn: string | null): number | null {
  if (!dn) return null;
  const d = new Date(dn + "T00:00:00");
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

const faixas = [
  { min: 0, max: 12, label: "0-12" },
  { min: 13, max: 17, label: "13-17" },
  { min: 18, max: 29, label: "18-29" },
  { min: 30, max: 44, label: "30-44" },
  { min: 45, max: 59, label: "45-59" },
  { min: 60, max: 200, label: "60+" },
];

function RelatoriosPage() {
  const { clinicaAtual } = useClinica();
  const hoje = new Date().toISOString().slice(0, 10);
  const primeiroDoAno = `${new Date().getFullYear()}-01-01`;
  const [from, setFrom] = useState(primeiroDoAno);
  const [to, setTo] = useState(hoje);
  const [showCustom, setShowCustom] = useState(false);
  const [drill, setDrill] = useState<null | {
    title: string;
    columns: { key: string; label: string; align?: "left" | "right" }[];
    rows: Array<Record<string, string | number>>;
  }>(null);
  const [loading, setLoading] = useState(true);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [mens, setMens] = useState<Mens[]>([]);
  const [deps, setDeps] = useState<Dep[]>([]);
  const [pacs, setPacs] = useState<Map<string, Pac>>(new Map());
  const [atends, setAtends] = useState<Atend[]>([]);
  const [despesas, setDespesas] = useState<Lanc[]>([]);
  const [allContratos, setAllContratos] = useState<Contrato[]>([]);
  const [allDeps, setAllDeps] = useState<Dep[]>([]);
  const [allMens, setAllMens] = useState<Mens[]>([]);

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const cid = clinicaAtual.clinica_id;

    const [cs, ps, ds, ls] = await Promise.all([
      supabase.from("contratos_assinatura").select("id, numero, paciente_id, paciente_nome, plano_id, valor_mensal, taxa_adesao, status, data_inicio, assinado_em").eq("clinica_id", cid).gte("data_inicio", from).lte("data_inicio", to).limit(2000),
      supabase.from("planos_assinatura").select("id, nome, tipo, valor_mensal").eq("clinica_id", cid),
      // dependents and lancamentos parallel
      supabase.from("contrato_dependentes").select("id, contrato_id, paciente_id, paciente_nome, tipo, ativo").eq("ativo", true).limit(5000),
      supabase.from("fin_lancamentos").select("id, tipo, valor, data, descricao").eq("clinica_id", cid).eq("tipo", "despesa").gte("data", from).lte("data", to).limit(5000),
    ]);
    const cList = (cs.data ?? []) as Contrato[];
    const cIds = cList.map((c) => c.id);

    // Carregar TODOS contratos da clínica (sem filtro de período) para o painel "Planos — mais vendidos"
    const allCsRes = await supabase
      .from("contratos_assinatura")
      .select("id, numero, paciente_id, paciente_nome, plano_id, valor_mensal, taxa_adesao, status, data_inicio, assinado_em")
      .eq("clinica_id", cid)
      .limit(10000);
    const allCList = (allCsRes.data ?? []) as Contrato[];
    const allCIds = allCList.map((c) => c.id);
    const allDepsRes = allCIds.length
      ? await supabase.from("contrato_dependentes").select("id, contrato_id, paciente_id, paciente_nome, tipo, ativo").in("contrato_id", allCIds).limit(20000)
      : { data: [] as Dep[] };
    const allMensRes = allCIds.length
      ? await supabase.from("contrato_mensalidades").select("id, contrato_id, numero_parcela, valor, status, pago_em, vencimento").in("contrato_id", allCIds).eq("status", "pago").limit(50000)
      : { data: [] as Mens[] };

    // Mensalidades para contratos do período
    const mensRes = cIds.length
      ? await supabase.from("contrato_mensalidades").select("id, contrato_id, numero_parcela, valor, status, pago_em, vencimento").in("contrato_id", cIds).limit(20000)
      : { data: [] as Mens[] };

    // Coletar todos paciente_ids (titulares + deps)
    const depsFiltered = ((ds.data ?? []) as Dep[]).filter((d) => cIds.includes(d.contrato_id));
    const pacIds = Array.from(new Set([
      ...cList.map((c) => c.paciente_id).filter(Boolean),
      ...depsFiltered.map((d) => d.paciente_id).filter(Boolean),
    ]));

    const [pacsRes, atendsRes] = await Promise.all([
      pacIds.length
        ? supabase.from("pacientes").select("id, data_nascimento").in("id", pacIds)
        : Promise.resolve({ data: [] as Pac[] }),
      pacIds.length
        ? supabase.from("fin_atendimentos").select("id, paciente_id, data").eq("clinica_id", cid).in("paciente_id", pacIds).gte("data", from).lte("data", to).limit(20000)
        : Promise.resolve({ data: [] as Atend[] }),
    ]);

    const pacMap = new Map<string, Pac>();
    ((pacsRes.data ?? []) as Pac[]).forEach((p) => pacMap.set(p.id, p));

    setContratos(cList);
    setPlanos((ps.data ?? []) as Plano[]);
    setMens((mensRes.data ?? []) as Mens[]);
    setDeps(depsFiltered);
    setPacs(pacMap);
    setAtends((atendsRes.data ?? []) as Atend[]);
    setDespesas((ls.data ?? []) as Lanc[]);
    setAllContratos(allCList);
    setAllDeps((allDepsRes.data ?? []) as Dep[]);
    setAllMens((allMensRes.data ?? []) as Mens[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clinicaAtual?.clinica_id, from, to]);

  const stats = useMemo(() => {
    const totalContratos = contratos.length;
    const ativos = contratos.filter((c) => c.status === "ativo").length;
    const titulares = new Set(contratos.map((c) => c.paciente_id)).size;
    const dependentesCount = deps.length;
    const totalPessoas = titulares + dependentesCount;

    // Pagantes: titulares com pelo menos uma mensalidade paga no período
    const contratosComPag = new Set(
      mens.filter((m) => m.status === "pago" && m.pago_em && m.pago_em >= from && m.pago_em <= to).map((m) => m.contrato_id),
    );
    const pagantes = contratos.filter((c) => contratosComPag.has(c.id)).length;

    const isAdesao = (m: Mens) => Number(m.numero_parcela) === 0;
    const pagasPeriodo = mens.filter((m) => m.status === "pago" && m.pago_em && m.pago_em >= from && m.pago_em <= to);
    const receitaMens = pagasPeriodo
      .filter((m) => !isAdesao(m))
      .reduce((s, m) => s + Number(m.valor), 0);
    const contratosComAdesaoLancada = new Set(mens.filter(isAdesao).map((m) => m.contrato_id));
    const receitaAdesaoLancada = pagasPeriodo
      .filter(isAdesao)
      .reduce((s, m) => s + Number(m.valor), 0);
    const receitaAdesaoLegada = contratos
      .filter((c) => !contratosComAdesaoLancada.has(c.id))
      .reduce((s, c) => s + Number(c.taxa_adesao || 0), 0);
    const receitaAdesao = receitaAdesaoLancada + receitaAdesaoLegada;
    const receita = receitaMens + receitaAdesao;
    const aReceber = mens.filter((m) => m.status !== "pago").reduce((s, m) => s + Number(m.valor), 0);
    const despesa = despesas.reduce((s, l) => s + Number(l.valor), 0);

    // Utilização: atendimentos por paciente vinculado
    const usoTotal = atends.length;
    const usoPorPac = new Map<string, number>();
    atends.forEach((a) => {
      if (!a.paciente_id) return;
      usoPorPac.set(a.paciente_id, (usoPorPac.get(a.paciente_id) ?? 0) + 1);
    });

    // Por plano
    const porPlano = planos.map((p) => {
      const cs = contratos.filter((c) => c.plano_id === p.id);
      const depsCount = deps.filter((d) => cs.find((c) => c.id === d.contrato_id)).length;
      const titularesCount = cs.length;
      return {
        plano: p.nome,
        tipo: p.tipo,
        contratos: titularesCount,
        pessoas: titularesCount + depsCount,
        receita: cs.reduce((s, c) => {
          const pago = mens.filter((m) => m.contrato_id === c.id && m.status === "pago" && m.pago_em && m.pago_em >= from && m.pago_em <= to).reduce((a, m) => a + Number(m.valor), 0);
          return s + pago + Number(c.taxa_adesao || 0);
        }, 0),
      };
    }).sort((a, b) => b.contratos - a.contratos);

    // Por plano — TODOS os cartões da clínica (lifetime)
    const porPlanoAll = planos.map((p) => {
      const cs = allContratos.filter((c) => c.plano_id === p.id);
      const csIds = new Set(cs.map((c) => c.id));
      const ativos = cs.filter((c) => c.status === "ativo");
      const depsCount = allDeps.filter((d) => d.ativo && csIds.has(d.contrato_id)).length;
      const mrr = ativos.reduce((s, c) => s + Number(c.valor_mensal || 0), 0);
      const receitaPaga = allMens.filter((m) => csIds.has(m.contrato_id)).reduce((s, m) => s + Number(m.valor), 0);
      const adesao = cs.reduce((s, c) => s + Number(c.taxa_adesao || 0), 0);
      return {
        plano: p.nome,
        tipo: p.tipo,
        valorMensal: Number(p.valor_mensal || 0),
        titulares: cs.length,
        titularesAtivos: ativos.length,
        dependentes: depsCount,
        pessoas: cs.length + depsCount,
        mrr,
        receita: receitaPaga + adesao,
      };
    }).sort((a, b) => b.titulares - a.titulares);

    // Por idade
    const todasPessoas: { id: string; tipo: "titular" | "dependente" }[] = [
      ...contratos.map((c) => ({ id: c.paciente_id, tipo: "titular" as const })),
      ...deps.map((d) => ({ id: d.paciente_id, tipo: "dependente" as const })),
    ];
    const porIdade = faixas.map((f) => ({ faixa: f.label, count: 0 }));
    let semData = 0;
    todasPessoas.forEach((p) => {
      const pac = pacs.get(p.id);
      const a = idade(pac?.data_nascimento ?? null);
      if (a == null) { semData++; return; }
      const i = faixas.findIndex((f) => a >= f.min && a <= f.max);
      if (i >= 0) porIdade[i].count++;
    });

    // Top usuários (mais utilizaram)
    const pessoaNome = new Map<string, string>();
    contratos.forEach((c) => pessoaNome.set(c.paciente_id, c.paciente_nome));
    deps.forEach((d) => pessoaNome.set(d.paciente_id, d.paciente_nome));
    const topUso = Array.from(usoPorPac.entries())
      .map(([id, qtd]) => ({ nome: pessoaNome.get(id) ?? "—", qtd }))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 10);

    // Consultas por titular
    const titularIds = new Set(contratos.map((c) => c.paciente_id));
    const depIds = new Set(deps.map((d) => d.paciente_id));
    const tituPorContrato = new Map(contratos.map((c) => [c.id, c.paciente_nome] as const));
    const consultasTitulares = contratos.map((c) => ({
      nome: c.paciente_nome,
      plano: planos.find((p) => p.id === c.plano_id)?.nome ?? "—",
      consultas: usoPorPac.get(c.paciente_id) ?? 0,
    })).sort((a, b) => b.consultas - a.consultas);
    const consultasDependentes = deps.map((d) => ({
      nome: d.paciente_nome,
      titular: tituPorContrato.get(d.contrato_id) ?? "—",
      tipo: d.tipo ?? "—",
      consultas: usoPorPac.get(d.paciente_id) ?? 0,
    })).sort((a, b) => b.consultas - a.consultas);
    const usosTitulares = consultasTitulares.reduce((s, x) => s + x.consultas, 0);
    const usosDependentes = consultasDependentes.reduce((s, x) => s + x.consultas, 0);
    const usosSemVinculo = Math.max(0, usoTotal - usosTitulares - usosDependentes);

    // Financeiro derivado
    const resultado = receita - despesa;
    const margemPct = receita > 0 ? (resultado / receita) * 100 : 0;
    const ticketMedio = pagantes > 0 ? receita / pagantes : 0;
    const mensalidades = mens.filter((m) => !isAdesao(m));
    const totalMens = mensalidades.length;
    const mensPagas = mensalidades.filter((m) => m.status === "pago").length;
    const mensAbertas = totalMens - mensPagas;
    const inadimplenciaPct = totalMens > 0 ? (mensAbertas / totalMens) * 100 : 0;
    const utilizacaoPct = (titulares + dependentesCount) > 0
      ? (usoPorPac.size / (titulares + dependentesCount)) * 100 : 0;
    const mediaConsultasPessoa = (titulares + dependentesCount) > 0
      ? usoTotal / (titulares + dependentesCount) : 0;
    void titularIds; void depIds;

    return {
      totalContratos, ativos, titulares, dependentesCount, totalPessoas, pagantes,
      receita, receitaMens, receitaAdesao, aReceber, despesa,
      usoTotal, porPlano, porPlanoAll, porIdade, semData, topUso,
      consultasTitulares, consultasDependentes,
      usosTitulares, usosDependentes, usosSemVinculo,
      resultado, margemPct, ticketMedio,
      inadimplenciaPct, mensPagas, mensAbertas,
      utilizacaoPct, mediaConsultasPessoa,
    };
  }, [contratos, planos, mens, deps, pacs, atends, despesas, allContratos, allDeps, allMens, from, to]);

  const exportarPlanos = () => {
    exportToExcel(stats.porPlanoAll, `cartao_beneficios_planos_${from}_${to}`, [
      { key: "plano", label: "Plano" }, { key: "tipo", label: "Tipo" },
      { key: "valorMensal", label: "Valor mensal (R$)" },
      { key: "titulares", label: "Titulares" },
      { key: "titularesAtivos", label: "Titulares ativos" },
      { key: "dependentes", label: "Dependentes" },
      { key: "pessoas", label: "Pessoas" },
      { key: "mrr", label: "Receita mensal recorrente (R$)" },
      { key: "receita", label: "Receita acumulada (R$)" },
    ]);
    toast.success("CSV gerado");
  };

  if (!clinicaAtual) return <p className="text-sm text-muted-foreground">Selecione uma clínica.</p>;

  const setQuick = (kind: "diario" | "semanal" | "quinzenal" | "mensal") => {
    const end = new Date();
    const start = new Date();
    if (kind === "diario") { /* mesmo dia */ }
    else if (kind === "semanal") start.setDate(end.getDate() - 6);
    else if (kind === "quinzenal") start.setDate(end.getDate() - 14);
    else if (kind === "mensal") start.setDate(end.getDate() - 29);
    setFrom(start.toISOString().slice(0, 10));
    setTo(end.toISOString().slice(0, 10));
  };

  const planoNome = new Map(planos.map((p) => [p.id, p.nome] as const));
  const pessoaNomeAll = new Map<string, string>();
  contratos.forEach((c) => pessoaNomeAll.set(c.paciente_id, c.paciente_nome));
  deps.forEach((d) => pessoaNomeAll.set(d.paciente_id, d.paciente_nome));

  const openDrill = (which: string) => {
    const fmtDate = (d: string) => d ? d.slice(0,10).split("-").reverse().join("/") : "—";
    if (which === "titulares") {
      setDrill({
        title: `Titulares (${contratos.length})`,
        columns: [{key:"nome",label:"Titular"},{key:"plano",label:"Plano"},{key:"status",label:"Status"},{key:"valor",label:"Mensal",align:"right"}],
        rows: contratos.map((c) => ({ nome: c.paciente_nome, plano: planoNome.get(c.plano_id) ?? "—", status: c.status, valor: BRL(c.valor_mensal) })),
      });
    } else if (which === "dependentes") {
      const tituPorContrato = new Map(contratos.map((c) => [c.id, c.paciente_nome] as const));
      setDrill({
        title: `Dependentes (${deps.length})`,
        columns: [{key:"nome",label:"Dependente"},{key:"titular",label:"Titular"},{key:"tipo",label:"Tipo"}],
        rows: deps.map((d) => ({ nome: d.paciente_nome, titular: tituPorContrato.get(d.contrato_id) ?? "—", tipo: d.tipo ?? "—" })),
      });
    } else if (which === "totalPessoas") {
      const tituPorContrato = new Map(contratos.map((c) => [c.id, c.paciente_nome] as const));
      const rows = [
        ...contratos.map((c) => ({ nome: c.paciente_nome, tipo: "Titular", vinculo: planoNome.get(c.plano_id) ?? "—" })),
        ...deps.map((d) => ({ nome: d.paciente_nome, tipo: "Dependente", vinculo: `Titular: ${tituPorContrato.get(d.contrato_id) ?? "—"}` })),
      ];
      setDrill({
        title: `Total de pessoas (${rows.length})`,
        columns: [{key:"nome",label:"Pessoa"},{key:"tipo",label:"Tipo"},{key:"vinculo",label:"Plano / Titular"}],
        rows,
      });
    } else if (which === "pagantes") {
      const contratosComPag = new Set(
        mens.filter((m) => m.status === "pago" && m.pago_em && m.pago_em >= from && m.pago_em <= to).map((m) => m.contrato_id),
      );
      const lista = contratos.filter((c) => contratosComPag.has(c.id));
      setDrill({
        title: `Pagantes no período (${lista.length})`,
        columns: [{key:"nome",label:"Titular"},{key:"plano",label:"Plano"},{key:"valor",label:"Mensal",align:"right"}],
        rows: lista.map((c) => ({ nome: c.paciente_nome, plano: planoNome.get(c.plano_id) ?? "—", valor: BRL(c.valor_mensal) })),
      });
    } else if (which === "receita") {
      const contratoNome = new Map(contratos.map((c) => [c.id, c.paciente_nome] as const));
      const pagas = mens.filter((m) => m.status === "pago" && m.pago_em && m.pago_em >= from && m.pago_em <= to);
      const contratosComAdesaoLancada = new Set(mens.filter((m) => Number(m.numero_parcela) === 0).map((m) => m.contrato_id));
      const rows = [
        ...pagas.map((m) => ({ data: fmtDate(m.pago_em ?? ""), descricao: `${Number(m.numero_parcela) === 0 ? "Adesao" : "Mensalidade"} - ${contratoNome.get(m.contrato_id) ?? "�"}`, valor: BRL(m.valor) })),
        ...contratos.filter((c) => Number(c.taxa_adesao || 0) > 0 && !contratosComAdesaoLancada.has(c.id)).map((c) => ({ data: fmtDate(c.data_inicio), descricao: `Ades�o - ${c.paciente_nome}`, valor: BRL(c.taxa_adesao) })),
      ];
      setDrill({
        title: `Receita do período (${rows.length})`,
        columns: [{key:"data",label:"Data"},{key:"descricao",label:"Descrição"},{key:"valor",label:"Valor",align:"right"}],
        rows,
      });
    } else if (which === "aReceber") {
      const contratoNome = new Map(contratos.map((c) => [c.id, c.paciente_nome] as const));
      const lista = mens.filter((m) => m.status !== "pago");
      setDrill({
        title: `A receber (${lista.length})`,
        columns: [{key:"venc",label:"Vencimento"},{key:"titular",label:"Titular"},{key:"status",label:"Status"},{key:"valor",label:"Valor",align:"right"}],
        rows: lista.map((m) => ({ venc: fmtDate(m.vencimento), titular: contratoNome.get(m.contrato_id) ?? "—", status: m.status, valor: BRL(m.valor) })),
      });
    } else if (which === "despesas") {
      setDrill({
        title: `Despesas do período (${despesas.length})`,
        columns: [{key:"data",label:"Data"},{key:"descricao",label:"Descrição"},{key:"valor",label:"Valor",align:"right"}],
        rows: despesas.map((l) => ({ data: fmtDate(l.data), descricao: l.descricao ?? "—", valor: BRL(l.valor) })),
      });
    } else if (which === "atendimentos") {
      setDrill({
        title: `Atendimentos usados (${atends.length})`,
        columns: [{key:"data",label:"Data"},{key:"paciente",label:"Paciente"}],
        rows: atends.map((a) => ({ data: fmtDate(a.data), paciente: a.paciente_id ? (pessoaNomeAll.get(a.paciente_id) ?? "—") : "—" })),
      });
    } else if (which === "resultado") {
      const contratoNome = new Map(contratos.map((c) => [c.id, c.paciente_nome] as const));
      const pagas = mens.filter((m) => m.status === "pago" && m.pago_em && m.pago_em >= from && m.pago_em <= to);
      const contratosComAdesaoLancada = new Set(mens.filter((m) => Number(m.numero_parcela) === 0).map((m) => m.contrato_id));
      const rows = [
        ...pagas.map((m) => ({ data: fmtDate(m.pago_em ?? ""), tipo: "Receita", descricao: `${Number(m.numero_parcela) === 0 ? "Adesao" : "Mensalidade"} - ${contratoNome.get(m.contrato_id) ?? "�"}`, valor: BRL(m.valor) })),
        ...contratos.filter((c) => Number(c.taxa_adesao || 0) > 0 && !contratosComAdesaoLancada.has(c.id)).map((c) => ({ data: fmtDate(c.data_inicio), tipo: "Receita", descricao: `Ades�o - ${c.paciente_nome}`, valor: BRL(c.taxa_adesao) })),
        ...despesas.map((l) => ({ data: fmtDate(l.data), tipo: "Despesa", descricao: l.descricao ?? "—", valor: `- ${BRL(l.valor)}` })),
      ];
      setDrill({
        title: `${stats.resultado >= 0 ? "Lucro" : "Prejuízo"} do período (${BRL(Math.abs(stats.resultado))})`,
        columns: [{key:"data",label:"Data"},{key:"tipo",label:"Tipo"},{key:"descricao",label:"Descrição"},{key:"valor",label:"Valor",align:"right"}],
        rows,
      });
    } else if (which === "ticket") {
      const contratosComPag = new Set(
        mens.filter((m) => m.status === "pago" && m.pago_em && m.pago_em >= from && m.pago_em <= to).map((m) => m.contrato_id),
      );
      const lista = contratos.filter((c) => contratosComPag.has(c.id));
      const totalPorContrato = new Map<string, number>();
      mens.filter((m) => m.status === "pago" && m.pago_em && m.pago_em >= from && m.pago_em <= to)
        .forEach((m) => totalPorContrato.set(m.contrato_id, (totalPorContrato.get(m.contrato_id) ?? 0) + Number(m.valor)));
      contratos.forEach((c) => {
        const ad = Number(c.taxa_adesao || 0);
        if (ad > 0) totalPorContrato.set(c.id, (totalPorContrato.get(c.id) ?? 0) + ad);
      });
      setDrill({
        title: `Ticket médio — ${BRL(stats.ticketMedio)} (${lista.length} pagantes)`,
        columns: [{key:"nome",label:"Titular"},{key:"plano",label:"Plano"},{key:"total",label:"Total no período",align:"right"}],
        rows: lista.map((c) => ({ nome: c.paciente_nome, plano: planoNome.get(c.plano_id) ?? "—", total: BRL(totalPorContrato.get(c.id) ?? 0) })),
      });
    } else if (which === "inadimplencia") {
      const contratoNome = new Map(contratos.map((c) => [c.id, c.paciente_nome] as const));
      const lista = mens.filter((m) => m.status !== "pago");
      setDrill({
        title: `Inadimplência — ${stats.mensAbertas} aberta(s) de ${stats.mensPagas + stats.mensAbertas}`,
        columns: [{key:"venc",label:"Vencimento"},{key:"titular",label:"Titular"},{key:"status",label:"Status"},{key:"valor",label:"Valor",align:"right"}],
        rows: lista.map((m) => ({ venc: fmtDate(m.vencimento), titular: contratoNome.get(m.contrato_id) ?? "—", status: m.status, valor: BRL(m.valor) })),
      });
    } else if (which === "utilizacao") {
      const tituPorContrato = new Map(contratos.map((c) => [c.id, c.paciente_nome] as const));
      const usoPorPac = new Map<string, number>();
      atends.forEach((a) => { if (a.paciente_id) usoPorPac.set(a.paciente_id, (usoPorPac.get(a.paciente_id) ?? 0) + 1); });
      const todas = [
        ...contratos.map((c) => ({ nome: c.paciente_nome, tipo: "Titular", vinculo: planoNome.get(c.plano_id) ?? "—", usou: (usoPorPac.get(c.paciente_id) ?? 0) > 0 ? "Sim" : "Não", consultas: usoPorPac.get(c.paciente_id) ?? 0 })),
        ...deps.map((d) => ({ nome: d.paciente_nome, tipo: "Dependente", vinculo: `Titular: ${tituPorContrato.get(d.contrato_id) ?? "—"}`, usou: (usoPorPac.get(d.paciente_id) ?? 0) > 0 ? "Sim" : "Não", consultas: usoPorPac.get(d.paciente_id) ?? 0 })),
      ].sort((a, b) => b.consultas - a.consultas);
      setDrill({
        title: `Taxa de utilização — ${stats.utilizacaoPct.toFixed(1)}%`,
        columns: [{key:"nome",label:"Pessoa"},{key:"tipo",label:"Tipo"},{key:"vinculo",label:"Plano / Titular"},{key:"usou",label:"Utilizou?"},{key:"consultas",label:"Consultas",align:"right"}],
        rows: todas,
      });
    } else if (which === "consTit") {
      setDrill({
        title: `Consultas por titular (${stats.usosTitulares})`,
        columns: [{key:"nome",label:"Titular"},{key:"plano",label:"Plano"},{key:"consultas",label:"Consultas",align:"right"}],
        rows: stats.consultasTitulares.map((t) => ({ nome: t.nome, plano: t.plano, consultas: t.consultas })),
      });
    } else if (which === "consDep") {
      setDrill({
        title: `Consultas por dependente (${stats.usosDependentes})`,
        columns: [{key:"nome",label:"Dependente"},{key:"titular",label:"Titular"},{key:"tipo",label:"Tipo"},{key:"consultas",label:"Consultas",align:"right"}],
        rows: stats.consultasDependentes.map((d) => ({ nome: d.nome, titular: d.titular, tipo: d.tipo, consultas: d.consultas })),
      });
    } else if (which === "mediaConsultas") {
      const tituPorContrato = new Map(contratos.map((c) => [c.id, c.paciente_nome] as const));
      const usoPorPac = new Map<string, number>();
      atends.forEach((a) => { if (a.paciente_id) usoPorPac.set(a.paciente_id, (usoPorPac.get(a.paciente_id) ?? 0) + 1); });
      const rows = [
        ...contratos.map((c) => ({ nome: c.paciente_nome, tipo: "Titular", vinculo: planoNome.get(c.plano_id) ?? "—", consultas: usoPorPac.get(c.paciente_id) ?? 0 })),
        ...deps.map((d) => ({ nome: d.paciente_nome, tipo: "Dependente", vinculo: `Titular: ${tituPorContrato.get(d.contrato_id) ?? "—"}`, consultas: usoPorPac.get(d.paciente_id) ?? 0 })),
      ].sort((a, b) => b.consultas - a.consultas);
      setDrill({
        title: `Média consultas / pessoa — ${stats.mediaConsultasPessoa.toFixed(2)}`,
        columns: [{key:"nome",label:"Pessoa"},{key:"tipo",label:"Tipo"},{key:"vinculo",label:"Plano / Titular"},{key:"consultas",label:"Consultas",align:"right"}],
        rows,
      });
    } else if (which === "semVinculo") {
      const vinc = new Set<string>([...contratos.map((c) => c.paciente_id), ...deps.map((d) => d.paciente_id)]);
      const lista = atends.filter((a) => !a.paciente_id || !vinc.has(a.paciente_id));
      setDrill({
        title: `Consultas sem vínculo (${lista.length})`,
        columns: [{key:"data",label:"Data"},{key:"paciente",label:"Paciente"}],
        rows: lista.map((a) => ({ data: fmtDate(a.data), paciente: a.paciente_id ? (pessoaNomeAll.get(a.paciente_id) ?? "—") : "—" })),
      });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4"/>Período</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div className="flex gap-1 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => { setShowCustom(false); setQuick("diario"); }}>Diário</Button>
            <Button size="sm" variant="outline" onClick={() => { setShowCustom(false); setQuick("semanal"); }}>Semanal</Button>
            <Button size="sm" variant="outline" onClick={() => { setShowCustom(false); setQuick("quinzenal"); }}>Quinzenal</Button>
            <Button size="sm" variant="outline" onClick={() => { setShowCustom(false); setQuick("mensal"); }}>Mensal</Button>
            <Button size="sm" variant={showCustom ? "default" : "outline"} onClick={() => setShowCustom((v) => !v)}>Personalizado</Button>
          </div>
          {showCustom && (
            <>
              <div><Label>De</Label><DateInputBR value={from} onChange={(e) => setFrom(e.target.value)}/></div>
              <div><Label>Até</Label><DateInputBR value={to} onChange={(e) => setTo(e.target.value)}/></div>
            </>
          )}
          <Button variant="outline" onClick={exportarPlanos}><Download className="h-4 w-4 mr-2"/>Exportar planos (CSV)</Button>
          <div className="text-xs text-muted-foreground ml-auto">
            Período: {from.split("-").reverse().join("/")} até {to.split("-").reverse().join("/")}
          </div>
        </CardContent>
      </Card>

      {loading ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI onClick={() => openDrill("titulares")} icon={<Users className="h-4 w-4"/>} label="Titulares" value={stats.titulares}/>
        <KPI onClick={() => openDrill("dependentes")} icon={<UserPlus className="h-4 w-4"/>} label="Dependentes" value={stats.dependentesCount}/>
        <KPI onClick={() => openDrill("totalPessoas")} icon={<Users className="h-4 w-4"/>} label="Total pessoas" value={stats.totalPessoas}/>
        <KPI onClick={() => openDrill("pagantes")} icon={<Activity className="h-4 w-4"/>} label="Pagantes no período" value={stats.pagantes}/>
        <KPI onClick={() => openDrill("receita")} icon={<TrendingUp className="h-4 w-4 text-green-600"/>} label="Receita (mensal. + adesão)" value={BRL(stats.receita)}/>
        <KPI onClick={() => openDrill("aReceber")} icon={<TrendingUp className="h-4 w-4 text-orange-600"/>} label="A receber" value={BRL(stats.aReceber)}/>
        <KPI onClick={() => openDrill("despesas")} icon={<TrendingDown className="h-4 w-4 text-red-600"/>} label="Despesas (período)" value={BRL(stats.despesa)}/>
        <KPI onClick={() => openDrill("atendimentos")} icon={<Activity className="h-4 w-4"/>} label="Atendimentos usados" value={stats.usoTotal}/>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI
          onClick={() => openDrill("resultado")}
          icon={stats.resultado >= 0
            ? <TrendingUp className="h-4 w-4 text-green-600"/>
            : <TrendingDown className="h-4 w-4 text-red-600"/>}
          label={stats.resultado >= 0 ? "Lucro (período)" : "Prejuízo (período)"}
          value={`${BRL(Math.abs(stats.resultado))} (${stats.margemPct.toFixed(1)}%)`}
        />
        <KPI onClick={() => openDrill("ticket")} icon={<Activity className="h-4 w-4"/>} label="Ticket médio / pagante" value={BRL(stats.ticketMedio)}/>
        <KPI onClick={() => openDrill("inadimplencia")} icon={<Activity className="h-4 w-4"/>} label="Inadimplência" value={`${stats.inadimplenciaPct.toFixed(1)}% (${stats.mensAbertas}/${stats.mensPagas + stats.mensAbertas})`}/>
        <KPI onClick={() => openDrill("utilizacao")} icon={<Activity className="h-4 w-4"/>} label="Taxa de utilização" value={`${stats.utilizacaoPct.toFixed(1)}%`}/>
        <KPI onClick={() => openDrill("consTit")} icon={<Users className="h-4 w-4"/>} label="Consultas / titulares" value={stats.usosTitulares}/>
        <KPI onClick={() => openDrill("consDep")} icon={<UserPlus className="h-4 w-4"/>} label="Consultas / dependentes" value={stats.usosDependentes}/>
        <KPI onClick={() => openDrill("mediaConsultas")} icon={<Activity className="h-4 w-4"/>} label="Média consultas / pessoa" value={stats.mediaConsultasPessoa.toFixed(2)}/>
        <KPI onClick={() => openDrill("semVinculo")} icon={<Activity className="h-4 w-4"/>} label="Consultas sem vínculo" value={stats.usosSemVinculo}/>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Planos / Cartões — catálogo completo</CardTitle>
          <p className="text-xs text-muted-foreground">Todos os cartões da clínica, com totais acumulados (não dependem do período acima).</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plano</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor mensal</TableHead>
                <TableHead className="text-right">Titulares</TableHead>
                <TableHead className="text-right">Ativos</TableHead>
                <TableHead className="text-right">Dependentes</TableHead>
                <TableHead className="text-right">Pessoas</TableHead>
                <TableHead className="text-right">MRR ativos</TableHead>
                <TableHead className="text-right">Receita acumulada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.porPlanoAll.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-4">Sem dados.</TableCell></TableRow> : null}
              {stats.porPlanoAll.map((p) => (
                <TableRow key={p.plano}>
                  <TableCell className="font-medium">{p.plano}</TableCell>
                  <TableCell><Badge variant="outline">{p.tipo}</Badge></TableCell>
                  <TableCell className="text-right">{BRL(p.valorMensal)}</TableCell>
                  <TableCell className="text-right">{p.titulares}</TableCell>
                  <TableCell className="text-right">{p.titularesAtivos}</TableCell>
                  <TableCell className="text-right">{p.dependentes}</TableCell>
                  <TableCell className="text-right">{p.pessoas}</TableCell>
                  <TableCell className="text-right">{BRL(p.mrr)}</TableCell>
                  <TableCell className="text-right">{BRL(p.receita)}</TableCell>
                </TableRow>
              ))}
              {stats.porPlanoAll.length > 0 ? (
                <TableRow className="bg-muted/30 font-semibold">
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right">{stats.porPlanoAll.reduce((s,p)=>s+p.titulares,0)}</TableCell>
                  <TableCell className="text-right">{stats.porPlanoAll.reduce((s,p)=>s+p.titularesAtivos,0)}</TableCell>
                  <TableCell className="text-right">{stats.porPlanoAll.reduce((s,p)=>s+p.dependentes,0)}</TableCell>
                  <TableCell className="text-right">{stats.porPlanoAll.reduce((s,p)=>s+p.pessoas,0)}</TableCell>
                  <TableCell className="text-right">{BRL(stats.porPlanoAll.reduce((s,p)=>s+p.mrr,0))}</TableCell>
                  <TableCell className="text-right">{BRL(stats.porPlanoAll.reduce((s,p)=>s+p.receita,0))}</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Consultas por titular</CardTitle>
            <p className="text-xs text-muted-foreground">Atendimentos no período por cada titular de cartão.</p>
          </CardHeader>
          <CardContent className="max-h-96 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titular</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead className="text-right">Consultas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.consultasTitulares.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">Sem titulares no período.</TableCell></TableRow>
                ) : null}
                {stats.consultasTitulares.map((t, i) => (
                  <TableRow key={i}>
                    <TableCell>{t.nome}</TableCell>
                    <TableCell><Badge variant="outline">{t.plano}</Badge></TableCell>
                    <TableCell className="text-right font-semibold">{t.consultas}</TableCell>
                  </TableRow>
                ))}
                {stats.consultasTitulares.length > 0 ? (
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell colSpan={2}>Total</TableCell>
                    <TableCell className="text-right">{stats.usosTitulares}</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Consultas por dependente</CardTitle>
            <p className="text-xs text-muted-foreground">Atendimentos no período por cada dependente.</p>
          </CardHeader>
          <CardContent className="max-h-96 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dependente</TableHead>
                  <TableHead>Titular</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Consultas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.consultasDependentes.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">Sem dependentes no período.</TableCell></TableRow>
                ) : null}
                {stats.consultasDependentes.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell>{d.nome}</TableCell>
                    <TableCell>{d.titular}</TableCell>
                    <TableCell><Badge variant="outline">{d.tipo}</Badge></TableCell>
                    <TableCell className="text-right font-semibold">{d.consultas}</TableCell>
                  </TableRow>
                ))}
                {stats.consultasDependentes.length > 0 ? (
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right">{stats.usosDependentes}</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Distribuição por idade</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {stats.porIdade.map((f) => {
              const max = Math.max(1, ...stats.porIdade.map((x) => x.count));
              const pct = (f.count / max) * 100;
              return (
                <div key={f.faixa} className="space-y-1">
                  <div className="flex justify-between text-sm"><span>{f.faixa} anos</span><span className="font-semibold">{f.count}</span></div>
                  <div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }}/></div>
                </div>
              );
            })}
            {stats.semData > 0 ? <p className="text-xs text-muted-foreground">{stats.semData} pessoa(s) sem data de nascimento.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top 10 — quem mais utilizou</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Pessoa</TableHead><TableHead className="text-right">Atendimentos</TableHead></TableRow></TableHeader>
              <TableBody>
                {stats.topUso.length === 0 ? <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-4">Nenhuma utilização no período.</TableCell></TableRow> : null}
                {stats.topUso.map((u, i) => (
                  <TableRow key={i}><TableCell>{u.nome}</TableCell><TableCell className="text-right font-semibold">{u.qtd}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={drill !== null} onOpenChange={(o) => { if (!o) setDrill(null); }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle>{drill?.title}</DialogTitle></DialogHeader>
          <div className="overflow-auto flex-1">
            {drill && drill.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhum registro.</p>
            ) : drill ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    {drill.columns.map((c) => (
                      <TableHead key={c.key} className={c.align === "right" ? "text-right" : ""}>{c.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drill.rows.map((r, i) => (
                    <TableRow key={i}>
                      {drill.columns.map((c) => (
                        <TableCell key={c.key} className={c.align === "right" ? "text-right" : ""}>{r[c.key]}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KPI({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value: string | number; onClick?: () => void }) {
  return (
    <Card onClick={onClick} className={onClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="text-xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
