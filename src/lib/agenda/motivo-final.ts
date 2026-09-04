// Decide qual justificativa é gravada ao cancelar ou reagendar um atendimento.
//
// A regra é a mesma nos dois núcleos (status e reagendamento), e a mesma para
// a Agenda clássica e a V2: quem opera pela tela é obrigado a escrever o
// motivo, e quem opera por integração externa — que não tem como abrir modal
// nenhum — recebe um motivo automático identificando a origem.
//
// Fica separada em função pura porque é a peça que a coordenação usa para
// cobrar a recepção: se ela silenciosamente devolvesse vazio, o histórico
// voltaria a não explicar nada e ninguém perceberia.

export type OrigemDaAcao = { tipo: "usuario" } | { tipo: "integracao"; origem_integracao: string };

export type AcaoComMotivo = "cancelamento" | "reagendamento";

/**
 * Devolve a justificativa a gravar, ou `null` quando não há nenhuma.
 *
 * `null` NÃO é erro: um cancelamento em cascata de pacote, ou uma correção de
 * manutenção, chegam aqui sem motivo e continuam válidos. A obrigatoriedade
 * mora na tela, que não deixa a recepção seguir sem escrever.
 */
export function motivoFinal(
  informado: string | null | undefined,
  origem: OrigemDaAcao,
  acao: AcaoComMotivo,
): string | null {
  const limpo = (informado ?? "").trim();
  if (limpo) return limpo;
  if (origem.tipo === "integracao") {
    const verbo = acao === "cancelamento" ? "Cancelado" : "Reagendado";
    return `${verbo} pela integração ${origem.origem_integracao}`;
  }
  return null;
}
