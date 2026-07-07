import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Check, FileText, CalendarClock, Wallet, FileSignature,
  MessageCircle, History, Stethoscope, Sparkles, AlertTriangle,
  Coffee, DollarSign, Clock, ClipboardCheck, LogIn, XCircle, UserX,
  ArrowUpRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { HhpChip } from "@/design-system/hhp";
import { HhpDrawer } from "@/design-system/hhp/drawer";
import type { StatusAgendamento } from "@/lib/agenda/status-agendamento.functions";

export interface DrawerPatientData {
  paciente_id?: string | null;
  paciente_nome: string;
  paciente_avatar_url?: string | null;
  medico_nome?: string | null;
  especialidade?: string | null;
  status?: string | null;
  chegou_em?: string | null;         // "09:28"
  etapa_atual: string | null;
  historico: Array<{ etapa: string; timestamp: string }>;
  proc_titulo?: string | null;
  hora?: string | null;
  /** Ids dos agendamentos da sessão — usado para alteração de status (S2-A). */
  agendamento_ids?: string[];
}

// 6 etapas rev.3 (rev. paciente).
const ETAPAS = [
  { key: "agendado", label: "Confirmado" },
  { key: "aguardando_recepcao", label: "Check-in" },
  { key: "caixa", label: "Financeiro" },
  { key: "atendimento", label: "Em atendimento" },
  { key: "exame", label: "Exames" },
  { key: "finalizado", label: "Alta" },
] as const;

type Tab = "resumo" | "financeiro" | "docs" | "historico" | "prontuario";

const STATUS_LABEL: Record<string, string> = {
  agendado: "Aguardando",
  confirmado: "Confirmado",
  em_atendimento: "Em atendimento",
  realizado: "Realizado",
  cancelado: "Cancelado",
  faltou: "Faltou",
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function idadeFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
  return a >= 0 && a < 130 ? a : null;
}

/**
 * Drawer — Centro de Atendimento (Fase C):
 * - Header: foto 96, nome dominante, chips (idade · convênio · médico · especialidade · hora · status)
 * - Jornada visual de 6 etapas em linha contínua
 * - 7 ações rápidas
 * - Bloco de sugestões IA (estrutura visual)
 * - Painel rápido (Resumo) + abas Financeiro/Docs/Histórico/Prontuário
 * - Abertura instantânea; detalhes do paciente carregam em segundo plano.
 */
export function PatientDrawer({
  open, onOpenChange, data, onChangeStatus, onOpenProntuario,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: DrawerPatientData | null;
  onChangeStatus?: (agendamentoIds: string[], novoStatus: StatusAgendamento) => void;
  /**
   * Sprint 3 · S3-A — abre o prontuário/atendimento IA para o
   * primeiro agendamento da sessão. A rota destino é
   * `/app/atendimento-ia/$agendamentoId`; a navegação em si acontece
   * no shell para preservar o contexto (data, filtros, densidade,
   * scroll, paciente selecionado) ao retornar.
   */
  onOpenProntuario?: (agendamentoId: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("resumo");
  const openedAtRef = useRef<number>(0);
  const [openMs, setOpenMs] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      openedAtRef.current = performance.now();
      setOpenMs(null);
      requestAnimationFrame(() => {
        setOpenMs(Math.round(performance.now() - openedAtRef.current));
      });
    }
  }, [open, data?.paciente_id]);

  const idx = data ? ETAPAS.findIndex((e) => e.key === data.etapa_atual) : -1;

  // Fetch em segundo plano — nome do convênio + idade — sem bloquear a abertura.
  const detalhesQuery = useQuery({
    queryKey: ["agenda-v2", "drawer-paciente", data?.paciente_id],
    enabled: open && !!data?.paciente_id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: p } = await supabase
        .from("pacientes")
        .select("id,data_nascimento")
        .eq("id", data!.paciente_id!)
        .maybeSingle();
      return { idade: idadeFromDob(p?.data_nascimento) };
    },
  });

  const idade = detalhesQuery.data?.idade ?? null;

  const primeiroAgendamentoId = data?.agendamento_ids?.[0] ?? null;
  const abrirProntuario = () => {
    if (!onOpenProntuario || !primeiroAgendamentoId) return;
    onOpenProntuario(primeiroAgendamentoId);
  };

  return (
    <HhpDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={data?.paciente_nome ?? "Paciente"}
      description="Centro de Atendimento do paciente: jornada, ações rápidas e sugestões."
    >
      {data && (
          <div className="animate-in fade-in duration-150">
            {/* 1. Cabeçalho */}
            <div className="px-6 pt-7 pb-5 border-b border-slate-100">
              <div className="flex items-start gap-4">
                <Avatar className="h-24 w-24 border border-slate-200/80 shadow-sm shrink-0">
                  {data.paciente_avatar_url && <AvatarImage src={data.paciente_avatar_url} alt={data.paciente_nome} />}
                  <AvatarFallback className="bg-slate-50 text-slate-500 text-2xl font-semibold">
                    {initials(data.paciente_nome)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 pt-0.5">
                  <h2
                    className="text-[22px] leading-tight font-semibold text-slate-900 truncate"
                    style={{ fontFamily: "'Inter Tight', Inter, sans-serif", letterSpacing: "-0.01em" }}
                  >
                    {data.paciente_nome}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                    <MetaChip label={idade === null ? (detalhesQuery.isLoading ? "…" : "—") : `${idade}a`} />
                    <MetaChip label={/* convênio: placeholder */ "Particular"} muted />
                    {data.medico_nome && <MetaChip label={data.medico_nome} />}
                    {data.especialidade && <MetaChip label={data.especialidade} />}
                    {data.hora && <MetaChip label={data.hora} tabular />}
                    {data.status && (
                      <HhpChip tone="focus" variant="outline" size="sm">
                        {STATUS_LABEL[data.status] ?? data.status.replace(/_/g, " ")}
                      </HhpChip>
                    )}
                  </div>
                  {data.chegou_em && (
                    <p className="mt-2 text-[11px] uppercase tracking-widest text-slate-400">
                      Chegou {data.chegou_em}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Jornada (linha contínua) */}
            <div className="px-6 py-5 border-b border-slate-100">
              <SectionTitle>Jornada</SectionTitle>
              <JourneyLine currentIdx={idx} />
            </div>

            {/* 4. Ações rápidas */}
            <div className="px-6 py-4 border-b border-slate-100">
              {onChangeStatus && data.agendamento_ids && data.agendamento_ids.length > 0 && (
                <StatusActions
                  status={data.status ?? "agendado"}
                  onChange={(novo) => onChangeStatus(data.agendamento_ids!, novo)}
                />
              )}
              <SectionTitle>Ações rápidas</SectionTitle>
              <div className="grid grid-cols-4 gap-2">
                <QuickAction
                  icon={<Stethoscope className="h-4 w-4" />}
                  label="Prontuário"
                  onClick={onOpenProntuario && primeiroAgendamentoId ? abrirProntuario : undefined}
                />
                <QuickAction icon={<CalendarClock className="h-4 w-4" />} label="Reagendar" />
                <QuickAction icon={<Wallet className="h-4 w-4" />} label="Financeiro" />
                <QuickAction icon={<FileSignature className="h-4 w-4" />} label="Orçamento" />
                <QuickAction icon={<FileText className="h-4 w-4" />} label="Documentos" />
                <QuickAction icon={<MessageCircle className="h-4 w-4" />} label="WhatsApp" />
                <QuickAction icon={<History className="h-4 w-4" />} label="Histórico" />
                <QuickAction icon={<Sparkles className="h-4 w-4" />} label="Nina" />
              </div>
            </div>

            {/* 5. Sugestões IA (estrutura visual) */}
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-b from-indigo-50/40 to-white">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-indigo-600">
                  <Sparkles className="h-3 w-3" /> Sugestões da IA
                </div>
                <span className="text-[10px] text-slate-400">3 sinais</span>
              </div>
              <div className="space-y-1.5">
                <AiChip
                  icon={<Clock className="h-3.5 w-3.5" />}
                  tone="warn"
                  label="Paciente chegou antes do horário"
                  hint="Considere adiantar a triagem."
                />
                <AiChip
                  icon={<Coffee className="h-3.5 w-3.5" />}
                  tone="info"
                  label="Exame exige jejum de 8h"
                  hint="Confirmar preparo antes da coleta."
                />
                <AiChip
                  icon={<DollarSign className="h-3.5 w-3.5" />}
                  tone="danger"
                  label="Existe pendência financeira"
                  hint="Verifique no Financeiro antes da alta."
                />
              </div>
            </div>

            {/* 3 + tabs: Painel rápido + demais abas (conteúdo pesado só ao trocar de aba) */}
            <div className="px-6 py-4">
              <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-4">
                {([
                  { key: "resumo", label: "Resumo" },
                  { key: "financeiro", label: "Financeiro" },
                  { key: "docs", label: "Docs" },
                  { key: "historico", label: "Histórico" },
                  { key: "prontuario", label: "Prontuário" },
                ] as const).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={cn(
                      "flex-1 h-8 rounded-lg text-[11px] font-medium transition-all",
                      tab === t.key
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="min-h-[180px]">
                {tab === "resumo" && <ResumoPanel proc={data.proc_titulo ?? null} />}
                {tab === "financeiro" && <TabPlaceholder title="Financeiro">
                  Total previsto, pago e em aberto — conectado no roadmap sem alterar as regras do módulo Financeiro clássico.
                </TabPlaceholder>}
                {tab === "docs" && <TabPlaceholder title="Documentos">
                  Anamneses, receitas e atestados serão listados aqui.
                </TabPlaceholder>}
                {tab === "historico" && (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
                    {data.historico.length === 0 ? (
                      <p className="text-xs text-slate-400">Sem eventos registrados.</p>
                    ) : (
                      <ol className="space-y-2">
                        {data.historico.map((h, i) => (
                          <li key={i} className="flex justify-between text-xs">
                            <span className="text-slate-600">{h.etapa.replace(/_/g, " ")}</span>
                            <span className="text-slate-400 tabular-nums">{new Date(h.timestamp).toLocaleString("pt-BR")}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
                {tab === "prontuario" && (
                  <ProntuarioPanel
                    proc={data.proc_titulo ?? null}
                    canOpen={!!onOpenProntuario && !!primeiroAgendamentoId}
                    onOpen={abrirProntuario}
                  />
                )}
              </div>
            </div>

            {openMs !== null && (
              <div className="px-6 pb-4 -mt-2 text-[10px] text-slate-300 tabular-nums text-right">
                aberto em {openMs}ms
              </div>
            )}
          </div>
      )}
    </HhpDrawer>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
      {children}
    </div>
  );
}

function MetaChip({ label, muted, tabular }: { label: string; muted?: boolean; tabular?: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center px-1.5 rounded",
      tabular && "tabular-nums",
      muted ? "text-slate-400" : "text-slate-600",
    )}>
      {label}
    </span>
  );
}

function JourneyLine({ currentIdx }: { currentIdx: number }) {
  return (
    <div className="relative">
      {/* trilha */}
      <div className="absolute top-3 left-3 right-3 h-px bg-slate-200/70" />
      {/* trilha percorrida */}
      {currentIdx > 0 && (
        <div
          className="absolute top-3 left-3 h-px bg-emerald-400/70 transition-all"
          style={{ width: `calc(${(currentIdx / (ETAPAS.length - 1)) * 100}% - 24px * ${currentIdx / (ETAPAS.length - 1)})` }}
        />
      )}
      <div className="relative grid" style={{ gridTemplateColumns: `repeat(${ETAPAS.length}, 1fr)` }}>
        {ETAPAS.map((e, i) => {
          const past = i < currentIdx;
          const current = i === currentIdx;
          return (
            <div key={e.key} className="flex flex-col items-center gap-2">
              <div className={cn(
                "h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-semibold z-10",
                past && "bg-emerald-500 text-white",
                current && "bg-indigo-500 text-white ring-4 ring-indigo-100",
                !past && !current && "bg-white text-slate-400 border border-slate-200",
              )}>
                {past ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <div className={cn(
                "text-[10px] leading-tight text-center max-w-full truncate px-1",
                current ? "font-semibold text-slate-900" : past ? "text-slate-600" : "text-slate-400",
              )}>
                {e.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick ??
        (() =>
          toast.info(label, {
            description:
              "Ação será integrada nas próximas fases sem alterar as regras dos módulos existentes.",
          }))
      }
      className="flex flex-col items-center justify-center gap-1 h-14 rounded-xl border border-slate-200/70 bg-white hover:bg-slate-50 hover:border-slate-300 transition-colors text-slate-600 hover:text-slate-900"
    >
      <span className="text-slate-500">{icon}</span>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

// Sprint 3 · S3-A — painel do Prontuário no drawer. Substitui o
// placeholder por um resumo do procedimento atual + CTA que abre o
// Atendimento IA daquele agendamento (mesma rota da Agenda Express).
function ProntuarioPanel({
  proc,
  canOpen,
  onOpen,
}: {
  proc: string | null;
  canOpen: boolean;
  onOpen: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Stethoscope className="h-4 w-4 text-indigo-500 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold text-slate-700">
            Prontuário do atendimento
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
            {proc
              ? `Abrir o prontuário deste atendimento (${proc}) para registrar evolução, exames e conduta.`
              : "Abrir o prontuário deste atendimento para registrar evolução, exames e conduta."}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        disabled={!canOpen}
        className={cn(
          "inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12px] font-medium",
          "bg-slate-900 text-white hover:bg-slate-800 transition-colors",
          "disabled:opacity-40 disabled:cursor-not-allowed",
        )}
      >
        <ArrowUpRight className="h-3.5 w-3.5" />
        Abrir prontuário completo
      </button>
      <p className="text-[10px] text-slate-400 leading-relaxed">
        A tela do prontuário abre no mesmo destino usado pela Agenda clássica e
        pela fila de Atendimento IA — nenhuma regra clínica é alterada.
      </p>
    </div>
  );
}

function AiChip({
  icon, label, hint, tone,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  tone: "info" | "warn" | "danger";
}) {
  const toneCls =
    tone === "warn" ? "bg-amber-50/60 border-amber-200/60 text-amber-800"
    : tone === "danger" ? "bg-rose-50/60 border-rose-200/60 text-rose-800"
    : "bg-slate-50 border-slate-200/60 text-slate-700";
  const iconCls =
    tone === "warn" ? "text-amber-500"
    : tone === "danger" ? "text-rose-500"
    : "text-indigo-500";
  return (
    <div className={cn("flex items-start gap-2 rounded-xl border px-3 py-2", toneCls)}>
      <span className={cn("mt-0.5", iconCls)}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium leading-tight">{label}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>
      </div>
    </div>
  );
}

function TabPlaceholder({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4 space-y-2">
      <div className="text-[11px] font-semibold text-slate-700">{title}</div>
      <p className="text-xs text-slate-500 leading-relaxed">{children}</p>
      <div className="pt-2 space-y-2">
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

// Sprint 2 · S2-A — bloco de ações de status, espelhando as transições
// disponíveis no dropdown da Agenda clássica (`mudarStatus`).
function StatusActions({
  status,
  onChange,
}: {
  status: string;
  onChange: (novo: StatusAgendamento) => void;
}) {
  const podeConfirmar = status === "agendado";
  const podeCheckin = status === "agendado" || status === "confirmado";
  const podeRealizar = status === "agendado" || status === "confirmado" || status === "em_atendimento";
  const podeCancelar = status !== "cancelado" && status !== "realizado";
  const podeFaltou = status !== "faltou" && status !== "cancelado" && status !== "realizado";
  const acoes: Array<{ key: StatusAgendamento; label: string; icon: React.ReactNode; on: boolean; cls: string }> = [
    { key: "confirmado", label: "Confirmar", icon: <Check className="h-4 w-4" />, on: podeConfirmar, cls: "text-blue-600" },
    { key: "em_atendimento", label: "Check-in", icon: <LogIn className="h-4 w-4" />, on: podeCheckin, cls: "text-indigo-600" },
    { key: "realizado", label: "Realizar", icon: <ClipboardCheck className="h-4 w-4" />, on: podeRealizar, cls: "text-emerald-600" },
    { key: "faltou", label: "Faltou", icon: <UserX className="h-4 w-4" />, on: podeFaltou, cls: "text-amber-600" },
    { key: "cancelado", label: "Cancelar", icon: <XCircle className="h-4 w-4" />, on: podeCancelar, cls: "text-rose-600" },
  ];
  const visiveis = acoes.filter((a) => a.on);
  if (visiveis.length === 0) return null;
  return (
    <div className="mb-4">
      <SectionTitle>Status</SectionTitle>
      <div className="flex flex-wrap gap-1.5">
        {visiveis.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => onChange(a.key)}
            className={cn(
              "inline-flex items-center gap-1.5 h-8 px-3 rounded-xl text-[11px] font-medium",
              "border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-colors",
              a.cls,
            )}
          >
            {a.icon}
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ResumoPanel({ proc }: { proc: string | null }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <PanelCard icon={<ClipboardCheck className="h-3.5 w-3.5" />} title="Observações" body="Sem observações registradas." />
      <PanelCard icon={<AlertTriangle className="h-3.5 w-3.5 text-rose-500" />} title="Alergias" body="Nenhuma alergia informada." tone="danger" />
      <PanelCard icon={<Wallet className="h-3.5 w-3.5" />} title="Pendências" body="Sem pendências no momento." />
      <PanelCard icon={<FileText className="h-3.5 w-3.5" />} title="Documentos" body="0 anexos" />
      <PanelCard
        icon={<Coffee className="h-3.5 w-3.5" />}
        title="Preparo do exame"
        body={proc ? `${proc} — verificar preparo.` : "Sem preparo específico."}
      />
      <PanelCard icon={<CalendarClock className="h-3.5 w-3.5" />} title="Retorno previsto" body="Sem retorno agendado." />
    </div>
  );
}

function PanelCard({
  icon, title, body, tone,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  tone?: "danger";
}) {
  return (
    <div className={cn(
      "rounded-xl border p-3 space-y-1",
      tone === "danger" ? "border-rose-100 bg-rose-50/30" : "border-slate-100 bg-white",
    )}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        <span className="text-slate-500">{icon}</span> {title}
      </div>
      <p className="text-[11px] text-slate-600 leading-snug">{body}</p>
    </div>
  );
}