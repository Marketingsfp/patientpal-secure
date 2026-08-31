/**
 * Orientação de qual empresa costuma emitir cada tipo de serviço.
 *
 * A clínica emite por dois CNPJs: consulta costuma sair pela CASA DE SAUDE E
 * MATERNIDADE e exame de imagem/gráfico pela MA IMAGENS.
 *
 * Isto é ORIENTAÇÃO, não decisão. A empresa que assina a nota é sempre a
 * escolhida no formulário: escolheu MA, sai MA; escolheu CASA DE SAUDE, sai
 * CASA DE SAUDE. Este módulo só serve para a tela avisar antes de emitir e
 * para o servidor registrar a divergência na nota.
 *
 * Antes era o contrário: esta relação vivia escondida dentro de `emitirNfse` e
 * reescrevia o emitente DEPOIS que a funcionária já tinha escolhido a empresa
 * no modal — ela selecionava "CASA DE SAUDE", digitava "ECOCARDIOGRAMA" e a
 * nota saía em "MA" sem nenhum aviso. Era a causa do relato "empresa trocada".
 * O dono determinou que a escolha da funcionária passasse a mandar sempre, com
 * o aviso no lugar da troca automática. Não voltar a decidir por aqui.
 */

/** Só dígitos — CNPJ é gravado ora com máscara, ora sem. */
export const somenteDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export type TipoServicoNfse = "consulta" | "exame";

export interface DestinoFiscal {
  tipo: TipoServicoNfse;
  /** CNPJ da empresa que costuma emitir esse tipo, apenas dígitos. */
  cnpj: string;
  /** Nome usado nas mensagens ao usuário. */
  nome: string;
}

const DESTINO_CONSULTA: DestinoFiscal = {
  tipo: "consulta",
  cnpj: "31919483000318",
  nome: "CASA DE SAUDE E MATERNIDADE",
};

const DESTINO_EXAME: DestinoFiscal = {
  tipo: "exame",
  cnpj: "57786061000143",
  nome: "MA IMAGENS",
};

/** Palavras que caracterizam exame de imagem ou gráfico. */
const RE_EXAME =
  /\bexam|ultrassom|ultra-?som|raio.?x|raio x|radiograf|tomograf|ressonan|mamograf|densitometr|ecocardio|eletrocardio|\becg\b|\beeg\b|holter|endoscop|colonoscop|doppler|ecograf/i;

const RE_CONSULTA = /consulta/i;

/**
 * Diz qual empresa a descrição sugere, ou `null` quando o texto não
 * caracteriza nem consulta nem exame — aí não há o que comentar.
 *
 * Exame tem precedência sobre consulta: uma descrição que cite os dois (nota
 * agrupada, por exemplo) é tratada como exame. Como isto hoje só alimenta um
 * aviso, o efeito de errar é uma sugestão inadequada, não uma nota no CNPJ
 * errado.
 */
export function destinoFiscalPorDescricao(
  descricao: string | null | undefined,
): DestinoFiscal | null {
  const texto = descricao ?? "";
  if (RE_EXAME.test(texto)) return DESTINO_EXAME;
  if (RE_CONSULTA.test(texto)) return DESTINO_CONSULTA;
  return null;
}

/**
 * Compara a orientação com o emitente escolhido no formulário. Retorna `null`
 * quando não há nada a avisar — a escolha já bate com a orientação, ou a
 * descrição não sugere empresa nenhuma.
 *
 * Quem chama usa isto SÓ para avisar e registrar. A empresa da nota continua
 * sendo a escolhida no formulário.
 */
export function conferirEscolhaDeEmitente(
  descricao: string | null | undefined,
  cnpjEscolhido: string | null | undefined,
): DestinoFiscal | null {
  const destino = destinoFiscalPorDescricao(descricao);
  if (!destino) return null;
  return somenteDigitos(cnpjEscolhido) === destino.cnpj ? null : destino;
}
