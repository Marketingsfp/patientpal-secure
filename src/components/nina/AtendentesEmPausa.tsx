import { Coffee, DoorOpen } from "lucide-react";
import type { PausaAtencao } from "@/lib/atendimento/central-atencao";
import { TempoPausa } from "./CronometroPausa";

const SECOES: { tipo: PausaAtencao["tipo"]; titulo: string; rotulo: string }[] = [
  { tipo: "PAUSA", titulo: "Atendentes em pausa", rotulo: "em pausa" },
  { tipo: "PAUSA_SAIDA", titulo: "Atendentes em pausa para almoço", rotulo: "em pausa para almoço" },
];

export function AtendentesEmPausa({ pausas }: { pausas: PausaAtencao[] }) {
  if (!pausas.length) return null;
  return (
    <>
      {SECOES.map(({ tipo, titulo, rotulo }) => {
        const grupo = pausas.filter((pausa) => (pausa.tipo ?? "PAUSA") === tipo);
        if (!grupo.length) return null;
        const Icone = tipo === "PAUSA_SAIDA" ? DoorOpen : Coffee;
        return (
          <div className="mb-1" key={tipo}>
            <p className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">
              {titulo} <span className="tabular-nums">({grupo.length})</span>
            </p>
            <ul className="max-h-48 space-y-0.5 overflow-y-auto">
              {grupo.map((pausa) => (
                <li
                  key={pausa.atendenteId}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-atd-warn/15 text-atd-warn-ink">
                    <Icone className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium" title={pausa.nome}>
                      {pausa.nome}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">{rotulo}</span>
                  </span>
                  <TempoPausa
                    inicio={pausa.inicio}
                    atendente={pausa.nome}
                    className="min-w-[4.5rem] px-1.5"
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}
