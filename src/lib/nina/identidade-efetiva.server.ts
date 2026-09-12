/**
 * FASE 3 — identidade efetiva para os caminhos que NÃO passam pelo turno do
 * WhatsApp (mensagem de handoff, textos automáticos do atendimento).
 *
 * Regras preservadas da Fase 2:
 *  - identidade e instruções vêm SEMPRE da mesma versão publicada;
 *  - sem versão publicada válida, a apresentação é NEUTRA (nunca volta para
 *    "Nina"/"Menino Jesus" nem usa `clinicas.nome`);
 *  - o tipo do estabelecimento nunca é inferido do cadastro administrativo.
 *
 * Quando o chamador conhece o turno em andamento (`turnoId`), o snapshot
 * fixado daquele turno é reutilizado — a mensagem de transferência fala com a
 * mesma identidade da resposta que a originou.
 */
import {
  resolverIdentidadeEfetiva,
  valoresIdentidade,
  type IdentidadeEfetiva,
} from "./identidade-efetiva";

export async function identidadeEfetivaAtual(
  escopo: "whatsapp" = "whatsapp",
  turnoId?: string | null,
): Promise<IdentidadeEfetiva> {
  const neutraTotal = () =>
    resolverIdentidadeEfetiva({ template: "", origem: "codigo", versao: null, versaoId: null });
  try {
    const { promptInstrucoes } = await import("./instrucoes-runtime.server");
    const snapshot = await promptInstrucoes(
      escopo,
      (template) =>
        valoresIdentidade(
          resolverIdentidadeEfetiva({
            template,
            origem: "publicada",
            versao: null,
            versaoId: null,
          }),
        ),
      // Sem versão publicada não existe identidade: o prompt de reserva aqui é
      // vazio de propósito, para cair na apresentação neutra.
      "",
      turnoId ?? null,
    );
    return resolverIdentidadeEfetiva({
      template: snapshot.template,
      origem: snapshot.origem,
      versao: snapshot.versao,
      versaoId: snapshot.versaoId,
    });
  } catch {
    return neutraTotal();
  }
}

/** Formato consumido pelos textos ao paciente fora do prompt principal. */
export function identidadeParaMensagens(efetiva: IdentidadeEfetiva) {
  return {
    assistente: efetiva.ok ? efetiva.apresentacao.assistente : null,
    estabelecimento: efetiva.ok ? efetiva.apresentacao.estabelecimento : null,
    tipoEstabelecimento: efetiva.ok ? efetiva.apresentacao.tipoEstabelecimento : null,
  };
}
