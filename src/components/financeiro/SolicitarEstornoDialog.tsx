import { useState, useEffect, type FormEvent } from "react";
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

import { DateInputBR } from "@/components/ui/date-input-br";
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
  const [caixaFechadoAviso, setCaixaFechadoAviso] = useState<string | null>(null);

  // Quando for devolução, verifica se o caixa da data do pagamento original
  // ainda está aberto. Se não houver caixa aberto naquele dia, avisa que a
  // devolução será lançada na data de hoje (caixa atual / banco).
  useEffect(() => {
    if (!open || tipo !== "devolucao" || !clinicaAtual || !dataPagamentoOriginal) {
      setCaixaFechadoAviso(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const inicio = `${dataPagamentoOriginal}T00:00:00`;
      const fim = `${dataPagamentoOriginal}T23:59:59`;
      const { data } = await supabase
        .from("caixa_sessoes")
        .select("id, status")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("status", "aberto")
        .gte("aberto_em", inicio)
        .lte("aberto_em", fim)
        .limit(1);
      if (cancelled) return;
      if (!data || data.length === 0) {
        setCaixaFechadoAviso(
          "O caixa do dia do pagamento original já está fechado. A devolução será lançada como saída na data informada abaixo (caixa/banco atual), sem alterar o fechamento anterior.",
        );
      } else {
        setCaixaFechadoAviso(null);
      }
    })();
    return () => { cancelled = true; };
  }, [open, tipo, clinicaAtual, dataPagamentoOriginal]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual || !user) return;
    const txt = motivo.trim();
    if (txt.length < 5) { toast.error("Descreva o motivo (mínimo 5 caracteres)"); return; }
    setSaving(true);
    // Evita duplicidade: se já existe uma solicitação pendente ou aprovada
    // para o mesmo lançamento ou agendamento, não cria outra.
    if (lancamentoId || agendamentoId) {
      let q = supabase
        .from("estorno_solicitacoes")
        .select("id, status")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .in("status", ["pendente", "aprovado"]);
      if (lancamentoId && agendamentoId) {
        q = q.or(`lancamento_id.eq.${lancamentoId},agendamento_id.eq.${agendamentoId}`);
      } else if (lancamentoId) {
        q = q.eq("lancamento_id", lancamentoId);
      } else if (agendamentoId) {
        q = q.eq("agendamento_id", agendamentoId);
      }
      const { data: exist } = await q.limit(1);
      if (exist && exist.length > 0) {
        setSaving(false);
        toast.error(
          exist[0].status === "pendente"
            ? "Já existe uma solicitação de estorno pendente para este item."
            : "Este item já foi estornado.",
        );
        onOpenChange(false);
        onCreated?.();
        return;
      }
    }
    const { error } = await supabase.from("estorno_solicitacoes").insert({
      clinica_id: clinicaAtual.clinica_id,
      lancamento_id: lancamentoId ?? null,
      agendamento_id: await (async () => {
        if (agendamentoId) return agendamentoId;
        // Deriva a partir do lançamento para que a Agenda consiga marcar
        // a linha em vermelho e ocultar o paciente para o médico.
        if (lancamentoId) {
          const { data: lanc } = await supabase
            .from("fin_lancamentos")
            .select("agendamento_id")
            .eq("id", lancamentoId)
            .maybeSingle();
          return (lanc as { agendamento_id: string | null } | null)?.agendamento_id ?? null;
        }
        return null;
      })(),
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
    if (error) {
      // Índice único parcial (uq_estorno_solicitacoes_lancamento_pendente) é a
      // trava real contra duplicidade — a checagem acima é só uma prévia para
      // UX; ela pode perder uma corrida (duplo clique, duas abas) e o banco
      // barra do mesmo jeito. Mostra a mesma mensagem amigável nesse caso raro.
      if ((error as { code?: string }).code === "23505") {
        toast.error("Já existe uma solicitação de estorno pendente para este item.");
        onOpenChange(false);
        onCreated?.();
        return;
      }
      mostrarErro(error);
      return;
    }
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
              <>
              {caixaFechadoAviso && (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
                  {caixaFechadoAviso}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="data-pg-orig">Data do pagamento original</Label>
                  <DateInputBR
                    id="data-pg-orig"
                    value={dataPagamentoOriginal}
                    onChange={(e) => setDataPagamentoOriginal(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="data-est">Data da devolução</Label>
                  <DateInputBR
                    id="data-est"
                    value={dataEstorno}
                    onChange={(e) => setDataEstorno(e.target.value)}
                  />
                </div>
              </div>
              </>
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