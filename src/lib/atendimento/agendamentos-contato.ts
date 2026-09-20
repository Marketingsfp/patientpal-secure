import { dataClinicaDe, hojeBR } from "@/lib/date-utils";

export type AgendamentoContato = {
  id: string;
  inicio?: string | null;
  status?: string | null;
  procedimento?: string | null;
  tipo_atendimento?: string | null;
  medico_nome?: string | null;
};

/** Hoje inteiro continua visível; datas anteriores e cancelamentos saem só deste painel. */
export function filtrarAgendamentosContato<T extends AgendamentoContato>(
  agendamentos: readonly T[],
  hoje = hojeBR(),
): T[] {
  return agendamentos.filter((a) => {
    const dia = dataClinicaDe(a.inicio);
    return dia !== null && dia >= hoje && a.status !== "cancelado";
  });
}
