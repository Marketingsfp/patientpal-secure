// Stub temporário — arquivo ficou corrompido por conflitos de merge.
// A agenda V2 é experimental (atrás de feature flag). Reintegrar depois.
import type { StatusAgendamento } from "@/lib/agenda/status-agendamento.functions";

export interface DrawerPatientData {
  paciente_id?: string | null;
  paciente_nome: string;
  paciente_avatar_url?: string | null;
  medico_nome?: string | null;
  especialidade?: string | null;
  status?: string | null;
  chegou_em?: string | null;
  etapa_atual: string | null;
  historico: Array<{ etapa: string; timestamp: string }>;
  proc_titulo?: string | null;
  hora?: string | null;
  agendamento_ids?: string[];
}

export function PatientDrawer(_props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: DrawerPatientData | null;
  onChangeStatus?: (agendamentoIds: string[], novoStatus: StatusAgendamento) => void;
  onOpenProntuario?: (agendamentoId: string) => void;
  onReagendar?: (agendamentoId: string) => void;
}) {
  return null;
}
