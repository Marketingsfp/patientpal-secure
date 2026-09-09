/**
 * Aviso e botão de correção do número de prontuário, na ficha do paciente.
 *
 * Entre 08/07 e 04/09/2026 o gerador automático entregou números na faixa dos
 * 2,65 milhões, muito à frente do arquivo físico. São 947 pacientes. Toda vez
 * que um deles volta ao balcão, a guia sai com o número errado.
 *
 * Renumerar os 947 de uma vez obrigaria a recepção a reetiquetar centenas de
 * pastas que já estão na estante. O dono decidiu em 08/09/2026 resolver sob
 * demanda: quem abre a ficha é justamente quem está com a pasta física na mão,
 * e é o melhor momento para trocar a etiqueta.
 *
 * Por isso o aviso mora na ficha, e não numa tela de mutirão.
 */
import { useState } from "react";
import { AlertTriangle, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { prontuarioForaDaEstante } from "@/lib/prontuario";
import { Button } from "@/components/ui/button";
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

interface Props {
  paciente: { id: string; codigo_prontuario?: string | null; created_at?: string | null };
  /** Chamado com o número novo, para a tela redesenhar sem recarregar. */
  onCorrigido: (novo: string) => void;
}

export function AvisoProntuarioForaDaEstante({ paciente, onCorrigido }: Props) {
  const podeEscrever = usePodeEscrever("clientes");
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  if (!prontuarioForaDaEstante(paciente)) return null;

  // A data de cadastro fica escrita no aviso de propósito. Sem ela, quem abre a
  // ficha lê "número errado" e conclui que o sistema acabou de gerar aquele
  // número — foi o que aconteceu em 09/09/2026. Com a data na tela fica claro
  // que é um cadastro antigo esperando a pasta chegar ao balcão.
  const cadastradoEm = paciente.created_at
    ? new Date(paciente.created_at).toLocaleDateString("pt-BR")
    : null;

  async function corrigir() {
    setSalvando(true);
    const { data, error } = await (supabase as any).rpc("paciente_corrigir_prontuario_estante", {
      _paciente_id: paciente.id,
    });
    setSalvando(false);
    setConfirmando(false);
    if (error) {
      toast.error(error.message ?? "Não foi possível corrigir o número.");
      return;
    }
    const linha = (data ?? [])[0];
    if (!linha?.novo) {
      toast.error("Não foi possível corrigir o número.");
      return;
    }
    onCorrigido(String(linha.novo));
    toast.success(
      `Prontuário corrigido para ${linha.novo}. Escreva este número na pasta e reimprima a guia.`,
    );
  }

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="space-y-2">
          <p>
            O prontuário <b>{paciente.codigo_prontuario}</b> está fora da faixa do arquivo físico e
            não corresponde a nenhuma pasta da estante.
          </p>
          <p>
            {cadastradoEm ? <>Este cadastro é de <b>{cadastradoEm}</b>, de quando</> : "De quando"} o
            gerador automático ainda errava (entre 08/07 e 04/09). Cadastro feito de hoje em diante
            já nasce com o número certo da estante.
          </p>
          {podeEscrever && (
            <>
              <p>
                Se você está com a pasta deste paciente em mãos, corrija agora: o sistema troca pelo
                próximo número livre da estante e você escreve esse número na pasta.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => setConfirmando(true)}
                disabled={salvando}
              >
                {salvando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                Corrigir para o próximo número da estante
              </Button>
            </>
          )}
        </div>
      </div>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Corrigir o número deste paciente?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  O prontuário <b>{paciente.codigo_prontuario}</b> será trocado pelo próximo número
                  livre do arquivo físico.
                </p>
                <p>
                  Depois de confirmar, <b>escreva o número novo na pasta</b> e reimprima a guia — a
                  que já saiu está com o número antigo.
                </p>
                <p className="text-muted-foreground">
                  Só confirme com a pasta do paciente em mãos. A troca fica registrada no histórico
                  com o seu nome.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void corrigir()}>Corrigir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
