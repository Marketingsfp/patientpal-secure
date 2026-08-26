import { AlertTriangle } from "lucide-react";
import { isPacienteDistante } from "@/lib/paciente-distancia";

/**
 * Badge de alta visibilidade para pacientes de municípios distantes.
 * Não renderiza nada para cidades vizinhas ou cidade não informada.
 */
export function BadgePacienteDistante({
  cidade,
  compact,
  className = "",
}: {
  cidade: string | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  if (!isPacienteDistante(cidade)) return null;
  const nome = (cidade ?? "").trim();
  return (
    <span
      title={`Paciente de outro município: ${nome}`}
      className={`shrink-0 max-w-full overflow-hidden bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 tracking-wide flex items-center gap-1 animate-pulse ${
        compact
          ? "px-1 py-0.5 text-[10px] font-semibold rounded"
          : "px-3 py-1 text-xs font-bold rounded-full"
      } ${className}`}
    >
      <AlertTriangle className={compact ? "h-2.5 w-2.5 shrink-0" : "h-3.5 w-3.5"} />
      <span className="truncate">
        {compact ? nome.toUpperCase() : `PACIENTE DE LONGE: ${nome}`}
      </span>
    </span>
  );
}
