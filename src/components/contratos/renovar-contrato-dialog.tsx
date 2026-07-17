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
import { Checkbox } from "@/components/ui/checkbox";

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Mode = "extensao" | "troca_plano";

interface Convenio {
  id: string;
  nome: string;
  valor_mensal: number;
  num_parcelas: number;
  taxa_adesao: number;
}

interface Dependente {
  id: string;
  paciente_nome: string;
  parentesco: string | null;
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
  const [observacao, setObservacao] = useState("");
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [novoConvenioId, setNovoConvenioId] = useState<string>("");
  const [dependentes, setDependentes] = useState<Dependente[]>([]);
  const [dependentesMantidos, setDependentesMantidos] = useState<Set<string>>(new Set());
  const [cobrarTaxa, setCobrarTaxa] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setObservacao("");
    setNovoConvenioId(convenioAtualId ?? "");
    setCobrarTaxa(true);

    (async () => {
      const [{ data: conv }, { data: deps }] = await Promise.all([
        supabase
        .from("cb_convenios")
        .select("id, nome, valor_mensal, num_parcelas, taxa_adesao")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
          .order("nome"),
        supabase
          .from("contrato_dependentes")
          .select("id, paciente_nome, parentesco")
          .eq("contrato_id", contratoId)
          .eq("ativo", true)
          .order("paciente_nome"),
      ]);
      setConvenios((conv ?? []) as Convenio[]);
      const listaDeps = (deps ?? []) as Dependente[];
      setDependentes(listaDeps);
      setDependentesMantidos(new Set(listaDeps.map((d) => d.id)));
    })();
  }, [open, clinicaId, convenioAtualId, contratoId]);

  const novoConvenio = convenios.find((c) => c.id === novoConvenioId);
  const mode: Mode =
    novoConvenioId && convenioAtualId && novoConvenioId === convenioAtualId ? "extensao" : "troca_plano";
  const valorRenovacao = novoConvenio ? Number(novoConvenio.valor_mensal) : 0;
  const parcelasRenovacao = novoConvenio ? Number(novoConvenio.num_parcelas ?? 12) : 12;
  const taxaConvenio = novoConvenio ? Number(novoConvenio.taxa_adesao ?? 0) : 0;
  const taxaCobrada = mode === "troca_plano" && cobrarTaxa ? taxaConvenio : 0;
  const totalPessoas = 1 + dependentesMantidos.size;

  const podeConfirmar = !saving && !!novoConvenioId;

  const toggleDep = (id: string) => {
    setDependentesMantidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmar = async () => {
    if (!podeConfirmar) return;
    const msg =
      mode === "extensao"
        ? `Renovar o contrato gerando ${parcelasRenovacao} novas mensalidades de ${BRL(valorRenovacao)}?`
        : `Encerrar este contrato como renovado e criar um novo contrato no convênio "${novoConvenio?.nome}" com ${parcelasRenovacao} parcelas de ${BRL(valorRenovacao)}${taxaCobrada > 0 ? ` + taxa de adesão de ${BRL(taxaCobrada)}` : ""}?`;
    if (
      !window.confirm(msg)
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
          _dependentes_manter: Array.from(dependentesMantidos),
          _cobrar_taxa_adesao: cobrarTaxa,
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-red-600" />
            Renovar contrato
          </DialogTitle>
          <DialogDescription>
            Todas as mensalidades deste contrato estão pagas. Escolha o convênio da renovação e revise os dependentes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Convênio da renovação</Label>
            <Select value={novoConvenioId} onValueChange={setNovoConvenioId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o convênio" />
              </SelectTrigger>
              <SelectContent>
                {convenios.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome} — {BRL(Number(c.valor_mensal))}
                    {c.id === convenioAtualId ? " (atual)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {mode === "extensao"
                ? "Manter o mesmo convênio estende este contrato sem cobrar taxa de adesão."
                : "Trocar de convênio cria um novo contrato e cobra a taxa de adesão do convênio escolhido."}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Pessoas no contrato</Label>
              <span className="text-xs text-muted-foreground">
                Total: <span className="font-semibold text-foreground">{totalPessoas}</span> (titular + {dependentesMantidos.size} dependente{dependentesMantidos.size === 1 ? "" : "s"})
              </span>
            </div>
            {dependentes.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Sem dependentes ativos neste contrato.</p>
            ) : (
              <div className="rounded-md border divide-y">
                {dependentes.map((d) => {
                  const checked = dependentesMantidos.has(d.id);
                  return (
                    <label
                      key={d.id}
                      className="flex items-center gap-2 p-2 text-sm cursor-pointer hover:bg-muted/40"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleDep(d.id)} />
                      <span className="flex-1 truncate">{d.paciente_nome}</span>
                      {d.parentesco ? (
                        <span className="text-xs text-muted-foreground">{d.parentesco}</span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {mode === "troca_plano" && taxaConvenio > 0 ? (
            <label className="flex items-start gap-2 rounded-md border p-2 text-sm cursor-pointer hover:bg-muted/40">
              <Checkbox
                checked={cobrarTaxa}
                onCheckedChange={(v) => setCobrarTaxa(v === true)}
                className="mt-0.5"
              />
              <span className="flex-1">
                Cobrar taxa de adesão do novo convênio ({BRL(taxaConvenio)})
              </span>
            </label>
          ) : null}

          <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Convênio anterior</span>
              <span className="font-medium">{convenioAtualNome ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Novo convênio</span>
              <span className="font-medium">{novoConvenio?.nome ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor mensal anterior</span>
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
            <div className="flex justify-between">
              <span className="text-muted-foreground">Taxa de adesão</span>
              <span className="font-mono">{BRL(taxaCobrada)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pessoas no contrato</span>
              <span className="font-mono">{totalPessoas}</span>
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