export const MENSAGEM_PESQUISA_SATISFACAO = `Seu atendimento foi encerrado. Agradecemos por entrar em contato conosco!

Queremos melhorar cada vez mais. Como você avalia o atendimento recebido?

Responda somente com um número:
5 - Excelente
4 - Muito bom
3 - Bom
2 - Regular
1 - Ruim

Sua opinião é muito importante. Obrigado!`;

export const MENSAGEM_AGRADECIMENTO_AVALIACAO =
  "Obrigado pela sua avaliação! Sua opinião nos ajuda a melhorar nosso atendimento.";

export const PRAZO_RESPOSTA_PESQUISA_MS = 24 * 60 * 60 * 1000;

export type DestinoMensagemAposPesquisa =
  { destino: "pesquisa"; nota: number } | { destino: "atendimento" };

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
