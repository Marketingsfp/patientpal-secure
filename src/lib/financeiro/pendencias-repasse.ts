/**
 * Repasses de dias anteriores que ainda não foram pagos.
 *
 * Motivação: a tesouraria (Bete, Zenilda, Mayra) paga o repasse dos médicos no
 * dia seguinte ao atendimento, e às vezes alguns dias depois. Isso é a rotina
 * normal da clínica, não um defeito — entre agosto e setembro de 2026 foram 94
 * repasses pagos com atraso médio de 2,6 dias. O problema é que ninguém
 * enxergava a fila: só se descobria que o repasse de um médico ficou para trás
 * quando ele cobrava, ou quando alguém abria a tela de Atendimentos dia a dia
 * procurando.
 *
 * Este módulo monta a fila. Ele NÃO calcula o valor do repasse: para
 * atendimentos vindos da agenda o valor do médico é derivado das regras de
 * repasse na hora e não fica gravado, então reproduzir a conta aqui seria
 * duplicar o motor de regras e arriscar mostrar um número diferente do da tela
 * que efetivamente paga. O card mostra QUANTOS atendimentos e de QUANTOS
 * médicos, e manda a pessoa para a tela de Atendimentos, que é onde o valor
 * certo aparece e onde o pagamento acontece.
 *
 * Nada aqui escreve no banco.
 */

/** Um dia com repasse ainda em aberto. */
export interface DiaComRepassePendente {
  /** Competência (YYYY-MM-DD). */
  dia: string;
  /** Quantos atendimentos daquele dia seguem com repasse em aberto. */
  atendimentos: number;
  /** De quantos médicos distintos. */
  medicos: number;
  /**
   * Soma do valor cobrado do paciente nesses atendimentos.
   *
   * É referência de tamanho, NÃO o valor do repasse — o repasse é uma fração
   * disso, calculada pelas regras de cada médico. A tela deixa isso explícito
   * para ninguém confundir com o que vai ser pago.
   */
  valorBruto: number;
}

export interface PendenciasDeRepasse {
  /** Dias com pendência, do mais recente para o mais antigo. */
  dias: DiaComRepassePendente[];
  totalAtendimentos: number;
  /** Dia mais antigo ainda em aberto, para a tela medir o atraso. */
  diaMaisAntigo: string | null;
}

/** Linha crua vinda do banco, de qualquer uma das duas origens. */
export interface LinhaPendente {
  /** Competência (YYYY-MM-DD). */
  data: string;
  /** Médico do atendimento; `null` quando o cadastro não amarra um. */
  medico_id?: string | null;
  valor?: number | string | null;
}

/**
 * Quantos dias para trás a fila olha.
 *
 * Sete dias cobrem a rotina da manhã (inclusive a segunda-feira, que precisa
 * enxergar o sábado) sem arrastar a cauda longa de atendimentos antigos que
 * seguem em aberto de propósito — convênio ainda não faturado, por exemplo.
 * Em 09/09/2026 havia pendência até 06/08; jogar tudo isso num card matinal
 * viraria ruído e ninguém leria.
 */
export const JANELA_PADRAO_DIAS = 7;

/**
 * Recorte de datas da fila: os `dias` anteriores a hoje, sem incluir hoje.
 *
 * Hoje fica de fora de propósito. O repasse do dia corrente ainda está sendo
 * gerado enquanto os pacientes são atendidos; cobrá-lo de manhã seria cobrar
 * um trabalho que nem começou.
 */
export function janelaDePendencias(
  hoje: string,
  dias: number = JANELA_PADRAO_DIAS,
): { de: string; ate: string } {
  const base = new Date(`${hoje}T12:00:00Z`);
  const ate = new Date(base);
  ate.setUTCDate(ate.getUTCDate() - 1);
  const de = new Date(base);
  de.setUTCDate(de.getUTCDate() - dias);
  return { de: de.toISOString().slice(0, 10), ate: ate.toISOString().slice(0, 10) };
}

/** Agrupa as linhas em aberto por dia de competência. */
export function agruparPendencias(linhas: LinhaPendente[]): PendenciasDeRepasse {
  const porDia = new Map<string, { atendimentos: number; medicos: Set<string>; valor: number }>();
  for (const l of linhas) {
    if (!l.data) continue;
    let d = porDia.get(l.data);
    if (!d) {
      d = { atendimentos: 0, medicos: new Set(), valor: 0 };
      porDia.set(l.data, d);
    }
    d.atendimentos += 1;
    d.valor += Number(l.valor) || 0;
    if (l.medico_id) d.medicos.add(l.medico_id);
  }

  const dias: DiaComRepassePendente[] = Array.from(porDia.entries())
    .map(([dia, d]) => ({
      dia,
      atendimentos: d.atendimentos,
      medicos: d.medicos.size,
      valorBruto: Number(d.valor.toFixed(2)),
    }))
    .sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : 0));

  return {
    dias,
    totalAtendimentos: dias.reduce((s, d) => s + d.atendimentos, 0),
    diaMaisAntigo: dias.length ? dias[dias.length - 1].dia : null,
  };
}

/** Quantos dias de atraso tem a pendência mais antiga da fila. */
export function diasDeAtraso(diaMaisAntigo: string | null, hoje: string): number {
  if (!diaMaisAntigo) return 0;
  const a = new Date(`${diaMaisAntigo}T12:00:00Z`).getTime();
  const b = new Date(`${hoje}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
