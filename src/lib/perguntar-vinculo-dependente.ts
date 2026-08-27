import { confirmDialog } from "@/lib/confirm";

/**
 * Aviso mostrado quando a recepção vai incluir como dependente um paciente que
 * já está em outro cartão ativo.
 *
 * Texto único para as quatro telas que incluem dependente (aba Dependentes,
 * detalhe do contrato, Conferência e a ficha do paciente), para o balcão ver
 * sempre a mesma pergunta.
 *
 * É aviso, não bloqueio: trocar de cartão é normal — a família compra um plano
 * novo e o paciente passa para ele. O que causava problema era isso acontecer
 * sem ninguém perceber, deixando o paciente ativo nos dois cartões ao mesmo
 * tempo. Aí o sistema tinha que escolher um deles para decidir convênio, preço
 * e mensalidade vencida, e o paciente podia ser atendido como Particular por
 * causa da dívida de um titular que já não era o dele.
 */
export function perguntarVinculoDuplicado(mensagem: string): Promise<boolean> {
  return confirmDialog({
    title: "Paciente já está em outro cartão",
    description: mensagem,
    confirmText: "Incluir mesmo assim",
    cancelText: "Cancelar",
    tone: "warning",
  });
}
