import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Undo2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Referência humana (descrição do movimento ou atendimento) */
  descricao?: string | null;
  valor?: number | null;
  pacienteNome?: string | null;
  lancamentoId?: string | null;
  agendamentoId?: string | null;
  onCreated?: () => void;
}

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function SolicitarEstornoDialog({
  open, onOpenChange, descricao, valor, pacienteNome, lancamentoId, agendamentoId, onCreated,
}: Props) {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const hoje = new Date().toISOString().slice(0, 10);
  const [tipo, setTipo] = useState<"erro_caixa" | "devolucao">("erro_caixa");
  const [motivo, setMotivo] = useState("");
  const [dataPagamentoOriginal, setDataPagamentoOriginal] = useState<string>(hoje);
  const [dataEstorno, setDataEstorno] = useState<string>(hoje);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual || !user) return;
    const txt = motivo.trim();
    if (txt.length < 5) { toast.error("Descreva o motivo (mínimo 5 caracteres)"); return; }
    setSaving(true);
    // Evita duplicidade: se já existe uma solicitação pendente ou aprovada
    // para o mesmo lançamento, não cria outra.
    if (lancamentoId) {
      const { data: exist } = await supabase
        .from("estorno_solicitacoes")
        .select("id, status")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("lancamento_id", lancamentoId)
        .in("status", ["pendente", "aprovado"])
        .limit(1);
      if (exist && exist.length > 0) {
        setSaving(false);
        toast.error(
          exist[0].status === "pendente"
            ? "Já existe uma solicitação pendente para este lançamento."
            : "Este lançamento já foi estornado.",
        );
        return;
      }
    }
    const { error } = await supabase.from("estorno_solicitacoes").insert({
      clinica_id: clinicaAtual.clinica_id,
      lancamento_id: lancamentoId ?? null,
      agendamento_id: agendamentoId ?? null,
      paciente_nome: pacienteNome ?? null,
      descricao: descricao ?? null,
      valor: valor ?? null,
      motivo: txt,
      tipo,
      data_pagamento_original: tipo === "devolucao" ? (dataPagamentoOriginal || null) : null,
      data_estorno: tipo === "devolucao" ? (dataEstorno || null) : null,
      status: "pendente",
      solicitado_por: user.id,
    });
    setSaving(false);
    if (error) { mostrarErro(error); return; }
    toast.success("Solicitação enviada ao financeiro");
    setMotivo("");
    setTipo("erro_caixa");
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="h-4 w-4" /> Solicitar estorno ao financeiro
            </DialogTitle>
            <DialogDescription>
              O financeiro será notificado em tempo real e decidirá pela aprovação ou recusa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {(descricao || valor != null || pacienteNome) && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-0.5">
                {pacienteNome && <div><span className="text-muted-foreground">Paciente:</span> <strong>{pacienteNome}</strong></div>}
                {descricao && <div><span className="text-muted-foreground">Lançamento:</span> {descricao}</div>}
                {valor != null && <div><span className="text-muted-foreground">Valor:</span> <strong>{fmt(Number(valor))}</strong></div>}
              </div>
            )}
            <div>
              <Label>Tipo de estorno</Label>
              <RadioGroup
                value={tipo}
                onValueChange={(v) => setTipo(v as "erro_caixa" | "devolucao")}
                className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1"
              >
                <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer hover:bg-muted/40">
                  <RadioGroupItem value="erro_caixa" id="t-erro" className="mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium">Erro de caixa</div>
                    <div className="text-xs text-muted-foreground">Cobrança errada, duplicidade, valor incorreto.</div>
                  </div>
                </label>
                <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer hover:bg-muted/40">
                  <RadioGroupItem value="devolucao" id="t-dev" className="mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium">Devolução ao paciente</div>
                    <div className="text-xs text-muted-foreground">Desistência, ocorrido, reembolso (pode ser em outro dia).</div>
                  </div>
                </label>
              </RadioGroup>
            </div>
            {tipo === "devolucao" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="data-pg-orig">Data do pagamento original</Label>
                  <Input
                    id="data-pg-orig"
                    type="date"
                    value={dataPagamentoOriginal}
                    onChange={(e) => setDataPagamentoOriginal(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="data-est">Data da devolução</Label>
                  <Input
                    id="data-est"
                    type="date"
                    value={dataEstorno}
                    onChange={(e) => setDataEstorno(e.target.value)}
                  />
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="motivo">Motivo / observação (obrigatório)</Label>
              <Textarea
                id="motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: paciente desistiu do procedimento, valor cobrado incorreto, duplicidade..."
                rows={4}
                maxLength={1000}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">{motivo.length}/1000</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Enviando..." : "Enviar solicitação"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}