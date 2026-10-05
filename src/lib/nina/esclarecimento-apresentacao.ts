/**
 * Texto entregue ao paciente para a pergunta de identificação do cadastro.
 *
 * A pergunta e as opções continuam sendo as do retorno da busca (o estado da
 * sessão guarda o texto original); aqui só muda a forma: frase de conversa,
 * uma opção por item e, na primeira resposta da sessão, a apresentação.
 * PURO: sem banco e sem rede.
 */

const CABECALHOS: Array<[RegExp, string]> = [
  [
    /^Não consegui identificar com segurança qual médico você escolheu\. Pode informar novamente qual deseja\?$/,
    "Para eu passar as informações certas, qual destes profissionais você procura?",
  ],
  [
    /^Não encontrei esse nome entre os médicos desta consulta\. Pode informar novamente qual deseja\?$/,
    "Não encontrei esse nome entre os profissionais desta consulta. Algum destes é o que você procura?",
  ],
  [
    /^Qual exame ou procedimento você deseja\?$/,
    "Encontrei mais de uma opção no cadastro para esse pedido. Qual destas você deseja?",
  ],
];

const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e"]);

export const FECHAMENTO_CORRECAO_EXAME =
  "Se não for esse o exame ou procedimento que você procura, pode escrever o nome novamente, como aparece no pedido médico.";

/** "ANDERSON LUIS ELOY — NEUROLOGIA" → "Anderson Luis Eloy — Neurologia". */
export function nomeEmTitulo(texto: string): string {
  return texto
    .toLocaleLowerCase("pt-BR")
    .split(/(\s+)/)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1)))
    .join("");
}

export function apresentarPerguntaEsclarecimento(
  pergunta: string,
  opcoes: { tipo?: string | null; tipoAtendimento?: string | null; apresentacao?: string | null } = {},
): string {
  // Apenas apresentação: manter a pergunta original no estado permite reconhecer
  // confirmações de mensagens antigas e não transforma o "não" condicional em recusa.
  const candidatoUnico = opcoes.tipo === "procedimento" && opcoes.tipoAtendimento !== "consulta"
    ? /^Você quis dizer (.+)\? Pode confirmar ou escrever o nome novamente\.$/.exec(pergunta.trim())
    : null;
  if (candidatoUnico) {
    return [opcoes.apresentacao?.trim(), `Você se refere a ${candidatoUnico[1]}?`, FECHAMENTO_CORRECAO_EXAME]
      .filter(Boolean).join("\n\n");
  }
  const linhas = pergunta.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!linhas.length) return pergunta;
  const cabecalho: string[] = [linhas[0]!];
  const itens: string[] = [];
  for (const linha of linhas.slice(1)) {
    if (!itens.length && /:\s*$/.test(linha)) cabecalho.push(linha);
    else itens.push(linha);
  }
  const titulo = cabecalho
    .map((l) => CABECALHOS.find(([re]) => re.test(l))?.[1] ?? l)
    .join(" ");
  const profissional = opcoes.tipo === "profissional";
  const lista = itens.map((i) => `• ${profissional ? nomeEmTitulo(i) : i}`);
  const corpo = lista.length ? `${titulo}\n\n${lista.join("\n")}` : titulo;
  const abertura = opcoes.apresentacao?.trim();
  return abertura ? `${abertura}\n\n${corpo}` : corpo;
}
