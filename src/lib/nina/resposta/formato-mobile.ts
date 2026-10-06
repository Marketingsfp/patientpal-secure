import { removerEmojisNina } from "./sem-emojis";

export const REGRA_FORMATO_MOBILE = `FORMATO MOBILE OBRIGATÓRIO: todas as mensagens ao paciente devem ser legíveis no WhatsApp de um celular. Use frases diretas, parágrafos curtos com uma linha em branco entre assuntos e quebras de linha reais. Para negrito, use somente um asterisco de cada lado: *texto*. Nunca use dois asteriscos de cada lado. Separe saudação, informações e pergunta final quando existirem. Liste cada opção em uma linha e cada profissional/atendimento em seu próprio bloco, mantendo valores, horários e condições junto da opção correspondente. Coloque formas de pagamento e dias com horários diferentes em linhas separadas. Preserve todas as condições relevantes, sem resumir ou omitir fatos para caber. Não use tabelas, colunas alinhadas, HTML ou blocos de código. Não quebre palavras, links, telefones, valores, datas ou horários nem tente fixar uma largura por quantidade de caracteres: o celular ajusta a largura. Esta regra organiza a apresentação e não altera regras de pagamento, nomes, fatos ou decisões.`;

/** Altera espaços/quebras e converte negrito Markdown ao formato do WhatsApp.
 * A largura de cada linha fica a cargo do WhatsApp.
 * Links e trechos literais não são divididos; uma frase longa não é truncada. */
export function formatarTextoMobile(texto: string): string {
  let marca = "\uE000";
  while (texto.includes(marca)) marca += "\uE000";
  const protegidos: string[] = [];
  const quebra = `${marca}Q\uE001`;
  const normal = texto.replace(/```[\s\S]*?```|`[^`\n]+`|https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,
    trecho => `${marca}${protegidos.push(trecho) - 1}\uE001`)
    .replace(/\r\n?/g, "\n")
    // Pares completos somente: não remove asteriscos literais, listas ou marcação já válida.
    .replace(/(?<!\*)\*\*(?=\S)([^*\n]*?[^*\s])\*\*(?!\*)/g, "*$1*")
    .replace(/[\t ]+(?=\*{0,2}(?:Dinheiro|Pix\/cartão|Pix|Cartão|Profissional|Dias e horários(?: habituais)?|Horários(?: disponíveis| habituais)?|Preparo|Unidade|Protocolo(?: d[eo] atendimento)?):)/gi, "\n");

  const organizado = normal.split("\n").map(linha => {
    const limpa = linha.trim();
    // Mantém listas já organizadas e não rompe nomes/abreviações como Dr. e Av.
    if (/^(?:[-•]|\d+[.)])\s/.test(limpa)) return limpa;
    const frases = limpa.replace(/([.!?]+)[\t ]+(?=[A-ZÀ-Ý0-9*])/g, (match, pontuacao: string, indice: number) => {
      const antes = limpa.slice(0, indice + pontuacao.length).replace(/\*/g, "");
      if (/\b(?:Dr|Dra|Sr|Sra|Srta|Prof|Profa|Av|R|Rod|Trav|D|Dona|n|nº|tel|aprox|etc)\.$/i.test(antes) || /\b[A-ZÀ-Ý]\.$/.test(antes)) return match;
      return pontuacao + quebra;
    }).split(quebra);
    const blocos: string[] = [];
    let bloco = "";
    for (const frase of frases) {
      const saudacao = /^(?:olá|oi|bom dia|boa tarde|boa noite)[^.!?]*[.!?]$/i.test(bloco);
      if (bloco && (bloco.length + frase.length > 240 || saudacao || /\?$/.test(frase))) {
        blocos.push(bloco); bloco = frase;
      } else bloco = bloco ? `${bloco} ${frase}` : frase;
    }
    if (bloco) blocos.push(bloco);
    return blocos.join("\n\n");
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return organizado.replace(new RegExp(`${marca}(\\d+)\uE001`, "g"), (_, i: string) => protegidos[Number(i)]!);
}

/** Mesmo acabamento no núcleo, finalização e retomadas dos dois transportes. */
export function formatarMensagemNina(texto: string): string {
  return formatarTextoMobile(removerEmojisNina(texto));
}
