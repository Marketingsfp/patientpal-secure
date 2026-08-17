/**
 * Máscara de dinheiro dos campos financeiros (CurrencyInput).
 *
 * Vive fora do componente para poder ser testada sem montar a tela.
 */

/** Converte o valor guardado ("130.00", "") em centavos. */
export function valorEmCentavos(v: string): number {
  if (!v) return 0;
  const n = Number(v);
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

/**
 * Traduz o que o usuário digitou no próximo valor do campo.
 *
 * Apagar tudo esvazia o campo — e apagar um campo que JÁ estava em R$ 0,00
 * também. Antes, o backspace num campo zerado só devolvia zeros, a máscara
 * remontava "R$ 0,00" e não havia como deixar a célula em branco; em telas
 * onde vazio significa "usa o valor padrão" (repasse do médico), isso prendia
 * o usuário num zero que ele não tinha escolhido.
 *
 * Digitar 0 com o campo vazio continua valendo como zero de propósito.
 */
export function proximoValorMoeda(valorAtual: string, textoDigitado: string): string {
  const digitos = textoDigitado.replace(/\D/g, "");
  if (!digitos) return "";
  const apagouUmZeroQueJaEraZero =
    /^0+$/.test(digitos) && valorAtual !== "" && valorEmCentavos(valorAtual) === 0;
  if (apagouUmZeroQueJaEraZero) return "";
  return (parseInt(digitos, 10) / 100).toFixed(2);
}
