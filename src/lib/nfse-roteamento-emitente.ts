/**
 * Regra de roteamento fiscal da NFS-e por tipo de serviço.
 *
 * A clínica emite por dois CNPJs e o enquadramento não é escolha da recepção:
 * consulta sai pela CASA DE SAUDE E MATERNIDADE e exame de imagem/gráfico sai
 * pela MA IMAGENS. Até então essa regra vivia escondida dentro de
 * `emitirNfse` e reescrevia o emitente DEPOIS que a funcionária já tinha
 * escolhido a empresa no modal — ela selecionava "CASA DE SAUDE", digitava
 * "ECOCARDIOGRAMA" e a nota saía em "MA" sem nenhum aviso. O relato de
 * "empresa trocada" é exatamente esse desvio silencioso.
 *
 * A regra continua valendo (é o enquadramento correto), mas agora mora aqui,
 * num módulo que o servidor E a tela importam. Assim a tela consegue avisar
 * ANTES de enviar em qual empresa a nota vai realmente sair, e o servidor
 * consegue registrar na nota que houve desvio.
 */

/** Só dígitos — CNPJ é gravado ora com máscara, ora sem. */
export const somenteDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export type TipoServicoNfse = "consulta" | "exame";

export interface DestinoFiscal {
  tipo: TipoServicoNfse;
  /** CNPJ do emitente obrigatório para esse tipo, apenas dígitos. */
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
 * Diz em qual empresa a descrição obriga a nota a sair, ou `null` quando o
 * texto não caracteriza nem consulta nem exame — aí vale a escolha do
 * formulário.
 *
 * Exame tem precedência sobre consulta: uma descrição que cite os dois
 * (nota agrupada, por exemplo) vai inteira para a MA. Isso é intencional,
 * mas é o ponto a revisar caso a clínica passe a agrupar consulta e exame
 * na mesma nota.
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
 * Compara o destino obrigatório com o emitente escolhido no formulário.
 * Retorna `null` quando não há desvio (a escolha já está correta ou a
 * descrição não aciona a regra).
 */
export function conferirEscolhaDeEmitente(
  descricao: string | null | undefined,
  cnpjEscolhido: string | null | undefined,
): DestinoFiscal | null {
  const destino = destinoFiscalPorDescricao(descricao);
  if (!destino) return null;
  return somenteDigitos(cnpjEscolhido) === destino.cnpj ? null : destino;
}
