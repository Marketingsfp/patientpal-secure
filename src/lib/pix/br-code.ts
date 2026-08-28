/**
 * Montagem do "BR Code" — o texto que vira o QR Code do PIX.
 *
 * O padrão é o EMV®QRCPS do Banco Central (Manual de Padrões para Iniciação
 * do PIX). O texto é uma sequência de campos no formato ID + TAMANHO + VALOR,
 * onde ID e TAMANHO têm sempre 2 dígitos. Exemplo do começo de todo payload:
 *
 *     00  02  01      → campo 00, 2 caracteres, valor "01"
 *
 * O último campo (63) é um CRC calculado sobre tudo que veio antes, inclusive
 * o próprio "6304". É ele que faz o aplicativo do banco recusar um código
 * digitado errado.
 *
 * Nada aqui conversa com banco nem com o Banco Central: é só a montagem do
 * texto. Quem paga lê o QR no aplicativo do próprio banco e o dinheiro cai
 * direto na conta da chave informada. Por isso a baixa da parcela no sistema
 * continua sendo um ato manual de quem confere o recebimento — este arquivo
 * não confirma pagamento nenhum.
 */

export interface DadosPix {
  /** Chave PIX que RECEBE (CPF/CNPJ, e-mail, telefone ou chave aleatória). */
  chave: string;
  /** Nome de quem recebe. O padrão corta em 25 caracteres. */
  beneficiario: string;
  /** Cidade de quem recebe. O padrão corta em 15 caracteres. */
  cidade: string;
  /** Valor em reais. Se ausente ou zero, o QR sai "em aberto" (o pagador digita). */
  valor?: number | null;
  /**
   * Identificador da cobrança, usado na conciliação. Só letras e números,
   * até 25 caracteres. Sem valor, o padrão manda usar "***".
   */
  txid?: string | null;
  /** Texto livre que alguns bancos exibem para o pagador. Opcional. */
  descricao?: string | null;
}

/** Campo ID + TAMANHO + VALOR. O tamanho é o do valor, com 2 dígitos. */
function campo(id: string, valor: string): string {
  if (!valor) return "";
  const tamanho = String(valor.length).padStart(2, "0");
  return `${id}${tamanho}${valor}`;
}

/**
 * Tira acento e deixa só o que o padrão aceita com segurança. Bancos
 * costumam recusar (ou exibir errado) acentuação nos campos de nome e cidade.
 */
export function normalizarTexto(texto: string, limite: number): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, limite)
    .trim();
}

/**
 * Deixa o identificador só com letras e números. O padrão não aceita espaço
 * nem pontuação aqui, e corta em 25 caracteres.
 */
export function normalizarTxid(texto: string): string {
  const limpo = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 25);
  return limpo || "***";
}

/**
 * CRC-16/CCITT-FALSE: polinômio 0x1021, valor inicial 0xFFFF, sem inversão
 * de bits e sem XOR final. É o algoritmo que o manual do PIX exige no campo
 * 63. O teste cobre o vetor clássico ("123456789" → 0x29B1).
 */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i += 1) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Valor em reais no formato do padrão: ponto como separador decimal e sempre
 * duas casas. Valor ausente, zero ou negativo devolve string vazia — nesse
 * caso o campo não entra no payload e o QR fica em aberto.
 */
function formatarValor(valor?: number | null): string {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toFixed(2);
}

/** Motivo pelo qual não deu para montar o código, em português simples. */
export type ErroPix = "sem-chave" | "sem-beneficiario" | "sem-cidade";

export interface ResultadoPix {
  payload: string | null;
  erro: ErroPix | null;
}

/**
 * Monta o texto do BR Code. Devolve `erro` em vez de lançar exceção porque a
 * tela precisa saber o que está faltando para orientar quem está no balcão
 * (ex.: "a chave PIX da clínica ainda não foi cadastrada").
 */
export function montarPayloadPix(dados: DadosPix): ResultadoPix {
  const chave = (dados.chave ?? "").trim();
  if (!chave) return { payload: null, erro: "sem-chave" };

  const beneficiario = normalizarTexto(dados.beneficiario ?? "", 25);
  if (!beneficiario) return { payload: null, erro: "sem-beneficiario" };

  const cidade = normalizarTexto(dados.cidade ?? "", 15);
  if (!cidade) return { payload: null, erro: "sem-cidade" };

  // Campo 26 — a conta PIX de destino. O GUI é fixo pelo Banco Central.
  const descricao = normalizarTexto(dados.descricao ?? "", 60);
  const contaPix =
    campo("00", "br.gov.bcb.pix") + campo("01", chave) + (descricao ? campo("02", descricao) : "");

  // Campo 62 — dados adicionais; o 05 é o identificador da cobrança.
  const txid = normalizarTxid(dados.txid ?? "");
  const dadosAdicionais = campo("05", txid);

  const semCrc =
    campo("00", "01") + // formato do payload
    campo("01", "12") + // 12 = uso único (cobrança com valor definido)
    campo("26", contaPix) +
    campo("52", "0000") + // categoria do estabelecimento: não informada
    campo("53", "986") + // moeda: real
    campo("54", formatarValor(dados.valor)) +
    campo("58", "BR") +
    campo("59", beneficiario) +
    campo("60", cidade) +
    campo("62", dadosAdicionais) +
    "6304"; // o CRC entra logo depois, mas o "6304" já entra na conta

  return { payload: semCrc + crc16(semCrc), erro: null };
}

/**
 * Identificador de cobrança de uma mensalidade do Cartão Benefícios.
 * Formato: CT<numero do contrato>P<numero da parcela> — ex.: CT20262655P8.
 * Serve para conciliar o PIX recebido com a parcela certa no extrato.
 */
export function txidMensalidade(numeroContrato: number | null, numeroParcela: number): string {
  return normalizarTxid(`CT${numeroContrato ?? 0}P${numeroParcela}`);
}

/**
 * Competência da parcela no formato MM/AAAA, tirada da data de vencimento.
 * É o que aparece para o paciente ("Mensalidade Contrato #20262655 - 08/2026").
 */
export function competenciaDeVencimento(vencimento?: string | null): string {
  const iso = (vencimento ?? "").slice(0, 10);
  const [ano, mes] = iso.split("-");
  if (!ano || !mes) return "";
  return `${mes}/${ano}`;
}
