import { useEffect, useState } from "react";
import { Loader2, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { ClienteForm, type Paciente } from "@/components/clientes/cliente-form";
import { prontuarioExibicao } from "@/lib/prontuario";

interface Props {
  pacienteId: string | null;
  clinicaId: string;
  readOnly?: boolean;
  onClose: () => void;
  /** Chamado após salvar, para atualizar a linha na tabela. */
  onSaved?: () => void;
}

/**
 * Edição de cliente em modal centralizado — substitui a navegação para a
 * página /app/clientes/$id/editar, preservando busca e rolagem da tabela.
 */
export function EditarClienteDialog({
  pacienteId,
  clinicaId,
  readOnly = false,
  onClose,
  onSaved,
}: Props) {
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!pacienteId) {
      setPaciente(null);
      return;
    }
    let active = true;
    setLoading(true);
    setErro(false);
    void supabase
      .from("pacientes")
      .select("*")
      .eq("id", pacienteId)
      .single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          setErro(true);
          if (error) mostrarErro(error);
        } else {
          setPaciente(data as Paciente);
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [pacienteId]);

  const prontuario = prontuarioExibicao(paciente) || paciente?.numero_pasta || null;

  return (
    <Dialog
      open={!!pacienteId}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="flex-shrink-0 border-b border-border p-6 pb-4">
          <DialogTitle className="flex items-center gap-2 pr-8">
            <Users className="h-5 w-5 text-primary shrink-0" />
            <span className="truncate">{paciente?.nome ?? "Editar cliente"}</span>
            {prontuario && (
              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                Prontuário {prontuario}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {readOnly
              ? "Você tem acesso somente leitura neste módulo."
              : "Atualize os dados do paciente e salve as alterações."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2 p-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </p>
        ) : erro || !paciente ? (
          <p className="text-sm text-muted-foreground p-6">Paciente não encontrado.</p>
        ) : (
          <ClienteForm
            clinicaId={clinicaId}
            paciente={paciente}
            stickyFooter
            readOnly={readOnly}
            onCancel={onClose}
            onSaved={() => {
              onSaved?.();
              onClose();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
