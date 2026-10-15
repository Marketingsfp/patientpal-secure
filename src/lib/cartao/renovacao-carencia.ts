/**
 * Renovação do cartão x carência (regra de 15/10/2026).
 *
 * Renovou até 3 meses depois do fim do contrato anterior → mantém o histórico
 * (sem carência). Renovou depois disso → a carência recomeça como num contrato
 * novo; a taxa de adesão continua isenta nos dois casos.
 *
 * Espelha a conta feita no banco (`renovar_contrato_extensao` /
 * `renovar_contrato_troca_plano`): `fim + interval '3 months'`, que no Postgres
 * prende o dia ao último dia do mês (30/11 + 3 meses = 28/02).
 */

/** Último dia em que a renovação ainda mantém a carência ("YYYY-MM-DD"). */
export function limiteJanelaRenovacao(fimContrato: string): string {
  const [y, m, d] = fimContrato.slice(0, 10).split("-").map(Number);
  const alvo = new Date(Date.UTC(y, m - 1 + 3, 1));
  const ultimoDia = new Date(
    Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0),
  ).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

/** true quando a renovação nessa data faz a carência recomeçar. */
export function renovacaoReiniciaCarencia(
  fimContrato: string | null | undefined,
  dataRenovacao: string | null | undefined,
): boolean {
  if (!fimContrato || !dataRenovacao) return false;
  return dataRenovacao.slice(0, 10) > limiteJanelaRenovacao(fimContrato);
}
