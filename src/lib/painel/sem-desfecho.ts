// Agendamento "sem desfecho" — o dia já acabou e o paciente nunca passou pelo
// balcão (continua "agendado"/"confirmado", sem check-in).
//
// O Dashboard operacional conta esses agendamentos como FALTA, junto com os
// marcados "faltou". É só leitura: o banco continua como está, então caixa,
// repasse e relatórios não mudam. "Confirmado" entra porque também vem da
// resposta do paciente no WhatsApp/site — não quer dizer que ele chegou.
// Pagamento não interfere: pago adiantado e não veio também é falta.
//
// A mesma regra está em SQL na função `painel_medicos_periodo` (migração
// 20261007200000_painel_faltas_sem_desfecho.sql). Mudou aqui, mude lá.

import { dataClinicaDe } from "@/lib/date-utils";
import { ehVagaLivre } from "@/lib/agenda/vaga-livre";
import { ehBloqueio } from "@/lib/painel/cards-do-dia";

/** Dias encerrados que o aviso do Dashboard olha (sem contar hoje). */
export const DIAS_AVISO_SEM_DESFECHO = 7;

type FichaMin = {
  inicio: string | null;
  status: string;
  fluxo_etapa: string | null;
  paciente_nome: string | null;
  paciente_id?: string | null;
};

export function ficouSemDesfecho(a: FichaMin, hoje: string): boolean {
  const dia = dataClinicaDe(a.inicio);
  if (!dia || dia >= hoje) return false;
  if (a.status !== "agendado" && a.status !== "confirmado") return false;
  if (a.fluxo_etapa && a.fluxo_etapa !== "aguardando_recepcao") return false;
  return !ehVagaLivre(a) && !ehBloqueio(a);
}
