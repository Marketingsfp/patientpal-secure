/**
 * Relatório de Sessões e Manutenções — regras puras.
 *
 * Duas naturezas convivem na mesma folha, e confundi-las seria o erro mais
 * caro deste relatório:
 *
 *  - PACOTE (Fisioterapia e afins): o paciente comprou 5 sessões e pagou na
 *    venda. A falta CONSOME a sessão — ele já pagou por ela —, então falta
 *    conta como sessão gasta. A situação financeira compara o que entrou de
 *    lançamento com o valor do pacote: Pago, Parcial ou Em aberto.
 *
 *  - CICLO (Manutenção de aparelho ortodôntico): cobrado por comparecimento.
 *    Quem não veio no mês NÃO deve nada retroativo — apenas ficou parado. Por
 *    isso a situação financeira é sempre "Por visita" e nenhuma coluna soma
 *    dívida acumulada. Somar meses não pagos aqui seria cobrar o paciente por
 *    um serviço que ele nunca recebeu.
 *
 * A lista de faltosos (busca ativa) é a interseção do que interessa às duas:
 * ainda há tratamento em aberto e não existe data futura marcada na agenda.
 */
import type { ColunaRateio as Coluna } from "@/lib/financeiro/rateio-colunas";

export type OrigemSessao = "pacote" | "ciclo";

export type SituacaoFinanceira = "pago" | "parcial" | "aberto" | "por_visita";

/** Uma linha crua, exatamente como `fn_relatorio_sessoes` devolve. */
export interface LinhaSessao {
  origem: OrigemSessao;
  paciente_id: string;
  paciente_nome: string;
  prontuario: string;
  procedimento: string;
  profissional: string;
  total_sessoes: number;
  realizadas: number;
  faltas: number;
  restantes: number;
  valor_contratado: number;
  valor_pago: number;
  situacao_financeira: SituacaoFinanceira;
  ultima_data: string | null;
  proxima_data: string | null;
  dias_parado: number | null;
  pendencia: string;
}

export type FiltroSessoes = "todos" | "pacotes" | "ciclos" | "faltosos" | "financeiro";

export const ROTULO_FILTRO: Record<FiltroSessoes, string> = {
  todos: "Tudo",
  pacotes: "Só pacotes (Fisioterapia)",
  ciclos: "Só manutenções (Odonto)",
  faltosos: "Busca ativa — sem agendamento",
  financeiro: "Pendência financeira",
};

export const ROTULO_SITUACAO: Record<SituacaoFinanceira, string> = {
  pago: "Pago integral",
  parcial: "Parcial",
  aberto: "Em aberto",
  por_visita: "Por visita",
};

export const ROTULO_ORIGEM: Record<OrigemSessao, string> = {
  pacote: "Pacote",
  ciclo: "Manutenção",
};

/**
 * Paciente que precisa de busca ativa: tem tratamento em andamento e nenhuma
 * data futura na agenda.
 *
 * No pacote, "em andamento" é sobrar sessão. No ciclo não existe fim, então
 * qualquer paciente sem próxima data conta — é a régua de dias parados que
 * separa quem está em dia de quem sumiu, e ela já vem calculada do banco.
 */
export function precisaBuscaAtiva(l: LinhaSessao): boolean {
  if (l.proxima_data) return false;
  return l.origem === "ciclo" ? true : l.restantes > 0;
}

/**
 * Pendência de dinheiro. Só existe em pacote: no ciclo, faltar não gera
 * dívida, então uma manutenção nunca entra nesta lista.
 */
export function temPendenciaFinanceira(l: LinhaSessao): boolean {
  if (l.origem === "ciclo") return false;
  return l.situacao_financeira === "aberto" || l.situacao_financeira === "parcial";
}

export function filtrarSessoes(linhas: LinhaSessao[], filtro: FiltroSessoes): LinhaSessao[] {
  switch (filtro) {
    case "pacotes":
      return linhas.filter((l) => l.origem === "pacote");
    case "ciclos":
      return linhas.filter((l) => l.origem === "ciclo");
    case "faltosos":
      return linhas.filter(precisaBuscaAtiva);
    case "financeiro":
      return linhas.filter(temPendenciaFinanceira);
    default:
      return linhas;
  }
}

/**
 * "3/5" no pacote; no ciclo não existe total contratado, então sai a contagem
 * de comparecimentos. Escrever "3/0" para uma manutenção sugeriria um pacote
 * que não existe.
 */
export function rotuloSessoes(l: LinhaSessao): string {
  if (l.origem === "ciclo") {
    return `${l.realizadas} visita${l.realizadas === 1 ? "" : "s"}`;
  }
  return `${l.realizadas}/${l.total_sessoes}`;
}

/** Linha pronta para a tabela, a folha A4, o CSV e o Excel — a mesma para os quatro. */
export function linhaExibida(l: LinhaSessao): Record<string, unknown> {
  return {
    origem: ROTULO_ORIGEM[l.origem],
    paciente: l.paciente_nome,
    prontuario: l.prontuario || "",
    procedimento: l.procedimento,
    profissional: l.profissional,
    sessoes: rotuloSessoes(l),
    faltas: l.faltas,
    restantes: l.origem === "ciclo" ? null : l.restantes,
    situacao: ROTULO_SITUACAO[l.situacao_financeira],
    valor_contratado: l.origem === "ciclo" ? null : l.valor_contratado,
    valor_pago: l.valor_pago,
    ultima_data: l.ultima_data,
    proxima_data: l.proxima_data,
    dias_parado: l.dias_parado,
    pendencia: l.pendencia,
  };
}

export function linhasSessoes(
  linhas: LinhaSessao[],
  filtro: FiltroSessoes,
): Record<string, unknown>[] {
  return filtrarSessoes(linhas, filtro).map(linhaExibida);
}

export const COLUNAS_SESSOES: Coluna[] = [
  { chave: "origem", rotulo: "Tipo", formato: "texto" },
  { chave: "paciente", rotulo: "Paciente", formato: "texto" },
  { chave: "prontuario", rotulo: "Prontuário", formato: "texto" },
  { chave: "procedimento", rotulo: "Procedimento", formato: "texto" },
  { chave: "profissional", rotulo: "Profissional", formato: "texto" },
  { chave: "sessoes", rotulo: "Realizadas", formato: "texto" },
  { chave: "faltas", rotulo: "Faltas", formato: "numero", somar: true },
  { chave: "restantes", rotulo: "A fazer", formato: "numero", somar: true },
  { chave: "situacao", rotulo: "Situação financeira", formato: "texto" },
  { chave: "valor_contratado", rotulo: "Contratado", formato: "moeda-opcional", somar: true },
  { chave: "valor_pago", rotulo: "Recebido", formato: "moeda", somar: true },
  { chave: "ultima_data", rotulo: "Última", formato: "data" },
  { chave: "proxima_data", rotulo: "Próxima", formato: "data" },
  { chave: "dias_parado", rotulo: "Dias parado", formato: "numero" },
  { chave: "pendencia", rotulo: "Situação", formato: "texto" },
];

export interface TotaisSessoes {
  linhas: number;
  pacotes: number;
  ciclos: number;
  sessoesContratadas: number;
  sessoesRealizadas: number;
  faltas: number;
  contratado: number;
  recebido: number;
  emAberto: number;
  buscaAtiva: number;
}

export function totaisSessoes(linhas: LinhaSessao[]): TotaisSessoes {
  const t: TotaisSessoes = {
    linhas: linhas.length,
    pacotes: 0,
    ciclos: 0,
    sessoesContratadas: 0,
    sessoesRealizadas: 0,
    faltas: 0,
    contratado: 0,
    recebido: 0,
    emAberto: 0,
    buscaAtiva: 0,
  };
  for (const l of linhas) {
    if (l.origem === "ciclo") t.ciclos += 1;
    else {
      t.pacotes += 1;
      t.sessoesContratadas += l.total_sessoes;
      t.contratado += l.valor_contratado;
      // Saldo a receber só existe em pacote. No ciclo, o que não foi pago é
      // consulta que não aconteceu — não é saldo devedor de ninguém.
      t.emAberto += Math.max(0, l.valor_contratado - l.valor_pago);
    }
    t.sessoesRealizadas += l.realizadas;
    t.faltas += l.faltas;
    t.recebido += l.valor_pago;
    if (precisaBuscaAtiva(l)) t.buscaAtiva += 1;
  }
  return t;
}

/** Quadro de fechamento, igual na tela, no papel e na planilha. */
export function resumoSessoes(t: TotaisSessoes): { rotulo: string; valor: string }[] {
  const n = (v: number) => v.toLocaleString("pt-BR");
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return [
    { rotulo: "Pacotes de sessões", valor: n(t.pacotes) },
    { rotulo: "Pacientes em manutenção", valor: n(t.ciclos) },
    { rotulo: "Sessões contratadas", valor: n(t.sessoesContratadas) },
    { rotulo: "Sessões realizadas", valor: n(t.sessoesRealizadas) },
    { rotulo: "Faltas", valor: n(t.faltas) },
    { rotulo: "Recebido", valor: brl(t.recebido) },
    { rotulo: "Saldo a receber (pacotes)", valor: brl(t.emAberto) },
    { rotulo: "Sem agendamento (busca ativa)", valor: n(t.buscaAtiva) },
  ];
}
