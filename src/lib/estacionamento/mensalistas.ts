/**
 * Estacionamento: em que situação está cada pagamento de mensalista.
 *
 * O painel "Detalhamento de mensalistas no período" responde uma pergunta só:
 * quanto entrou no caixa × a qual mês cada pagamento se refere. Um mensalista
 * pode quitar em agosto a mensalidade de julho (atrasado) ou já deixar
 * setembro pago (antecipado), e os três números precisam ser lidos separados —
 * juntos, um mês forte esconde a inadimplência do mês anterior.
 *
 * A regra é a mesma que já vale para as mensalidades do Cartão Benefícios no
 * Movimento de Caixa: quem decide é a COMPETÊNCIA (o mês a que o pagamento se
 * refere) comparada com o período exibido, nunca a data do pagamento.
 */

export type SituacaoMensalista = "periodo" | "atrasado" | "antecipado";

export const LABEL_SITUACAO: Record<SituacaoMensalista, string> = {
  periodo: "Referente ao período",
  atrasado: "Atrasados (meses anteriores)",
  antecipado: "Antecipados (próximos meses)",
};

export const LEGENDA_SITUACAO: Record<SituacaoMensalista, string> = {
  periodo: "mensalidade do mês atual",
  atrasado: "quitou mês passado agora",
  antecipado: "pagou adiantado",
};

/**
 * Compara a competência com o período exibido.
 *
 * A comparação é de MÊS, não de dia: a competência é sempre o dia 1 (o banco
 * normaliza na gravação), então um período de 01/08 a 31/08 precisa aceitar a
 * competência 2026-08-01 como "do período" mesmo quando o usuário escolhe de
 * 15/08 a 20/08. Comparar dia a dia jogaria toda mensalidade de agosto em
 * "atrasado" sempre que o filtro não começasse no dia 1 — que é o recorte que
 * a recepção mais usa.
 */
export function situacaoMensalista(
  competencia: string | null | undefined,
  periodo: { de: string; ate: string },
): SituacaoMensalista | null {
  if (!competencia) return null;
  const mes = competencia.slice(0, 7);
  const mesDe = periodo.de.slice(0, 7);
  const mesAte = periodo.ate.slice(0, 7);
  if (mes < mesDe) return "atrasado";
  if (mes > mesAte) return "antecipado";
  return "periodo";
}

export interface TotalSituacao {
  qtd: number;
  total: number;
}

/** Quanto e quantos pagamentos em cada situação, mais o total geral. */
export function totaisPorSituacao(
  linhas: Array<{
    tipo: string;
    valor: number | string | null | undefined;
    competencia?: string | null;
  }>,
  periodo: { de: string; ate: string },
): {
  porSituacao: Record<SituacaoMensalista, TotalSituacao>;
  total: TotalSituacao;
} {
  const porSituacao: Record<SituacaoMensalista, TotalSituacao> = {
    periodo: { qtd: 0, total: 0 },
    atrasado: { qtd: 0, total: 0 },
    antecipado: { qtd: 0, total: 0 },
  };
  for (const l of linhas) {
    if (l.tipo !== "mensalista") continue;
    const s = situacaoMensalista(l.competencia, periodo);
    if (!s) continue;
    porSituacao[s].qtd += 1;
    porSituacao[s].total += Number(l.valor) || 0;
  }
  let qtd = 0;
  let total = 0;
  for (const s of ["periodo", "atrasado", "antecipado"] as SituacaoMensalista[]) {
    porSituacao[s].total = Number(porSituacao[s].total.toFixed(2));
    qtd += porSituacao[s].qtd;
    total += porSituacao[s].total;
  }
  return { porSituacao, total: { qtd, total: Number(total.toFixed(2)) } };
}

/** "2026-08-01" → "08/2026", para mostrar a competência na linha. */
export function mesBR(competencia: string | null | undefined): string {
  if (!competencia) return "";
  return `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;
}
