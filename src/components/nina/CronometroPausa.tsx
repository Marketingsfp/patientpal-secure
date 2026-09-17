import { useEffect, useState } from "react";
import { formatarTempoPausa } from "@/lib/atendimento/cronometro-pausa";

export function CronometroPausa({ inicio }: { inicio: string }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const atualizar = () => setAgora(Date.now());
    atualizar();
    const intervalo = window.setInterval(atualizar, 1000);
    document.addEventListener("visibilitychange", atualizar);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", atualizar);
    };
  }, [inicio]);
  return (
    <div className="grid grid-cols-3 gap-1">
      <span
        role="timer"
        aria-label="Tempo desde o início da pausa"
        aria-live="off"
        title="A contagem termina ao clicar em Online"
        className="col-start-2 inline-flex h-7 items-center justify-center rounded-md border border-atd-warn/40 bg-background px-1 text-[11px] font-medium tabular-nums text-atd-warn-ink"
      >
        {formatarTempoPausa(inicio, agora)}
      </span>
    </div>
  );
}
