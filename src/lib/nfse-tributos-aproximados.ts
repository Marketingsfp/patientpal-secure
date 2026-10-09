/**
 * Totais aproximados dos tributos (Lei 12.741/2012) para emitente NÃO optante
 * do Simples Nacional. Antes iam zerados ("Federais: R$ 0,00; ..."). Agora vão
 * em percentual por esfera (pTotTrib), igual à nota emitida no portal nacional
 * ("Federais: 3,65 %; Estaduais: 0,00 %; Municipais: 3,00 %"):
 *
 * - Federais: percentual informado pela contabilidade no cadastro do emitente
 *   ("Total aproximado de tributos federais (%)"); vazio = 0.
 * - Estaduais: serviço não tem tributo estadual, fica 0.
 * - Municipais: alíquota do ISS da nota.
 */
export function totaisAproximadosNaoOptante(args: {
  pctFederais: number | null | undefined;
  aliquotaIss: number;
}) {
  const pct = args.pctFederais != null ? Number(args.pctFederais) : 0;
  return {
    percentual_total_tributos_federais: Number.isFinite(pct) && pct > 0 ? pct : 0,
    percentual_total_tributos_estaduais: 0,
    percentual_total_tributos_municipais: +(args.aliquotaIss * 100).toFixed(2),
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
