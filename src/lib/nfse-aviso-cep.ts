import { toast } from "sonner";

/**
 * Avisa na tela quando a nota saiu sem o endereço do tomador porque o CEP da
 * ficha do paciente não existe nos Correios.
 *
 * Antes desse aviso a prefeitura recusava a nota inteira com E0240 ("o CEP
 * informado ... não existe ou não pertence ao município do endereço do
 * tomador") e a recepção só via a mensagem da prefeitura, sem saber que o
 * problema estava no cadastro do paciente — e ficava reenviando a mesma nota.
 * Agora a nota sai, e o aviso diz qual ficha corrigir.
 *
 * Fica em arquivo próprio, separado de `nfse.functions.ts`, porque o `sonner`
 * só existe no navegador e aquele módulo também roda no servidor.
 */
export function avisarCepDoTomadorInvalido(resposta: unknown): void {
  const aviso = (resposta as { avisoCep?: string | null })?.avisoCep;
  if (!aviso) return;
  toast.warning(aviso, { duration: 12000 });
}
