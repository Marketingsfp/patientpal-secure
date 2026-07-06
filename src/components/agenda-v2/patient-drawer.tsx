import { useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Play, DollarSign, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DrawerPatientData {
  paciente_nome: string;
  paciente_avatar_url?: string | null;
  resumo_clinico?: string | null;   // "42a · Unimed · Cardiologia · Dra. Ana · chegou 09:28"
  etapa_atual: string | null;
  historico: Array<{ etapa: string; timestamp: string }>;
  proc_titulo?: string | null;
  hora?: string | null;
}

const ETAPAS = [
  { key: "agendado", label: "Agendamento" },
  { key: "aguardando_recepcao", label: "Check-in" },
  { key: "recepcao", label: "Recepção" },
  { key: "caixa", label: "Pagamento" },
  { key: "triagem", label: "Triagem" },
  { key: "atendimento", label: "Atendimento" },
  { key: "exame", label: "Exames" },
  { key: "finalizado", label: "Alta" },
] as const;

type Tab = "financeiro" | "docs" | "historico" | "prontuario";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

/**
 * Drawer padrão do paciente (rev.3):
 * - foto 96px, nome 24px em Inter Tight
 * - linha compacta de resumo clínico logo abaixo do nome
 * - timeline vertical de etapas
 * - CTAs "Iniciar atendimento" e "Pagar"
 * - abas segmentadas: Financeiro · Docs · Histórico · Prontuário
 */
export function PatientDrawer({
  open, onOpenChange, data,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: DrawerPatientData | null;
}) {
  const [tab, setTab] = useState<Tab>("financeiro");
  const idx = data ? ETAPAS.findIndex((e) => e.key === data.etapa_atual) : -1;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto p-0 bg-white">
        <VisuallyHidden.Root>
          <SheetTitle>{data?.paciente_nome ?? "Paciente"}</SheetTitle>
          <SheetDescription>Resumo clínico, jornada e ações rápidas.</SheetDescription>
        </VisuallyHidden.Root>
        {data && (
          <>
            <div className="px-6 pt-8 pb-5 border-b border-slate-100">
              <div className="flex items-start gap-4">
                <Avatar className="h-24 w-24 border border-slate-200/80 shadow-sm">
                  {data.paciente_avatar_url && <AvatarImage src={data.paciente_avatar_url} alt={data.paciente_nome} />}
                  <AvatarFallback className="bg-slate-50 text-slate-500 text-2xl font-semibold">
                    {initials(data.paciente_nome)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 pt-1">
                  <h2
                    className="text-2xl font-semibold text-slate-900 truncate"
                    style={{ fontFamily: "'Inter Tight', Inter, sans-serif", letterSpacing: "-0.01em" }}
                  >
                    {data.paciente_nome}
                  </h2>
                  {data.resumo_clinico && (
                    <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                      {data.resumo_clinico}
                    </p>
                  )}
                  {(data.proc_titulo || data.hora) && (
                    <p className="mt-2 text-[11px] uppercase tracking-widest text-slate-400">
                      {[data.hora, data.proc_titulo].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
                >
                  <Play className="h-3.5 w-3.5" /> Iniciar atendimento
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  <DollarSign className="h-3.5 w-3.5" /> Pagar
                </button>
              </div>
            </div>

            <div className="px-6 py-5 border-b border-slate-100">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
                Jornada do paciente
              </div>
              <ol className="relative space-y-2">
                {ETAPAS.map((e, i) => {
                  const past = i < idx;
                  const current = i === idx;
                  const isLast = i === ETAPAS.length - 1;
                  return (
                    <li key={e.key} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          "h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-semibold",
                          past && "bg-emerald-500 text-white",
                          current && "bg-indigo-500 text-white ring-4 ring-indigo-100 animate-pulse",
                          !past && !current && "bg-slate-100 text-slate-400 border border-slate-200/60",
                        )}>
                          {past ? <Check className="h-3 w-3" /> : i + 1}
                        </div>
                        {!isLast && (
                          <div className={cn("w-px flex-1 min-h-4 my-1", past ? "bg-emerald-300" : "bg-slate-200/70")} />
                        )}
                      </div>
                      <div className="flex-1 pb-2 pt-0.5">
                        <div className={cn(
                          "text-[13px]",
                          current ? "font-semibold text-slate-900" : past ? "text-slate-700" : "text-slate-400",
                        )}>
                          {e.label}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="px-6 py-4">
              <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-4">
                {([
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
                      "flex-1 h-8 rounded-lg text-[12px] font-medium transition-all",
                      tab === t.key
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="min-h-[120px] text-sm text-slate-500 rounded-xl border border-slate-100 bg-slate-50/40 p-4">
                {tab === "financeiro" && (
                  <div className="space-y-2">
                    <div className="flex justify-between"><span>Total previsto</span><span className="tabular-nums text-slate-700 font-semibold">—</span></div>
                    <div className="flex justify-between"><span>Pago</span><span className="tabular-nums text-emerald-600 font-semibold">—</span></div>
                    <div className="flex justify-between"><span>Em aberto</span><span className="tabular-nums text-amber-600 font-semibold">—</span></div>
                    <p className="pt-2 text-[11px] text-slate-400 border-t border-slate-100">
                      Fase A · pré-visualização. Integração real na Fase B.
                    </p>
                  </div>
                )}
                {tab === "docs" && (<p>Anamneses, receitas e atestados serão listados aqui.</p>)}
                {tab === "historico" && (
                  <ol className="space-y-2">
                    {data.historico.length === 0 ? (
                      <p className="text-slate-400">Sem eventos registrados.</p>
                    ) : data.historico.map((h, i) => (
                      <li key={i} className="flex justify-between text-xs">
                        <span>{h.etapa.replace(/_/g, " ")}</span>
                        <span className="text-slate-400 tabular-nums">{new Date(h.timestamp).toLocaleString("pt-BR")}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {tab === "prontuario" && (<p>Últimas evoluções, exames e sinais vitais.</p>)}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}