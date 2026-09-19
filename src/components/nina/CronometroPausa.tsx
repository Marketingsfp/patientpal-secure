import { formatarTempoPausa } from "@/lib/atendimento/cronometro-pausa";
import { useRelogioPausa } from "@/hooks/use-relogio-pausa";
import { cn } from "@/lib/utils";

export function TempoPausa({
  inicio,
  className,
  atendente,
}: {
  inicio: string | null;
  className?: string;
  atendente?: string;
}) {
  const agora = useRelogioPausa();
  const disponivel = inicio !== null && Number.isFinite(Date.parse(inicio)) && agora > 0;
  return (
    <span
      role="timer"
      aria-label={atendente ? `Tempo de pausa de ${atendente}` : "Tempo desde o início da pausa"}
      aria-live="off"
      title={disponivel ? "A contagem termina ao clicar em Online ou Offline" : "Tempo de pausa indisponível"}
      className={cn(
        "inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-atd-warn/40 bg-background px-1 text-[11px] font-medium tabular-nums text-atd-warn-ink",
        className,
      )}
    >
      {disponivel ? formatarTempoPausa(inicio, agora) : "—"}
    </span>
  );
}

export function CronometroPausa({ inicio }: { inicio: string }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      <TempoPausa inicio={inicio} className="col-start-2" />
    </div>
  );
}
