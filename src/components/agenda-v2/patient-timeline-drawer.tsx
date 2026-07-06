import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Check, Clock, User, Stethoscope, TestTube, FileText, LogOut } from "lucide-react";
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Linha do tempo do paciente</SheetTitle>
          {data && (
            <div className="text-sm text-muted-foreground">{data.paciente_nome}</div>
          )}
        </SheetHeader>

        {!data ? (
          <div className="p-6 text-sm text-muted-foreground">Selecione um paciente.</div>
        ) : (
          <ol className="mt-6 space-y-4">
            {ETAPAS.map((etapa, i) => {
              const past = i < currentIdx;
              const current = i === currentIdx;
              const Icon = etapa.icon;
              const evento = data.historico.find((h) => h.etapa === etapa.key);
              return (
                <li key={etapa.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "h-8 w-8 rounded-full border-2 flex items-center justify-center",
                        past && "bg-emerald-500 border-emerald-500 text-white",
                        current && "bg-primary border-primary text-primary-foreground animate-pulse",
                        !past && !current && "border-muted-foreground/30 text-muted-foreground",
                      )}
                    >
                      {past ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    {i < ETAPAS.length - 1 && (
                      <div className={cn("w-0.5 flex-1 min-h-4", past ? "bg-emerald-500" : "bg-muted-foreground/20")} />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="text-sm font-medium flex items-center gap-2">
                      {etapa.label}
                      {current && <Badge variant="default" className="text-[10px]">atual</Badge>}
                    </div>
                    {evento && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Date(evento.timestamp).toLocaleString("pt-BR")}
                        {evento.responsavel && ` · ${evento.responsavel}`}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div className="mt-6 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          <b>Fase 1:</b> visualização apenas. Ações contextuais (concluir etapa, anotar,
          reagendar) entram nas Fases seguintes conforme o planejamento.
        </div>
      </SheetContent>
    </Sheet>
  );
}