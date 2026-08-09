import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarPlus, UserCheck, Search, Banknote, Ticket, Stethoscope,
  Clock, Users, AlertTriangle, Activity, CheckCircle2, XCircle,
  RefreshCw, Megaphone, ArrowRight, Wallet, ListChecks,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { HhpPageHeader, HhpKpiCard, HhpKpiRow, HhpEmptyState } from "@/design-system/hhp";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/painel")({
  component: DashboardOperacional,
  head: () => ({
    meta: [
      { title: "Dashboard operacional — ClinicaOS" },
      { name: "description", content: "Fila ao vivo, check-ins do dia, próximos atendimentos e alertas imediatos da clínica." },
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
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--");

type Ag = {
  id: string; paciente_nome: string | null; inicio: string | null; status: string;
  fluxo_etapa: string | null; procedimento: string | null; prioridade: string | null;
};
type Senha = { id: string; codigo: string | null; tipo: string; numero: number; status: string; emitida_em: string | null; guiche: string | null };
type Alerta = { id: string; titulo: string | null; paciente_nome: string | null; severidade: string | null; created_at: string };
type CaixaSessao = { id: string; user_nome: string | null; aberto_em: string; valor_abertura: number | null };

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

  const q = useQuery({
    queryKey: ["dashboard-operacional", ids.join("|"), dia],
    enabled,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const de = `${dia}T00:00:00`;
      const ate = `${dia}T23:59:59`;
      const [ags, senhas, alertas, caixas] = await Promise.all([
        supabase.from("agendamentos")
          .select("id,paciente_nome,inicio,status,fluxo_etapa,procedimento,prioridade")
          .in("clinica_id", ids).gte("inicio", de).lte("inicio", ate).order("inicio"),
        supabase.from("senhas")
          .select("id,codigo,tipo,numero,status,emitida_em,guiche")
          .in("clinica_id", ids).eq("data_dia", dia).order("emitida_em", { ascending: false }).limit(50),
        supabase.from("alertas_enfermagem")
          .select("id,titulo,paciente_nome,severidade,created_at")
          .in("clinica_id", ids).eq("status", "aberto").order("created_at", { ascending: false }).limit(8),
        supabase.from("caixa_sessoes")
          .select("id,user_nome,aberto_em,valor_abertura")
          .in("clinica_id", ids).eq("status", "aberto").order("aberto_em"),
      ]);
      return {
        ags: (ags.data ?? []) as Ag[],
        senhas: (senhas.data ?? []) as Senha[],
        alertas: (alertas.data ?? []) as Alerta[],
        caixas: (caixas.data ?? []) as CaixaSessao[],
      };
    },
  });

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["dashboard-operacional"] });
  }, [qc]);
  useRealtimeRefresh(["agendamentos", "senhas", "alertas_enfermagem", "caixa_sessoes"], refresh, enabled);

  const d = q.data;
  const k = useMemo(() => {
    const ags = d?.ags ?? [];
    const naFila = ags.filter((a) => ["recepcao", "caixa", "triagem"].includes(a.fluxo_etapa ?? ""));
    const emAtend = ags.filter((a) => ["atendimento", "exame"].includes(a.fluxo_etapa ?? ""));
    const checkins = ags.filter((a) => a.fluxo_etapa && a.fluxo_etapa !== "aguardando_recepcao");
    return {
      agendados: ags.length,
      checkins: checkins.length,
      naFila: naFila.length,
      emAtend: emAtend.length,
      concluidos: ags.filter((a) => a.status === "realizado" || a.fluxo_etapa === "finalizado").length,
      faltas: ags.filter((a) => a.status === "faltou").length,
      aguardando: ags.filter((a) => !a.fluxo_etapa || a.fluxo_etapa === "aguardando_recepcao").length,
    };
  }, [d]);

  const proximos = useMemo(() => {
    const agora = Date.now();
    return (d?.ags ?? [])
      .filter((a) => a.inicio && new Date(a.inicio).getTime() >= agora && !["cancelado", "realizado", "faltou"].includes(a.status))
      .slice(0, 8);
  }, [d]);

  const filaAtual = useMemo(
    () => (d?.ags ?? []).filter((a) => ["recepcao", "caixa", "triagem", "atendimento", "exame"].includes(a.fluxo_etapa ?? "")).slice(0, 10),
    [d],
  );

  const senhasAguardando = (d?.senhas ?? []).filter((s) => s.status === "emitida");
  const ultimaChamada = (d?.senhas ?? []).find((s) => s.status === "chamada");

  const carregando = loading || q.isLoading;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto bg-slate-50/60">
      <HhpPageHeader
        title="Dashboard operacional"
        eyebrow={`${clinicaAtual?.clinica.nome ?? "Clínica"} · ${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}`}
        actions={
          <>
            <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> ao vivo
            </span>
            <Button variant="outline" size="sm" onClick={refresh} disabled={q.isFetching}>
              <RefreshCw className={cn("h-4 w-4 mr-1.5", q.isFetching && "animate-spin")} /> Atualizar
            </Button>
          </>
        }
      />

      <div className="p-3 md:p-6 space-y-4 md:space-y-6">
        {/* Atalhos rápidos */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3">
          <Atalho to="/app/agenda" icon={CalendarPlus} label="Novo agendamento" />
          <Atalho to="/app/checkin" icon={UserCheck} label="Check-in" />
          <Atalho to="/app/recepcao" icon={Ticket} label="Recepção / Filas" />
          <Atalho to="/app/caixa" icon={Banknote} label="Caixa" />
          <Atalho to="/app/clientes" icon={Search} label="Buscar paciente" />
          <Atalho to="/app/fluxo" icon={Stethoscope} label="Fluxo do paciente" />
        </div>

        {/* KPIs operacionais do dia */}
        {carregando ? (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : (
          <HhpKpiRow>
            <HhpKpiCard label="Agendados hoje" value={k.agendados} icon={Users} tone="info" />
            <HhpKpiCard label="Check-ins feitos" value={k.checkins} icon={UserCheck} tone="ok" hint="Pacientes que já chegaram" />
            <HhpKpiCard label="Aguardando chegada" value={k.aguardando} icon={Clock} tone="default" />
            <HhpKpiCard label="Na fila" value={k.naFila} icon={ListChecks} tone="warn" hint="Recepção, caixa e triagem" />
            <HhpKpiCard label="Em atendimento" value={k.emAtend} icon={Activity} tone="info" />
            <HhpKpiCard label="Concluídos" value={k.concluidos} icon={CheckCircle2} tone="ok" />
          </HhpKpiRow>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Fila ao vivo */}
          <Painel
            title="Fila ao vivo"
            subtitle="Pacientes dentro da clínica agora"
            action={<LinkMais to="/app/fluxo" />}
            className="xl:col-span-2"
          >
            {carregando ? <Linhas /> : filaAtual.length === 0 ? (
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
                    <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400 w-11 shrink-0">{hhmm(a.inicio)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800 truncate">{a.paciente_nome ?? "Paciente"}</div>
                      <div className="text-[11px] text-slate-500 truncate">{a.procedimento ?? "—"}</div>
                    </div>
                    {a.prioridade && a.prioridade !== "normal" && (
                      <Badge variant="destructive" className="text-[10px]">{a.prioridade}</Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {ETAPA_LABEL[a.fluxo_etapa ?? ""] ?? a.fluxo_etapa}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Painel>

          {/* Senhas */}
          <Painel title="Senhas" subtitle="Emissão e chamada do dia" action={<LinkMais to="/app/recepcao" />}>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="Aguardando" value={senhasAguardando.length} tone="warn" />
                <MiniStat label="Última chamada" value={ultimaChamada?.codigo ?? "—"} tone="info" />
              </div>
              {carregando ? <Linhas n={4} /> : senhasAguardando.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">Nenhuma senha aguardando chamada.</p>
              ) : (
                <ul className="space-y-1.5">
                  {senhasAguardando.slice(0, 6).map((s) => (
                    <li key={s.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                      <span className="font-semibold tabular-nums text-slate-800 text-sm">{s.codigo ?? `${s.tipo}${s.numero}`}</span>
                      <span className="text-[11px] text-slate-600 dark:text-slate-400">{hhmm(s.emitida_em)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Painel>

          {/* Próximos atendimentos */}
          <Painel title="Próximos atendimentos" subtitle="Ainda hoje" action={<LinkMais to="/app/agenda" />} className="xl:col-span-2">
            {carregando ? <Linhas /> : proximos.length === 0 ? (
              <HhpEmptyState icon={CalendarPlus} title="Nada mais agendado hoje" description="Use os atalhos acima para criar um novo agendamento." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {proximos.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-sm font-semibold tabular-nums text-slate-700 w-12 shrink-0">{hhmm(a.inicio)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-800 truncate">{a.paciente_nome ?? "Paciente"}</div>
                      <div className="text-[11px] text-slate-500 truncate">{a.procedimento ?? "—"}</div>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">{a.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Painel>

          {/* Alertas + caixa */}
          <div className="space-y-4">
            <Painel title="Alertas imediatos" subtitle="Enfermagem e faltas" action={<LinkMais to="/app/alertas-enfermagem" />}>
              <div className="p-4 space-y-2">
                {k.faltas > 0 && (
                  <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-100 px-3 py-2">
                    <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
                    <span className="text-xs text-rose-700">{k.faltas} falta(s) registrada(s) hoje</span>
                  </div>
                )}
                {(d?.alertas ?? []).map((a) => (
                  <div key={a.id} className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-amber-800 truncate">{a.titulo ?? "Alerta"}</div>
                      <div className="text-[11px] text-amber-700/80 truncate">{a.paciente_nome ?? "—"}</div>
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

            <Painel title="Caixas abertos" subtitle="Operadores em turno" action={<LinkMais to="/app/caixa" />}>
              <div className="p-4 space-y-2">
                {carregando ? <Linhas n={2} /> : (d?.caixas ?? []).length === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Wallet className="h-4 w-4" /> Nenhum caixa aberto no momento.
                  </div>
                ) : (
                  (d?.caixas ?? []).map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                      <span className="text-xs font-medium text-slate-700 truncate">{c.user_nome ?? "Operador"}</span>
                      <span className="text-[11px] text-slate-600 dark:text-slate-400">desde {hhmm(c.aberto_em)}</span>
                    </div>
                  ))
                )}
              </div>
            </Painel>
          </div>
        </div>

        <p className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
          <Megaphone className="h-3.5 w-3.5" />
          Indicadores estratégicos, financeiros e comparativos estão no{" "}
          <Link to="/app/painel-executivo" className="underline underline-offset-2 hover:text-slate-600">Painel Executivo</Link>.
        </p>
      </div>
    </div>
  );
}

function Atalho({ to, icon: Icon, label }: { to: string; icon: typeof Users; label: string }) {
  return (
    <Link
      to={to as never}
      className="group flex items-center gap-2.5 rounded-2xl border border-slate-100 bg-white px-3 py-3 transition-all hover:-translate-y-[1px] hover:border-slate-200 hover:shadow-[0_10px_28px_-16px_rgba(15,23,42,0.20)]"
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600 group-hover:bg-[var(--clinic-accent)] group-hover:text-white transition-colors">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-xs font-medium text-slate-700 leading-tight">{label}</span>
    </Link>
  );
}

function Painel({
  title, subtitle, action, children, className,
}: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-slate-100 bg-white overflow-hidden", className)}>
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800 truncate">{title}</h2>
          {subtitle && <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function LinkMais({ to }: { to: string }) {
  return (
    <Link to={to as never} className="text-[11px] font-medium text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 shrink-0">
      abrir <ArrowRight className="h-3 w-3" />
    </Link>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number | string; tone: "warn" | "info" }) {
  return (
    <div className={cn("rounded-xl px-3 py-2", tone === "warn" ? "bg-amber-50" : "bg-sky-50")}>
      <div className="text-[10px] uppercase tracking-widest font-semibold text-slate-600 dark:text-slate-400">{label}</div>
      <div className="text-lg font-bold tabular-nums text-slate-800 truncate">{value}</div>
    </div>
  );
}

function Linhas({ n = 5 }: { n?: number }) {
  return (
    <div className="p-4 space-y-2">
      {Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
    </div>
  );
}
