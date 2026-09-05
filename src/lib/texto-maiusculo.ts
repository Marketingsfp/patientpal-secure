/**
 * Caixa alta dos campos de identificação.
 *
 * Por que isto existe no front se o banco já resolve: o Postgres tem o
 * gatilho `tg_uppercase_text_fields`, que ao gravar passa `upper()` +
 * remoção de acentos nas colunas de identificação (nome, logradouro,
 * bairro, cidade, complemento, descricao, parentesco…) de dezenas de
 * tabelas. O dado no banco, portanto, sempre sai padronizado.
 *
 * O que faltava era a tela contar isso para quem digita. A recepcionista
 * escrevia "maria da silva", via minúsculo o formulário inteiro, salvava e
 * só então o nome aparecia como "MARIA DA SILVA" na listagem — parecia que
 * o sistema tinha mudado o que ela escreveu. Aplicando a caixa alta já na
 * digitação, o campo mostra desde o primeiro caractere exatamente o que
 * será gravado.
 *
 * O que NÃO fazemos aqui de propósito:
 *
 * - Não removemos acentos durante a digitação. Quem digita precisa ver o
 *   nome como o paciente o escreve para conferir com o documento; tirar o
 *   "Ã" de "JOÃO" letra a letra atrapalha essa conferência. A remoção
 *   continua acontecendo na gravação, no gatilho do banco.
 * - Não aplicamos em e-mail, senha, login, texto clínico do prontuário
 *   (queixa, conduta, prescrição) nem em mensagem enviada ao paciente.
 *   Maiúsculo ali ou quebra o acesso ao sistema ou prejudica a leitura.
 */

/** Caixa alta para uso enquanto o campo é digitado (preserva os espaços). */
export function maiusculoDigitacao(v: string): string {
  return v.toUpperCase();
}

/**
 * Caixa alta para o momento de salvar: tira espaços das pontas e reduz
 * espaços repetidos no meio a um só. Os espaços duplicados são a causa
 * conhecida de cadastros duplicados que não se reconhecem entre si
 * ("MARIA  SILVA" e "MARIA SILVA").
 *
 * Use apenas em campos de uma linha — a redução de espaços apagaria as
 * quebras de linha de um texto longo.
 */
export function maiusculoParaBanco(v: string): string {
  return v.toUpperCase().replace(/\s+/g, " ").trim();
}
