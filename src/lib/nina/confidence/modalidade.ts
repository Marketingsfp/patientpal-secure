/**
 * FASE 3 — NEGAÇÕES E COBERTURA DAS AFIRMAÇÕES (camada pura).
 *
 * Antes, a modalidade era lida na FRASE inteira: um "não" em qualquer lugar
 * transformava toda a frase em negativa. Isso produzia dois erros opostos:
 *
 *   "Não precisa de encaminhamento, a consulta custa R$ 999."
 *      -> o preço deixava de ser conferido contra a fonte;
 *   "Não temos vaga" com a agenda devolvendo vaga
 *      -> a negativa era aprovada só porque a consulta respondeu.
 *
 * A partir daqui a modalidade é determinada por ORAÇÃO, e a negativa é
 * classificada quanto à sua natureza: ausência afirmada, informação
 * desconhecida, falha de consulta ou recusa/limitação.
 *
 * Módulo puro: nenhuma consulta a banco, rede ou modelo.
 */
import type { ModalidadeClaim } from "./types";

/** O que a oração realmente faz — mais fino que `ModalidadeClaim`. */
export type NaturezaAfirmacao =
  /** Afirma um dado positivo ("a consulta custa R$ 150"). */
  | "afirmacao_positiva"
  /** Afirma que algo NÃO existe ("não temos vaga", "não realizamos o exame"). */
  | "ausencia_afirmada"
  /** Declara não saber ("não tenho essa informação", "não consta"). */
  | "desconhecido_declarado"
  /** Declara que a consulta falhou ("não consegui consultar a agenda"). */
  | "falha_declarada"
  /** Recusa ou limita a própria atuação ("não posso informar por aqui"). */
  | "recusa_ou_limitacao"
  /** Apresenta como estimativa ("geralmente", "costuma"). */
  | "hipotese"
  /** Pergunta ao paciente — não afirma nada. */
  | "pergunta";

/**
 * Naturezas que NÃO são afirmação factual sobre o mundo: nada a conferir
 * contra fonte, e também nada a penalizar.
 */
export const NATUREZAS_NAO_FACTUAIS: ReadonlySet<NaturezaAfirmacao> = new Set<NaturezaAfirmacao>([
  "desconhecido_declarado",
  "falha_declarada",
  "recusa_ou_limitacao",
  "pergunta",
]);

// --------------------------------------------------------------- orações

/**
 * Divide o texto em ORAÇÕES: além de ponto, quebra e ponto e vírgula, também
 * vírgula e conectivos ("e", "mas", "porém"). O "não" de uma oração não
 * alcança a oração seguinte.
 */
export function oracoesDaResposta(texto: string): Array<{ texto: string; inicio: number }> {
  const t = texto ?? "";
  const oracoes: Array<{ texto: string; inicio: number }> = [];
  const re = /[.!?;,\n]+|\s+(?:e|mas|por[ée]m|contudo|entretanto|todavia|j[áa] que|pois)\s+/giu;
  let inicio = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    oracoes.push({ texto: t.slice(inicio, m.index), inicio });
    inicio = m.index + m[0].length;
  }
  if (inicio < t.length) oracoes.push({ texto: t.slice(inicio), inicio });
  return oracoes.filter((o) => o.texto.trim() !== "");
}

/** Oração que contém a posição informada. */
export function oracaoNaPosicao(texto: string, posicao: number): string {
  const o = oracoesDaResposta(texto).find(
    (x) => posicao >= x.inicio && posicao <= x.inicio + x.texto.length,
  );
  return (o?.texto ?? texto).trim();
}

// --------------------------------------------------------------- natureza

const RE_PERGUNTA = /\?\s*$/;
const RE_HIPOTESE =
  /\b(geralmente|normalmente|costuma|em m[ée]dia|acredito|acho que|talvez|deve ser|provavelmente)\b/i;
const RE_DESCONHECIDO =
  /\bn[ãa]o\s+sei\b|\bn[ãa]o\s+(tenho|temos|possuo|localizei|encontrei)\s+(essa\s+|esta\s+|a\s+|o\s+)?(informa[çc][ãa]o|informa[çc][õo]es|dado|dados|registro)\b|\bn[ãa]o\s+consta\b|\bsem\s+(informa[çc][ãa]o|confirma[çc][ãa]o|previs[ãa]o)\b|\bn[ãa]o\s+est[áa]\s+dispon[íi]vel\s+na\s+base\b/i;
const RE_FALHA =
  /\bn[ãa]o\s+consegui\s+(consultar|acessar|verificar)\b|\b(sistema|agenda|base)\s+(fora do ar|indispon[íi]vel|instável|instavel)\b|\bfalha\s+ao\s+consultar\b|\binstabilidade\b/i;
const RE_RECUSA =
  /\bn[ãa]o\s+(posso|podemos|consigo)\s+(informar|passar|confirmar|resolver)\b|\bn[ãa]o\s+estou\s+autorizad/i;
const RE_NEGACAO =
  /\b(n[ãa]o|nao|nenhum|nenhuma|sem)\b|\bainda\s+n[ãa]o\b|\besgotad[oa]s?\b|\bindispon[íi]ve(l|is)\b/i;

/** Natureza de UMA oração (nunca da resposta inteira). */
export function classificarNatureza(oracao: string): NaturezaAfirmacao {
  const o = (oracao ?? "").trim();
  if (!o) return "afirmacao_positiva";
  if (RE_PERGUNTA.test(o)) return "pergunta";
  if (RE_FALHA.test(o)) return "falha_declarada";
  if (RE_DESCONHECIDO.test(o)) return "desconhecido_declarado";
  if (RE_RECUSA.test(o)) return "recusa_ou_limitacao";
  if (RE_HIPOTESE.test(o)) return "hipotese";
  if (RE_NEGACAO.test(o)) return "ausencia_afirmada";
  return "afirmacao_positiva";
}

/** Compatibilidade com o contrato antigo de modalidade. */
export function modalidadeDaNatureza(n: NaturezaAfirmacao): ModalidadeClaim {
  if (n === "pergunta") return "pergunta";
  if (n === "hipotese") return "hipotese";
  if (n === "afirmacao_positiva") return "afirmacao";
  return "negacao";
}

/**
 * A resposta contém dado operacional (preço, horário, endereço, preparo) que
 * o extrator DEVERIA ter reconhecido? Serve para não tratar "zero afirmações
 * reconhecidas" como prova de que não havia nada a verificar.
 */
export function pareceConterDadoOperacional(texto: string): boolean {
  const t = (texto ?? "").trim();
  if (!t) return false;
  return (
    /R\$\s?\d/i.test(t) ||
    /\b\d{1,2}\s?(h\b|:\d{2})/i.test(t) ||
    /\b\d{1,2}\/\d{1,2}\b/.test(t) ||
    /\b(jejum|preparo|encaminhamento)\b/i.test(t) ||
    /\b(rua|avenida|av\.)\b/i.test(t) ||
    /\b(vaga|hor[áa]rio|disponibilidade|agenda)\b/i.test(t)
  );
}
