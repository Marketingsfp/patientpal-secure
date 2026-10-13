/**
 * Modalidade não informada no catálogo (regra de 13/10/2026).
 *
 * Sem modalidade cadastrada, a Nina não diz que a informação "não consta no
 * sistema": diz que quem informa a forma de atendimento é a equipe de
 * atendimento. Com modalidade cadastrada, informa a do catálogo.
 *
 * Módulo puro: sem banco e sem rede.
 */
import { normalizarRespostaInformal } from "./resposta-afirmativa";

export const TEXTO_MODALIDADE_PELA_EQUIPE =
  "Quem informa a forma de atendimento (horário marcado, ordem de chegada ou ficha) é a nossa equipe de atendimento.";

/** Valor do campo de modalidade entregue à IA quando o catálogo não a traz. */
export const MODALIDADE_INFORMADA_PELA_EQUIPE =
  "informada pela equipe de atendimento (não cadastrada para a Nina)";

export const REGRA_MODALIDADE_NAO_INFORMADA =
  "- Modalidade nao informada no cadastro: nunca diga que a informacao nao consta no sistema, no cadastro ou na base. Diga que quem informa a forma de atendimento (horario marcado, ordem de chegada ou ficha) e a nossa equipe de atendimento. Com modalidade no cadastro, informe exatamente a modalidade cadastrada.";

const ASSUNTO =
  /\b(?:modalidade|forma de atendimento|ordem de chegada|hora marcada|horario marcado|horario certinho|por ficha|pre-?agendamento)\b/;
const AUSENCIA =
  /\b(?:nao (?:consta|constam|esta (?:cadastrad|registrad|informad|disponivel|definid)|tenho (?:essa|esta|a) informacao|temos (?:essa|esta|a) informacao|ha (?:essa|esta) informacao|foi (?:informad|cadastrad|definid))|sem (?:essa|esta) informacao)/;

/** Marca temporária para o ponto das abreviações. */
const PONTO = String.fromCharCode(30);

/**
 * Troca a frase que diz que a modalidade "não consta" pela orientação da
 * equipe. Frases sobre outros assuntos ficam intactas; a troca acontece uma vez.
 */
export function corrigirModalidadeNaoConsta(texto: string): string {
  let trocou = false;
  // "Dra." e afins não terminam a frase: o ponto fica protegido durante a troca.
  const protegido = texto.replace(/\b(?:dra?|sra?|profa?|av)\./gi, (m) => m.slice(0, -1) + PONTO);
  // Frase = trecho até o ponto final, interrogação, exclamação ou quebra de linha.
  const corrigido = protegido.replace(/[^.!?\n]+[.!?]?/g, (frase) => {
    const t = normalizarRespostaInformal(frase.split(PONTO).join("."));
    if (!ASSUNTO.test(t) || !AUSENCIA.test(t)) return frase;
    if (trocou) return "";
    trocou = true;
    const inicio = /^\s*/.exec(frase)?.[0] ?? "";
    return `${inicio}${TEXTO_MODALIDADE_PELA_EQUIPE}`;
  });
  return corrigido.split(PONTO).join(".");
}
