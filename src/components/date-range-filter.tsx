import { useMemo, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type DateRange = { from: string; to: string };
export type DatePreset = "hoje" | "semana" | "quinzena" | "mes" | "periodo";

const toISO = (d: Date) => {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const y = x.getFullYear(); const m = String(x.getMonth() + 1).padStart(2, "0"); const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export function computeRange(preset: DatePreset, ref: Date = new Date()): DateRange {
  const today = new Date(ref); today.setHours(0, 0, 0, 0);
  if (preset === "hoje") return { from: toISO(today), to: toISO(today) };
  if (preset === "semana") {
    const dow = today.getDay(); // 0 = dom
    const start = new Date(today); start.setDate(today.getDate() - dow);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return { from: toISO(start), to: toISO(end) };
  }
  if (preset === "quinzena") {
    const d = today.getDate();
    if (d <= 15) {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 15);
      return { from: toISO(start), to: toISO(end) };
    }
    const start = new Date(today.getFullYear(), today.getMonth(), 16);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from: toISO(start), to: toISO(end) };
  }
  // mes
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { from: toISO(start), to: toISO(end) };
}

export interface DateRangeFilterProps {
  value: DateRange;
  preset: DatePreset;
  onChange: (range: DateRange, preset: DatePreset) => void;
  className?: string;
}

export function DateRangeFilter({ value, preset, onChange, className }: DateRangeFilterProps) {
  const [openFrom, setOpenFrom] = useState(false);
  const [openTo, setOpenTo] = useState(false);
  const fromDate = useMemo(() => (value.from ? new Date(value.from + "T00:00:00") : undefined), [value.from]);
  const toDate = useMemo(() => (value.to ? new Date(value.to + "T00:00:00") : undefined), [value.to]);

  const setPreset = (p: DatePreset) => {
    if (p === "periodo") { onChange(value, "periodo"); return; }
    onChange(computeRange(p), p);
  };

  return (
    <div className={cn("flex flex-col sm:flex-row gap-2 items-start sm:items-center", className)}>
      <Tabs value={preset} onValueChange={(v) => setPreset(v as DatePreset)}>
        <TabsList>
          <TabsTrigger value="hoje">Dia</TabsTrigger>
          <TabsTrigger value="semana">Semana</TabsTrigger>
          <TabsTrigger value="quinzena">Quinzena</TabsTrigger>
          <TabsTrigger value="mes">Mês</TabsTrigger>
          <TabsTrigger value="periodo">Período</TabsTrigger>
        </TabsList>
      </Tabs>
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
              <Calendar mode="single" selected={fromDate} onSelect={(d) => { if (d) { onChange({ from: toISO(d), to: value.to || toISO(d) }, "periodo"); setOpenFrom(false); } }} initialFocus className={cn("p-3 pointer-events-auto")} />
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
              <Calendar mode="single" selected={toDate} onSelect={(d) => { if (d) { onChange({ from: value.from || toISO(d), to: toISO(d) }, "periodo"); setOpenTo(false); } }} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}