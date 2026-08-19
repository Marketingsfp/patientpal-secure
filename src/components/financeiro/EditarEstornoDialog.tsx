import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DateInputBR } from "@/components/ui/date-input-br";

/** Campos que o financeiro pode revisar antes de aprovar. */
export interface EstornoEditavel {
  id: string;
  paciente_nome: string | null;
  descricao: string | null;
  valor: number | null;
  motivo: string;
  tipo: "erro_caixa" | "devolucao" | null;
  caixa_movimento_id: string | null;
  data_pagamento_original: string | null;
  data_estorno: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  solicitacao: EstornoEditavel | null;
  onSaved?: () => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

/**
 * Ajuste de uma solicitação de estorno ainda PENDENTE.
 *
 * Antes disso a única forma de corrigir um pedido malfeito era recusar e pedir
 * para a recepção enviar outro — o índice único parcial só libera uma nova
 * solicitação depois que a anterior sai do status pendente.
 *
 * Paciente, descrição e valor ficam somente leitura de propósito: eles vêm do
 * lançamento original, e o estorno sempre devolve o valor real do lançamento
 * (RPC estornar_lancamento_receita). Deixar o valor editável aqui só criaria
 * divergência entre o que a tela mostra e o que o caixa realmente devolve.
 */
export function EditarEstornoDialog({ open, onOpenChange, solicitacao, onSaved }: Props) {
  const ehSangria = !!solicitacao?.caixa_movimento_id;
  const [tipo, setTipo] = useState<"erro_caixa" | "devolucao">("erro_caixa");
  const [motivo, setMotivo] = useState("");
  const [dataPagamentoOriginal, setDataPagamentoOriginal] = useState("");
  const [dataEstorno, setDataEstorno] = useState("");
  const [saving, setSaving] = useState(false);

  // Recarrega os campos toda vez que o dialog abre com outra solicitação.
  useEffect(() => {
    if (!open || !solicitacao) return;
    const hoje = new Date().toISOString().slice(0, 10);
    setTipo(solicitacao.tipo === "devolucao" ? "devolucao" : "erro_caixa");
    setMotivo(solicitacao.motivo ?? "");
    setDataPagamentoOriginal(solicitacao.data_pagamento_original ?? hoje);
    setDataEstorno(solicitacao.data_estorno ?? hoje);
  }, [open, solicitacao]);

  // Sangria só faz sentido como "erro de caixa" — mesma trava do pedido.
  useEffect(() => {
    if (ehSangria) setTipo("erro_caixa");
  }, [ehSangria]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!solicitacao) return;
    const txt = motivo.trim();
    // Espelha o CHECK estorno_motivo_len do banco.
    if (txt.length < 5) {
      toast.error("Descreva o motivo (mínimo 5 caracteres)");
      return;
    }
    if (txt.length > 1000) {
      toast.error("O motivo pode ter no máximo 1000 caracteres");
      return;
    }
    setSaving(true);
    // O filtro por status garante que uma aprovação/recusa feita por outro
    // usuário enquanto o dialog estava aberto não seja sobrescrita.
    const { data, error } = await supabase
      .from("estorno_solicitacoes")
      .update({
        motivo: txt,
        tipo,
        data_pagamento_original: tipo === "devolucao" ? dataPagamentoOriginal || null : null,
        data_estorno: tipo === "devolucao" ? dataEstorno || null : null,
      })
      .eq("id", solicitacao.id)
      .eq("status", "pendente")
      .select("id");
    setSaving(false);
    if (error) {
      mostrarErro(error, "Não foi possível salvar a alteração");
      return;
    }
    if (!data || data.length === 0) {
      toast.error("Esta solicitação já foi aprovada ou recusada por outra pessoa.");
      onOpenChange(false);
      onSaved?.();
      return;
    }
    toast.success("Solicitação atualizada");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Editar solicitação de estorno
            </DialogTitle>
            <DialogDescription>
              Ajuste o pedido antes de aprovar — assim não é preciso recusar e pedir para a recepção
              enviar tudo de novo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="font-medium">{solicitacao?.paciente_nome ?? "Sem paciente"}</div>
              {solicitacao?.descricao && (
                <div className="text-xs text-muted-foreground">{solicitacao.descricao}</div>
              )}
              <div className="text-xs text-muted-foreground mt-1">
                Valor: {solicitacao?.valor != null ? fmt(Number(solicitacao.valor)) : "—"} — o
                estorno sempre devolve o valor real do lançamento, por isso ele não é editável aqui.
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <RadioGroup
                value={tipo}
                onValueChange={(v) => setTipo(v as "erro_caixa" | "devolucao")}
                className="flex gap-4"
                disabled={ehSangria}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="erro_caixa" id="edit-tipo-erro" />
                  <Label htmlFor="edit-tipo-erro" className="font-normal cursor-pointer">
                    Erro de caixa
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="devolucao" id="edit-tipo-devolucao" />
                  <Label htmlFor="edit-tipo-devolucao" className="font-normal cursor-pointer">
                    Devolução ao paciente
                  </Label>
                </div>
              </RadioGroup>
              {ehSangria && (
                <p className="text-xs text-muted-foreground">
                  Estorno de sangria é sempre erro de caixa.
                </p>
              )}
            </div>

            {tipo === "devolucao" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-data-pag">Data do pagamento original</Label>
                  <DateInputBR
                    id="edit-data-pag"
                    value={dataPagamentoOriginal}
                    onChange={(e) => setDataPagamentoOriginal(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-data-est">Data da devolução</Label>
                  <DateInputBR
                    id="edit-data-est"
                    value={dataEstorno}
                    onChange={(e) => setDataEstorno(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="edit-motivo">Motivo</Label>
              <Textarea
                id="edit-motivo"
                rows={4}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Explique o motivo do estorno"
              />
              <p className="text-xs text-muted-foreground">
                Mínimo 5 caracteres. O texto original do pedido fica registrado na auditoria.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
