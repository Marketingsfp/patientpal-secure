// Detalhamento do "Resumo do dia" da Agenda — quem está por trás de cada
// número da barra.
//
// Regra de ouro: a lista de cada contador tem de bater com o número que o
// contador mostra. Por isso a separação usa o mesmo `ehLivre` e a mesma
// `situacaoDaFicha` de `resumirDia` (ver `resumo-do-dia.ts`), e não um
// critério novo.

import { ultimoDiaEncerrado } from "@/lib/painel/sem-desfecho";
import { ehLivre, situacaoDaFicha, type LinhaResumo, type SituacaoFicha } from "./resumo-do-dia";
import { detectarCheckupRosa, itemCheckupRosa } from "./checkup-rosa";

export type CategoriaResumo =
  | "fichasGeradas"
  | "livres"
  | "agendados"
  | "aguardando"
  | "confirmados"
  | "emAtendimento"
  | "atendidos"
  | "cancelados"
  | "faltas"
  | "encaixes";

export const ROTULO_CATEGORIA: Record<CategoriaResumo, string> = {
  fichasGeradas: "Fichas geradas",
  livres: "Livres",
  agendados: "Agendados",
  aguardando: "Aguardando",
  confirmados: "Presentes",
  emAtendimento: "Em atendimento",
  atendidos: "Atendidos",
  cancelados: "Cancelados",
  faltas: "Faltas",
  encaixes: "Encaixes",
};

function diaLocal(inicio: string): string {
  return new Date(inicio).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * Linhas de um horário dividido por mais de um paciente. Para Encaixes a lista
 * traz TODAS as fichas desses horários (a original e a encaixada), porque a
 * recepção precisa ver as duas para entender o encaixe — o número do contador
 * continua sendo `contarEncaixes`, só os pacientes a mais.
 */
function linhasDeHorarioDividido<T extends LinhaResumo>(linhas: readonly T[]): T[] {
  const grupos = new Map<string, { pacientes: Set<string>; linhas: T[] }>();
  for (const a of linhas) {
    if (ehLivre(a.paciente_nome) || !a.medico_id) continue;
    const chave = `${diaLocal(a.inicio)}::${a.medico_id}::${a.agenda_id ?? "__sem_agenda__"}::${new Date(a.inicio).getTime()}`;
    const quem = a.paciente_id ?? `nome:${(a.paciente_nome ?? "").trim().toLowerCase()}`;
    const g = grupos.get(chave) ?? { pacientes: new Set<string>(), linhas: [] };
    g.pacientes.add(quem);
    g.linhas.push(a);
    grupos.set(chave, g);
  }
  const out: T[] = [];
  for (const g of grupos.values()) if (g.pacientes.size > 1) out.push(...g.linhas);
  return out;
}

/** As linhas que compõem o número de um contador do Resumo do dia. */
export function linhasDaCategoria<T extends LinhaResumo>(
  linhas: readonly T[],
  categoria: CategoriaResumo,
  ateDia: string = ultimoDiaEncerrado(),
): T[] {
  switch (categoria) {
    case "fichasGeradas":
      return [...linhas];
    case "livres":
      return linhas.filter((a) => ehLivre(a.paciente_nome));
    case "agendados":
      return linhas.filter((a) => !ehLivre(a.paciente_nome));
    case "encaixes":
      return linhasDeHorarioDividido(linhas);
    default:
      return linhas.filter(
        (a) =>
          !ehLivre(a.paciente_nome) &&
          situacaoDaFicha(a, ateDia) === (categoria satisfies SituacaoFicha),
      );
  }
}

export type LinhaDetalhe = LinhaResumo & {
  procedimento?: string | null;
  tipo_atendimento?: string | null;
  data_pagamento?: string | null;
  origem_externa?: boolean | null;
  sem_faturamento?: boolean | null;
};

export type SituacaoFinanceira =
  | "pago"
  | "pendente"
  | "convenio"
  | "sem_faturamento"
  | "externo"
  | "nao_se_aplica";

export const ROTULO_FINANCEIRO: Record<SituacaoFinanceira, string> = {
  pago: "Pago",
  pendente: "Pendente",
  convenio: "Convênio",
  sem_faturamento: "Sem faturamento",
  externo: "Externo",
  nao_se_aplica: "—",
};

/**
 * Situação de pagamento de uma ficha, no mesmo critério da Agenda: pago é ter
 * receita confirmada ligada à ficha ou a data de pagamento preenchida (pago no
 * sistema anterior / adiantado). Ficha livre, cancelada ou com falta não tem
 * cobrança a esperar.
 */
export function situacaoFinanceira(
  a: LinhaDetalhe,
  pagos: ReadonlySet<string>,
): SituacaoFinanceira {
  if (ehLivre(a.paciente_nome)) return "nao_se_aplica";
  if (a.status === "cancelado" || a.status === "faltou") return "nao_se_aplica";
  if (a.sem_faturamento === true) return "sem_faturamento";
  if (a.origem_externa) return "externo";
  if (pagos.has(a.id) || !!a.data_pagamento) return "pago";
  if ((a.tipo_atendimento ?? "particular") === "convenio") return "convenio";
  return "pendente";
}

/**
 * Fichas do dia que formam um pacote CHECKUP ROSA.
 *
 * Nada fica gravado quando o caixa aplica o pacote, então a lista deduz: as
 * marcações não canceladas de cada paciente no dia que são item de pacote têm
 * de bater EXATAMENTE com um dos quatro pacotes — a mesma conta que o caixa
 * faz para oferecer o pacote (`detectarCheckupRosa`). Atendimentos de outras
 * especialidades no mesmo dia não atrapalham. Limite: não dá para saber se o
 * pacote foi de fato aplicado na cobrança.
 *
 * `linhas` deve ser o dia INTEIRO da clínica: o pacote junta profissionais
 * diferentes (gineco, ultrassom, mamografia).
 */
export function idsCheckupRosa(
  linhas: readonly LinhaDetalhe[],
  especialidadeDoMedico: (medicoId: string | null | undefined) => string | null,
): Set<string> {
  const porPaciente = new Map<string, LinhaDetalhe[]>();
  for (const a of linhas) {
    if (ehLivre(a.paciente_nome)) continue;
    if (a.status === "cancelado" || a.status === "faltou") continue;
    if (!itemCheckupRosa(a.procedimento, especialidadeDoMedico(a.medico_id))) continue;
    const quem = `${diaLocal(a.inicio)}::${a.paciente_id ?? `nome:${(a.paciente_nome ?? "").trim().toLowerCase()}`}`;
    const arr = porPaciente.get(quem) ?? [];
    arr.push(a);
    porPaciente.set(quem, arr);
  }
  const ids = new Set<string>();
  for (const grupo of porPaciente.values()) {
    const pacote = detectarCheckupRosa(
      grupo.map((a) => ({
        id: a.id,
        procedimento: a.procedimento ?? null,
        especialidade: especialidadeDoMedico(a.medico_id),
        dia: diaLocal(a.inicio),
      })),
    );
    if (pacote) for (const a of grupo) ids.add(a.id);
  }
  return ids;
}
