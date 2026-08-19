import { supabase } from "@/integrations/supabase/client";

/**
 * "Expediente encerrado" é uma marcação por (médico, dia) gravada em
 * `medico_expediente_encerramento`: sinaliza que o profissional já terminou os
 * atendimentos daquela data.
 *
 * Até 19/08/2026 a marcação era gravada e NINGUÉM a lia — o botão "Encerrar
 * expediente" salvava a linha e a tela continuava idêntica, o que passava a
 * impressão de que o modal travava. Este módulo é a ponte que faltava: a
 * Agenda carrega o conjunto e esconde os horários LIVRES restantes do médico
 * naquele dia. Fichas com paciente nunca são escondidas — encerrar expediente
 * é um sinal de "não ofereça mais horário", não um cancelamento.
 */
export type ExpedienteEncerrado = {
  medico_id: string;
  data: string;
  motivo: string | null;
};

/** Chave do mapa: um médico pode estar encerrado num dia e aberto no outro. */
export const chaveExpediente = (medicoId: string | null | undefined, dataISO: string) =>
  `${medicoId ?? ""}|${dataISO}`;

/**
 * Data local (YYYY-MM-DD) de um `inicio` vindo do PostgREST. O timestamptz
 * chega já no fuso da clínica ("2026-08-19T08:00:00-03:00"), então os 10
 * primeiros caracteres são o dia local — mesma convenção usada no resto da
 * Agenda para comparar com "hoje".
 */
export const dataLocalDoInicio = (inicio: string | null | undefined) => (inicio ?? "").slice(0, 10);

/**
 * Carrega os encerramentos da clínica a partir de `dataInicial`. A tabela tem
 * no máximo uma linha por médico/dia, então a janela aberta é barata; o
 * `limite` existe só como trava contra uma clínica com histórico muito longo.
 */
export async function carregarExpedientesEncerrados(
  clinicaId: string,
  dataInicial: string,
  dataFinal?: string | null,
): Promise<Map<string, ExpedienteEncerrado>> {
  const mapa = new Map<string, ExpedienteEncerrado>();
  if (!clinicaId || !dataInicial) return mapa;
  let q = supabase
    .from("medico_expediente_encerramento")
    .select("medico_id, data, motivo")
    .eq("clinica_id", clinicaId)
    .gte("data", dataInicial)
    .limit(2000);
  if (dataFinal) q = q.lte("data", dataFinal);
  const { data, error } = await q;
  // Falha ao ler a marcação não pode derrubar a Agenda: sem o mapa, a tela
  // volta ao comportamento antigo (mostra todos os horários livres).
  if (error) return mapa;
  for (const r of (data ?? []) as ExpedienteEncerrado[]) {
    mapa.set(chaveExpediente(r.medico_id, r.data), r);
  }
  return mapa;
}
