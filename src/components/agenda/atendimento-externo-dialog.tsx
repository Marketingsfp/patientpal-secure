import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { marcarAtendimentoExterno } from "@/lib/agenda/atendimento-externo.functions";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agendamentoId: string | null;
  clinicaId: string | null;
  pacienteNome?: string | null;
  procedimento?: string | null;
  onDone?: () => void;
};

/**
 * Registra um atendimento que foi faturado em outra clínica parceira:
 * não gera caixa nem NFS-e aqui, apenas marca a origem no agendamento e
 * cria o fin_atendimentos com valor_clinica = 0 para o repasse do médico.
 */
export function AtendimentoExternoDialog({
  open,
  onOpenChange,
  agendamentoId,
  clinicaId,
  pacienteNome,
  procedimento,
  onDone,
}: Props) {
  const marcarFn = useServerFn(marcarAtendimentoExterno);
  const [clinicaNome, setClinicaNome] = useState("");
  const [gr, setGr] = useState("");
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) {
      setClinicaNome("");
      setGr("");
      setValor("");
    }
  }, [open]);

  const salvar = async () => {
    if (!agendamentoId || !clinicaId) return;
    if (!clinicaNome.trim()) return toast.error("Informe a clínica de origem.");
    if (!gr.trim()) return toast.error("Informe o número da GR da clínica de origem.");
    setSalvando(true);
    const res = await marcarFn({
      data: {
        agendamento_id: agendamentoId,
        clinica_id: clinicaId,
        origem_clinica_id: null,
        origem_clinica_nome: clinicaNome.trim(),
        origem_gr_numero: gr.trim(),
        origem_valor: valor ? Number(valor.replace(",", ".")) : null,
      },
    });
    setSalvando(false);
    if (!res.ok) return toast.error(res.message);
    toast.success("Atendimento externo registrado — sem lançamento em caixa.");
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-orange-600" /> Atendimento externo
          </DialogTitle>
          <DialogDescription>
            Paciente atendido aqui, mas faturado em outra clínica. Não entra no caixa
            nem gera nota fiscal — apenas alimenta o repasse do médico e o acerto entre clínicas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {(pacienteNome || procedimento) && (
            <div className="rounded-md border px-3 py-2 text-sm">
              <div className="font-medium">{pacienteNome ?? "—"}</div>
              <div className="text-muted-foreground text-xs">{procedimento ?? "—"}</div>
            </div>
          )}
          <div>
            <Label>Clínica de origem</Label>
            <Input value={clinicaNome} onChange={(e) => setClinicaNome(e.target.value)} placeholder="Ex.: Policlínica São Francisco de Paula" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>GR da origem</Label>
              <Input value={gr} onChange={(e) => setGr(e.target.value)} placeholder="Nº da guia" />
            </div>
            <div>
              <Label>Valor na origem</Label>
              <Input
                value={valor}
                onChange={(e) => setValor(e.target.value.replace(/[^0-9.,]/g, ""))}
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Registrar externo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}