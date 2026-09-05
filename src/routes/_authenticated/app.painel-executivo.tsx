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
  Users,
  Printer,
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
import { Switch } from "@/components/ui/switch";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDatePura, hojeBR, TZ_CLINICA, zonedDateStringToUtcISO } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { useDashboardBlocos } from "@/hooks/use-dashboard-blocos";
import { BlocosDashboard } from "@/components/painel-executivo/blocos";
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
   *
   * A conta é a MESMA da aba "GRs" (ver SecaoGrsDoDia): uma GR por atendimento
   * lançado em `fin_lancamentos`. Até 26/08/2026 a função contava impressões de
   * guia (`gr_impressoes`), que deixou de ser alimentada em 22/07 — o card
   * mostrava 9 guias numa semana em que a clínica lançou mais de 1.500.
   * A correção está em
   * supabase/migrations/20260826120000_painel_grs_periodo_por_lancamento.sql.
   */
  grs: {
    total: number;
    pacientes: number;
    novos: number;
    recorrentes: number;
  };
  /**
   * Indicadores de qualidade.
   *
   * `marcacoesFalta` e `marcacoesExecucao` dizem QUANTAS marcações existem por
   * trás de cada indicador no período. Sem elas, um zero é ambíguo: pode ser
   * "não houve falta nenhuma" (ótimo) ou "ninguém registra falta" (o
   * indicador não mede nada). Nesta clínica é o segundo caso — nunca foi
   * marcada uma falta em toda a história do sistema, e só um agendamento tem
   * horário de execução preenchido. Com a contagem, a tela esconde o
   * indicador em vez de exibir um zero que a gestão leria como desempenho.
   * Quando a recepção passar a registrar, os indicadores voltam sozinhos.
   */
  qualidade: {
    noShowPct: number;
    atrasoMedioMin: number;
    marcacoesFalta: number;
    marcacoesExecucao: number;
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
  qualidade: { noShowPct: 0, atrasoMedioMin: 0, marcacoesFalta: 0, marcacoesExecucao: 0 },
});

// ---------- Utils ----------
/**
 * Hoje no fuso da clínica.
 *
 * Antes era `new Date().toISOString().slice(0, 10)`, que devolve o dia em UTC:
 * das 21:00 em diante, em São Paulo, já respondia o dia seguinte. Com o painel
 * abrindo num intervalo de 30 dias isso passava despercebido; agora que ele
 * abre em "Hoje", um erro de um dia deixaria a tela inteira no dia errado
 * durante o fim do expediente.
 */
const hojeISO = () => hojeBR();

/**
 * Soma dias a uma data pura (YYYY-MM-DD), em calendário — sem passar pelo fuso
 * do navegador. A versão anterior montava a data no fuso do runtime e voltava
 * para ISO/UTC, o que desloca o dia em qualquer fuso à frente de Greenwich (e o
 * mesmo código roda no Worker SSR, que é UTC).
 */
const addDays = (iso: string, d: number) => {
  const [y, m, dd] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + d)).toISOString().slice(0, 10);
};

/** Primeiro dia do mês / do ano de uma data pura, sem tocar em fuso. */
const primeiroDiaDoMes = (iso: string) => `${iso.slice(0, 7)}-01`;
const primeiroDiaDoAno = (iso: string) => `${iso.slice(0, 4)}-01-01`;
const money = (n: number) =>
  `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const int = (n: number) => n.toLocaleString("pt-BR");
const pctFmt = (v: number) => `${v.toFixed(1)}%`;

// ---------- Presets de período ----------
type Periodo = { de: string; ate: string };
/**
 * Atalhos de período, na ordem em que a gestão pediu: primeiro o dia corrente,
 * depois o dia anterior e as janelas mais longas. Os rótulos em português
 * substituíram as siglas MTD e YTD, que ninguém na clínica lia como "mês
 * corrente" e "ano corrente".
 */
const presets: { label: string; hint: string; make: () => Periodo }[] = [
  { label: "Hoje", hint: "Somente o dia de hoje", make: () => ({ de: hojeISO(), ate: hojeISO() }) },
  {
    label: "Ontem",
    hint: "Somente o dia de ontem",
    make: () => ({ de: addDays(hojeISO(), -1), ate: addDays(hojeISO(), -1) }),
  },
  {
    label: "7d",
    hint: "Últimos 7 dias, incluindo hoje",
    make: () => ({ de: addDays(hojeISO(), -6), ate: hojeISO() }),
  },
  {
    label: "30d",
    hint: "Últimos 30 dias, incluindo hoje",
    make: () => ({ de: addDays(hojeISO(), -29), ate: hojeISO() }),
  },
  {
    label: "Este mês",
    hint: "Do dia 1º do mês até hoje",
    make: () => ({ de: primeiroDiaDoMes(hojeISO()), ate: hojeISO() }),
  },
  {
    label: "90d",
    hint: "Últimos 90 dias, incluindo hoje",
    make: () => ({ de: addDays(hojeISO(), -89), ate: hojeISO() }),
  },
  {
    label: "Este ano",
    hint: "De 1º de janeiro até hoje",
    make: () => ({ de: primeiroDiaDoAno(hojeISO()), ate: hojeISO() }),
  },
];

/** Atalho que a tela abre selecionado: o dia corrente. */
const PRESET_PADRAO = presets[0];

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
  // Fronteiras do período no fuso da clínica. Montar a data com
  // `new Date(\`${periodo.de}T00:00:00\`)` resolve no fuso de quem executa —
  // o navegador da recepção (BRT) e o Worker do SSR (UTC) chegavam a janelas
  // diferentes, com até 3 horas de diferença. Num período de 30 dias isso
  // mudava pouco; agora que o padrão é um único dia, deslocaria o dia inteiro.
  const ini = zonedDateStringToUtcISO(periodo.de, "00:00:00");
  const fim = zonedDateStringToUtcISO(periodo.ate, "23:59:59");

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
      marcacoesFalta: num(rQua.marcacoesFalta),
      marcacoesExecucao: num(rQua.marcacoesExecucao),
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
/**
 * Quantas marcações um indicador de qualidade precisa ter no período para
 * aparecer no painel. Abaixo disso a conta existe, mas não representa a
 * operação: uma média tirada de um ou dois registros passa a impressão de
 * medição sem ser uma.
 */
const AMOSTRA_MINIMA = 10;

const delta = (atual: number, ant: number): number | undefined => {
  if (!ant) return undefined;
  return Number((((atual - ant) / ant) * 100).toFixed(1));
};

// ---------- Page ----------
function PainelExecutivoPage() {
  const { clinicaAtual, loading } = useClinica();
  const podeFin = ["admin", "gestor", "financeiro"].includes(clinicaAtual?.role ?? "");
  const podeEscrever = usePodeEscrever("painel-executivo");

  // A tela abre no dia corrente. Antes abria nos últimos 30 dias, e a gestão
  // via um acumulado quando queria saber como está o dia.
  const [periodo, setPeriodo] = useState<Periodo>(PRESET_PADRAO.make());

  /**
   * Dados dos três blocos temáticos do topo. Ficam fora do `carregarBloco`
   * porque não seguem o filtro de período: eles são sempre o mês (e o ano)
   * corrente, e recarregar tudo a cada clique em "Ontem" só gastaria consulta.
   */
  const blocos = useDashboardBlocos(clinicaAtual?.clinica_id);

  // Preferência do usuário: mostrar ou não a variação contra o período
  // anterior. Padrão desligado, e persistida por navegador — mesmo padrão do
  // Financeiro (`financeiro:decomporMisto`).
  //
  // Por que desligada por padrão: a tela abre em "Hoje", que é um dia em
  // andamento, e o período anterior é um dia inteiro. Às 9h da manhã a
  // comparação mostra quedas de 90% e poucos que não são queda nenhuma — é só
  // o dia ainda não ter acontecido. Quem quiser a comparação liga a chave, e
  // ela continua ligada nas próximas visitas.
  const [comparar, setComparar] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("painel-executivo:comparar") === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("painel-executivo:comparar", comparar ? "1" : "0");
    }
  }, [comparar]);
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

  /**
   * Variação usada pelos cards. Com a chave desligada devolve `undefined`, e
   * tanto o `BigCard` quanto o `HhpKpiCard` já omitem o número nesse caso —
   * por isso desligar a comparação não precisou de nenhuma condição espalhada
   * pela tela.
   */
  const cmp = (valorAtual: number, valorAnterior: number): number | undefined =>
    comparar ? delta(valorAtual, valorAnterior) : undefined;

  // Indicadores sem base de medição no período — ver o comentário do bloco
  // `qualidade` em `Bloco`. Enquanto não houver registro, eles saem do painel
  // em vez de mostrar zero: um "No-show 0,0%" ao lado dos números de produção
  // é lido como excelência, quando na verdade ninguém registrou nada.
  //
  // O piso não é zero, é AMOSTRA_MINIMA. Nos últimos 30 dias a clínica tem
  // 3.278 marcações e exatamente 1 delas com horário de execução preenchido —
  // publicar um "atraso médio" tirado de um único atendimento seria pior que
  // não publicar nada, porque parece uma medição.
  const semRegistroFalta = q.marcacoesFalta < AMOSTRA_MINIMA;
  const semRegistroExecucao = q.marcacoesExecucao < AMOSTRA_MINIMA;
  // Nesta clínica a recepção lança e confirma no mesmo ato, então não existe
  // "a receber". Mostrar R$ 0,00 fixo só ocupa espaço; o campo volta sozinho
  // se algum dia houver lançamento pendente.
  const temPrevistoReceita = f.receitaPrevista > 0;
  const temPrevistoDespesa = f.despesaPrevista > 0;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Painel Executivo</h1>
        <p className="text-sm text-muted-foreground">
          A leitura do mês em três blocos, e o detalhamento por período logo abaixo
        </p>
      </div>

      {/*
        Blocos 1, 2 e 3. Olham sempre o MÊS e o ANO corrente — não seguem o
        filtro de datas do detalhamento, e cada bloco escreve o período no
        próprio cabeçalho para que ninguém leia um número com a régua errada.
      */}
      <BlocosDashboard
        dados={blocos.data}
        carregando={blocos.isLoading}
        clinicaId={clinicaAtual.clinica_id}
        podeFin={podeFin}
      />

      {/* Detalhamento por período — as abas e o filtro de datas que as governa */}
      <TooltipProvider delayDuration={200}>
        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-border pt-6">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Detalhamento por período</h2>
            <p className="text-sm text-muted-foreground">
              Produção, GRs, financeiro, comercial e qualidade nas datas escolhidas ao lado
            </p>
            {/* A faixa só aparece quando a comparação está ligada: ela existe
                para dizer CONTRA O QUE os percentuais estão sendo medidos, e
                sem percentual na tela ela não informa nada. */}
            {comparar && (
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs text-muted-foreground dark:border-slate-700 dark:bg-slate-800">
                <BarChart3 className="h-3.5 w-3.5" />
                Comparando com o período anterior ({formatDatePura(periodoAnterior.de)} a{" "}
                {formatDatePura(periodoAnterior.ate)})
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">
                De
              </Label>
              <DateInputBR
                value={periodo.de}
                onChange={(e) => setPeriodo((p) => ({ ...p, de: e.target.value }))}
                className="h-9 w-40 focus-visible:ring-2 focus-visible:ring-primary/30"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">
                Até
              </Label>
              <DateInputBR
                value={periodo.ate}
                onChange={(e) => setPeriodo((p) => ({ ...p, ate: e.target.value }))}
                className="h-9 w-40 focus-visible:ring-2 focus-visible:ring-primary/30"
              />
            </div>
            {/* flex-wrap: são sete atalhos, e em tela de celular eles não cabem
                numa linha só — sem isso a faixa empurrava o layout para o lado. */}
            <div className="flex flex-wrap items-center gap-0.5 rounded-2xl border border-border bg-muted/60 p-1">
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

            {/* Chave da comparação. Fica ao lado dos atalhos de período porque
                é sobre eles que ela age. A escolha é lembrada no navegador. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <label
                  htmlFor="painel-comparar"
                  className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border bg-muted/60 px-3"
                >
                  <Switch id="painel-comparar" checked={comparar} onCheckedChange={setComparar} />
                  <span className="text-xs font-medium text-muted-foreground">
                    Comparar com período anterior
                  </span>
                </label>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {comparar
                  ? `Os cards mostram a variação contra ${formatDatePura(periodoAnterior.de)} a ${formatDatePura(periodoAnterior.ate)}.`
                  : "Ligue para ver quanto cada número subiu ou caiu em relação ao período anterior. Com o filtro em Hoje, lembre que o dia ainda está em andamento e a queda aparente pode ser só isso."}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>

      <Tabs defaultValue="producao" className="space-y-4">
        {/* As cinco abas somam mais que a largura de um celular. O invólucro
            rolável deixa deslizar de lado só a faixa de abas, em vez de a
            página inteira sair do lugar. */}
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="w-max">
            <TabsTrigger value="producao">Produção</TabsTrigger>
            <TabsTrigger value="grs">GRs</TabsTrigger>
            {podeFin && <TabsTrigger value="financeiro">Financeiro</TabsTrigger>}
            <TabsTrigger value="comercial">Comercial</TabsTrigger>
            <TabsTrigger value="qualidade">Qualidade</TabsTrigger>
          </TabsList>
        </div>

        {/* Produção */}
        <TabsContent value="producao" className="space-y-6">
          <HhpKpiRow>
            <HhpKpiCard
              label="Agendados"
              value={int(p.agendados)}
              icon={CalendarDays}
              tone="info"
              delta={cmp(p.agendados, pa.agendados)}
            />
            <HhpKpiCard
              label="Confirmados"
              value={int(p.confirmados)}
              icon={CheckCircle2}
              tone="ok"
              delta={cmp(p.confirmados, pa.confirmados)}
            />
            <HhpKpiCard
              label="Compareceram"
              value={int(p.compareceram)}
              icon={UserCheck}
              tone="ok"
              delta={cmp(p.compareceram, pa.compareceram)}
            />
            {!semRegistroFalta && (
              <HhpKpiCard
                label="Faltaram"
                value={int(p.faltaram)}
                icon={UserX}
                tone="danger"
                delta={cmp(p.faltaram, pa.faltaram)}
              />
            )}
            <HhpKpiCard
              label="Cancelaram"
              value={int(p.cancelaram)}
              icon={Ban}
              tone="warn"
              delta={cmp(p.cancelaram, pa.cancelaram)}
            />
            <HhpKpiCard
              label="Ocupação"
              value={pctFmt(p.ocupacaoPct)}
              icon={Percent}
              tone="info"
              hint={`${int(p.agendadoMin)} de ${int(p.capacidadeMin)} min da agenda publicada`}
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

        {/* GRs do período escolhido no topo — resumo e lista (ver SecaoGrsDoDia) */}
        <TabsContent value="grs" className="space-y-6">
          <SecaoGrsDoDia clinicaId={clinicaAtual.clinica_id} periodo={periodo} podeFin={podeFin} />
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
                delta={cmp(f.receitaRealizada, fa.receitaRealizada)}
              />
              {/* "A receber" só existe se houver lançamento pendente. Nesta
                  clínica a recepção lança e confirma no mesmo ato, então o card
                  ficava fixo em R$ 0,00 — ver o comentário em `temPrevistoReceita`. */}
              {temPrevistoReceita && (
                <HhpKpiCard
                  label="Receita a receber"
                  value={money(f.receitaPrevista)}
                  icon={TrendingUp}
                  tone="info"
                  delta={cmp(f.receitaPrevista, fa.receitaPrevista)}
                />
              )}
              <HhpKpiCard
                label="Ticket médio"
                value={money(f.ticketMedio)}
                icon={BadgeDollarSign}
                tone="info"
                delta={cmp(f.ticketMedio, fa.ticketMedio)}
              />
              <HhpKpiCard
                label="Despesa realizada"
                value={money(f.despesaRealizada)}
                icon={Receipt}
                tone="warn"
                delta={cmp(f.despesaRealizada, fa.despesaRealizada)}
              />
              <HhpKpiCard
                label="Resultado"
                value={money(f.resultado)}
                icon={TrendingUp}
                tone={f.resultado >= 0 ? "ok" : "danger"}
                delta={cmp(f.resultado, fa.resultado)}
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
              delta={cmp(c.novos, ca.novos)}
            />
            <HhpKpiCard
              label="Recorrentes"
              value={int(c.recorrentes)}
              icon={Repeat}
              tone="info"
              delta={cmp(c.recorrentes, ca.recorrentes)}
            />
            <HhpKpiCard
              label="Orçamentos"
              value={int(c.orcamentosNoPeriodo)}
              icon={Receipt}
              tone="default"
              delta={cmp(c.orcamentosNoPeriodo, ca.orcamentosNoPeriodo)}
            />
            <HhpKpiCard
              label="Conversão orçam."
              value={pctFmt(c.conversaoOrcamento)}
              icon={TrendingUp}
              tone="info"
            />
          </HhpKpiRow>
        </TabsContent>

        {/* Qualidade */}
        <TabsContent value="qualidade" className="space-y-6">
          <HhpKpiRow>
            {!semRegistroFalta && (
              <HhpKpiCard
                label="No-show %"
                value={pctFmt(q.noShowPct)}
                icon={AlertTriangle}
                tone="danger"
                delta={cmp(q.noShowPct, qa.noShowPct)}
              />
            )}
            {!semRegistroExecucao && (
              <HhpKpiCard
                label="Atraso médio"
                value={`${q.atrasoMedioMin.toFixed(0)} min`}
                icon={Clock}
                tone="warn"
                delta={cmp(q.atrasoMedioMin, qa.atrasoMedioMin)}
              />
            )}
            <HhpKpiCard
              label="Confirmação"
              value={pctFmt(p.agendados > 0 ? (p.confirmados / p.agendados) * 100 : 0)}
              icon={CheckCircle2}
              tone="ok"
              hint="Agendamentos que passaram da recepção, sobre o total de marcações"
            />
            <HhpKpiCard
              label="Tempo médio"
              value={`${p.tempoMedioMin.toFixed(0)} min`}
              icon={Timer}
              tone="default"
              hint="Duração média reservada na agenda dos atendimentos realizados"
            />
          </HhpKpiRow>

          {/* Aviso no lugar dos indicadores escondidos. Antes havia aqui um
              texto fixo dizendo que os tempos de espera eram "atualizados
              automaticamente" — nada disso era calculado, e a gestão ficava
              esperando um número que não viria. */}
          {(semRegistroFalta || semRegistroExecucao) && (
            <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span>
                {semRegistroFalta && semRegistroExecucao
                  ? `No-show e atraso médio estão fora do painel neste período: houve ${int(q.marcacoesFalta)} marcação de falta e ${int(q.marcacoesExecucao)} horário de execução registrado, pouco para sustentar um indicador.`
                  : semRegistroFalta
                    ? `O no-show está fora do painel neste período: só ${int(q.marcacoesFalta)} agendamento(s) foram marcados como falta.`
                    : `O atraso médio está fora do painel neste período: só ${int(q.marcacoesExecucao)} atendimento(s) tiveram o horário de execução registrado.`}{" "}
                Os indicadores voltam sozinhos assim que a recepção passar a registrar — não é
                preciso mexer no sistema.
              </span>
            </div>
          )}
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

// ============================================================================
// GRs — resumo + lista detalhada do período
// ----------------------------------------------------------------------------
// A gestão pediu para enxergar, guia por guia, o que foi lançado: horário,
// número da GR, paciente, médico/especialidade/procedimento, quem executou o
// lançamento, situação e valor.
//
// A seção segue o filtro de data do TOPO da tela. Ela já teve um seletor de dia
// próprio, e o resultado era que clicar em "Ontem" lá em cima não mexia na
// lista — a pessoa tinha que escolher a data duas vezes, e as duas metades da
// tela podiam ficar mostrando dias diferentes sem avisar.
//
// ---------------------------- DE ONDE SAI A LISTA --------------------------
// A base é o LANÇAMENTO de receita (`fin_lancamentos`), não o registro de
// impressão da guia (`gr_impressoes`). Dois motivos:
//
//   1. É o que a gestão pediu: "horário do lançamento" e "usuário que executou
//      o lançamento" são exatamente `created_at` e `criado_por` do lançamento.
//   2. `gr_impressoes` deixou de ser alimentada de forma confiável: em
//      25/08/2026 a clínica faturou 326 atendimentos e a tabela de impressões
//      registrou 1 linha. Uma lista montada sobre ela viria praticamente
//      vazia. A tabela ainda é lida aqui, mas só para acrescentar o número da
//      guia impressa e contar as 2ªs vias.
//
// Uma GR = um atendimento. Pagamento dividido gera vários lançamentos para o
// mesmo agendamento e continua sendo UMA guia, por isso o agrupamento por
// agendamento.
// ============================================================================

/** Tamanho da página de leitura — é o teto de linhas que o PostgREST devolve. */
const GR_PAGINA = 1000;
/** Rede de segurança da paginação; na prática GR_MAX_LANCAMENTOS trava antes. */
const GR_MAX_PAGINAS = 25;
/**
 * Acima disto a seção nem tenta montar a lista.
 *
 * A conta de um período normal é pequena — 30 dias dão 2.952 lançamentos. Mas a
 * migração do sistema antigo gravou o histórico inteiro de uma vez, e todas
 * aquelas linhas ficaram com `created_at` no dia da importação: 609.793 em
 * 01/06/2026 e 215.751 em 12/06/2026. Qualquer período que alcance esses dias
 * (os atalhos de 90 dias e "Este ano") passa de 840 mil lançamentos.
 *
 * Sem esta trava, clicar em "90d" com a aba de GRs aberta gastaria uns dez
 * segundos baixando página após página para no fim mostrar um pedaço inútil.
 * A contagem prévia custa 66 ms mesmo nesse caso, então é ela que decide.
 */
const GR_MAX_LANCAMENTOS = 20000;
/**
 * Quantas guias a lista chega a desenhar. Ler 30 mil linhas o navegador
 * aguenta; desenhar 30 mil linhas de tabela (e 30 mil cards no celular) trava
 * a tela por vários segundos. Os cards de resumo continuam contando TODAS as
 * guias do período — o corte é só do que aparece na lista, e a tela diz isso.
 */
const GR_MAX_LINHAS = 1000;

type GrLancRow = {
  id: string;
  agendamento_id: string | null;
  paciente_id: string | null;
  medico_id: string | null;
  descricao: string | null;
  valor: number | string | null;
  status: string;
  criado_por: string | null;
  created_at: string;
};

type GrLinha = {
  id: string;
  /** Dia do lançamento (dd/MM), mostrado só quando o período passa de um dia. */
  data: string;
  hora: string;
  /** Posição da GR na ordem do período (1, 2, 3…) — sempre existe. */
  numero: string;
  /** Nº da guia impressa, quando a impressão ficou registrada. */
  numeroGuia: string | null;
  paciente: string;
  medico: string;
  especialidade: string;
  procedimento: string;
  atendente: string;
  /** Situação do atendimento na agenda (Aguardando, Atendido, Falta…). */
  situacao: string;
  /** Situação financeira da guia (Faturado, A receber, Estornado…). */
  financeiro: string | null;
  /** Valor cobrado na guia (lançamentos não cancelados). */
  valor: number;
  /** Parte já confirmada no caixa. */
  valorConfirmado: number;
  /**
   * Valor que foi devolvido — a soma dos lançamentos cancelados desta guia.
   *
   * Fica FORA de `valor` e de `valorConfirmado` de propósito: dinheiro
   * estornado não é receita e não pode entrar em nenhum total do caixa. Mas a
   * gestão precisa enxergar o número, senão a linha estornada aparece como
   * "R$ 0,00" e não dá para auditar o que foi devolvido.
   */
  valorEstornado: number;
  /** Motivo registrado no estorno (`estorno_solicitacoes.motivo`). */
  motivoEstorno: string | null;
};

type GrsDoDia = {
  linhas: GrLinha[];
  segundasVias: number;
  truncado: boolean;
  /** Nº de lançamentos quando o período é grande demais para listar (ver GR_MAX_LANCAMENTOS). */
  excedeu: number | null;
};

const grVazio = (): GrsDoDia => ({
  linhas: [],
  segundasVias: 0,
  truncado: false,
  excedeu: null,
});

/** Dia dd/MM no fuso da clínica — usado quando o período cobre mais de um dia. */
const diaClinica = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ_CLINICA,
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(iso));

/**
 * Hora HH:mm no fuso da clínica — nunca no fuso do navegador de quem abre o
 * painel. Um lançamento das 21:30 em São Paulo, aberto de outro fuso,
 * apareceria com outro horário e, na virada do dia, fora da lista.
 */
const horaClinica = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ_CLINICA,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/**
 * Separa o procedimento na especialidade do SERVIÇO e no nome limpo.
 *
 * O nome do procedimento carrega a especialidade entre parênteses no fim
 * ("CONSULTA (CARDIOLOGIA)"), e é ela que vale aqui. (A GR impressa faz a
 * separação pelo mesmo critério, mas descarta a especialidade: a guia mostra
 * só o serviço, para o arquivo separar as fichas.) Sem
 * isso, a lista mostraria a especialidade principal do médico: um cardiologista
 * cadastrado como geriatra apareceria atendendo "GERIATRIA · CONSULTA
 * (CARDIOLOGIA)". Na base da clínica isso não é exceção — `especialidade_id` do
 * agendamento vem sempre vazio, então a especialidade do médico seria a única
 * fonte, e um quinto dos procedimentos do dia traz a sua própria.
 */
function separarProcedimento(nome: string): { procedimento: string; especialidade: string | null } {
  const base = nome.trim();
  const m = base.match(/^(.*)\(([^()]+)\)\s*$/);
  if (!m) return { procedimento: base, especialidade: null };
  const limpo = m[1].trim();
  const esp = m[2].trim();
  return { procedimento: limpo || base, especialidade: esp || null };
}

/** Os mesmos rótulos que a recepção vê na agenda, para a lista falar a mesma língua. */
const SITUACAO_LABEL: Record<string, string> = {
  agendado: "Aguardando",
  confirmado: "Confirmado",
  realizado: "Atendido",
  faltou: "Falta",
  cancelado: "Cancelado",
};

/**
 * Roda a mesma consulta em lotes de ids.
 *
 * O filtro `.in(...)` viaja na URL da requisição, e algumas centenas de UUIDs
 * de uma vez estouram o limite de tamanho da URL — nesse caso a consulta volta
 * com erro, não com menos linhas. Em lotes, o tamanho da lista deixa de
 * depender do movimento do dia.
 */
async function emLotes<T>(
  ids: string[],
  tamanho: number,
  consulta: (lote: string[]) => PromiseLike<{ data: unknown }>,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += tamanho) lotes.push(ids.slice(i, i + tamanho));
  const res = await Promise.all(lotes.map((l) => consulta(l)));
  return res.flatMap((r) => (r.data ?? []) as T[]);
}

const soIds = (v: (string | null | undefined)[]) => [...new Set(v.filter((x): x is string => !!x))];

async function carregarGrsDoPeriodo(cid: string, periodo: Periodo): Promise<GrsDoDia> {
  // Fronteiras no fuso da clínica: `new Date(dia + "T00:00:00")` resolve no
  // fuso de quem executa o código e erra em até 3 horas entre o navegador da
  // recepção e o Worker do SSR.
  const inicio = zonedDateStringToUtcISO(periodo.de, "00:00:00");
  const fimExclusivo = zonedDateStringToUtcISO(addDays(periodo.ate, 1), "00:00:00");

  // Contagem antes de qualquer leitura: descobre em uma consulta barata se o
  // período cabe numa lista guia a guia. Ver GR_MAX_LANCAMENTOS.
  const { count, error: erroContagem } = await supabase
    .from("fin_lancamentos")
    .select("id", { count: "exact", head: true })
    .eq("clinica_id", cid)
    .eq("tipo", "receita")
    .gte("created_at", inicio)
    .lt("created_at", fimExclusivo);
  if (erroContagem) {
    mostrarErro(erroContagem, "falha ao contar as GRs do período");
    return grVazio();
  }
  if ((count ?? 0) > GR_MAX_LANCAMENTOS) {
    return { ...grVazio(), excedeu: count ?? 0 };
  }

  // Leitura paginada: o PostgREST devolve no máximo GR_PAGINA linhas por
  // consulta e um dia cheio já passa de 350 lançamentos. Sem paginar, qualquer
  // período maior que um dia sairia cortado sem avisar.
  const lancs: GrLancRow[] = [];
  let truncado = false;
  for (let pagina = 0; ; pagina++) {
    if (pagina >= GR_MAX_PAGINAS) {
      truncado = true;
      break;
    }
    const { data, error } = await supabase
      .from("fin_lancamentos")
      .select(
        "id,agendamento_id,paciente_id,medico_id,descricao,valor,status,criado_por,created_at",
      )
      .eq("clinica_id", cid)
      .eq("tipo", "receita")
      .gte("created_at", inicio)
      .lt("created_at", fimExclusivo)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(pagina * GR_PAGINA, pagina * GR_PAGINA + GR_PAGINA - 1);
    if (error) {
      mostrarErro(error, "falha ao ler as GRs do dia");
      return grVazio();
    }
    const pag = (data ?? []) as GrLancRow[];
    lancs.push(...pag);
    if (pag.length < GR_PAGINA) break;
  }

  // Uma GR = um atendimento. Pagamento dividido gera vários lançamentos para o
  // mesmo agendamento e continua sendo a MESMA guia. Lançamento sem agendamento
  // (mensalidade do cartão, cobrança avulsa) é uma GR sozinho.
  const ordem: string[] = [];
  const grupos = new Map<string, GrLancRow[]>();
  for (const l of lancs) {
    const chave = l.agendamento_id ?? `lanc:${l.id}`;
    const atual = grupos.get(chave);
    if (atual) atual.push(l);
    else {
      grupos.set(chave, [l]);
      ordem.push(chave);
    }
  }

  const agIds = soIds(lancs.map((l) => l.agendamento_id));

  const [ags, impressoes] = await Promise.all([
    emLotes<{
      id: string;
      paciente_nome: string | null;
      medico_id: string | null;
      especialidade_id: string | null;
      procedimento: string | null;
      status: string;
    }>(agIds, 100, (lote) =>
      supabase
        .from("agendamentos")
        .select("id,paciente_nome,medico_id,especialidade_id,procedimento,status")
        .in("id", lote),
    ),
    // Só para enfeitar a lista com o número da guia impressa e contar as 2ªs
    // vias — a existência da GR não depende disto (ver o bloco de comentário
    // no topo da seção).
    supabase
      .from("gr_impressoes")
      .select("agendamento_id,ficha_numero,via_numero")
      .eq("clinica_id", cid)
      .gte("created_at", inicio)
      .lt("created_at", fimExclusivo)
      .limit(GR_PAGINA)
      .then(
        (r) =>
          (r.data ?? []) as {
            agendamento_id: string | null;
            ficha_numero: number | null;
            via_numero: number;
          }[],
      ),
  ]);

  const agMap = new Map(ags.map((a) => [a.id, a] as const));
  const fichaImpressa = new Map<string, number>();
  let segundasVias = 0;
  for (const i of impressoes) {
    if (i.via_numero > 1) segundasVias++;
    else if (i.agendamento_id && i.ficha_numero != null)
      fichaImpressa.set(i.agendamento_id, i.ficha_numero);
  }

  const [meds, profs, pacs, estornos] = await Promise.all([
    // Sem filtro de `ativo`: médico desligado depois do atendimento continua
    // sendo o médico daquela guia.
    emLotes<{ id: string; nome: string; especialidade_id: string | null }>(
      soIds([...ags.map((a) => a.medico_id), ...lancs.map((l) => l.medico_id)]),
      100,
      (lote) => supabase.from("medicos").select("id,nome,especialidade_id").in("id", lote),
    ),
    emLotes<{ id: string; nome: string | null }>(
      soIds(lancs.map((l) => l.criado_por)),
      100,
      (lote) => supabase.from("profiles").select("id,nome").in("id", lote),
    ),
    // Paciente só precisa ser buscado nas GRs sem agendamento; nas outras o
    // nome já vem do próprio agendamento.
    emLotes<{ id: string; nome: string }>(
      soIds(lancs.filter((l) => !l.agendamento_id).map((l) => l.paciente_id)),
      100,
      (lote) => supabase.from("pacientes").select("id,nome").in("id", lote),
    ),
    // Motivo do estorno. Ele não fica no lançamento cancelado — fica em
    // `estorno_solicitacoes`, ligado pelo `lancamento_id`. Confirmado na base:
    // os 63 lançamentos de receita cancelados desde 17/08 têm todos a sua
    // solicitação, com motivos escritos pela recepção ("VALOR ERRADO",
    // "2X NO SISTEMA", "PACIENTE NÃO CONSEGUIU FAZER O PREVENTIVO").
    emLotes<{ lancamento_id: string | null; motivo: string; created_at: string }>(
      soIds(lancs.filter((l) => l.status === "cancelado").map((l) => l.id)),
      100,
      (lote) =>
        supabase
          .from("estorno_solicitacoes")
          .select("lancamento_id,motivo,created_at")
          .in("lancamento_id", lote)
          .order("created_at", { ascending: true }),
    ),
  ]);

  const medMap = new Map(meds.map((m) => [m.id, m] as const));
  const profMap = new Map(profs.map((p) => [p.id, (p.nome ?? "").trim()] as const));
  const pacMap = new Map(pacs.map((p) => [p.id, p.nome] as const));
  // Um lançamento pode ter mais de uma solicitação (pedido negado e refeito, por
  // exemplo). Fica a mais recente, que é a que explica o estorno que valeu.
  const motivoPorLanc = new Map<string, string>();
  for (const e of estornos) {
    const motivo = (e.motivo ?? "").trim();
    if (e.lancamento_id && motivo) motivoPorLanc.set(e.lancamento_id, motivo);
  }

  // A especialidade da guia sai do agendamento; quando ele não tem, cai na
  // especialidade principal do médico — a mesma ordem que a GR impressa usa.
  const esps = await emLotes<{ id: string; nome: string }>(
    soIds([...ags.map((a) => a.especialidade_id), ...meds.map((m) => m.especialidade_id)]),
    100,
    (lote) => supabase.from("especialidades").select("id,nome").in("id", lote),
  );
  const espMap = new Map(esps.map((e) => [e.id, e.nome] as const));

  const linhas: GrLinha[] = ordem.map((chave, i) => {
    const doGrupo = grupos.get(chave) ?? [];
    const primeiro = doGrupo[0];
    const agId = primeiro.agendamento_id;
    const a = agId ? agMap.get(agId) : undefined;

    const naoCancelados = doGrupo.filter((l) => l.status !== "cancelado");
    const confirmados = doGrupo.filter((l) => l.status === "confirmado");
    const cancelados = doGrupo.filter((l) => l.status === "cancelado");
    const financeiro = confirmados.length
      ? "Faturado"
      : naoCancelados.length
        ? "A receber"
        : "Estornado";
    // O motivo vem do lançamento cancelado mais recente da guia. Quando o
    // atendimento foi estornado e relançado (o caso de "VALOR ERRADO"), a guia
    // aparece como Faturada e ainda assim mostra o que foi devolvido no
    // caminho — que é justamente o que a auditoria precisa enxergar.
    const motivoEstorno =
      cancelados
        .map((l) => motivoPorLanc.get(l.id))
        .filter((m): m is string => !!m)
        .at(-1) ?? null;

    const medId = a?.medico_id ?? primeiro.medico_id ?? null;
    const med = medId ? medMap.get(medId) : undefined;
    const espId = a?.especialidade_id ?? med?.especialidade_id ?? null;
    // "Usuário que executou o lançamento" = quem criou a receita.
    const autor = doGrupo.map((l) => l.criado_por).find((v): v is string => !!v) ?? null;
    // A descrição do lançamento é "PACIENTE — PROCEDIMENTO"; sem agendamento,
    // o que sobra depois do travessão é a melhor descrição do serviço.
    const depoisDoTravessao = (primeiro.descricao ?? "").split("—").slice(1).join("—").trim();
    const servico = separarProcedimento(
      (a?.procedimento ?? "").trim() || depoisDoTravessao || (primeiro.descricao ?? "").trim(),
    );

    return {
      id: chave,
      data: diaClinica(primeiro.created_at),
      hora: horaClinica(primeiro.created_at),
      numero: String(i + 1),
      numeroGuia: agId && fichaImpressa.has(agId) ? String(fichaImpressa.get(agId)) : null,
      paciente:
        (a?.paciente_nome ?? "").trim() ||
        (primeiro.paciente_id ? (pacMap.get(primeiro.paciente_id) ?? "") : "") ||
        "—",
      medico: med?.nome ?? "—",
      // Especialidade do serviço na frente da do médico — ver separarProcedimento.
      especialidade: servico.especialidade ?? (espId ? (espMap.get(espId) ?? "—") : "—"),
      procedimento: servico.procedimento || "—",
      atendente: (autor ? (profMap.get(autor) ?? "") : "") || "—",
      // Sem agendamento não há situação de agenda — é uma cobrança avulsa
      // (mensalidade do cartão, taxa, acerto). Dizer "Avulso" é mais honesto
      // que herdar um status que aquele lançamento não tem.
      situacao: a ? (SITUACAO_LABEL[a.status] ?? "—") : "Avulso",
      financeiro,
      valor: naoCancelados.reduce((s, l) => s + num(l.valor), 0),
      valorConfirmado: confirmados.reduce((s, l) => s + num(l.valor), 0),
      valorEstornado: cancelados.reduce((s, l) => s + num(l.valor), 0),
      motivoEstorno,
    };
  });

  return { linhas, segundasVias, truncado, excedeu: null };
}

const TODOS = "todos";

/**
 * O selo da situação financeira. "Estornado" sai em âmbar, e não no cinza dos
 * demais: é dinheiro que voltou para o paciente e precisa saltar aos olhos numa
 * lista de centenas de linhas. "A receber" fica em azul porque também é uma
 * pendência, só que sem devolução. "Faturado" é o caso normal e continua
 * discreto — se tudo chamar atenção, nada chama.
 */
function SeloFinanceiro({ situacao }: { situacao: string }) {
  const cor =
    situacao === "Estornado"
      ? "border-amber-300 bg-amber-50 text-amber-800"
      : situacao === "A receber"
        ? "border-sky-300 bg-sky-50 text-sky-800"
        : "border-transparent bg-secondary text-secondary-foreground";
  return <Badge className={cn("text-[11px] font-semibold", cor)}>{situacao}</Badge>;
}

/** Linha "estorno R$ x,xx" que acompanha o valor. Riscada, porque não entrou. */
function ValorEstornado({ valor }: { valor: number }) {
  return (
    <span className="block text-[11px] font-medium tabular-nums text-amber-700">
      estorno <s>{money(valor)}</s>
    </span>
  );
}

function SecaoGrsDoDia({
  clinicaId,
  periodo,
  podeFin,
}: {
  clinicaId: string;
  /** Período escolhido no topo da tela — esta seção não tem filtro próprio. */
  periodo: Periodo;
  podeFin: boolean;
}) {
  const [dados, setDados] = useState<GrsDoDia>(grVazio());
  const [carregando, setCarregando] = useState(false);
  const [fAtendente, setFAtendente] = useState(TODOS);
  const [fMedico, setFMedico] = useState(TODOS);
  const [fStatus, setFStatus] = useState(TODOS);
  const [busca, setBusca] = useState("");

  const umDiaSo = periodo.de === periodo.ate;

  const carregar = async () => {
    setCarregando(true);
    try {
      setDados(await carregarGrsDoPeriodo(clinicaId, periodo));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    // Trocar o período zera os filtros: o atendente escolhido ontem pode não
    // ter trabalhado hoje, e a lista abriria vazia sem explicar o porquê.
    setFAtendente(TODOS);
    setFMedico(TODOS);
    setFStatus(TODOS);
    void carregar(); /* eslint-disable-next-line */
  }, [clinicaId, periodo.de, periodo.ate]);

  const ordenar = (v: string[]) => [...new Set(v)].filter((x) => x !== "—").sort();
  const atendentes = useMemo(() => ordenar(dados.linhas.map((l) => l.atendente)), [dados]);
  const medicos = useMemo(() => ordenar(dados.linhas.map((l) => l.medico)), [dados]);
  // As opções de status saem das próprias linhas do período — assim a lista
  // nunca oferece um filtro que não existe ali.
  const statuses = useMemo(
    () => ordenar(dados.linhas.flatMap((l) => [l.situacao, l.financeiro ?? "—"])),
    [dados],
  );

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return dados.linhas.filter((l) => {
      if (fAtendente !== TODOS && l.atendente !== fAtendente) return false;
      if (fMedico !== TODOS && l.medico !== fMedico) return false;
      // Um status casa tanto pela situação do atendimento quanto pela situação
      // financeira: "Atendido" e "Faturado" são respostas para a mesma guia.
      if (fStatus !== TODOS && l.situacao !== fStatus && l.financeiro !== fStatus) return false;
      if (
        termo &&
        !`${l.numero} ${l.numeroGuia ?? ""} ${l.paciente} ${l.medico} ${l.especialidade} ${l.procedimento} ${l.atendente}`
          .toLowerCase()
          .includes(termo)
      )
        return false;
      return true;
    });
  }, [dados, fAtendente, fMedico, fStatus, busca]);

  const valorTotal = filtradas.reduce((s, l) => s + l.valor, 0);
  const valorConfirmado = filtradas.reduce((s, l) => s + l.valorConfirmado, 0);
  // Somado à parte, nunca dentro dos dois acima: é dinheiro devolvido.
  const valorEstornado = filtradas.reduce((s, l) => s + l.valorEstornado, 0);
  const pacientes = new Set(filtradas.map((l) => l.paciente).filter((p) => p !== "—")).size;
  const filtrando = filtradas.length !== dados.linhas.length;
  // Os cards acima contam tudo; a lista abaixo desenha só o começo quando o
  // período é grande. Ver GR_MAX_LINHAS.
  const visiveis = filtradas.slice(0, GR_MAX_LINHAS);
  const cortouLista = filtradas.length > visiveis.length;
  const limpar = () => {
    setFAtendente(TODOS);
    setFMedico(TODOS);
    setFStatus(TODOS);
    setBusca("");
  };

  return (
    <div className="space-y-4">
      {/* Esta seção não tem filtro de data: ela segue o período do topo. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {umDiaSo
            ? `Guias emitidas em ${formatDatePura(periodo.de)}`
            : `Guias emitidas de ${formatDatePura(periodo.de)} a ${formatDatePura(periodo.ate)}`}{" "}
          — para trocar, use o filtro de data no topo da tela.
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={() => void carregar()}
          disabled={carregando}
        >
          <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* 1) Cards de resumo — total de GRs do período */}
      <HhpKpiRow>
        <HhpKpiCard
          label="GRs geradas"
          value={int(filtradas.length)}
          icon={FileText}
          tone="info"
          hint={
            filtrando
              ? `${int(filtradas.length)} de ${int(dados.linhas.length)} guias do período (filtro aplicado)`
              : `${int(dados.linhas.length)} guias emitidas no período`
          }
        />
        {podeFin && (
          <>
            <HhpKpiCard
              label="Valor lançado"
              value={money(valorTotal)}
              icon={Wallet}
              tone="info"
              hint="Soma das guias listadas, sem contar as estornadas"
            />
            <HhpKpiCard
              label="Confirmado no caixa"
              value={money(valorConfirmado)}
              icon={Receipt}
              tone="ok"
              hint="Parte das guias listadas que já entrou no caixa"
            />
            {/* Só aparece quando houve devolução no período. Fica de fora dos
                dois cards acima de propósito: estorno não é receita. */}
            {valorEstornado > 0 && (
              <HhpKpiCard
                label="Estornado"
                value={money(valorEstornado)}
                icon={Undo2}
                tone="warn"
                hint="Valor devolvido nas guias listadas — não entra nos totais acima"
              />
            )}
          </>
        )}
        <HhpKpiCard
          label="Pacientes"
          value={int(pacientes)}
          icon={Users}
          tone="default"
          hint="Pacientes distintos nas guias listadas"
        />
        {/* Só aparece quando houve reimpressão. O registro de impressão de guia
            está descontinuado, então este número é quase sempre zero — e um
            card sozinho com "0" no fim da grade do celular vira ruído sem
            informação nenhuma. */}
        {dados.segundasVias > 0 && (
          <HhpKpiCard
            label="2ªs vias impressas"
            value={int(dados.segundasVias)}
            icon={Printer}
            tone="default"
            hint="Reimpressões registradas no dia — não contam como GR nova"
          />
        )}
      </HhpKpiRow>

      {dados.excedeu !== null && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Este período tem {int(dados.excedeu)} lançamentos — demais para uma lista guia a guia.
            Escolha um período menor no topo da tela (Hoje, Ontem, 7d ou 30d). Períodos que alcançam
            junho de 2026 entram nessa conta porque a migração do sistema antigo gravou todo o
            histórico de uma vez, com a data da importação.
          </span>
        </div>
      )}

      {dados.truncado && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Este período tem mais de {int(GR_PAGINA * GR_MAX_PAGINAS)} lançamentos e só os primeiros
            foram lidos. Os números acima estão incompletos — trate como amostra, não como total.
            Escolha um período menor no topo da tela para ver o número certo.
          </span>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {umDiaSo
                ? `GRs geradas em ${formatDatePura(periodo.de)}`
                : `GRs geradas de ${formatDatePura(periodo.de)} a ${formatDatePura(periodo.ate)}`}
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {int(filtradas.length)} {filtradas.length === 1 ? "guia" : "guias"}
            </span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Uma linha por atendimento lançado. O Nº é a ordem da GR no período; quando a impressão
            da guia ficou registrada, o número dela aparece ao lado.
            {cortouLista &&
              ` A lista desenha as ${int(GR_MAX_LINHAS)} primeiras — os cards acima continuam contando todas as ${int(filtradas.length)}.`}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 3) Filtros rápidos */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={fAtendente} onValueChange={setFAtendente}>
              <SelectTrigger className="h-9 w-full text-xs sm:w-[200px]">
                <SelectValue placeholder="Todos os atendentes" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={TODOS}>Todos os atendentes</SelectItem>
                {atendentes.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={fMedico} onValueChange={setFMedico}>
              <SelectTrigger className="h-9 w-full text-xs sm:w-[200px]">
                <SelectValue placeholder="Todos os médicos" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={TODOS}>Todos os médicos</SelectItem>
                {medicos.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger className="h-9 w-full text-xs sm:w-[180px]">
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={TODOS}>Todos os status</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar paciente, procedimento, nº da GR…"
              className="h-9 w-full text-xs sm:w-[280px]"
            />

            {(filtrando || busca) && (
              <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={limpar}>
                Limpar filtros
              </Button>
            )}
          </div>

          {/* 2) Lista detalhada.
              As sete colunas não cabem na largura de um celular: a tabela
              cortava justamente o fim da linha, que é onde ficam atendente,
              status e valor. Por isso o celular recebe um card por GR, com os
              mesmos campos empilhados, e a tabela fica a partir de `md`. */}
          {carregando ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : filtradas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {dados.excedeu !== null
                ? "Escolha um período menor no topo da tela para ver a lista."
                : dados.linhas.length === 0
                  ? "Nenhuma GR gerada neste período."
                  : "Nenhuma GR corresponde aos filtros."}
            </p>
          ) : (
            <>
              {/* Celular */}
              <ul className="space-y-2 md:hidden">
                {visiveis.map((l) => (
                  <li key={l.id} className="rounded-lg border p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {umDiaSo ? "" : `${l.data} · `}
                        {l.hora} · GR {l.numero}
                        {l.numeroGuia ? ` · guia ${l.numeroGuia}` : ""}
                      </span>
                      {podeFin &&
                        // Guia inteiramente estornada: mostrar "R$ 0,00" esconde
                        // justamente o que a gestão quer auditar. No lugar vai o
                        // valor devolvido, riscado — ele não entra em total nenhum.
                        (l.valor === 0 && l.valorEstornado > 0 ? (
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-amber-700">
                            <s>{money(l.valorEstornado)}</s>
                          </span>
                        ) : (
                          <span className="shrink-0 text-sm font-semibold tabular-nums">
                            {money(l.valor)}
                          </span>
                        ))}
                    </div>
                    <p className="mt-1 text-sm font-medium uppercase leading-tight">{l.paciente}</p>
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                      {l.medico}
                      {l.especialidade !== "—" ? ` · ${l.especialidade}` : ""}
                      {l.procedimento !== "—" ? ` · ${l.procedimento}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Atendente: <span className="text-foreground">{l.atendente}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <Badge variant="outline" className="text-[11px]">
                        {l.situacao}
                      </Badge>
                      {l.financeiro && <SeloFinanceiro situacao={l.financeiro} />}
                    </div>
                    {l.motivoEstorno && (
                      <p className="mt-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-800">
                        Motivo do estorno: {l.motivoEstorno}
                        {podeFin && l.valorEstornado > 0 && (
                          <span className="font-semibold"> — {money(l.valorEstornado)}</span>
                        )}
                      </p>
                    )}
                  </li>
                ))}
              </ul>

              {/* Tablet e desktop */}
              <div className="hidden overflow-x-auto rounded-md border md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {/* A data só faz sentido quando o período passa de um
                          dia; num dia só ela repetiria a mesma linha 350 vezes. */}
                      {!umDiaSo && <TableHead className="w-[70px]">Data</TableHead>}
                      <TableHead className="w-[70px]">Horário</TableHead>
                      <TableHead className="w-[110px]">Nº GR</TableHead>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Médico / Especialidade / Procedimento</TableHead>
                      <TableHead>Atendente</TableHead>
                      <TableHead>Status</TableHead>
                      {podeFin && <TableHead className="text-right">Valor</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visiveis.map((l) => (
                      <TableRow key={l.id}>
                        {!umDiaSo && (
                          <TableCell className="whitespace-nowrap text-xs tabular-nums">
                            {l.data}
                          </TableCell>
                        )}
                        <TableCell className="whitespace-nowrap text-xs tabular-nums">
                          {l.hora}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs tabular-nums">
                          <span className="font-semibold">{l.numero}</span>
                          {l.numeroGuia && (
                            <span className="ml-1 text-muted-foreground">
                              · guia {l.numeroGuia}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-medium uppercase">
                          {l.paciente}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{l.medico}</div>
                          <div className="text-xs text-muted-foreground">
                            {l.especialidade !== "—" ? `${l.especialidade} · ` : ""}
                            {l.procedimento}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{l.atendente}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge variant="outline" className="text-[11px]">
                              {l.situacao}
                            </Badge>
                            {l.financeiro && <SeloFinanceiro situacao={l.financeiro} />}
                          </div>
                          {/* O motivo fica embaixo do selo, escrito. Deixá-lo só
                              no balãozinho esconderia a informação de quem
                              imprime a tela ou passa os olhos pela lista. */}
                          {l.motivoEstorno && (
                            <p
                              className="mt-1 max-w-[220px] text-[11px] leading-snug text-amber-700"
                              title={l.motivoEstorno}
                            >
                              {l.motivoEstorno}
                            </p>
                          )}
                        </TableCell>
                        {podeFin && (
                          <TableCell className="text-right align-top tabular-nums">
                            {l.valor === 0 && l.valorEstornado > 0 ? (
                              <span className="font-semibold text-amber-700">
                                <s>{money(l.valorEstornado)}</s>
                              </span>
                            ) : (
                              <>
                                {money(l.valor)}
                                {/* Guia relançada depois do estorno: o valor de
                                    cima é o que valeu, e embaixo fica o que foi
                                    devolvido no caminho. */}
                                {l.valorEstornado > 0 && (
                                  <ValorEstornado valor={l.valorEstornado} />
                                )}
                              </>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
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
                      className="text-[11px]"
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
