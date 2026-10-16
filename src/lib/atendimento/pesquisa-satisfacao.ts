export const MENSAGEM_PESQUISA_SATISFACAO = `Seu atendimento foi encerrado. Agradecemos por entrar em contato conosco!

Queremos melhorar cada vez mais. Como você avalia o atendimento recebido?

Responda somente com um número:
5 - Excelente
4 - Muito bom
3 - Bom
2 - Regular
1 - Ruim

Sua opinião é muito importante. Obrigado!`;

/**
 * Pesquisa com lista de toque (16/10/2026): o paciente toca em "Avaliar" e
 * escolhe a nota, sem digitar. Mesma escala de 1 a 5; o número digitado
 * continua valendo. Se a lista falhar, vai o texto acima.
 */
export const PESQUISA_LISTA = {
  corpo: `Seu atendimento foi encerrado. Agradecemos por entrar em contato conosco!

Queremos melhorar cada vez mais. Como você avalia o atendimento recebido?

Toque em *Avaliar* e escolha a nota. Sua opinião é muito importante. Obrigado!`,
  botao: "Avaliar",
  secao: "Nota do atendimento",
  opcoes: [
    { id: "pesquisa_nota_5", titulo: "5 - Excelente" },
    { id: "pesquisa_nota_4", titulo: "4 - Muito bom" },
    { id: "pesquisa_nota_3", titulo: "3 - Bom" },
    { id: "pesquisa_nota_2", titulo: "2 - Regular" },
    { id: "pesquisa_nota_1", titulo: "1 - Ruim" },
  ],
} as const;

/** Texto guardado na conversa para a equipe ver o que o paciente recebeu. */
export const ESPELHO_PESQUISA_LISTA = [
  PESQUISA_LISTA.corpo,
  `[${PESQUISA_LISTA.botao}]`,
  ...PESQUISA_LISTA.opcoes.map((o) => `• ${o.titulo}`),
].join("\n");

/**
 * Texto de um toque em lista/botão (o título do item, como fica salvo na
 * conversa). Item da pesquisa vira só o número da nota ("5 - Excelente" → "5"),
 * que a pesquisa já reconhece; outros títulos seguem como estão.
 */
export function textoDaRespostaInterativa(titulo: unknown): string {
  const t = String(titulo ?? "").trim();
  const opcao = PESQUISA_LISTA.opcoes.find((o) => o.titulo === t);
  return opcao ? opcao.id.replace("pesquisa_nota_", "") : t;
}

export const MENSAGEM_AGRADECIMENTO_AVALIACAO =
  "Obrigado pela sua avaliação! Sua opinião nos ajuda a melhorar nosso atendimento.";

export const PRAZO_RESPOSTA_PESQUISA_MS = 24 * 60 * 60 * 1000;

export type DestinoMensagemAposPesquisa =
  | { destino: "pesquisa"; nota: number }
  | { destino: "atendimento" };

/**
 * Só um número isolado de 1 a 5 é consumido pela pesquisa. Qualquer conteúdo
 * adicional preserva a mensagem para o fluxo normal de atendimento.
 */
export function classificarMensagemAposPesquisa(texto: unknown): DestinoMensagemAposPesquisa {
  const valor = String(texto ?? "").trim();
  return /^[1-5]$/.test(valor)
    ? { destino: "pesquisa", nota: Number(valor) }
    : { destino: "atendimento" };
}

export function interpretarNotaSatisfacao(texto: unknown): number | null {
  const classificacao = classificarMensagemAposPesquisa(texto);
  return classificacao.destino === "pesquisa" ? classificacao.nota : null;
}
