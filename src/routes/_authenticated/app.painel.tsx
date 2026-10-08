import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarPlus,
  UserCheck,
  Search,
  Banknote,
  Ticket,
  Stethoscope,
  Clock,
  Users,
  AlertTriangle,
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Megaphone,
  ArrowRight,
  Wallet,
  ListChecks,
  Tv,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { HhpPageHeader, HhpKpiCard, HhpKpiRow, HhpEmptyState } from "@/design-system/hhp";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { InformacoesRapidasCard } from "@/components/painel/informacoes-rapidas";
import { BannerBoasVindas } from "@/components/painel/banner-boas-vindas";
import { MedicosDoDiaTv, type MedicoDoDia } from "@/components/painel/medicos-do-dia-tv";
import {
  ehPeriodoHoje,
  periodoHoje,
  SeletorPeriodoMedicos,
  useMedicosPeriodo,
  type PeriodoMedicos,
} from "@/components/painel/medicos-periodo";
import { formatDatePura } from "@/lib/date-utils";
import { ehVagaLivre, FILTRO_SEM_VAGA_LIVRE } from "@/lib/agenda/vaga-livre";
import { separarPorCartao, type CartaoDia } from "@/lib/painel/cards-do-dia";
import { DetalheCartaoDia } from "@/components/painel/detalhe-cartao-dia";
import { AvisoSemDesfecho } from "@/components/painel/aviso-sem-desfecho";
import { ficouSemDesfecho, ultimoDiaEncerrado } from "@/lib/painel/sem-desfecho";

export const Route = createFileRoute("/_authenticated/app/painel")({
  component: DashboardOperacional,
  head: () => ({
    meta: [
      { title: "Dashboard operacional — ClinicaOS" },
      {
        name: "description",
        content:
          "Fila ao vivo, check-ins do dia, próximos atendimentos e alertas imediatos da clínica.",
      },
      { property: "og:title", content: "Dashboard operacional — ClinicaOS" },
      { property: "og:description", content: "Acompanhe a operação do dia em tempo real." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const hhmm = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--";

/** "Hoje às 13:46" ou "08/08 às 18:27". */
const dataHoraCurta = (iso: string | null) => {
  if (!iso) return "--:--";
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const hoje = new Date();
  const mesmoDia =
    d.getFullYear() === hoje.getFullYear() &&
    d.getMonth() === hoje.getMonth() &&
    d.getDate() === hoje.getDate();
  if (mesmoDia) return `Hoje às ${hora}`;
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes} às ${hora}`;
};

/** Teto de linhas que o PostgREST devolve numa requisição. */
const PAGINA = 1000;

/**
 * Busca todas as linhas de uma consulta sem parar no teto de 1.000 linhas do
 * PostgREST. A primeira página já pede o total exato (`count: "exact"`) e as
 * seguintes são buscadas até completar esse total.
 */
async function buscarTudo<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; count: number | null }>,
): Promise<T[]> {
  const primeira = await consulta(0, PAGINA - 1);
  const linhas = [...(primeira.data ?? [])];
  const total = primeira.count ?? linhas.length;
  for (let inicio = PAGINA; inicio < total; inicio += PAGINA) {
    const pagina = await consulta(inicio, inicio + PAGINA - 1);
    linhas.push(...(pagina.data ?? []));
  }
  return linhas;
}

type Ag = {
  id: string;
  paciente_nome: string | null;
  inicio: string | null;
  status: string;
  fluxo_etapa: string | null;
  procedimento: string | null;
  prioridade: string | null;
  medico_id?: string | null;
  paciente_id?: string | null;
  data_pagamento?: string | null;
};
type Senha = {
  id: string;
  codigo: string | null;
  tipo: string;
  numero: number;
  status: string;
  emitida_em: string | null;
  guiche: string | null;
};
type Alerta = {
  id: string;
  titulo: string | null;
  paciente_nome: string | null;
  severidade: string | null;
  created_at: string;
};
type CaixaSessao = {
  id: string;
  user_nome: string | null;
  aberto_em: string;
  valor_abertura: number | null;
};

const ETAPA_LABEL: Record<string, string> = {
  aguardando_recepcao: "Aguardando recepção",
  recepcao: "Na recepção",
  caixa: "No caixa",
  triagem: "Em triagem",
  atendimento: "Em atendimento",
  exame: "Em exame",
  finalizado: "Finalizado",
};

function DashboardOperacional() {
  const { clinicaIds, clinicaAtual, loading } = useClinica();
  const qc = useQueryClient();
  const dia = hojeISO();
  const ids = clinicaIds;
  const enabled = ids.length > 0;

  // No Modo TV quem comanda a atualização periódica é o seletor da própria tela.
  const [modoTv, setModoTv] = useState(false);

  const q = useQuery({
    queryKey: ["dashboard-operacional", ids.join("|"), dia],
    enabled,
    refetchInterval: modoTv ? false : 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const de = `${dia}T00:00:00`;
      const ate = `${dia}T23:59:59`;
      const [ags, senhas, alertas, caixas, meds, esps, novos] = await Promise.all([
        buscarTudo<Ag>((pDe, pAte) =>
          supabase
            .from("agendamentos")
            .select(
              "id,paciente_nome,inicio,status,fluxo_etapa,procedimento,prioridade,medico_id,paciente_id,data_pagamento",
              { count: "exact" },
            )
            .in("clinica_id", ids)
            .gte("inicio", de)
            .lte("inicio", ate)
            .or(FILTRO_SEM_VAGA_LIVRE)
            .order("inicio")
            .order("id")
            .range(pDe, pAte),
        ),
        supabase
          .from("senhas")
          .select("id,codigo,tipo,numero,status,emitida_em,guiche")
          .in("clinica_id", ids)
          .eq("data_dia", dia)
          .order("emitida_em", { ascending: false })
          .limit(50),
        supabase
          .from("alertas_enfermagem")
          .select("id,titulo,paciente_nome,severidade,created_at")
          .in("clinica_id", ids)
          .eq("status", "aberto")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("caixa_sessoes")
          .select("id,user_nome,aberto_em,valor_abertura")
          .in("clinica_id", ids)
          .eq("status", "aberto")
          .order("aberto_em", { ascending: false }),
        supabase.from("medicos").select("id,nome,especialidade_id").in("clinica_id", ids),
        supabase.from("especialidades").select("id,nome"),
        buscarTudo<{ id: string }>((pDe, pAte) =>
          supabase
            .from("pacientes")
            .select("id", { count: "exact" })
            .in("clinica_id", ids)
            .gte("created_at", `${dia}T00:00:00`)
            .lte("created_at", `${dia}T23:59:59`)
            .order("id")
            .range(pDe, pAte),
        ),
      ]);
      return {
        ags: ags.filter((a) => !ehVagaLivre(a)),
        senhas: (senhas.data ?? []) as Senha[],
        alertas: (alertas.data ?? []) as Alerta[],
        caixas: (caixas.data ?? []) as CaixaSessao[],
        medicos: (meds.data ?? []) as Array<{
          id: string;
          nome: string;
          especialidade_id: string | null;
        }>,
        especialidades: (esps.data ?? []) as Array<{ id: string; nome: string }>,
        pacientesNovos: new Set(novos.map((p) => p.id)),
      };
    },
  });

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["dashboard-operacional"] });
  }, [qc]);
  useRealtimeRefresh(
    ["agendamentos", "senhas", "alertas_enfermagem", "caixa_sessoes"],
    refresh,
    enabled,
  );

  const d = q.data;
  // Número do cartão e lista que abre ao clicar saem da mesma separação.
  const porCartao = useMemo(() => separarPorCartao(d?.ags ?? []), [d]);
  const k = useMemo(
    () => ({
      agendados: porCartao.agendados.length,
      checkins: porCartao.checkins.length,
      naFila: porCartao.naFila.length,
      emAtend: porCartao.emAtend.length,
      concluidos: porCartao.concluidos.length,
      faltas: porCartao.agendados.filter((a) => a.status === "faltou").length,
      aguardando: porCartao.aguardando.length,
    }),
    [porCartao],
  );

  const [cartaoAberto, setCartaoAberto] = useState<CartaoDia | null>(null);
  const medicoNome = useMemo(() => new Map((d?.medicos ?? []).map((m) => [m.id, m.nome])), [d]);
  // Contagem por atendente é ferramenta de supervisão: mesma regra de
  // Relatórios → Marcações por atendente (`pode_autorizar` + admin/gestor).
  // A função do banco repete a checagem.
  const ehSupervisor =
    !!clinicaAtual?.pode_autorizar &&
    (clinicaAtual.role === "admin" || clinicaAtual.role === "gestor");

  const proximos = useMemo(() => {
    const agora = Date.now();
    return (d?.ags ?? [])
      .filter(
        (a) =>
          a.inicio &&
          new Date(a.inicio).getTime() >= agora &&
          !["cancelado", "realizado", "faltou"].includes(a.status),
      )
      .slice(0, 8);
  }, [d]);

  const filaAtual = useMemo(
    () =>
      (d?.ags ?? [])
        .filter((a) =>
          ["recepcao", "caixa", "triagem", "atendimento", "exame"].includes(a.fluxo_etapa ?? ""),
        )
        .slice(0, 10),
    [d],
  );

  const senhasAguardando = (d?.senhas ?? []).filter((s) => s.status === "emitida");
  const ultimaChamada = (d?.senhas ?? []).find((s) => s.status === "chamada");

  const medicosDoDia = useMemo(() => {
    const ags = (d?.ags ?? []).filter((a) => a.medico_id && a.status !== "cancelado");
    const espNome = new Map((d?.especialidades ?? []).map((e) => [e.id, e.nome]));
    const medInfo = new Map((d?.medicos ?? []).map((m) => [m.id, m]));
    const novos = d?.pacientesNovos ?? new Set<string>();
    // Depois das 19h quem não passou pelo balcão já conta como falta (sem-desfecho.ts).
    const ateDia = ultimoDiaEncerrado();
    const mapa = new Map<string, MedicoDoDia>();
    for (const a of ags) {
      const id = a.medico_id as string;
      const info = medInfo.get(id);
      const item = mapa.get(id) ?? {
        id,
        nome: info?.nome ?? "Médico",
        especialidade: info?.especialidade_id ? (espNome.get(info.especialidade_id) ?? null) : null,
        total: 0,
        atendidos: 0,
        faltas: 0,
        pagos: 0,
        novos: 0,
      };
      item.total += 1;
      if (a.status === "realizado" || a.fluxo_etapa === "finalizado") item.atendidos += 1;
      if (a.status === "faltou" || ficouSemDesfecho(a, ateDia)) item.faltas += 1;
      if (a.data_pagamento) item.pagos += 1;
      if (a.paciente_id && novos.has(a.paciente_id)) item.novos += 1;
      mapa.set(id, item);
    }
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [d]);

  // Seção de médicos com período: "Hoje" usa os dados ao vivo já carregados;
  // outros períodos vêm prontos do banco. O Modo TV continua sempre no dia.
  const [periodoMedicos, setPeriodoMedicos] = useState<PeriodoMedicos>(periodoHoje);
  const medicosHoje = ehPeriodoHoje(periodoMedicos);
  const qPeriodo = useMedicosPeriodo(ids, periodoMedicos, !medicosHoje);
  const medicosSecao = useMemo<MedicoDoDia[]>(() => {
    if (medicosHoje) return medicosDoDia;
    const espNome = new Map((d?.especialidades ?? []).map((e) => [e.id, e.nome]));
    const medInfo = new Map((d?.medicos ?? []).map((m) => [m.id, m]));
    return (qPeriodo.data ?? [])
      .map((r) => {
        const info = medInfo.get(r.medico_id);
        return {
          id: r.medico_id,
          nome: info?.nome ?? "Médico",
          especialidade: info?.especialidade_id
            ? (espNome.get(info.especialidade_id) ?? null)
            : null,
          total: r.total,
          atendidos: r.atendidos,
          faltas: r.faltas,
          pagos: r.pagos,
          novos: r.novos,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [medicosHoje, medicosDoDia, qPeriodo.data, d]);

  const carregando = loading || q.isLoading;
  const carregandoMedicos = carregando || (!medicosHoje && qPeriodo.isLoading);
  const sairModoTv = useCallback(() => setModoTv(false), []);

  return (
    <div className="flex flex-col w-full bg-slate-50/60">
      <HhpPageHeader
        title="Dashboard operacional"
        eyebrow={`${clinicaAtual?.clinica.nome ?? "Clínica"} · ${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}`}
        actions={
          <>
            <span className="hidden md:inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> ao vivo
            </span>
            <Button variant="outline" size="sm" onClick={refresh} disabled={q.isFetching}>
              <RefreshCw className={cn("h-4 w-4 mr-1.5", q.isFetching && "animate-spin")} />{" "}
              Atualizar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModoTv(true)}
              title="Mostrar só os médicos do dia em tela cheia, para TV ou monitor grande"
            >
              <Tv className="h-4 w-4 mr-1.5" /> Modo TV
            </Button>
          </>
        }
      />

      {modoTv && (
        <MedicosDoDiaTv
          medicos={medicosDoDia}
          atualizando={q.isFetching}
          atualizadoEm={q.dataUpdatedAt}
          onAtualizar={refresh}
          onSair={sairModoTv}
        />
      )}

      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 md:py-6">
        <BannerBoasVindas />

        {/* Atalhos rápidos */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <Atalho to="/app/agenda" icon={CalendarPlus} label="Novo agendamento" />
          <Atalho to="/app/checkin" icon={UserCheck} label="Check-in" />
          <Atalho to="/app/recepcao" icon={Ticket} label="Recepção / Filas" />
          <Atalho to="/app/caixa" icon={Banknote} label="Caixa" />
          <Atalho to="/app/clientes" icon={Search} label="Buscar paciente" />
          <Atalho to="/app/fluxo" icon={Stethoscope} label="Fluxo do paciente" />
        </div>

        {/* KPIs operacionais do dia */}
        {carregando ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : (
          <HhpKpiRow className="grid-cols-2 md:grid-cols-3 lg:grid-cols-6 mb-6">
            <HhpKpiCard
              label="Agendados hoje"
              value={k.agendados}
              icon={Users}
              tone="info"
              hint={
                ehSupervisor
                  ? "Clique para ver quantos cada atendente marcou"
                  : "Clique para ver a lista"
              }
              onClick={() => setCartaoAberto("agendados")}
            />
            <HhpKpiCard
              label="Check-ins feitos"
              value={k.checkins}
              icon={UserCheck}
              tone="ok"
              hint="Pacientes que já chegaram — clique para ver a lista"
              onClick={() => setCartaoAberto("checkins")}
            />
            <HhpKpiCard
              label="Aguardando chegada"
              value={k.aguardando}
              icon={Clock}
              tone="default"
              hint="Clique para ver a lista"
              onClick={() => setCartaoAberto("aguardando")}
            />
            <HhpKpiCard
              label="Na fila"
              value={k.naFila}
              icon={ListChecks}
              tone="warn"
              hint="Recepção, caixa e triagem — clique para ver a lista"
              onClick={() => setCartaoAberto("naFila")}
            />
            <HhpKpiCard
              label="Em atendimento"
              value={k.emAtend}
              icon={Activity}
              tone="info"
              hint="Clique para ver a lista"
              onClick={() => setCartaoAberto("emAtend")}
            />
            <HhpKpiCard
              label="Concluídos"
              value={k.concluidos}
              icon={CheckCircle2}
              tone="ok"
              hint="Clique para ver a lista"
              onClick={() => setCartaoAberto("concluidos")}
            />
          </HhpKpiRow>
        )}

        <DetalheCartaoDia
          cartao={cartaoAberto}
          onClose={() => setCartaoAberto(null)}
          fichas={cartaoAberto ? porCartao[cartaoAberto] : []}
          medicoNome={medicoNome}
          dia={dia}
          clinicaIds={ids}
          ehSupervisor={ehSupervisor}
        />

        <InformacoesRapidasCard className="w-full mb-6" />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 items-start">
          <div className="flex flex-col gap-6">
            {/* Fila ao vivo */}
            <Painel
              title="Fila ao vivo"
              subtitle="Pacientes dentro da clínica agora"
              action={<LinkMais to="/app/fluxo" />}
            >
              {carregando ? (
                <Linhas />
              ) : filaAtual.length === 0 ? (
                <HhpEmptyState
                  icon={Users}
                  title="Ninguém na fila"
                  description="Assim que um paciente fizer check-in ele aparece aqui em tempo real."
                  className="min-h-[220px]"
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filaAtual.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400 w-11 shrink-0">
                        {hhmm(a.inicio)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-800 truncate">
                          {a.paciente_nome ?? "Paciente"}
                        </div>
                        <div className="text-[12px] text-slate-500 truncate">
                          {a.procedimento ?? "—"}
                        </div>
                      </div>
                      {a.prioridade && a.prioridade !== "normal" && (
                        <Badge variant="destructive" className="text-[11px]">
                          {a.prioridade}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[11px] shrink-0">
                        {ETAPA_LABEL[a.fluxo_etapa ?? ""] ?? a.fluxo_etapa}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Painel>

            {/* Próximos atendimentos */}
            <Painel
              title="Próximos atendimentos"
              subtitle="Ainda hoje"
              action={<LinkMais to="/app/agenda" />}
            >
              {carregando ? (
                <Linhas />
              ) : proximos.length === 0 ? (
                <div className="min-h-[260px] rounded-xl bg-card p-6 flex flex-col items-center justify-center text-center gap-3">
                  <CalendarPlus className="h-10 w-10 text-slate-400" strokeWidth={1.5} />
                  <div className="text-sm font-semibold text-slate-700">
                    Nada mais agendado hoje
                  </div>
                  <p className="text-xs text-slate-500 max-w-xs">
                    Use os atalhos acima para criar um novo agendamento.
                  </p>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/app/agenda">
                      <CalendarPlus className="h-4 w-4 mr-1.5" /> Novo agendamento
                    </Link>
                  </Button>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {proximos.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-sm font-semibold tabular-nums text-slate-700 w-12 shrink-0">
                        {hhmm(a.inicio)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-slate-800 truncate">
                          {a.paciente_nome ?? "Paciente"}
                        </div>
                        <div className="text-[12px] text-slate-500 truncate">
                          {a.procedimento ?? "—"}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[11px] shrink-0">
                        {a.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Painel>
          </div>

          {/* Senhas + Alertas + caixa */}
          <div className="flex flex-col gap-6">
            <Painel
              title="Senhas"
              subtitle="Emissão e chamada do dia"
              action={<LinkMais to="/app/recepcao" />}
            >
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Aguardando" value={senhasAguardando.length} tone="warn" />
                  <MiniStat
                    label="Última chamada"
                    value={ultimaChamada?.codigo ?? "—"}
                    tone="info"
                  />
                </div>
                {carregando ? (
                  <Linhas n={4} />
                ) : senhasAguardando.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    Nenhuma senha aguardando chamada.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {senhasAguardando.slice(0, 6).map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
                      >
                        <span className="font-semibold tabular-nums text-slate-800 text-sm">
                          {s.codigo ?? `${s.tipo}${s.numero}`}
                        </span>
                        <span className="text-[12px] text-slate-600 dark:text-slate-400">
                          {hhmm(s.emitida_em)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Painel>

            <Painel
              title="Alertas imediatos"
              subtitle="Enfermagem e faltas"
              action={<LinkMais to="/app/alertas-enfermagem" />}
            >
              <div className="p-4 space-y-2">
                {k.faltas > 0 && (
                  <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-100 px-3 py-2">
                    <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
                    <span className="text-xs text-rose-700">
                      {k.faltas} falta(s) registrada(s) hoje
                    </span>
                  </div>
                )}
                {(d?.alertas ?? []).map((a) => (
                  <div
                    key={a.id}
                    className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2"
                  >
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-amber-800 truncate">
                        {a.titulo ?? "Alerta"}
                      </div>
                      <div className="text-[12px] text-amber-700/80 truncate">
                        {a.paciente_nome ?? "—"}
                      </div>
                    </div>
                  </div>
                ))}
                {!carregando && k.faltas === 0 && (d?.alertas ?? []).length === 0 && (
                  <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                    <CheckCircle2 className="h-4 w-4" /> Nenhum alerta em aberto.
                  </div>
                )}
              </div>
            </Painel>

            <Painel
              title="Caixas abertos"
              subtitle="Operadores em turno"
              action={<LinkMais to="/app/caixa" />}
            >
              <div className="p-4 space-y-2">
                {carregando ? (
                  <Linhas n={2} />
                ) : (d?.caixas ?? []).length === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Wallet className="h-4 w-4" /> Nenhum caixa aberto no momento.
                  </div>
                ) : (
                  <>
                    {(d?.caixas ?? [])
                      .slice()
                      .sort(
                        (a, b) => new Date(b.aberto_em).getTime() - new Date(a.aberto_em).getTime(),
                      )
                      .slice(0, 5)
                      .map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
                        >
                          <span className="text-xs font-medium text-slate-700 truncate">
                            {c.user_nome ?? "Operador"}
                          </span>
                          <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                            {dataHoraCurta(c.aberto_em)}
                          </span>
                        </div>
                      ))}
                    {(d?.caixas ?? []).length > 5 && (
                      <Link
                        to="/app/caixa"
                        className="block pt-1 text-[12px] font-medium text-slate-500 hover:text-slate-800"
                      >
                        +{(d?.caixas ?? []).length - 5} caixa(s) aberto(s) — ver todos
                      </Link>
                    )}
                  </>
                )}
              </div>
            </Painel>
          </div>
        </div>

        {/* Médicos do dia */}
        <Painel
          title={medicosHoje ? "Médicos do dia — Total de atendimentos" : "Médicos no período"}
          subtitle={
            medicosHoje
              ? "Agendamentos de hoje por profissional"
              : periodoMedicos.de === periodoMedicos.ate
                ? `Agendamentos de ${formatDatePura(periodoMedicos.de)} por profissional`
                : `Agendamentos de ${formatDatePura(periodoMedicos.de)} a ${formatDatePura(periodoMedicos.ate)} por profissional`
          }
          action={<LinkMais to="/app/agenda-medicos" />}
          className="mb-6"
        >
          <div className="px-4 pt-3">
            <SeletorPeriodoMedicos periodo={periodoMedicos} onChange={setPeriodoMedicos} />
          </div>
          <AvisoSemDesfecho clinicaIds={ids} medicoNome={medicoNome} />
          {!medicosHoje && periodoMedicos.de > periodoMedicos.ate ? (
            <HhpEmptyState
              icon={Stethoscope}
              title="Período inválido"
              description="A data inicial precisa ser anterior ou igual à data final."
              className="min-h-[180px]"
            />
          ) : !medicosHoje && qPeriodo.isError ? (
            <HhpEmptyState
              icon={AlertTriangle}
              title="Não foi possível carregar o período"
              description="Tente de novo em instantes pelo botão Atualizar."
              className="min-h-[180px]"
            />
          ) : carregandoMedicos ? (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : medicosSecao.length === 0 ? (
            <HhpEmptyState
              icon={Stethoscope}
              title={
                medicosHoje
                  ? "Nenhum médico com atendimentos hoje"
                  : "Nenhum médico com atendimentos no período"
              }
              description="Assim que houver agendamentos vinculados a profissionais, eles aparecem aqui."
              className="min-h-[180px]"
            />
          ) : (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {medicosSecao.map((m) => {
                const naoPagos = m.total - m.pagos;
                return (
                  <div
                    key={m.id}
                    className="rounded-xl border border-slate-100 bg-card p-3 transition-shadow hover:shadow-[0_10px_28px_-16px_rgba(15,23,42,0.20)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div
                          className="text-sm font-semibold text-slate-800 truncate"
                          title={m.nome}
                        >
                          {m.nome}
                        </div>
                        <Badge variant="secondary" className="mt-1 text-[11px]">
                          {m.especialidade ?? "Sem especialidade"}
                        </Badge>
                      </div>
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        title="Abrir agenda deste médico"
                      >
                        <Link to="/app/agenda" search={{ orcmed: m.id } as never}>
                          <CalendarPlus className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between gap-2 border-b border-slate-100 pb-2">
                      <span className="text-[11px] uppercase tracking-widest font-semibold text-slate-500">
                        Agendamentos
                      </span>
                      <span className="text-3xl font-bold tabular-nums text-slate-900 leading-none">
                        {m.total}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                      <MetricaMedico rotulo="Atendidos" qtd={m.atendidos} total={m.total} />
                      <MetricaMedico rotulo="Faltas" qtd={m.faltas} total={m.total} />
                      <MetricaMedico rotulo="Pagos" qtd={m.pagos} total={m.total} />
                      <MetricaMedico rotulo="Não pagos" qtd={naoPagos} total={m.total} />
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500">
                      {m.novos} cliente(s) novo(s)
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Painel>

        <p className="text-[12px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
          <Megaphone className="h-3.5 w-3.5" />
          Indicadores estratégicos, financeiros e comparativos estão no{" "}
          <Link
            to="/app/painel-executivo"
            className="underline underline-offset-2 hover:text-slate-600"
          >
            Painel Executivo
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function Atalho({ to, icon: Icon, label }: { to: string; icon: typeof Users; label: string }) {
  return (
    <Link
      to={to as never}
      className="group inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-100 bg-card px-3 py-2 transition-all hover:-translate-y-[1px] hover:border-slate-200 hover:shadow-[0_10px_28px_-16px_rgba(15,23,42,0.20)]"
    >
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 group-hover:bg-[var(--clinic-accent)] group-hover:text-white transition-colors">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-xs font-medium text-slate-700 leading-tight whitespace-nowrap">
        {label}
      </span>
    </Link>
  );
}

function Painel({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-2xl border border-slate-100 bg-card overflow-hidden", className)}
    >
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800 truncate">{title}</h2>
          {subtitle && (
            <p className="text-[12px] text-slate-600 dark:text-slate-400 truncate">{subtitle}</p>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function LinkMais({ to }: { to: string }) {
  return (
    <Link
      to={to as never}
      className="text-[12px] font-medium text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 shrink-0"
    >
      abrir <ArrowRight className="h-3 w-3" />
    </Link>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "warn" | "info";
}) {
  return (
    <div className={cn("rounded-xl px-3 py-2", tone === "warn" ? "bg-amber-50" : "bg-sky-50")}>
      <div className="text-[11px] uppercase tracking-widest font-semibold text-slate-600 dark:text-slate-400">
        {label}
      </div>
      <div className="text-lg font-bold tabular-nums text-slate-800 truncate">{value}</div>
    </div>
  );
}

/** Quantidade + % sobre o total de agendamentos do médico (formato do sistema antigo). */
function MetricaMedico({ rotulo, qtd, total }: { rotulo: string; qtd: number; total: number }) {
  const pct = total > 0 ? (qtd / total) * 100 : 0;
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">{rotulo}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-bold tabular-nums text-slate-800 leading-tight">{qtd}</span>
        <span className="text-[11px] tabular-nums text-slate-500">
          {pct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
        </span>
      </div>
    </div>
  );
}

function Linhas({ n = 5 }: { n?: number }) {
  return (
    <div className="p-4 space-y-2">
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}
