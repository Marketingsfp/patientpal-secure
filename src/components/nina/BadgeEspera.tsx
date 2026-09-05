import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Clock } from "lucide-react";
import {
  CLASSE_ESPERA_ATD,
  faixaEsperaAtd,
  formatarEspera,
  minutosDesde,
  rotuloEspera,
} from "@/lib/atendimento/espera";
import { cn } from "@/lib/utils";

/**
 * Relógio único da tela: um só intervalo (30s) alimenta TODOS os indicadores
 * de espera. Nada de um timer por conversa nem de consulta ao banco por
 * segundo — o instante inicial vem do servidor e o tempo é calculado aqui.
 */
const RelogioCtx = createContext<number>(0);

export function RelogioEsperaProvider({ children }: { children: ReactNode }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return <RelogioCtx.Provider value={agora}>{children}</RelogioCtx.Provider>;
}

function useAgora() {
  const ctx = useContext(RelogioCtx);
  // Fora do provider (uso isolado) ainda funciona, só sem atualizar sozinho.
  return ctx || Date.now();
}

/**
 * Indicador "🕒 8 min". Não renderiza nada quando não há espera pendente
 * (atendente já respondeu, Nina respondeu, conversa fechada).
 */
export function BadgeEspera({
  desde,
  className,
  prefixo,
}: {
  desde?: string | null;
  className?: string;
  prefixo?: string;
}) {
  const agora = useAgora();
  if (!desde) return null;
  const min = minutosDesde(desde, agora);
  const faixa = faixaEsperaAtd(min);
  return (
    <span
      role="status"
      title={rotuloEspera(min)}
      aria-label={rotuloEspera(min)}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] tabular-nums",
        CLASSE_ESPERA_ATD[faixa],
        className,
      )}
    >
      <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>
        {prefixo ? `${prefixo} ` : ""}
        {formatarEspera(min)}
      </span>
    </span>
  );
}
