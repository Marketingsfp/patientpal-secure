import { createFileRoute, Link } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ElementType } from "react";
import {
  Building2, Bell, CalendarDays, Users, RotateCcw, MessageCircle,
  CheckCircle2, Handshake, CreditCard, Banknote, Receipt, BadgeDollarSign, Stethoscope, BookOpen, Brain, Filter, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildCategoriaResolver } from "@/lib/procedimento/categoria";
import { cn } from "@/lib/utils";
import { useClinicFeatureFlag } from "@/hooks/use-clinic-feature-flag";

import { DateInputBR } from "@/components/ui/date-input-br";
export const Route = createFileRoute("/_authenticated/app/painel")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Painel — ClinicaOS" }] }),
});

const fmtMoney = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString("pt-BR");
const pct = (num: number, den: number) => (den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "0%");

type Periodo = { de: string; ate: string };

const hojeISO = () => new Date().toISOString().slice(0, 10);

type DrillSpec = {
  title: string;
  columns: { key: string; label: string; align?: "left" | "right" }[];
  rows: Array<Record<string, string | number>>;
};
type RawAg = { id: string; status: string; medico_id: string | null; paciente_id: string | null; procedimento: string | null; inicio: string | null };
type RawLanc = { id: string; tipo: string; status: string; valor: number; medico_id: string | null };
type RawAtend = { id: string; valor_total: number; valor_medico: number; medico_id: string | null; status: string };

function DashboardPage() {
  const { memberships, clinicaAtual, loading } = useClinica();
  // Stagger + count-up nos KPIs — só São Francisco de Paula (flag ux_melhorias).
  const { enabled: uxMelhorias } = useClinicFeatureFlag("ux_melhorias");
  const podeVerFinanceiro = ["admin", "gestor", "financeiro"].includes(clinicaAtual?.role ?? "");
  const [periodo, setPeriodo] = useState<Periodo>({ de: hojeISO(), ate: hojeISO() });
  const [carregando, setCarregando] = useState(false);
  const [medicosLista, setMedicosLista] = useState<{ id: string; nome: string }[]>([]);
  const [especialidadesLista, setEspecialidadesLista] = useState<{ id: string; nome: string }[]>([]);
  const [medEspMap, setMedEspMap] = useState<Record<string, string[]>>({}); // medico_id -> [esp_id]
  const [medicosSel, setMedicosSel] = useState<string[]>([]);
  const [especialidadesSel, setEspecialidadesSel] = useState<string[]>([]);
  const [buscaMed, setBuscaMed] = useState("");
  const [buscaEsp, setBuscaEsp] = useState("");
  const [data, setData] = useState({
    alertas: [] as { id: string; mensagem: string }[],
    agend: { total: 0, atendidos: 0, faltas: 0, pagos: 0, naoPagos: 0, novos: 0, regulares: 0, retornos: 0, semAgenda: 0 },
    msgs: { enviadas: 0, respostas: 0, total: 0 },
    conf: { presencas: 0, ausencias: 0 },
    vendas: { total: 0, orcamentos: 0 },
    pagamentos: { realizado: 0, aPagar: 0 },
    recebimentos: { realizado: 0, aReceber: 0, qtdRealizado: 0, qtdAReceber: 0 },
    comissoes: { pagas: 0, pendentes: 0, percentReceita: 0 },
    porMedico: [] as { nome: string; total: number; pagos: number; novos: number }[],
  });
  const [rawAgs, setRawAgs] = useState<RawAg[]>([]);
  const [rawLancs, setRawLancs] = useState<RawLanc[]>([]);
  const [rawAtends, setRawAtends] = useState<RawAtend[]>([]);
  const [novosIds, setNovosIds] = useState<Set<string>>(new Set());
  const [pacNomes, setPacNomes] = useState<Map<string, string>>(new Map());
  const [medNomes, setMedNomes] = useState<Map<string, string>>(new Map());
  const [drill, setDrill] = useState<DrillSpec | null>(null);

  // Conjunto efetivo de medico_ids após filtros (intersecção médicos x especialidades)
  const medicosFiltradosIds = useMemo(() => {
    let ids = medicosLista.map(m => m.id);
    if (medicosSel.length > 0) ids = ids.filter(id => medicosSel.includes(id));
    if (especialidadesSel.length > 0) {
      ids = ids.filter(id => (medEspMap[id] ?? []).some(e => especialidadesSel.includes(e)));
    }
    return ids;
  }, [medicosLista, medicosSel, especialidadesSel, medEspMap]);
  const filtrosAtivos = medicosSel.length > 0 || especialidadesSel.length > 0;

  const load = async () => {
    if (!clinicaAtual) return;
    setCarregando(true);
    const cid = clinicaAtual.clinica_id;
    const ini = new Date(`${periodo.de}T00:00:00`).toISOString();
    const fim = new Date(`${periodo.ate}T23:59:59`).toISOString();

    const [alertasR, agendR, lancR, atendR, medicosR, espR, medEspR, procR] = await Promise.all([
      supabase.from("fin_alertas").select("id,mensagem").eq("clinica_id", cid).eq("lido", false).order("created_at", { ascending: false }).limit(5),
      supabase.from("agendamentos").select("id,status,medico_id,paciente_id,procedimento,inicio").eq("clinica_id", cid).gte("inicio", ini).lte("inicio", fim),
      supabase.from("fin_lancamentos").select("id,tipo,status,valor,medico_id").eq("clinica_id", cid).gte("data", periodo.de).lte("data", periodo.ate),
      supabase.from("fin_atendimentos").select("id,valor_total,valor_medico,medico_id,status").eq("clinica_id", cid).gte("data", periodo.de).lte("data", periodo.ate),
      supabase.from("medicos").select("id,nome").eq("clinica_id", cid).eq("ativo", true),
      supabase.from("especialidades").select("id,nome"),
      supabase.from("medico_especialidades").select("medico_id,especialidade_id"),
      supabase.from("procedimentos").select("nome,tipo_procedimento").eq("clinica_id", cid).eq("ativo", true),
    ]);

    const medsAll = (medicosR.data ?? []) as { id: string; nome: string }[];
    const espAll = (espR.data ?? []) as { id: string; nome: string }[];
    const medEspAll = (medEspR.data ?? []) as Array<{ medico_id: string; especialidade_id: string }>;

    // Atualiza listas para os filtros
    setMedicosLista(medsAll.slice().sort((a, b) => a.nome.localeCompare(b.nome)));
    setEspecialidadesLista(espAll.slice().sort((a, b) => a.nome.localeCompare(b.nome)));
    const mapTmp: Record<string, string[]> = {};
    for (const me of medEspAll) {
      (mapTmp[me.medico_id] ||= []).push(me.especialidade_id);
    }
    setMedEspMap(mapTmp);

    // Aplica filtros de médico / especialidade
    let medsFiltrados = medsAll;
    if (medicosSel.length > 0) {
      medsFiltrados = medsFiltrados.filter(m => medicosSel.includes(m.id));
    }
    if (especialidadesSel.length > 0) {
      medsFiltrados = medsFiltrados.filter(m =>
        (mapTmp[m.id] ?? []).some(e => especialidadesSel.includes(e)),
      );
    }
    const filtroAtivo = medicosSel.length > 0 || especialidadesSel.length > 0;
    const medIdsPermitidos = new Set(medsFiltrados.map(m => m.id));
    const passaFiltro = (mid: string | null) => !filtroAtivo || (!!mid && medIdsPermitidos.has(mid));

    const ags = (agendR.data ?? []).filter(a => passaFiltro(a.medico_id));
    const lancs = (lancR.data ?? []).filter(l => !filtroAtivo || passaFiltro(l.medico_id));
    const atends = (atendR.data ?? []).filter(a => passaFiltro(a.medico_id));
    const meds = medsFiltrados;

    // Identifica médicos cuja especialidade é "Laboratório"
    // Regra de contagem: 1 paciente por GR/procedimento, exceto laboratório
    // (vários exames do mesmo paciente no mesmo dia contam como 1).
    const espLabIds = new Set(
      espAll
        .filter(e => (e.nome ?? "").toLowerCase().includes("laborat"))
        .map(e => e.id),
    );
    const labMedicoIds = new Set<string>();
    for (const me of medEspAll) {
      if (espLabIds.has(me.especialidade_id)) labMedicoIds.add(me.medico_id);
    }
    // Categoria por procedimento (fonte da verdade); fallback = especialidade do médico.
    const catResolver = buildCategoriaResolver(
      (procR.data ?? []) as { nome: string; tipo_procedimento: string | null }[],
    );
    const isLabAg = (a: { medico_id: string | null; procedimento?: string | null }) => {
      if (a.procedimento) return catResolver.categoriaDoTexto(a.procedimento) === "laboratorio";
      return !!a.medico_id && labMedicoIds.has(a.medico_id);
    };
    const contarGRs = <T extends { medico_id: string | null; paciente_id?: string | null; inicio?: string | null; procedimento?: string | null; id: string }>(arr: T[]) => {
      const naoLab = arr.filter(x => !isLabAg(x)).length;
      const grupos = new Set<string>();
      for (const x of arr.filter(isLabAg)) {
        const dia = (x.inicio ?? "").slice(0, 10);
        grupos.add(`${x.paciente_id ?? x.id}|${dia}`);
      }
      return naoLab + grupos.size;
    };

    // Agendamentos (contagem por GR/procedimento, com regra de laboratório)
    const total = contarGRs(ags);
    const atendidos = contarGRs(ags.filter(a => a.status === "realizado"));
    const faltas = contarGRs(ags.filter(a => a.status === "faltou"));
    const retornos = contarGRs(ags.filter(a => (a.procedimento ?? "").toLowerCase().includes("retorno")));
    const semAgenda = ags.filter(a => !a.medico_id).length;

    // Novos x regulares (a partir de paciente_id em agendamentos do período vs histórico)
    const pacIds = Array.from(new Set(ags.map(a => a.paciente_id).filter(Boolean) as string[]));
    let novos = 0, regulares = 0;
    let setExistentes = new Set<string>();
    if (pacIds.length > 0) {
      const { data: hist } = await supabase
        .from("agendamentos").select("paciente_id,inicio")
        .eq("clinica_id", cid).in("paciente_id", pacIds).lt("inicio", ini);
      setExistentes = new Set((hist ?? []).map(h => h.paciente_id) as string[]);
      novos = pacIds.filter(p => !setExistentes.has(p)).length;
      regulares = pacIds.length - novos;
    }

    // Financeiro
    const receitas = lancs.filter(l => l.tipo === "receita");
    const despesas = lancs.filter(l => l.tipo === "despesa");
    const recebRealizado = receitas.filter(l => l.status === "confirmado").reduce((s, l) => s + Number(l.valor || 0), 0);
    const recebAReceber = receitas.filter(l => l.status === "pendente").reduce((s, l) => s + Number(l.valor || 0), 0);
    const qtdReceb = receitas.filter(l => l.status === "confirmado").length;
    const qtdAReceber = receitas.filter(l => l.status === "pendente").length;
    const pagRealizado = despesas.filter(l => l.status === "confirmado").reduce((s, l) => s + Number(l.valor || 0), 0);
    const pagAPagar = despesas.filter(l => l.status === "pendente").reduce((s, l) => s + Number(l.valor || 0), 0);

    const vendasTotal = atends.reduce((s, a) => s + Number(a.valor_total || 0), 0);
    const comissoesPagas = atends.reduce((s, a) => s + Number(a.valor_medico || 0), 0);

    // Pagamentos das senhas (pagos/não pagos): a partir de atendimentos status
    const pagos = atends.filter(a => a.status === "pago" || a.status === "realizado").length;
    const naoPagos = Math.max(0, total - pagos);

    // Por médico
    const porMedico = meds.map(m => {
      const agendados = ags.filter(a => a.medico_id === m.id);
      const pacIdsM = Array.from(new Set(agendados.map(a => a.paciente_id).filter(Boolean) as string[]));
      return {
        nome: m.nome,
        total: contarGRs(agendados),
        pagos: contarGRs(agendados.filter(a => a.status === "realizado")),
        novos: pacIdsM.filter(p => !setExistentes.has(p)).length,
      };
    }).sort((a, b) => b.total - a.total);

    setData({
      alertas: alertasR.data ?? [],
      agend: { total, atendidos, faltas, pagos, naoPagos, novos, regulares, retornos, semAgenda },
      msgs: { enviadas: 0, respostas: 0, total: 0 },
      conf: { presencas: atendidos, ausencias: faltas },
      vendas: { total: vendasTotal, orcamentos: 0 },
      pagamentos: { realizado: pagRealizado, aPagar: pagAPagar },
      recebimentos: { realizado: recebRealizado, aReceber: recebAReceber, qtdRealizado: qtdReceb, qtdAReceber },
      comissoes: { pagas: comissoesPagas, pendentes: 0, percentReceita: recebRealizado > 0 ? (comissoesPagas / recebRealizado) * 100 : 0 },
      porMedico,
    });
    setRawAgs(ags as RawAg[]);
    setRawLancs(lancs as RawLanc[]);
    setRawAtends(atends as RawAtend[]);
    const novosSet = new Set(pacIds.filter(p => !setExistentes.has(p)));
    setNovosIds(novosSet);
    setMedNomes(new Map(medsAll.map(m => [m.id, m.nome] as const)));
    // Buscar nomes de pacientes
    if (pacIds.length > 0) {
      const { data: pacs } = await supabase.from("pacientes").select("id,nome").in("id", pacIds).limit(5000);
      setPacNomes(new Map(((pacs ?? []) as { id: string; nome: string }[]).map(p => [p.id, p.nome] as const)));
    } else {
      setPacNomes(new Map());
    }
    setCarregando(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clinicaAtual?.clinica_id, periodo.de, periodo.ate, medicosSel, especialidadesSel]);

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  if (memberships.length === 0) {
    return (
      <div className="mx-auto mt-12 max-w-xl text-center">
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Building2 className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-semibold">Bem-vindo ao ClinicaOS!</h1>
        <p className="mt-2 text-muted-foreground">Para começar, crie sua primeira clínica.</p>
        <Button asChild className="mt-6" size="lg"><Link to="/app/unidades">Criar minha primeira clínica</Link></Button>
      </div>
    );
  }

  const a = data.agend;

  const fmtDt = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  const pacNome = (id: string | null) => (id ? (pacNomes.get(id) ?? "—") : "—");
  const medNome = (id: string | null) => (id ? (medNomes.get(id) ?? "—") : "Sem profissional");
  const moneyBRL = (n: number) => `R$ ${fmtMoney(Number(n || 0))}`;

  const openDrill = (kind: string, ctx?: Record<string, string>) => {
    if (kind === "alertas") {
      setDrill({
        title: `Central de alertas (${data.alertas.length})`,
        columns: [{ key: "mensagem", label: "Mensagem" }],
        rows: data.alertas.map(al => ({ mensagem: al.mensagem })),
      });
    } else if (kind.startsWith("agend")) {
      const filtroFn = (g: RawAg) => {
        if (kind === "agend_total") return true;
        if (kind === "agend_atendidos") return g.status === "realizado";
        if (kind === "agend_faltas") return g.status === "faltou";
        if (kind === "agend_pagos") {
          const atIds = new Set(rawAtends.filter(at => at.status === "pago" || at.status === "realizado").map(at => at.id));
          // approximate: agendamentos com status realizado/pago
          return g.status === "realizado" || atIds.has(g.id);
        }
        if (kind === "agend_naopagos") return g.status !== "realizado" && g.status !== "pago";
        return true;
      };
      const titulos: Record<string, string> = {
        agend_total: "Todos os agendamentos",
        agend_atendidos: "Agendamentos atendidos",
        agend_faltas: "Faltas",
        agend_pagos: "Agendamentos pagos",
        agend_naopagos: "Agendamentos não pagos",
      };
      const lista = rawAgs.filter(filtroFn);
      setDrill({
        title: `${titulos[kind] ?? "Agendamentos"} (${lista.length})`,
        columns: [
          { key: "data", label: "Quando" }, { key: "paciente", label: "Paciente" },
          { key: "medico", label: "Profissional" }, { key: "proc", label: "Procedimento" },
          { key: "status", label: "Status" },
        ],
        rows: lista.map(g => ({ data: fmtDt(g.inicio), paciente: pacNome(g.paciente_id), medico: medNome(g.medico_id), proc: g.procedimento ?? "—", status: g.status })),
      });
    } else if (kind === "clientes_novos" || kind === "clientes_regulares" || kind === "clientes_total") {
      const pacsAg = Array.from(new Set(rawAgs.map(g => g.paciente_id).filter(Boolean) as string[]));
      const lista = pacsAg.filter(p => kind === "clientes_total" ? true : (kind === "clientes_novos" ? novosIds.has(p) : !novosIds.has(p)));
      const titulos: Record<string, string> = { clientes_total: "Clientes agendados", clientes_novos: "Clientes novos", clientes_regulares: "Clientes regulares" };
      setDrill({
        title: `${titulos[kind]} (${lista.length})`,
        columns: [{ key: "paciente", label: "Paciente" }, { key: "tipo", label: "Tipo" }],
        rows: lista.map(p => ({ paciente: pacNome(p), tipo: novosIds.has(p) ? "Novo" : "Regular" })),
      });
    } else if (kind === "retornos") {
      const lista = rawAgs.filter(g => (g.procedimento ?? "").toLowerCase().includes("retorno"));
      setDrill({
        title: `Retornos agendados (${lista.length})`,
        columns: [{ key: "data", label: "Quando" }, { key: "paciente", label: "Paciente" }, { key: "medico", label: "Profissional" }, { key: "status", label: "Status" }],
        rows: lista.map(g => ({ data: fmtDt(g.inicio), paciente: pacNome(g.paciente_id), medico: medNome(g.medico_id), status: g.status })),
      });
    } else if (kind === "retornos_sem") {
      const lista = rawAgs.filter(g => !g.medico_id);
      setDrill({
        title: `Sem profissional definido (${lista.length})`,
        columns: [{ key: "data", label: "Quando" }, { key: "paciente", label: "Paciente" }, { key: "proc", label: "Procedimento" }],
        rows: lista.map(g => ({ data: fmtDt(g.inicio), paciente: pacNome(g.paciente_id), proc: g.procedimento ?? "—" })),
      });
    } else if (kind === "conf_pres" || kind === "conf_aus" || kind === "conf_total") {
      const lista = rawAgs.filter(g => kind === "conf_total" ? (g.status === "realizado" || g.status === "faltou") : kind === "conf_pres" ? g.status === "realizado" : g.status === "faltou");
      const titulos: Record<string, string> = { conf_total: "Confirmações", conf_pres: "Presenças", conf_aus: "Ausências" };
      setDrill({
        title: `${titulos[kind]} (${lista.length})`,
        columns: [{ key: "data", label: "Quando" }, { key: "paciente", label: "Paciente" }, { key: "medico", label: "Profissional" }, { key: "status", label: "Status" }],
        rows: lista.map(g => ({ data: fmtDt(g.inicio), paciente: pacNome(g.paciente_id), medico: medNome(g.medico_id), status: g.status })),
      });
    } else if (kind === "vendas") {
      setDrill({
        title: `Vendas / atendimentos (${rawAtends.length})`,
        columns: [{ key: "medico", label: "Profissional" }, { key: "status", label: "Status" }, { key: "valor", label: "Valor", align: "right" }, { key: "comissao", label: "Comissão médico", align: "right" }],
        rows: rawAtends.map(at => ({ medico: medNome(at.medico_id), status: at.status, valor: moneyBRL(at.valor_total), comissao: moneyBRL(at.valor_medico) })),
      });
    } else if (kind.startsWith("pag_") || kind.startsWith("rec_")) {
      const isRec = kind.startsWith("rec_");
      const tipo = isRec ? "receita" : "despesa";
      const status = kind.endsWith("real") ? "confirmado" : "pendente";
      const lista = rawLancs.filter(l => l.tipo === tipo && l.status === status);
      const tot = lista.reduce((s, l) => s + Number(l.valor || 0), 0);
      const titulos: Record<string, string> = {
        pag_real: "Pagamentos realizados", pag_apagar: "Pagamentos a pagar",
        rec_real: "Recebimentos realizados", rec_areceber: "Recebimentos a receber",
      };
      setDrill({
        title: `${titulos[kind] ?? "Lançamentos"} — ${moneyBRL(tot)} (${lista.length})`,
        columns: [{ key: "medico", label: "Profissional" }, { key: "status", label: "Status" }, { key: "valor", label: "Valor", align: "right" }],
        rows: lista.map(l => ({ medico: medNome(l.medico_id), status: l.status, valor: moneyBRL(l.valor) })),
      });
    } else if (kind === "comissoes") {
      const lista = rawAtends.filter(at => Number(at.valor_medico || 0) > 0);
      setDrill({
        title: `Comissões (${lista.length})`,
        columns: [{ key: "medico", label: "Profissional" }, { key: "status", label: "Status" }, { key: "valor", label: "Atendimento", align: "right" }, { key: "comissao", label: "Comissão", align: "right" }],
        rows: lista.map(at => ({ medico: medNome(at.medico_id), status: at.status, valor: moneyBRL(at.valor_total), comissao: moneyBRL(at.valor_medico) })),
      });
    } else if (kind === "medico" && ctx?.nome) {
      const lista = rawAgs.filter(g => medNome(g.medico_id) === ctx.nome);
      setDrill({
        title: `Agendamentos — ${ctx.nome} (${lista.length})`,
        columns: [{ key: "data", label: "Quando" }, { key: "paciente", label: "Paciente" }, { key: "proc", label: "Procedimento" }, { key: "status", label: "Status" }],
        rows: lista.map(g => ({ data: fmtDt(g.inicio), paciente: pacNome(g.paciente_id), proc: g.procedimento ?? "—", status: g.status })),
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Painel</h1>
          <p className="text-sm text-muted-foreground">{clinicaAtual?.clinica.nome} {carregando && "• atualizando…"}</p>
        </div>
        <div className="flex items-end gap-2">
          <MultiSelectFiltro
            label="Profissional"
            placeholder="Todos os profissionais"
            options={medicosLista.filter(m =>
              especialidadesSel.length === 0 ||
              (medEspMap[m.id] ?? []).some(e => especialidadesSel.includes(e))
            ).map(m => ({ value: m.id, label: m.nome }))}
            selected={medicosSel}
            onChange={setMedicosSel}
            busca={buscaMed}
            setBusca={setBuscaMed}
          />
          <MultiSelectFiltro
            label="Especialidade"
            placeholder="Todas as especialidades"
            options={especialidadesLista.map(e => ({ value: e.id, label: e.nome }))}
            selected={especialidadesSel}
            onChange={setEspecialidadesSel}
            busca={buscaEsp}
            setBusca={setBuscaEsp}
          />
          <div className="space-y-1">
            <Label className="text-xs">Período</Label>
            <DateInputBR value={periodo.de} onChange={(e) => setPeriodo(p => ({ ...p, de: e.target.value }))} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">até</Label>
            <DateInputBR value={periodo.ate} onChange={(e) => setPeriodo(p => ({ ...p, ate: e.target.value }))} className="w-40" />
          </div>
          <Button variant="outline" onClick={load}>Atualizar</Button>
        </div>
      </div>

      {filtrosAtivos && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtros ativos:</span>
          {medicosSel.map(id => {
            const m = medicosLista.find(x => x.id === id);
            if (!m) return null;
            return (
              <Badge key={`m-${id}`} variant="secondary" className="gap-1">
                {m.nome}
                <button onClick={() => setMedicosSel(s => s.filter(x => x !== id))} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
          {especialidadesSel.map(id => {
            const e = especialidadesLista.find(x => x.id === id);
            if (!e) return null;
            return (
              <Badge key={`e-${id}`} variant="outline" className="gap-1">
                {e.nome}
                <button onClick={() => setEspecialidadesSel(s => s.filter(x => x !== id))} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => { setMedicosSel([]); setEspecialidadesSel([]); }}
          >
            Limpar
          </Button>
          <span className="text-xs text-muted-foreground">
            ({medicosFiltradosIds.length} {medicosFiltradosIds.length === 1 ? "profissional" : "profissionais"})
          </span>
        </div>
      )}

      <KpiAnimContext.Provider value={uxMelhorias}>
      <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-3", uxMelhorias && "kpi-stagger")}>
        {/* Informações rápidas — lembrete para a equipe */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Informações rápidas</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Tire dúvidas sobre médicos, horários e valores de exames sem precisar lembrar de cor.
            </p>
            <div className="flex flex-col gap-2">
              <Button asChild size="sm" variant="default" className="w-full justify-start">
                <Link to="/app/consulta-rapida"><BookOpen className="h-4 w-4 mr-1 shrink-0" /> Abrir tabela</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="w-full justify-start">
                <Link to="/app/nina"><Brain className="h-4 w-4 mr-1 shrink-0" /> Perguntar à Nina</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Alertas */}
        <KpiCard icon={Bell} title="Central de Alertas" onClick={() => openDrill("alertas")}>
          {data.alertas.length === 0
            ? <p className="text-sm text-muted-foreground">Oba! Nenhum alerta.</p>
            : <ul className="space-y-1 text-sm">{data.alertas.map(al => <li key={al.id} className="truncate">• {al.mensagem}</li>)}</ul>}
        </KpiCard>

        <KpiCard icon={CalendarDays} title="Agendamentos" value={a.total} format={fmtInt} onClick={() => openDrill("agend_total")}>
          <SubGrid items={[
            { label: "Atendidos", value: fmtInt(a.atendidos), pct: pct(a.atendidos, a.total), onClick: () => openDrill("agend_atendidos") },
            { label: "Faltas", value: fmtInt(a.faltas), pct: pct(a.faltas, a.total), onClick: () => openDrill("agend_faltas") },
            { label: "Pagos", value: fmtInt(a.pagos), pct: pct(a.pagos, a.total), onClick: () => openDrill("agend_pagos") },
            { label: "Não Pagos", value: fmtInt(a.naoPagos), pct: pct(a.naoPagos, a.total), onClick: () => openDrill("agend_naopagos") },
          ]} />
        </KpiCard>

        <KpiCard icon={Users} title="Clientes Agendados" value={a.novos + a.regulares} format={fmtInt} onClick={() => openDrill("clientes_total")}>
          <SubGrid items={[
            { label: "Novos", value: fmtInt(a.novos), pct: pct(a.novos, a.novos + a.regulares), onClick: () => openDrill("clientes_novos") },
            { label: "Regulares", value: fmtInt(a.regulares), pct: pct(a.regulares, a.novos + a.regulares), onClick: () => openDrill("clientes_regulares") },
          ]} />
        </KpiCard>

        <KpiCard icon={RotateCcw} title="Retornos" value={a.retornos} format={fmtInt} onClick={() => openDrill("retornos")}>
          <SubGrid items={[
            { label: "Sem Agenda", value: fmtInt(a.semAgenda), onClick: () => openDrill("retornos_sem") },
            { label: "Agendados", value: fmtInt(a.retornos), onClick: () => openDrill("retornos") },
          ]} />
        </KpiCard>

        <KpiCard icon={MessageCircle} title="Mensagens Enviadas" value={data.msgs.enviadas} format={fmtInt}>
          <SubGrid items={[
            { label: "Respostas", value: fmtInt(data.msgs.respostas) },
            { label: "Total", value: fmtInt(data.msgs.total) },
          ]} />
        </KpiCard>

        <KpiCard icon={CheckCircle2} title="Confirmações das Agendas" value={data.conf.presencas + data.conf.ausencias} format={fmtInt} onClick={() => openDrill("conf_total")}>
          <SubGrid items={[
            { label: "Presenças", value: fmtInt(data.conf.presencas), pct: pct(data.conf.presencas, data.conf.presencas + data.conf.ausencias), onClick: () => openDrill("conf_pres") },
            { label: "Ausências", value: fmtInt(data.conf.ausencias), pct: pct(data.conf.ausencias, data.conf.presencas + data.conf.ausencias), onClick: () => openDrill("conf_aus") },
          ]} />
        </KpiCard>

        {podeVerFinanceiro && (
        <KpiCard icon={Handshake} title="Vendas" value={data.vendas.total} format={fmtMoney} onClick={() => openDrill("vendas")}>
          <SubGrid items={[
            { label: "Conversão", value: "—" },
            { label: "Orçamentos", value: fmtMoney(data.vendas.orcamentos) },
          ]} />
        </KpiCard>
        )}

        {podeVerFinanceiro && (
        <KpiCard icon={CreditCard} title="Pagamentos" value={data.pagamentos.realizado + data.pagamentos.aPagar} format={fmtMoney} onClick={() => openDrill("pag_real")}>
          <SubGrid items={[
            { label: "Realizado", value: fmtMoney(data.pagamentos.realizado), onClick: () => openDrill("pag_real") },
            { label: "À pagar", value: fmtMoney(data.pagamentos.aPagar), onClick: () => openDrill("pag_apagar") },
          ]} />
        </KpiCard>
        )}

        {podeVerFinanceiro && (
        <KpiCard icon={Banknote} title="Recebimentos" value={data.recebimentos.realizado + data.recebimentos.aReceber} format={fmtMoney} onClick={() => openDrill("rec_real")}>
          <SubGrid items={[
            { label: "Realizado", value: fmtMoney(data.recebimentos.realizado), onClick: () => openDrill("rec_real") },
            { label: "À receber", value: fmtMoney(data.recebimentos.aReceber), onClick: () => openDrill("rec_areceber") },
          ]} />
        </KpiCard>
        )}

        {podeVerFinanceiro && (
        <KpiCard icon={Receipt} title="Recebimentos Qtd." value={data.recebimentos.qtdRealizado + data.recebimentos.qtdAReceber} format={fmtInt} onClick={() => openDrill("rec_real")}>
          <SubGrid items={[
            { label: "Realizado", value: fmtInt(data.recebimentos.qtdRealizado), onClick: () => openDrill("rec_real") },
            { label: "À receber", value: fmtInt(data.recebimentos.qtdAReceber), onClick: () => openDrill("rec_areceber") },
          ]} />
        </KpiCard>
        )}

        {podeVerFinanceiro && (
        <KpiCard icon={BadgeDollarSign} title="Comissões Pagas" value={data.comissoes.pagas} format={fmtMoney} onClick={() => openDrill("comissoes")}>
          <SubGrid items={[
            { label: "% da Receita", value: `${data.comissoes.percentReceita.toFixed(1)}%` },
            { label: "Pendentes", value: fmtMoney(data.comissoes.pendentes) },
          ]} />
        </KpiCard>
        )}
      </div>
      </KpiAnimContext.Provider>

      {data.porMedico.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase mb-3">Total de Agendamentos por médico</h2>
          <KpiAnimContext.Provider value={uxMelhorias}>
          <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-3", uxMelhorias && "kpi-stagger")}>
            {data.porMedico.map((m) => (
              <KpiCard key={m.nome} icon={Stethoscope} title={m.nome} value={m.total} format={fmtInt} small onClick={() => openDrill("medico", { nome: m.nome })}>
                <SubGrid items={[
                  { label: "Pagos", value: fmtInt(m.pagos), pct: pct(m.pagos, m.total) },
                  { label: "Clientes Novos", value: fmtInt(m.novos), pct: pct(m.novos, m.total) },
                ]} />
              </KpiCard>
            ))}
          </div>
          </KpiAnimContext.Provider>
        </div>
      )}

      <Dialog open={drill !== null} onOpenChange={(o) => { if (!o) setDrill(null); }}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
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

// Contexto que liga o count-up dos KPIs — provido pela flag ux_melhorias
// (só São Francisco de Paula) uma única vez em DashboardPage.
const KpiAnimContext = createContext(false);

function KpiCard({ icon: Icon, title, value, format, small, children, onClick }: {
  icon: ElementType; title: string; value?: number; format?: (n: number) => string;
  small?: boolean; children?: React.ReactNode; onClick?: () => void;
}) {
  const animado = useContext(KpiAnimContext);
  const big = value !== undefined && format
    ? (animado ? <CountUpNumber value={value} format={format} /> : format(value))
    : undefined;
  return (
    <Card className={`overflow-hidden ${onClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`} onClick={onClick}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 text-sm text-muted-foreground min-w-0 flex-1">
            <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span className="line-clamp-2 leading-tight" title={title}>{title}</span>
          </div>
          {big !== undefined && <div className="text-xl lg:text-2xl font-semibold tabular-nums shrink-0 whitespace-nowrap">{big}</div>}
        </div>
        {children && <div className="mt-4 pt-3 border-t border-border">{children}</div>}
      </CardContent>
    </Card>
  );
}

/** Anima o número de `from` (valor anterior, 0 no primeiro carregamento) até
 * `value`, reformatando a cada quadro. Respeita prefers-reduced-motion. */
function CountUpNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;
    const reduceMotion = typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (from === to || reduceMotion) { setDisplay(to); return; }
    const toIsInt = Number.isInteger(to);
    const duration = 600;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const atual = from + (to - from) * eased;
      setDisplay(t < 1 ? (toIsInt ? Math.round(atual) : atual) : to);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(display)}</>;
}

function SubGrid({ items }: { items: { label: string; value: string; pct?: string; onClick?: () => void }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((it) => (
        <div
          key={it.label}
          onClick={it.onClick ? (e) => { e.stopPropagation(); it.onClick!(); } : undefined}
          className={it.onClick ? "cursor-pointer rounded px-1 -mx-1 hover:bg-accent" : ""}
        >
          <div className="text-xs text-muted-foreground">{it.label}</div>
          <div className="text-sm font-medium tabular-nums">
            {it.value}{it.pct && <span className="ml-1 text-xs text-muted-foreground">{it.pct}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function MultiSelectFiltro({
  label, placeholder, options, selected, onChange, busca, setBusca,
}: {
  label: string;
  placeholder: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  busca: string;
  setBusca: (v: string) => void;
}) {
  const filtradas = busca.trim()
    ? options.filter(o => o.label.toLowerCase().includes(busca.toLowerCase()))
    : options;
  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  };
  const resumo = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? options.find(o => o.value === selected[0])?.label ?? "1 selecionado"
      : `${selected.length} selecionados`;
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-56 justify-between font-normal">
            <span className="flex items-center gap-2 truncate">
              <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{resumo}</span>
            </span>
            {selected.length > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">{selected.length}</Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="end">
          <div className="p-2 border-b">
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={`Buscar ${label.toLowerCase()}...`}
              className="h-8"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {filtradas.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground text-center">Nada encontrado.</p>
            ) : (
              filtradas.map(o => {
                const checked = selected.includes(o.value);
                return (
                  <label
                    key={o.value}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggle(o.value)} />
                    <span className="truncate">{o.label}</span>
                  </label>
                );
              })
            )}
          </div>
          {selected.length > 0 && (
            <div className="p-2 border-t flex justify-end">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange([])}>
                Limpar seleção
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
