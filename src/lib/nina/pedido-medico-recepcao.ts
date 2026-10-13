/**
 * Pedido médico não informado no catálogo (regra de 13/10/2026).
 *
 * A Nina informa só o que o cadastro traz (obrigatório ou dispensado). Sem a
 * informação, não supõe ("geralmente não é necessário…"): diz que quem tira
 * essa dúvida é a recepção.
 *
 * Módulo puro: sem banco e sem rede.
 */
import { normalizarRespostaInformal } from "./resposta-afirmativa";

export const TEXTO_PEDIDO_MEDICO_RECEPCAO = "quem tira essa dúvida é a nossa recepção.";

/** Linha entregue à IA quando o cadastro não informa o pedido médico. */
export const PEDIDO_MEDICO_NAO_INFORMADO =
  "Pedido médico: não informado no cadastro — quem tira essa dúvida é a nossa recepção. Não suponha se é ou não necessário.";

export const REGRA_PEDIDO_MEDICO_NAO_INFORMADO =
  "- Pedido medico: informe somente o que o cadastro traz (obrigatorio ou dispensado). Sem essa informacao no cadastro, nao suponha (nada de 'geralmente', 'normalmente', 'por ser consulta particular nao precisa'): diga que quem tira essa duvida e a nossa recepcao.";

const ASSUNTO = /\b(?:pedido(?: medico)?|encaminhamento medico|guia medica|solicitacao medica)\b/;
const SUPOSICAO =
  /\b(?:geralmente|normalmente|em geral|costuma|provavelmente|via de regra|a principio|nao (?:e|seria) (?:necessari|obrigatori|preciso)|nao precisa|nao exige|nao e exigid|dispensa|por ser (?:uma )?consulta)\b/;

/**
 * Troca a frase (ou a linha "Pedido médico: …") que supõe se o pedido médico é
 * necessário pela orientação da recepção. A troca acontece uma vez; o resto
 * da resposta fica igual.
 */
export function corrigirSuposicaoPedidoMedico(texto: string): string {
  let trocou = false;
  const linhas = texto.split("\n").flatMap((linha) => {
    const t = normalizarRespostaInformal(linha);
    if (!ASSUNTO.test(t) || !SUPOSICAO.test(t)) return [linha];
    if (trocou) return [];
    trocou = true;
    // Linha com rótulo ("*Pedido médico:* …"): mantém o rótulo.
    const rotulo = /^(\s*[•*_-]*\s*[*_]{0,2}pedido m[ée]dico[*_]{0,2}\s*:\s*[*_]{0,2})/i.exec(
      linha,
    );
    if (rotulo)
      return [`${rotulo[1]!.trimEnd()} ${TEXTO_PEDIDO_MEDICO_RECEPCAO.replace(/^q/, "Q")}`];
    // Frase solta: troca só a frase que supõe.
    const frases = linha.match(/[^.!?]+[.!?]*/g) ?? [linha];
    return [
      frases
        .map((f) => {
          const n = normalizarRespostaInformal(f);
          return ASSUNTO.test(n) && SUPOSICAO.test(n)
            ? `${/^\s*/.exec(f)?.[0] ?? ""}Sobre o pedido médico, ${TEXTO_PEDIDO_MEDICO_RECEPCAO}`
            : f;
        })
        .join(""),
    ];
  });
  return linhas.join("\n");
}
