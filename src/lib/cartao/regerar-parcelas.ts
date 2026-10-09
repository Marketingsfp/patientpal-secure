/**
 * Plano do "Data de início movida para o passado → Confirmar e regenerar".
 *
 * A versão anterior apagava TODAS as mensalidades do contrato — pagas
 * inclusive — e gerava 12 novas. De julho a setembro de 2026 isso sumiu com
 * 15 parcelas pagas no caixa (R$ 2.264,90) em 13 contratos: o dinheiro ficava
 * no caixa, mas o contrato perdia o registro de que aquele mês estava quitado.
 *
 * Regras:
 * - Parcela paga ou cancelada NUNCA sai: é histórico financeiro.
 * - Parcela pendente com boleto ou guia impressa também fica — apagá-la
 *   apagaria o boleto junto (a chave estrangeira é em cascata).
 * - Só as demais pendentes são apagadas, e as 12 parcelas a partir da nova
 *   data de início são refeitas apenas nos meses que ficaram sem parcela.
 * - "Parcelas já pagas" (N) continua valendo: os N primeiros meses que
 *   precisarem ser criados entram como pagos (pagos no sistema anterior). Mês
 *   que já tem parcela paga conta dentro desses N.
 * - Numeração: cada mês ganha o número da sua posição (1 a 12) quando ele está
 *   livre; se uma parcela mantida já usa o número, vai para o próximo livre.
 */

export interface ParcelaAtual {
  id: string;
  numero_parcela: number | null;
  vencimento: string;
  status: string | null;
  /** Tem boleto ou guia impressa ligada. */
  travada: boolean;
}

export interface NovaParcela {
  numero_parcela: number;
  vencimento: string;
  paga: boolean;
}

export interface PlanoRegeracao {
  apagar: string[];
  criar: NovaParcela[];
  /** Quantas parcelas pagas foram preservadas. */
  pagasMantidas: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

function vencimentoDoMes(inicioIso: string, dia: number, i: number): string {
  const [ano, mes] = inicioIso.slice(0, 10).split("-").map(Number);
  const total = mes - 1 + i;
  const a = ano + Math.floor(total / 12);
  const m = (total % 12) + 1;
  const ultimoDia = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${a}-${pad(m)}-${pad(Math.min(dia, ultimoDia))}`;
}

export function planejarRegeracao(
  dataInicio: string,
  diaVencimento: number | null,
  pagasInformadas: number,
  atuais: readonly ParcelaAtual[],
): PlanoRegeracao {
  const dia = Math.max(1, Math.min(31, Number(diaVencimento) || 10));
  const n = Math.max(0, Math.min(12, Math.floor(pagasInformadas) || 0));
  const mensais = atuais.filter((p) => Number(p.numero_parcela) > 0);

  const status = (p: ParcelaAtual) => (p.status ?? "").toLowerCase();
  const fica = (p: ParcelaAtual) => status(p) === "pago" || status(p) === "cancelado" || p.travada;
  const mantidas = mensais.filter(fica);
  const apagar = mensais.filter((p) => !fica(p)).map((p) => p.id);

  // Mês ocupado = tem parcela mantida que não está cancelada.
  const ocupados = new Map<string, boolean>(); // mês → está paga
  for (const p of mantidas) {
    if (status(p) === "cancelado") continue;
    const mes = p.vencimento.slice(0, 7);
    ocupados.set(mes, (ocupados.get(mes) ?? false) || status(p) === "pago");
  }
  const numerosUsados = new Set(mantidas.map((p) => Number(p.numero_parcela)));
  let proximoLivre = Math.max(12, ...numerosUsados) + 1;

  const criar: NovaParcela[] = [];
  for (let i = 0; i < 12; i += 1) {
    const venc = vencimentoDoMes(dataInicio, dia, i);
    if (ocupados.has(venc.slice(0, 7))) continue;
    let numero = i + 1;
    if (numerosUsados.has(numero)) numero = proximoLivre++;
    numerosUsados.add(numero);
    criar.push({ numero_parcela: numero, vencimento: venc, paga: i < n });
  }
  return {
    apagar,
    criar,
    pagasMantidas: mantidas.filter((p) => status(p) === "pago").length,
  };
}
