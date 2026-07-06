import { HhpDrawer } from "@/design-system/hhp";
import { Badge } from "@/components/ui/badge";
import {
  Check, Clock, User, Stethoscope, TestTube, FileText, LogOut, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ETAPAS = [
  { key: "agendado", label: "Agendamento", icon: Clock },
  { key: "aguardando_recepcao", label: "Check-in", icon: User },
  { key: "recepcao", label: "Recepção", icon: User },
  { key: "caixa", label: "Pagamento", icon: FileText },
  { key: "triagem", label: "Triagem", icon: Stethoscope },
  { key: "atendimento", label: "Atendimento", icon: Stethoscope },
  { key: "exame", label: "Exames", icon: TestTube },
  { key: "finalizado", label: "Alta", icon: LogOut },
] as const;

export interface TimelineData {
  paciente_nome: string;
  etapa_atual: string | null;
  historico: Array<{ etapa: string; timestamp: string; responsavel?: string | null }>;
}

export function PatientTimelineDrawer({
  open, onOpenChange, data,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: TimelineData | null;
}) {
  const currentIdx = data ? ETAPAS.findIndex((e) => e.key === data.etapa_atual) : -1;

  const progresso = currentIdx >= 0
    ? Math.round(((currentIdx + 1) / ETAPAS.length) * 100)
    : 0;

  return (
    <HhpDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={data?.paciente_nome ?? "Linha do tempo do paciente"}
      description="Linha do tempo do paciente"
      hiddenTitle={false}
      side="right"
      maxWidth="28rem"
    >
        {/* Cabeçalho com identidade forte */}
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 border-b">
          <div className="text-left space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-primary font-semibold">
              Linha do tempo do paciente
            </div>
            <div className="text-xl font-semibold">
              {data?.paciente_nome ?? "—"}
            </div>
          </div>
          {data && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                <span>Progresso do fluxo</span>
                <span className="tabular-nums font-medium text-foreground">{progresso}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-primary/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-500"
                  style={{ width: `${progresso}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-5">
          {!data ? (
            <div className="text-sm text-muted-foreground">Selecione um paciente.</div>
          ) : (
            <ol className="relative space-y-1">
              {ETAPAS.map((etapa, i) => {
                const past = i < currentIdx;
                const current = i === currentIdx;
                const Icon = etapa.icon;
                const evento = data.historico.find((h) => h.etapa === etapa.key);
                const isLast = i === ETAPAS.length - 1;
                return (
                  <li key={etapa.key} className="flex gap-3 relative">
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          "h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-all",
                          past && "bg-emerald-500 text-white shadow-[0_2px_8px_rgba(16,185,129,0.35)]",
                          current && "bg-primary text-primary-foreground shadow-[0_2px_10px_hsl(var(--primary)/0.4)] ring-4 ring-primary/15",
                          !past && !current && "bg-muted text-muted-foreground/60 border border-border/60",
                        )}
                      >
                        {past ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                      </div>
                      {!isLast && (
                        <div
                          className={cn(
                            "w-0.5 flex-1 min-h-6 my-1",
                            past ? "bg-emerald-500/70" : "bg-border",
                          )}
                        />
                      )}
                    </div>
                    <div className="flex-1 pb-5 pt-1">
                      <div className={cn(
                        "text-sm flex items-center gap-2",
                        current ? "font-semibold text-foreground" : past ? "font-medium text-foreground/90" : "font-medium text-muted-foreground",
                      )}>
                        {etapa.label}
                        {current && (
                          <Badge className="text-[10px] px-1.5 h-4 bg-primary/15 text-primary hover:bg-primary/15 border-0">
                            atual
                          </Badge>
                        )}
                        {past && (
                          <Badge variant="outline" className="text-[10px] px-1.5 h-4 bg-emerald-50 text-emerald-700 border-emerald-200">
                            concluído
                          </Badge>
                        )}
                      </div>
                      {evento ? (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {new Date(evento.timestamp).toLocaleString("pt-BR")}
                          {evento.responsavel && ` · ${evento.responsavel}`}
                        </div>
                      ) : !past && !current ? (
                        <div className="text-[11px] text-muted-foreground/60 mt-0.5">pendente</div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="mt-6 rounded-lg border border-primary/15 bg-primary/[0.03] p-3 text-xs text-muted-foreground flex gap-2">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <b className="text-foreground">Fase 1:</b> visualização apenas. Ações contextuais
              (concluir etapa, anotar, reagendar) entram nas próximas fases conforme o planejamento.
            </div>
          </div>
        </div>
    </HhpDrawer>
  );
}