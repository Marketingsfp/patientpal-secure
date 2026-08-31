import { toast } from "sonner";

/**
 * Avisa na tela quando a empresa escolhida para a nota contraria a orientação
 * do tipo de serviço (consulta costuma sair pela CASA DE SAUDE, exame pela MA
 * IMAGENS).
 *
 * A nota sai pela empresa escolhida de qualquer forma — este aviso não desfaz
 * nada, só dá a chance de perceber o engano logo depois de emitir, enquanto
 * cancelar na prefeitura e reemitir ainda é barato.
 *
 * Existe porque a emissão acontece em vários lugares (Agenda, Contratos,
 * Financeiro › Notas) e o aviso precisa ser o mesmo em todos.
 *
 * Fica separado de `nfse-roteamento-emitente.ts` de propósito: aquele módulo
 * também roda no servidor, e o `sonner` só existe no navegador.
 */
export function avisarEmitenteDivergente(resposta: unknown): void {
  const aviso = (
    resposta as {
      emitenteDivergente?: { usado: string; sugerido: string; motivo: string };
    }
  )?.emitenteDivergente;
  if (!aviso) return;
  toast.warning(
    `Emitida por ${aviso.usado}, como escolhido — mas ${aviso.motivo}, que normalmente sai por ${aviso.sugerido}.`,
    { duration: 10000 },
  );
}
