import { Coffee } from "lucide-react";
import type { FilaIndividualAtencao, PausaAtencao } from "@/lib/atendimento/central-atencao";
import { cn } from "@/lib/utils";
import { TempoPausa } from "./CronometroPausa";

export function AtendentesEmPausa({
  pausas,
  filas,
  selecionada,
  onSelecionar,
}: {
  pausas: PausaAtencao[];
  filas: FilaIndividualAtencao[];
  selecionada?: string;
  onSelecionar: (atendente: { id: string; nome: string }) => void;
}) {
  if (!pausas.length) return null;
  const totais = new Map(filas.map((fila) => [fila.atendenteId, fila.total]));
  return (
    <div className="mb-1">
      <p className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">
        Atendentes em pausa
      </p>
      <ul className="max-h-48 space-y-0.5 overflow-y-auto">
        {pausas.map((pausa) => {
          const total = totais.get(pausa.atendenteId) ?? 0;
          return (
            <li key={pausa.atendenteId}>
              <button
                type="button"
                aria-pressed={selecionada === pausa.atendenteId}
                aria-label={`${pausa.nome}, em pausa, ${total} ${total === 1 ? "conversa não atribuída" : "conversas não atribuídas"}`}
                onClick={() => onSelecionar({ id: pausa.atendenteId, nome: pausa.nome })}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted",
                  selecionada === pausa.atendenteId && "bg-muted",
                )}
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-atd-warn/15 text-atd-warn-ink">
                  <Coffee className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium" title={pausa.nome}>
                    {pausa.nome}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    <span className="font-semibold tabular-nums">{total}</span>{" "}
                    {total === 1 ? "não atribuída" : "não atribuídas"}
                  </span>
                </span>
                <TempoPausa
                  inicio={pausa.inicio}
                  atendente={pausa.nome}
                  className="min-w-[4.5rem] px-1.5"
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
