import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useFichaPresence } from "@/hooks/use-ficha-presence";

function fmtDuracao(desdeMs: number): string {
  const seg = Math.max(0, Math.floor((Date.now() - desdeMs) / 1000));
  if (seg < 60) return `há ${seg}s`;
  const min = Math.floor(seg / 60);
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  return `há ${h}h${String(min % 60).padStart(2, "0")}`;
}

/**
 * Faixa de alerta exibida no topo de um diálogo/drawer de ficha quando
 * outro(s) usuário(s) já estão com a mesma ficha aberta. Se ninguém mais
 * está, não renderiza nada.
 */
export function FichaEmUsoAlert({ agendamentoId }: { agendamentoId: string | null | undefined }) {
  const { outros } = useFichaPresence(agendamentoId);
  // Força re-render a cada 15s para atualizar o "há Ns"
  const [, setTick] = useState(0);
  useEffect(() => {
    if (outros.length === 0) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 15_000);
    return () => window.clearInterval(t);
  }, [outros.length]);

  if (outros.length === 0) return null;

  const um = outros[0];
  const resto = outros.length - 1;
  const texto = resto > 0
    ? `${um.nome} e mais ${resto} usuário(s) estão com esta ficha aberta`
    : `${um.nome} já está com esta ficha aberta ${fmtDuracao(um.entrou_em)}`;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-xs mb-3">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="font-semibold uppercase tracking-wide text-[11px]">Ficha em uso simultâneo</div>
        <div>{texto}. Alterações feitas ao mesmo tempo podem se sobrescrever.</div>
      </div>
    </div>
  );
}