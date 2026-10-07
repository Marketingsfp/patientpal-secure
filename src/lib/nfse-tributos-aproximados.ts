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
