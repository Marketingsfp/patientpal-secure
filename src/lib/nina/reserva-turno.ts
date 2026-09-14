/** Perda do lease interrompe este turno; não é falha que autoriza resposta alternativa. */
export class ErroReservaTurnoPerdida extends Error {
  readonly codigo = "NINA_RESERVA_TURNO_PERDIDA";
  constructor() {
    super(
      "A reserva deste turno não está mais confirmada; nenhuma nova ação ou resposta será iniciada.",
    );
    this.name = "ErroReservaTurnoPerdida";
  }
}

/**
 * A primeira falha invalida o turno definitivamente. Mesmo que um catch
 * interno tente produzir fallback e a próxima leitura seja positiva, não
 * podemos recuperar autoridade de uma geração que perdeu sua reserva.
 */
export function criarGuardiaoReservaTurno(
  validar?: () => Promise<boolean>,
): () => Promise<boolean> {
  let perdida = false;
  return async () => {
    if (perdida) throw new ErroReservaTurnoPerdida();
    if (!validar) return true;
    try {
      if ((await validar()) && !perdida) return true;
    } catch {
      // Falha ao confirmar a propriedade do turno também impede efeito.
    }
    perdida = true;
    throw new ErroReservaTurnoPerdida();
  };
}
