import { toast } from "sonner";

/**
 * Avisa na tela quando o roteamento fiscal emitiu a nota por uma empresa
 * diferente da escolhida no formulário.
 *
 * Existe porque a emissão acontece em vários lugares (Agenda, Contratos,
 * Financeiro › Notas) e em todos eles a recepção escolhia a empresa e nunca
 * ficava sabendo que o servidor tinha trocado — daí o relato de "escolhi CASA
 * DE SAUDE e a nota saiu como MA".
 *
 * Fica separado de `nfse-roteamento-emitente.ts` de propósito: aquele módulo
 * também roda no servidor, e o `sonner` só existe no navegador.
 */
export function avisarEmitenteAjustado(resposta: unknown): void {
  const ajuste = (resposta as { emitenteAjustado?: { de: string; para: string; motivo: string } })
    ?.emitenteAjustado;
  if (!ajuste) return;
  toast.warning(`Emitida por ${ajuste.para}, não por ${ajuste.de} — ${ajuste.motivo}.`, {
    duration: 10000,
  });
}
