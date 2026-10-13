/**
 * Informação que o cadastro não traz (regra de 13/10/2026, vale para todos os casos).
 *
 * A Nina responde só com o que o cadastro traz. Faltando a informação ou
 * estando "não informada" (público atendido, gênero, preparo, pedido médico,
 * documentos, convênio, parcelamento, modalidade…), ela não supõe e não diz
 * que a informação "não está cadastrada": diz que quem passa é a recepção.
 * IDADE-01 continua: idade não informada não cria restrição (sem citar cadastro).
 *
 * Módulo puro: sem banco e sem rede.
 */
import { normalizarRespostaInformal } from "./resposta-afirmativa";

export const TEXTO_INFORMACAO_PELA_RECEPCAO = "Essa informação quem passa é a nossa recepção.";

export const REGRA_INFORMACAO_NAO_CADASTRADA = `INFORMACAO NAO CADASTRADA — REGRA INEGOCIAVEL:
- Responda somente com o que o cadastro traz. Quando o paciente pedir algo que o cadastro nao traz ou traz como nao informado (ex.: publico atendido, genero, pedido medico, preparo, documentos, convenio, parcelamento, modalidade, duracao, resultado), nao suponha e nao complete com conhecimento geral ("normalmente", "geralmente", "para o publico geral").
- Nunca diga ao paciente que a informacao nao esta cadastrada, nao consta no sistema, nao foi informada ou que nao ha restricao cadastrada.
- Diga que quem passa essa informacao e a nossa recepcao.
- Excecao: IDADE-01 continua valendo (idade nao informada nao cria restricao etaria); ao aplicar, nao mencione o cadastro.`;

/** Frase que expõe ao paciente a falta de cadastro ("não está cadastrado", "não consta no sistema"…). */
const FALTA_DE_CADASTRO =
  /\b(?:nao (?:esta|estao|consta|constam|ha|temos|tenho|possui|possuem|foi|foram|existe)\b[^.!?\n]{0,60}\b(?:cadastrad|registrad|informad|no sistema|no cadastro|na base|em nosso sistema|no nosso sistema|no nosso cadastro)|sem\b[^.!?\n]{0,40}\b(?:cadastrad|registrad|informad)|nao (?:tenho|temos) (?:essa|esta|a) informacao|(?:essa|esta) informacao nao (?:esta|consta|foi))/;
/** Assunto de idade: IDADE-01 manda não falar de restrição inexistente, só remover a frase. */
const IDADE =
  /\b(?:idade|anos|crianca|criancas|bebe|bebes|faixa etaria|idosos?|menor(?:es)? de idade)\b/;

const PONTO = String.fromCharCode(30);

/**
 * Troca a frase que expõe a falta de cadastro pela orientação da recepção (uma
 * vez por resposta). Frase sobre idade sem restrição sai sem substituição
 * (IDADE-01). O resto da resposta fica igual e ela nunca fica vazia.
 */
export function corrigirInformacaoNaoCadastrada(texto: string): string {
  let trocou = false;
  const protegido = texto.replace(/\b(?:dra?|sra?|profa?)\./gi, (m) => m.slice(0, -1) + PONTO);
  const corrigido = protegido.replace(/[^.!?\n]+[.!?]*/g, (frase) => {
    const t = normalizarRespostaInformal(frase.split(PONTO).join("."));
    if (!FALTA_DE_CADASTRO.test(t)) return frase;
    // Rótulo no início da frase ("*Preparo:* …") continua; só o conteúdo muda.
    const inicio =
      /^\s*(?:[•*_-]*\s*[*_]{0,2}[\p{L} /]{2,40}?[*_]{0,2}\s*:\s*[*_]{0,2}\s*)?/u.exec(
        frase,
      )?.[0] ?? "";
    if (IDADE.test(t)) return "";
    if (trocou) return "";
    trocou = true;
    return `${inicio}${TEXTO_INFORMACAO_PELA_RECEPCAO}`;
  });
  const resultado = corrigido
    .split(PONTO)
    .join(".")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return resultado || texto;
}
