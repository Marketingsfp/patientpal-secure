import { useState } from "react";
import { ChevronDown, ChevronRight, Clock, User, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TIPO_SESSAO_COR, TIPO_SESSAO_LABEL, type TipoSessao } from "@/lib/agenda-v2/session-detect";

export interface SessionItem {
  id: string;
  procedimento_nome: string;
  status?: string | null;
  preparo?: string | null;
}

export interface SessionCardData {
  pacote_id: string;
  paciente_nome: string;
  paciente_id: string | null;
  medico_nome: string | null;
  recurso_nome: string | null;
  inicio: string;
  fim: string;
  tipo: TipoSessao;
  status: string;
  is_encaixe?: boolean;
  items: SessionItem[];
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function SessionCard({
  data, onOpenTimeline,
}: {
  data: SessionCardData;
  onOpenTimeline: (pacoteId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const multi = data.items.length > 1;
  const isLab = data.tipo === "coleta_laboratorial";

  const titulo = isLab
    ? `Coleta Laboratorial · ${data.items.length} ${data.items.length === 1 ? "exame" : "exames"}`
    : data.items[0]?.procedimento_nome ?? TIPO_SESSAO_LABEL[data.tipo];

  return (
    <div className={cn("rounded-lg border p-3 hover:shadow-sm transition-shadow", TIPO_SESSAO_COR[data.tipo])}>
      <div className="flex items-start gap-3">
        <div className="text-xs font-medium tabular-nums w-20 shrink-0 flex items-center gap-1">
          <Clock className="h-3.5 w-3.5 opacity-70" />
          {fmt(data.inicio)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              className="font-medium truncate hover:underline text-left"
              onClick={() => onOpenTimeline(data.pacote_id)}
            >
              {data.paciente_nome}
            </button>
            <Badge variant="outline" className="text-[10px] bg-white/70">
              {TIPO_SESSAO_LABEL[data.tipo]}
            </Badge>
            {data.is_encaixe && (
              <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-900 border-amber-300">
                ⏱ Encaixe
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] bg-white/70 capitalize">
              {data.status}
            </Badge>
          </div>
          <div className="text-xs mt-0.5 opacity-80 flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <span className="opacity-70">•</span> {titulo}
            </span>
            {data.medico_nome && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" /> {data.medico_nome}
              </span>
            )}
            {data.recurso_nome && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {data.recurso_nome}
              </span>
            )}
          </div>
        </div>

        {multi && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 -mr-2"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="text-xs ml-1">{open ? "recolher" : "expandir"}</span>
          </Button>
        )}
      </div>

      {multi && open && (
        <ul className="mt-2 pl-24 space-y-1 border-t border-current/10 pt-2">
          {data.items.map((it) => (
            <li key={it.id} className="text-xs flex items-center gap-2">
              <span className="opacity-60">›</span>
              <span className="truncate">{it.procedimento_nome}</span>
              {it.status && (
                <Badge variant="outline" className="text-[9px] bg-white/60 capitalize">
                  {it.status}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}