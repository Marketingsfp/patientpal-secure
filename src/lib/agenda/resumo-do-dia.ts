// Resumo do Dia da Agenda — regra única de contagem.
//
// A supervisão precisava abrir o Financeiro → Relatórios só para saber quantas
// fichas do dia foram atendidas, quantas faltaram e quantos encaixes entraram.
// Este módulo concentra essa contagem para que a barra da Agenda e qualquer
// outra tela que venha a mostrar o mesmo número usem exatamente o mesmo
// critério.
//
// Vocabulário (o mesmo do balcão e o mesmo que a lista da Agenda já usa):
//   • FICHA GERADA — toda linha da grade daquele dia, ocupada ou não. É o
//     tamanho da grade que o médico abriu.
//   • LIVRE        — ficha sem paciente ("DISPONÍVEL"/"BLOQUEIO").
//   • AGENDADA     — ficha com paciente alocado, qualquer que seja o status.
//     É o mesmo sentido do filtro "agendado" da lista.
//   • Os demais números dividem as fichas ocupadas em situações — ver
//     `situacaoDaFicha`. Somar as situações sempre devolve o total de agendadas.
//
// PRESENÇA vem do check-in (`fluxo_etapa`), nunca do `status`: "confirmado"
// também é a resposta do paciente no WhatsApp/site e não quer dizer que ele
// chegou, e o check-in nem sempre muda o status. Em 07/10/2026 a barra
// mostrava 46 "presentes" (17 nunca vieram), 138 "aguardando" (30 já tinham
// feito check-in), "em atendimento" sempre 0 (o status "em_atendimento" não
// existe no banco) e 0 faltas contra 125 pacientes que não passaram pelo balcão.
//
// Cancelado e falta continuam contando como ficha agendada: a grade foi
// ocupada, o paciente é que não foi atendido.

import { ficouSemDesfecho, ultimoDiaEncerrado } from "@/lib/painel/sem-desfecho";

export type LinhaResumo = {
  id: string;
  inicio: string;
  paciente_nome?: string | null;
  paciente_id?: string | null;
  medico_id?: string | null;
  agenda_id?: string | null;
  status?: string | null;
  fluxo_etapa?: string | null;
};

export type ResumoDoDia = {
  /** Todas as linhas da grade do dia (livres + ocupadas). */
  fichasGeradas: number;
  /** Fichas ainda sem paciente. */
  livres: number;
  /** Fichas com paciente alocado, em qualquer status. */
  agendados: number;
  /** Sem check-in e o dia ainda não acabou (a clínica fecha às 19h). */
  aguardando: number;
  /** Presentes: check-in feito (recepção, caixa, triagem), ainda sem atendimento. */
  confirmados: number;
  /** Na sala ou no exame. */
  emAtendimento: number;
  /** Status "realizado" ou fluxo finalizado. */
  atendidos: number;
  cancelados: number;
  /** "Faltou" + sem check-in em dia encerrado (ver `ficouSemDesfecho`). */
  faltas: number;
  /** Fichas ocupadas que dividem horário com outra — ver `contarEncaixes`. */
  encaixes: number;
};

/** `true` quando a linha é uma vaga da grade ainda sem paciente. */
export function ehLivre(pacienteNome: string | null | undefined): boolean {
  const nome = (pacienteNome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return nome === "" || nome === "disponivel" || nome === "bloqueio";
}

/** Dia LOCAL da clínica (America/Sao_Paulo) — nunca os 10 primeiros do ISO. */
function diaLocal(inicio: string): string {
  return new Date(inicio).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * Conta os encaixes de hora marcada.
 *
 * Encaixe, no balcão, é OUTRO paciente lançado POR CIMA de um horário já
 * ocupado: a linha nova nasce com o mesmo `inicio` da ficha sobreposta e as
 * duas dividem o número da ficha (ver `ficha-numero.ts`). Dentro de cada
 * (dia, profissional, agenda, horário), cada PACIENTE além do primeiro é um
 * encaixe.
 *
 * Duas exclusões vieram da conferência contra a produção (dia 08/09/2026, que
 * acusava 2 encaixes e não tinha nenhum):
 *
 *   • MESMO paciente repetido no mesmo horário NÃO é encaixe — é atendimento
 *     múltiplo/pacote, uma linha por procedimento (o caso real: duas
 *     odontologias do mesmo paciente às 13:00). Por isso contamos pacientes
 *     distintos, não linhas.
 *   • Linha SEM profissional fica de fora. Ela não pertence à fila de ninguém,
 *     e juntar todas num balde só fazia dois atendimentos externos sem relação
 *     nenhuma, marcados para as 10:00, virarem "um encaixe".
 *
 * LIMITE CONHECIDO: nas agendas de ORDEM DE CHEGADA o encaixe entra no fim da
 * fila, com horário próprio, e é indistinguível de uma ficha comum — lá o
 * número sai zerado. Isso é da natureza da fila, não um defeito da conta.
 */
export function contarEncaixes(linhas: readonly LinhaResumo[]): number {
  const pacientesPorHorario = new Map<string, Set<string>>();
  for (const a of linhas) {
    if (ehLivre(a.paciente_nome)) continue;
    if (!a.medico_id) continue;
    const agenda = a.agenda_id ?? "__sem_agenda__";
    const chave = `${diaLocal(a.inicio)}::${a.medico_id}::${agenda}::${new Date(a.inicio).getTime()}`;
    // `paciente_id` é a identidade boa; o nome é o desempate para a ficha
    // avulsa que ainda não tem cadastro ligado.
    const quem = a.paciente_id ?? `nome:${(a.paciente_nome ?? "").trim().toLowerCase()}`;
    const set = pacientesPorHorario.get(chave);
    if (set) set.add(quem);
    else pacientesPorHorario.set(chave, new Set([quem]));
  }
  let encaixes = 0;
  for (const pacientes of pacientesPorHorario.values()) encaixes += pacientes.size - 1;
  return encaixes;
}

export type SituacaoFicha =
  | "aguardando"
  | "confirmados"
  | "emAtendimento"
  | "atendidos"
  | "cancelados"
  | "faltas";

/**
 * Em que contador entra uma ficha OCUPADA. `ateDia` = último dia encerrado
 * (`ultimoDiaEncerrado`): sem check-in até ele é falta, depois é aguardando.
 * Mesma regra do Dashboard operacional (`lib/painel/sem-desfecho.ts`).
 */
export function situacaoDaFicha(a: LinhaResumo, ateDia: string): SituacaoFicha {
  const etapa = a.fluxo_etapa ?? "aguardando_recepcao";
  if (a.status === "cancelado") return "cancelados";
  if (a.status === "faltou") return "faltas";
  if (a.status === "realizado" || etapa === "finalizado") return "atendidos";
  if (etapa === "atendimento" || etapa === "exame") return "emAtendimento";
  if (etapa !== "aguardando_recepcao") return "confirmados";
  const ficha = {
    inicio: a.inicio,
    status: a.status ?? "",
    fluxo_etapa: a.fluxo_etapa ?? null,
    paciente_nome: a.paciente_nome ?? null,
    paciente_id: a.paciente_id,
  };
  return ficouSemDesfecho(ficha, ateDia) ? "faltas" : "aguardando";
}

/** Contagem completa do dia a partir das linhas da grade. */
export function resumirDia(
  linhas: readonly LinhaResumo[],
  ateDia: string = ultimoDiaEncerrado(),
): ResumoDoDia {
  const resumo: ResumoDoDia = {
    fichasGeradas: linhas.length,
    livres: 0,
    agendados: 0,
    aguardando: 0,
    confirmados: 0,
    emAtendimento: 0,
    atendidos: 0,
    cancelados: 0,
    faltas: 0,
    encaixes: contarEncaixes(linhas),
  };
  for (const a of linhas) {
    if (ehLivre(a.paciente_nome)) {
      resumo.livres += 1;
      continue;
    }
    resumo.agendados += 1;
    resumo[situacaoDaFicha(a, ateDia)] += 1;
  }
  return resumo;
}
