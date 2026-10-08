// Agendamento "sem desfecho" — o dia já acabou e o paciente nunca passou pelo
// balcão (continua "agendado"/"confirmado", sem check-in).
//
// O Dashboard operacional conta esses agendamentos como FALTA, junto com os
// marcados "faltou". É só leitura: o banco continua como está, então caixa,
// repasse e relatórios não mudam. "Confirmado" entra porque também vem da
// resposta do paciente no WhatsApp/site — não quer dizer que ele chegou.
// Pagamento não interfere: pago adiantado e não veio também é falta.
//
// O dia acaba quando a clínica fecha (19h): depois disso o de hoje já conta.
//
// A mesma regra está em SQL na função `painel_medicos_periodo` (migração
// 20261007210000_painel_faltas_apos_fechamento.sql). Mudou aqui, mude lá.

import { dataClinicaDe, TZ_CLINICA } from "@/lib/date-utils";
import { ehVagaLivre } from "@/lib/agenda/vaga-livre";
import { ehBloqueio } from "@/lib/painel/cards-do-dia";

/** Dias encerrados que o aviso do Dashboard olha (até o último encerrado). */
export const DIAS_AVISO_SEM_DESFECHO = 7;

/** Hora (fuso da clínica) em que a clínica fecha e o dia passa a contar. */
export const HORA_FECHAMENTO = 19;

const addDays = (iso: string, d: number) => {
  const [y, m, dd] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + d)).toISOString().slice(0, 10);
};

/** Último dia (YYYY-MM-DD) já encerrado: hoje depois das 19h, senão ontem. */
export function ultimoDiaEncerrado(agora: Date = new Date()): string {
  const hoje = dataClinicaDe(agora) as string;
  const hora = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ_CLINICA,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(agora),
  );
  return hora >= HORA_FECHAMENTO ? hoje : addDays(hoje, -1);
}

type FichaMin = {
  inicio: string | null;
  status: string;
  fluxo_etapa: string | null;
  paciente_nome: string | null;
  paciente_id?: string | null;
};

/** `ateDia` = último dia encerrado (ver `ultimoDiaEncerrado`). */
export function ficouSemDesfecho(a: FichaMin, ateDia: string): boolean {
  const dia = dataClinicaDe(a.inicio);
  if (!dia || dia > ateDia) return false;
  if (a.status !== "agendado" && a.status !== "confirmado") return false;
  if (a.fluxo_etapa && a.fluxo_etapa !== "aguardando_recepcao") return false;
  return !ehVagaLivre(a) && !ehBloqueio(a);
}
