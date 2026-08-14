/**
 * Regras de validação para nomes de pessoas (pacientes, responsáveis).
 * Aceita apenas letras (com acentos) e espaços. Bloqueia números,
 * pontuação e símbolos (vírgula, ponto, dois-pontos, aspas etc.).
 */

/** Caracteres permitidos em um nome de pessoa. */
export const NOME_PESSOA_REGEX = /^[\p{L}\s]+$/u;

/** Remove tudo que não for letra ou espaço e normaliza os espaços. */
export function sanitizarNomePessoa(valor: string): string {
  return valor
    .replace(/[^\p{L}\s]/gu, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s+/, "");
}

/** Mensagem de erro para o caractere inválido digitado, ou null se estiver ok. */
export function erroCaractereNome(valor: string): string | null {
  if (/\d/.test(valor)) return "O nome não pode conter números.";
  if (/[^\p{L}\s]/u.test(valor)) {
    return "O nome aceita apenas letras e espaços (sem pontuação ou símbolos).";
  }
  return null;
}

/** Validação final, usada no envio do formulário. */
export function validarNomePessoa(
  valor: string,
  { obrigatorio = true, maxLength = 200 }: { obrigatorio?: boolean; maxLength?: number } = {},
): { valido: boolean; mensagem: string | null; valor: string } {
  const limpo = sanitizarNomePessoa(valor).trim();
  if (!limpo) {
    return obrigatorio
      ? { valido: false, mensagem: "Informe o nome.", valor: limpo }
      : { valido: true, mensagem: null, valor: limpo };
  }
  const erro = erroCaractereNome(valor.trim());
  if (erro) return { valido: false, mensagem: erro, valor: limpo };
  if (limpo.length < 2) return { valido: false, mensagem: "Nome muito curto.", valor: limpo };
  if (limpo.length > maxLength) {
    return {
      valido: false,
      mensagem: `Nome muito longo (máx. ${maxLength} caracteres).`,
      valor: limpo,
    };
  }
  if (!NOME_PESSOA_REGEX.test(limpo)) {
    return { valido: false, mensagem: "O nome aceita apenas letras e espaços.", valor: limpo };
  }
  return { valido: true, mensagem: null, valor: limpo };
}
