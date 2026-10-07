/**
 * Totais aproximados dos tributos (Lei 12.741/2012) para emitente NÃO optante
 * do Simples Nacional. A DPS exige o bloco vTotTrib (valores em R$) e, antes,
 * mandávamos tudo zerado — a nota saía com "Federais: R$ 0,00; Estaduais:
 * R$ 0,00; Municipais: R$ 0,00" mesmo com ISS apurado.
 *
 * - Municipais: o próprio ISS da nota (é o único tributo municipal do serviço).
 * - Federais: percentual informado pela contabilidade no cadastro do emitente
 *   ("Total aproximado de tributos federais (%)"); vazio = 0.
 * - Estaduais: serviço não tem tributo estadual, fica 0.
 */
export function totaisAproximadosNaoOptante(args: {
  valorServicos: number;
  valorIss: number;
  pctFederais: number | null | undefined;
}) {
  const pct = args.pctFederais != null ? Number(args.pctFederais) : 0;
  const federais =
    Number.isFinite(pct) && pct > 0 ? +((args.valorServicos * pct) / 100).toFixed(2) : 0;
  return {
    valor_total_tributos_federais: federais,
    valor_total_tributos_estaduais: 0,
    valor_total_tributos_municipais: +Number(args.valorIss || 0).toFixed(2),
  };
}

/**
 * Totais aproximados para optante do Simples Nacional (ME/EPP ou MEI).
 *
 * Quando o ISS é pago por fora do Simples (regApTribSN 2 ou 3), o portal da
 * NFS-e Nacional imprime "Federais: X %; Estaduais: 0,00 %; Municipais: ISS %".
 * Mandamos o mesmo (pTotTrib), com federais = percentual do cadastro e
 * municipais = alíquota do ISS. Com tudo dentro do Simples (regApTribSN 1),
 * o percentual do cadastro já inclui o ISS e segue no pTotTribSN.
 */
export function totaisAproximadosSimples(args: {
  regimeApuracaoSn: number | null | undefined;
  pctTotTribSN: number;
  aliquotaIss: number;
}) {
  const regime = Number(args.regimeApuracaoSn ?? 1);
  if (regime === 2 || regime === 3) {
    return {
      percentual_total_tributos_federais: args.pctTotTribSN,
      percentual_total_tributos_estaduais: 0,
      percentual_total_tributos_municipais: +(args.aliquotaIss * 100).toFixed(2),
    };
  }
  return { percentual_total_tributos_simples_nacional: args.pctTotTribSN };
}
