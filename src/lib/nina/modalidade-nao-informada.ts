/**
 * Modalidade não informada no catálogo (regra de 13/10/2026).
 *
 * Sem modalidade cadastrada, a Nina não diz que a informação "não consta no
 * sistema": diz que quem informa a forma de atendimento é a equipe de
 * atendimento. Com modalidade cadastrada, informa a do catálogo.
 *
 * Só quando o paciente pergunta (regra de 13/10/2026, segunda revisão): no
 * fluxo normal a Nina não fala da forma de atendimento. Exceções: ordem de
 * chegada sem pré-agendamento quando o paciente quer marcar ("não precisa
 * agendar, basta comparecer") e o agendamento feito pela própria Nina.
 *
 * Módulo puro: sem banco e sem rede.
 */
import { normalizarRespostaInformal } from "./resposta-afirmativa";

export const TEXTO_MODALIDADE_PELA_EQUIPE =
  "Quem informa a forma de atendimento (horário marcado, ordem de chegada ou ficha) é a nossa recepção.";

/** Valor do campo de modalidade entregue à IA quando o catálogo não a traz. */
export const MODALIDADE_INFORMADA_PELA_EQUIPE = "informada pela nossa recepção";

export const REGRA_MODALIDADE_NAO_INFORMADA =
  "- Modalidade (horario marcado, ordem de chegada ou ficha): so fale dela quando o paciente perguntar como funciona o atendimento; no fluxo normal nao mencione. Excecao: ordem de chegada sem pre-agendamento quando o paciente quer marcar (diga que nao precisa agendar, basta comparecer). Quando perguntarem: com modalidade no cadastro, informe exatamente a cadastrada; sem modalidade, diga que quem informa a forma de atendimento e a nossa recepcao, nunca que a informacao nao consta no sistema, no cadastro ou na base.";

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

/** O paciente perguntou como funciona o atendimento (horário marcado, ordem de chegada, ficha…)? */
export function pacientePerguntouModalidade(mensagem: string): boolean {
  const t = normalizarRespostaInformal(mensagem ?? "");
  // "Como funciona aí?" sozinho é genérico (14/10/2026): só conta "como funciona
  // o atendimento/a marcação/a chamada…".
  return /\b(?:modalidade|forma de atendimento|ordem de chegada|por ordem|hora marcada|horario marcado|horario certinho|horario certo|ficha|pre-?agendamento|encaixe|como funciona (?:o atendimento|o agendamento|a marcacao|a chamada|a fila|a ordem|pra marcar|para marcar|pra agendar|para agendar)|reservar (?:um )?horario|precisa (?:marcar|agendar|reservar)|tem que (?:marcar|agendar)|chegar cedo|que horas (?:devo|tenho que|preciso|eu) chegar|so chegar|e so ir|chego e)\b/.test(
    t,
  );
}

const ROTULO_MODALIDADE =
  /[*_]{0,2}(?:modalidade|forma de atendimento)(?: e agendamento)?(?:\s*:\s*[*_]{0,2}|[*_]{1,2}\s*:)/i;
const ASSUNTO_MODALIDADE =
  /\b(?:modalidade|forma (?:exata )?de atendimento|ordem de chegada|hora marcada|horario marcado|por ficha|numeracao \(ficha\)|pre-?agendamento|agendamento previo|como funciona a chamada|funcionamento do atendimento)\b/;

/**
 * Tira da resposta o que fala da forma de atendimento, quando o paciente não
 * perguntou: linhas "Modalidade: …", o rótulo dentro de uma linha, o trecho
 * "na modalidade de hora marcada" e frases inteiras sobre o assunto. O resto
 * (dias, horários, valores) fica; a resposta nunca fica vazia.
 */
export function removerModalidadeNaoPerguntada(texto: string): string {
  const linhas = texto.split("\n").flatMap((linha) => {
    // "*Modalidade:* Hora marcada" sozinha na linha, ou como cabeçalho.
    const inicio = linha.search(ROTULO_MODALIDADE);
    if (inicio >= 0 && /^[\s*_•-]*$/.test(linha.slice(0, inicio))) return [];
    // Rótulo no meio da linha ("… *Horário:* sábado *Modalidade:* hora marcada").
    let l = inicio > 0 ? linha.slice(0, inicio).trimEnd() : linha;
    l = l
      .replace(
        /\s*\((?:[^()]*\b(?:ordem de chegada|hora marcada|horário marcado|horario marcado|ficha)\b[^()]*)\)/gi,
        "",
      )
      .replace(/,?\s*(?:na|em|pela|por)\s+modalidade(?:\s+de)?\s+[^.,;\n]*/gi, "")
      .replace(
        /,?\s*(?:com|por|na|em)\s+(?:hora marcada|horário marcado|horario marcado|ordem de chegada)(?:\s*\([^)]*\))?(?=[.,;\n]|$)/gi,
        "",
      );
    // Frases que ainda falam do assunto saem inteiras.
    const frases = l.match(/[^.!?]+[.!?]*/g) ?? [];
    const restantes = frases.filter((f) => !ASSUNTO_MODALIDADE.test(normalizarRespostaInformal(f)));
    const nova = restantes
      .join("")
      .replace(/\s{2,}/g, " ")
      .trimEnd();
    if (!nova.trim() && linha.trim()) return [];
    return [/^\s/.test(nova) && !/^\s/.test(linha) ? nova.trimStart() : nova];
  });
  const resultado = linhas
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return resultado || texto;
}
