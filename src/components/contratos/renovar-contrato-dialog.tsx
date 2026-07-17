import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Mode = "extensao" | "troca_plano";

interface Convenio {
  id: string;
  nome: string;
  valor_mensal: number;
  num_parcelas: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contratoId: string;
  clinicaId: string;
  convenioAtualId: string | null;
  convenioAtualNome?: string | null;
  valorAtual: number;
  onRenovado: (result: { tipo: Mode; contratoNovoId?: string | null }) => void;
}

export function RenovarContratoDialog({
  open,
  onOpenChange,
  contratoId,
  clinicaId,
  convenioAtualId,
  convenioAtualNome,
  valorAtual,
  onRenovado,
}: Props) {
  const [mode, setMode] = useState<Mode>("extensao");
  const [observacao, setObservacao] = useState("");
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [novoConvenioId, setNovoConvenioId] = useState<string>("");
  const [valorAtualConvenio, setValorAtualConvenio] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("extensao");
    setObservacao("");
    setNovoConvenioId("");

    (async () => {
      const { data } = await supabase
        .from("cb_convenios")
        .select("id, nome, valor_mensal, num_parcelas")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .order("nome");
      setConvenios((data ?? []) as Convenio[]);
      if (convenioAtualId) {
        const atual = (data ?? []).find((c: Convenio) => c.id === convenioAtualId);
        setValorAtualConvenio(atual ? Number(atual.valor_mensal) : null);
      }
    })();
  }, [open, clinicaId, convenioAtualId]);

  const novoConvenio = convenios.find((c) => c.id === novoConvenioId);
  const valorRenovacao =
    mode === "extensao"
      ? valorAtualConvenio ?? valorAtual
      : novoConvenio
        ? Number(novoConvenio.valor_mensal)
        : 0;
  const parcelasRenovacao =
    mode === "extensao" ? 12 : novoConvenio ? Number(novoConvenio.num_parcelas ?? 12) : 12;

  const podeConfirmar =
    !saving && (mode === "extensao" || (mode === "troca_plano" && novoConvenioId));

  const confirmar = async () => {
    if (!podeConfirmar) return;
    if (
      !window.confirm(
        mode === "extensao"
          ? `Renovar o contrato gerando ${parcelasRenovacao} novas mensalidades de ${BRL(valorRenovacao)}?`
          : `Encerrar este contrato como renovado e criar um novo contrato no convênio "${novoConvenio?.nome}" com ${parcelasRenovacao} parcelas de ${BRL(valorRenovacao)}?`,
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      if (mode === "extensao") {
        const { data, error } = await (supabase.rpc as any)("renovar_contrato_extensao", {
          _contrato_id: contratoId,
          _observacao: observacao || null,
        });
        if (error) throw error;
        toast.success(
          `Contrato renovado — ${(data as any)?.parcelas_geradas ?? parcelasRenovacao} novas parcelas geradas`,
        );
        onRenovado({ tipo: "extensao" });
      } else {
        const { data, error } = await (supabase.rpc as any)("renovar_contrato_troca_plano", {
          _contrato_id: contratoId,
          _convenio_novo_id: novoConvenioId,
          _observacao: observacao || null,
        });
        if (error) throw error;
        toast.success("Novo contrato criado a partir da renovação");
        onRenovado({ tipo: "troca_plano", contratoNovoId: (data as any)?.contrato_novo_id ?? null });
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro ao renovar: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-red-600" />
            Renovar contrato
          </DialogTitle>
          <DialogDescription>
            Todas as mensalidades deste contrato estão pagas. Escolha como renovar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setMode("extensao")}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                mode === "extensao" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
              }`}
            >
              <div className="font-semibold text-sm">Renovar mesmo plano</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Estende o contrato atual{convenioAtualNome ? ` (${convenioAtualNome})` : ""} com 12 novas
                mensalidades pelo valor atual do convênio.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMode("troca_plano")}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                mode === "troca_plano" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
              }`}
            >
              <div className="font-semibold text-sm">Alterar convênio</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Encerra este contrato como renovado e cria um novo contrato no convênio escolhido, mantendo os
                dependentes ativos.
              </div>
            </button>
          </div>

          {mode === "troca_plano" ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Novo convênio</Label>
              <Select value={novoConvenioId} onValueChange={setNovoConvenioId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o convênio" />
                </SelectTrigger>
                <SelectContent>
                  {convenios
                    .filter((c) => c.id !== convenioAtualId)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome} — {BRL(Number(c.valor_mensal))}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor mensal atual</span>
              <span className="font-mono">{BRL(valorAtual)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor da renovação</span>
              <span className="font-mono font-semibold">{BRL(valorRenovacao)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Parcelas a gerar</span>
              <span className="font-mono">{parcelasRenovacao}</span>
            </div>
            <div className="text-xs text-muted-foreground pt-1">
              A renovação não cobra taxa de adesão.
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Observação (opcional)</Label>
            <Textarea
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Motivo, condições combinadas, etc."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!podeConfirmar} className="bg-red-600 hover:bg-red-700 text-white">
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Confirmar renovação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}