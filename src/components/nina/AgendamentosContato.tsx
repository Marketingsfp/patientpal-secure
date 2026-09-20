import { useEffect, useState } from "react";
import { hojeBR, janelaDiaClinica } from "@/lib/date-utils";
import { formatarDataHoraMensagem } from "@/lib/atendimento/data-hora";
import {
  filtrarAgendamentosContato,
  type AgendamentoContato,
} from "@/lib/atendimento/agendamentos-contato";

export function AgendamentosContato({ agendamentos }: { agendamentos: AgendamentoContato[] }) {
  const [hoje, setHoje] = useState(hojeBR);
  useEffect(() => {
    const atualizar = () => setHoje(hojeBR());
    // Remove o dia anterior mesmo que a atendente deixe o mesmo chat aberto à meia-noite.
    const timer = setTimeout(
      atualizar,
      Math.max(0, Date.parse(janelaDiaClinica(hoje).fimExclusivo) - Date.now()) + 50,
    );
    document.addEventListener("visibilitychange", atualizar);
    window.addEventListener("focus", atualizar);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", atualizar);
      window.removeEventListener("focus", atualizar);
    };
  }, [hoje]);
  const visiveis = filtrarAgendamentosContato(agendamentos, hoje);
  if (visiveis.length === 0) return null;
  return (
    <section>
      <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Agendamentos</div>
      {visiveis.map((a) => (
        <div key={a.id} className="text-xs border rounded p-2 mb-1 space-y-0.5">
          <div className="font-medium">{a.procedimento || a.tipo_atendimento || "Consulta"}</div>
          <div className="text-muted-foreground">Médico: {a.medico_nome || "não definido"}</div>
          <div className="text-muted-foreground">
            {formatarDataHoraMensagem(a.inicio)} · {a.status}
          </div>
        </div>
      ))}
    </section>
  );
}
