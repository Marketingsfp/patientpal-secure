import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClinica } from "@/hooks/use-clinica";
import { marcarAtendimentoExterno } from "@/lib/agenda/atendimento-externo.functions";
import { supabase } from "@/integrations/supabase/client";
import { valorDaTabela } from "@/lib/agenda/atendimento-externo.server";

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
  const { memberships } = useClinica();
  const [origemId, setOrigemId] = useState<string>("");
  const [clinicaNome, setClinicaNome] = useState("");
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [buscandoValor, setBuscandoValor] = useState(false);

  const unidades = memberships
    .filter((m) => m.clinica_id !== clinicaId)
    .map((m) => ({ id: m.clinica_id, nome: m.clinica.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));

  useEffect(() => {
    if (open) {
      setOrigemId("");
      setClinicaNome("");
      setValor("");
    }
  }, [open]);

  // Preenche automaticamente com o preço do serviço na tabela desta clínica
  // (a que recebe a GR) — é ele que serve de base para o repasse do médico.
  useEffect(() => {
    if (!open || !clinicaId || !procedimento?.trim()) return;
    let cancelado = false;
    setBuscandoValor(true);
    void (async () => {
      const { data } = await supabase
        .from("procedimentos")
        .select("valor_dinheiro,valor_dinheiro_pix,valor_padrao")
        .eq("clinica_id", clinicaId)
        .ilike("nome", procedimento.trim())
        .limit(1)
        .maybeSingle();
      if (cancelado) return;
      const v = valorDaTabela(data as never);
      if (v > 0) setValor(v.toFixed(2).replace(".", ","));
      setBuscandoValor(false);
    })();
    return () => { cancelado = true; };
  }, [open, clinicaId, procedimento]);

  const salvar = async () => {
    if (!agendamentoId || !clinicaId) return;
    const unidade = unidades.find((u) => u.id === origemId);
    const nomeOrigem = unidade ? unidade.nome : clinicaNome.trim();
    if (!nomeOrigem) return toast.error("Informe a clínica de origem.");
    const valorNum = valor ? Number(valor.replace(",", ".")) : 0;
    setSalvando(true);
    const res = await marcarFn({
      data: {
        agendamento_id: agendamentoId,
        clinica_id: clinicaId,
        origem_clinica_id: unidade ? unidade.id : null,
        origem_clinica_nome: nomeOrigem,
        origem_valor: Number.isFinite(valorNum) && valorNum > 0 ? valorNum : null,
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
            <Select value={origemId} onValueChange={setOrigemId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a unidade" />
              </SelectTrigger>
              <SelectContent>
                {unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
                <SelectItem value="outra">Outra clínica (digitar)</SelectItem>
              </SelectContent>
            </Select>
            {origemId === "outra" && (
              <Input
                className="mt-2"
                value={clinicaNome}
                onChange={(e) => setClinicaNome(e.target.value)}
                placeholder="Ex.: Policlínica São Francisco de Paula"
              />
            )}
          </div>
          <div>
            <Label>Valor do atendimento</Label>
            <Input
              value={valor}
              onChange={(e) => setValor(e.target.value.replace(/[^0-9.,]/g, ""))}
              inputMode="decimal"
              placeholder={buscandoValor ? "Buscando na tabela…" : "0,00"}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Preenchido com o valor da tabela desta clínica — ajuste só se for diferente.
              Usado para o repasse do médico; não entra no caixa daqui.
            </p>
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