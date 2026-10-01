/**
 * Mensalidades que faltam num contrato, do mês corrente até o fim da vigência.
 *
 * Existe por causa dos contratos importados de planilha sem nenhuma parcela
 * (112 na Menino Jesus em 01/10/2026). Quando um desses pacientes aparecia
 * para pagar, a recepção criava as cobranças uma a uma pelo "Adicionar
 * parcela" — que põe a data de hoje em todas. Foi assim que um contrato ficou
 * com 12 mensalidades vencendo em 14/09/2026 e a paciente passou a ser
 * atendida como Particular por "R$ 1.320,00 em atraso".
 *
 * Regras:
 * - Nunca gera mês passado. O que o paciente pagou antes (no sistema anterior,
 *   na planilha) não pode virar dívida nova; quem realmente deve um mês antigo
 *   continua sendo lançado à mão.
 * - Só gera dentro da vigência: o vencimento tem que cair antes de `dataFim`.
 *   Contrato com vigência encerrada não gera nada — o caminho é renovar.
 * - Pula mês que já tem mensalidade não cancelada.
 * - No mês corrente, se o dia de vencimento já passou, a parcela vence hoje
 *   (cobrança no ato) em vez de nascer atrasada — a mesma trava da criação do
 *   contrato, porque parcela vencida há mais de 5 dias bloqueia o cartão.
 *
 * Datas sempre como texto AAAA-MM-DD: `new Date("2026-10-10")` lê em UTC e, no
 * Brasil, devolve o dia 9.
 */

export interface ParcelaExistente {
  numero_parcela: number | null;
  vencimento: string;
  status: string | null;
}

export interface ParcelasQueFaltamEntrada {
  dataInicio: string;
  /** Fim da vigência. Vazio → um ano depois do início. */
  dataFim: string | null;
  diaVencimento: number | null;
  hojeIso: string;
  existentes: readonly ParcelaExistente[];
}

export type ParcelasQueFaltam =
  | { tipo: "ok"; vencimentos: string[] }
  | { tipo: "vigencia_encerrada"; dataFim: string }
  | { tipo: "nada_faltando" };

const pad = (n: number) => String(n).padStart(2, "0");

function umAnoDepois(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(y + 1, m - 1, d);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function calcularParcelasQueFaltam(e: ParcelasQueFaltamEntrada): ParcelasQueFaltam {
  const hoje = e.hojeIso.slice(0, 10);
  const inicio = e.dataInicio.slice(0, 10);
  const fim = (e.dataFim ?? "").slice(0, 10) || umAnoDepois(inicio);
  if (fim <= hoje) return { tipo: "vigencia_encerrada", dataFim: fim };

  const mesesOcupados = new Set(
    e.existentes
      .filter((p) => Number(p.numero_parcela) > 0 && (p.status ?? "").toLowerCase() !== "cancelado")
      .map((p) => p.vencimento.slice(0, 7)),
  );

  const dia = Math.max(1, Math.min(31, Number(e.diaVencimento) || 10));
  // Começa no mês corrente — ou no mês do início, se o contrato ainda não começou.
  const partida = inicio > hoje ? inicio : hoje;
  let [ano, mes] = partida.split("-").map(Number);
  const vencimentos: string[] = [];
  // Trava contra laço longo em vigência mal cadastrada.
  for (let i = 0; i < 36; i += 1) {
    const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    let venc = `${ano}-${pad(mes)}-${pad(Math.min(dia, ultimoDia))}`;
    if (venc >= fim) break;
    if (venc < partida) venc = partida;
    if (!mesesOcupados.has(venc.slice(0, 7))) vencimentos.push(venc);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return vencimentos.length > 0 ? { tipo: "ok", vencimentos } : { tipo: "nada_faltando" };
}
