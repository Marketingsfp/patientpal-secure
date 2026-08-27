/**
 * Seletor de período compartilhado pelo Dashboard, Estatísticas e Relatórios.
 *
 * As pílulas Dia/Semana/Quinzena/Mês aplicam o intervalo sozinhas; só
 * "Período" abre os dois campos de data. A conta de cada recorte e o texto das
 * dicas vivem em `@/lib/financeiro/preset-periodo`, que é código puro e tem
 * teste — aqui fica só a montagem da tela.
 *
 * Cada pílula anuncia, ao passar o mouse ou pelo teclado, o intervalo exato em
 * dd/mm/aaaa que ela vai aplicar, e o intervalo selecionado fica escrito
 * embaixo do seletor. Antes disso a pílula dizia apenas "Semana" e não havia
 * como saber, sem clicar e conferir o resultado, se a semana começava no
 * domingo, se a quinzena era 1–15 ou os últimos quinze dias, nem em que dia o
 * mês fechava — dúvida que aparecia toda vez que alguém ia conferir caixa.
 */
import { useMemo, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  computeRange,
  descricaoDoPreset,
  ROTULO_PRESET,
  type DatePreset,
  type DateRange,
} from "@/lib/financeiro/preset-periodo";
import { cn } from "@/lib/utils";

// Reexportados para as telas que já importavam daqui (Estatísticas, Relatórios)
// não precisarem trocar o caminho do import.
export { computeRange };
export type { DateRange, DatePreset };

/** Ordem das pílulas na barra. */
const PRESETS: DatePreset[] = ["hoje", "semana", "quinzena", "mes", "periodo"];

export interface DateRangeFilterProps {
  value: DateRange;
  preset: DatePreset;
  onChange: (range: DateRange, preset: DatePreset) => void;
  className?: string;
}

export function DateRangeFilter({ value, preset, onChange, className }: DateRangeFilterProps) {
  const [openFrom, setOpenFrom] = useState(false);
  const [openTo, setOpenTo] = useState(false);
  const fromDate = useMemo(
    () => (value.from ? new Date(value.from + "T00:00:00") : undefined),
    [value.from],
  );
  const toDate = useMemo(
    () => (value.to ? new Date(value.to + "T00:00:00") : undefined),
    [value.to],
  );

  // Uma descrição por pílula, recalculada quando as datas mudam: só a de
  // "Período" depende do que está digitado, mas todas dependem do dia de hoje.
  const descricoes = useMemo(
    () => PRESETS.map((p) => ({ preset: p, ...descricaoDoPreset(p, value) })),
    [value],
  );
  const selecionada = descricoes.find((d) => d.preset === preset);

  const setPreset = (p: DatePreset) => {
    if (p === "periodo") {
      onChange(value, "periodo");
      return;
    }
    onChange(computeRange(p), p);
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
        <TooltipProvider delayDuration={150}>
          <Tabs value={preset} onValueChange={(v) => setPreset(v as DatePreset)}>
            <TabsList>
              {descricoes.map((d) => (
                <Tooltip key={d.preset}>
                  <TooltipTrigger asChild>
                    <TabsTrigger value={d.preset}>{ROTULO_PRESET[d.preset]}</TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-64 px-3 py-2 text-xs">
                    <p className="font-semibold">{d.resumo}</p>
                    <p className="mt-1 opacity-80">
                      {d.regra} ({d.duracao})
                    </p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </TabsList>
          </Tabs>
        </TooltipProvider>
        {preset === "periodo" && (
          <div className="flex items-center gap-2">
            <Popover open={openFrom} onOpenChange={setOpenFrom}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="justify-start font-normal">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {fromDate ? format(fromDate, "dd/MM/yyyy", { locale: ptBR }) : "De"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={fromDate}
                  onSelect={(d) => {
                    if (d) {
                      onChange({ from: toISO(d), to: value.to || toISO(d) }, "periodo");
                      setOpenFrom(false);
                    }
                  }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground text-sm">até</span>
            <Popover open={openTo} onOpenChange={setOpenTo}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="justify-start font-normal">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {toDate ? format(toDate, "dd/MM/yyyy", { locale: ptBR }) : "Até"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={toDate}
                  onSelect={(d) => {
                    if (d) {
                      onChange({ from: value.from || toISO(d), to: toISO(d) }, "periodo");
                      setOpenTo(false);
                    }
                  }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>
      {/* Mesma informação da dica, sempre visível: quem usa no celular ou na
          tela de toque da recepção não tem "passar o mouse". */}
      {selecionada && (
        <p className="text-xs text-muted-foreground">
          {selecionada.titulo}:{" "}
          <span className="font-medium tabular-nums">{selecionada.intervalo}</span> (
          {selecionada.duracao})
        </p>
      )}
    </div>
  );
}

/** Data local em `YYYY-MM-DD` — o calendário devolve `Date`, o filtro usa texto. */
const toISO = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
