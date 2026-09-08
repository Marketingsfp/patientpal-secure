/**
 * Aviso de conferência quando o número de prontuário digitado está longe da
 * estante.
 *
 * Por que existe: até 04/09/2026 o número automático saía de "maior número da
 * clínica + 1" e caía na faixa dos 2,65 milhões, centenas de milhares à frente
 * do arquivo físico. Isso foi corrigido no banco, mas o outro caminho continuou
 * aberto: um número digitado errado com 7 dígitos passa por todas as barreiras
 * atuais (a régua de dígitos e a checagem de número já usado) e o paciente
 * nasce fora da estante sem ninguém perceber.
 *
 * Este modal é a conferência que faltava. Ele NÃO impede o cadastro: pasta
 * antiga resgatada da estante é caso legítimo e acontece toda semana. Só põe os
 * dois números lado a lado e pede que a recepção olhe a ficha antes de gravar.
 */
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatarProntuario, type DesvioProntuario } from "@/lib/prontuario";

interface Props {
  /** Os dois números a comparar. `null` mantém o modal fechado. */
  desvio: DesvioProntuario | null;
  /** "Revisar": fecha e devolve o foco ao campo, sem gravar nada. */
  onRevisar: () => void;
  /** "Confirmar e Salvar": segue com o número digitado. */
  onConfirmar: () => void;
}

export function ConfirmarProntuarioDistante({ desvio, onRevisar, onConfirmar }: Props) {
  return (
    <AlertDialog open={desvio !== null} onOpenChange={(aberto) => !aberto && onRevisar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confere o número na ficha física?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                O arquivo físico está em{" "}
                <strong>{desvio ? formatarProntuario(desvio.contador) : "—"}</strong>. Você digitou{" "}
                <strong>{desvio ? formatarProntuario(desvio.digitado) : "—"}</strong>.
              </p>
              <p>
                Se for uma pasta antiga que você resgatou da estante, pode confirmar. Se foi engano
                de digitação, revise antes de salvar — depois de impresso na guia, o número fica com
                o paciente.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onRevisar}>Revisar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmar}>Confirmar e Salvar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
