/**
 * Limpeza do texto digitado — ou COLADO — nos campos de busca.
 *
 * A recepção quase nunca digita o nome inteiro: copia de um WhatsApp, de um
 * PDF de convênio, de uma planilha, e cola no campo. Esse texto costuma vir
 * com sujeira invisível que quebra a busca no banco:
 *
 *   - espaço sobrando no começo e no fim;
 *   - dois ou mais espaços no meio ("MARIA  DA SILVA");
 *   - espaço "duro" (NBSP) no lugar do espaço comum — muito comum ao copiar
 *     de página web e de PDF;
 *   - quebra de linha e tabulação vindas de planilha;
 *   - caracteres de largura zero (marca de ordenação do Word, BOM de arquivo)
 *     que não aparecem na tela mas contam como texto.
 *
 * Como os nomes estão gravados no banco com um único espaço simples entre as
 * palavras, qualquer um desses caracteres faz o `LIKE '%termo%'` não casar com
 * ninguém — o paciente existe, mas "não aparece". Medido em produção: colar um
 * nome com espaço duplo devolve ZERO resultado para um paciente que existe.
 *
 * Use SEMPRE esta função antes de mandar um termo de busca ao banco.
 *
 * `\p{Cf}` = caracteres de formatação invisíveis; `\s` em JavaScript já cobre
 * o NBSP, a tabulação e a quebra de linha.
 */
export function normalizarTermoBusca(bruto: string | null | undefined): string {
  return (bruto ?? "")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Mesma limpeza, mais a normalização usada para comparar nomes: sem acento e
 * em maiúsculas — o formato em que os nomes estão gravados na tabela
 * `pacientes` e na coluna `agendamentos.paciente_nome` (conferido em produção:
 * 252.465 cadastros, nenhum com acento, minúscula ou espaço duplicado).
 *
 * `\p{M}` remove os sinais de acento que o `normalize("NFD")` separa da letra.
 */
export function normalizarNomeBusca(bruto: string | null | undefined): string {
  return normalizarTermoBusca(bruto).normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
}
