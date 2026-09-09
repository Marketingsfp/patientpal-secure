/**
 * FASE 5 — revisão manual do vínculo entre o contato WhatsApp e o cadastro
 * clínico. Nada é alterado em um clique: pesquisar → selecionar → confirmar.
 * O cadastro do paciente não é modificado; só muda a qual cadastro esta
 * conversa aponta, e isso fica registrado na auditoria da conversa.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buscarPacientesChat } from "@/lib/agenda/chat-agenda.functions";
import { revisarVinculoPacienteConversa } from "@/lib/atendimento.functions";

type Paciente = {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  data_nascimento: string | null;
};

export function RevisarVinculoDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clinicaId: string;
  conversaId: string;
  contatoNome: string | null;
  contatoTelefone: string | null;
  pacienteVinculadoNome: string | null;
  onVinculado: () => void;
}) {
  const buscar = useServerFn(buscarPacientesChat);
  const revisar = useServerFn(revisarVinculoPacienteConversa);
  const [termo, setTermo] = useState("");
  const [lista, setLista] = useState<Paciente[]>([]);
  const [escolhido, setEscolhido] = useState<Paciente | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!props.open) {
      setTermo("");
      setLista([]);
      setEscolhido(null);
    }
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    const t = termo.trim();
    if (t.length < 2) {
      setLista([]);
      return;
    }
    const id = setTimeout(() => {
      void buscar({ data: { clinicaId: props.clinicaId, termo: t } })
        .then((r) => setLista((r ?? []) as Paciente[]))
        .catch(() => setLista([]));
    }, 300);
    return () => clearTimeout(id);
  }, [termo, props.open, props.clinicaId, buscar]);

  async function confirmar() {
    if (!escolhido || salvando) return;
    setSalvando(true);
    try {
      await revisar({
        data: {
          clinicaId: props.clinicaId,
          conversaId: props.conversaId,
          pacienteId: escolhido.id,
          confirmado: true as const,
        },
      });
      toast.success("Vínculo atualizado");
      props.onVinculado();
      props.onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar o vínculo");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Revisar cadastro vinculado</DialogTitle>
          <DialogDescription>
            Contato do WhatsApp: <strong>{props.contatoNome ?? props.contatoTelefone ?? "—"}</strong>
            {props.pacienteVinculadoNome ? (
              <>
                {" · "}cadastro vinculado hoje: <strong>{props.pacienteVinculadoNome}</strong>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <Input
          autoFocus
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar paciente por nome, CPF ou telefone"
        />

        <div className="max-h-64 overflow-auto space-y-1">
          {lista.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setEscolhido(p)}
              className={`w-full text-left rounded border p-2 text-sm ${
                escolhido?.id === p.id ? "border-primary bg-muted" : "hover:bg-muted"
              }`}
            >
              <div className="font-medium">{p.nome}</div>
              <div className="text-xs text-muted-foreground">
                {[p.cpf, p.telefone].filter(Boolean).join(" · ") || "sem CPF/telefone"}
              </div>
            </button>
          ))}
          {termo.trim().length >= 2 && lista.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum cadastro encontrado.</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!escolhido || salvando} onClick={() => void confirmar()}>
            {escolhido ? `Confirmar vínculo com ${escolhido.nome.split(" ")[0]}` : "Confirmar vínculo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
