import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Calendar,
  DollarSign,
  FileText,
  Ban,
  XCircle,
  Info,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// -------- Types (mirrors get_orcamento_conversao JSONB output) --------

type StatusOp =
  | "pendente"
  | "aguardando_agendamento"
  | "agendado"
  | "em_atendimento"
  | "concluido"
  | "cancelado"
  | "nao_aplicavel";

type StatusFin = "pendente" | "pago" | "estornado" | "isento" | "nao_aplicavel";

type Acao = "vender" | "agendar" | "marcar_nao_aplicavel" | "cancelar" | "emitir_nfse";

type Regra = {
  fluxo_atendimento?: string | null;
  agenda_obrigatoria?: boolean | null;
  medico_obrigatorio?: boolean | null;
  sala_obrigatoria?: boolean | null;
  equipamento_obrigatorio?: boolean | null;
  permite_venda_direta?: boolean | null;
  permite_venda_antecipada?: boolean | null;
  tempo_padrao_min?: number | null;
  permite_encaixe?: boolean | null;
  [key: string]: unknown;
};

type ItemConversao = {
  id: string;
  procedimento_id: string | null;
  descricao: string;
  quantidade: number;
  valor_total: number;
  status_operacional: StatusOp;
  status_financeiro: StatusFin;
  regras: Regra;
  acoes_disponiveis: Acao[];
  tem_agendamento: boolean;
  tem_pagamento: boolean;
  agendamento_id?: string | null;
  fin_atendimento_id?: string | null;
  regra_invalida?: boolean;
};

type Resp = {
  ok: boolean;
  codigo?: string;
  mensagem?: string;
  orcamento?: {
    id: string;
    numero?: string | number | null;
    status?: string;
    clinica_id?: string;
    paciente_nome?: string | null;
    valor_total?: number;
  };
  caixa_aberto?: boolean;
  itens?: ItemConversao[];
};

type UIState = {
  orcamento_id: string;
  orcamento_status?: string;
  clinica_id?: string;
  nfse_modo_emissao: "por_item" | "agrupada";
  caixa_aberto: boolean;
  caixa_sessao_id: string | null;
  itens: ItemConversao[];
};

// -------- Small helpers --------

const BRL = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const FORMAS = ["Dinheiro", "PIX", "Cartão de Crédito", "Cartão de Débito", "Boleto", "Outro"];

function labelOp(s: StatusOp): { label: string; className: string } {
  switch (s) {
    case "pendente": return { label: "Pendente", className: "bg-slate-100 text-slate-700 border-slate-300" };
    case "aguardando_agendamento": return { label: "Aguardando agenda", className: "bg-amber-100 text-amber-800 border-amber-300" };
    case "agendado": return { label: "Agendado", className: "bg-blue-100 text-blue-800 border-blue-300" };
    case "em_atendimento": return { label: "Em atendimento", className: "bg-indigo-100 text-indigo-800 border-indigo-300" };
    case "concluido": return { label: "Concluído", className: "bg-emerald-100 text-emerald-800 border-emerald-300" };
    case "cancelado": return { label: "Cancelado", className: "bg-rose-100 text-rose-800 border-rose-300" };
    case "nao_aplicavel": return { label: "Não aplicável", className: "bg-zinc-100 text-zinc-600 border-zinc-300" };
  }
}

function labelFin(s: StatusFin): { label: string; className: string } {
  switch (s) {
    case "pendente": return { label: "Pendente", className: "bg-slate-100 text-slate-700 border-slate-300" };
    case "pago": return { label: "Pago", className: "bg-emerald-100 text-emerald-800 border-emerald-300" };
    case "estornado": return { label: "Estornado", className: "bg-rose-100 text-rose-800 border-rose-300" };
    case "isento": return { label: "Isento", className: "bg-sky-100 text-sky-800 border-sky-300" };
    case "nao_aplicavel": return { label: "Não aplicável", className: "bg-zinc-100 text-zinc-600 border-zinc-300" };
  }
}

// -------- Sub-dialogs (Ações) --------

type ActionState =
  | { kind: "none" }
  | { kind: "venda"; item: ItemConversao }
  | { kind: "agendar"; item: ItemConversao }
  | { kind: "nao_aplicavel"; item: ItemConversao }
  | { kind: "cancelar"; item: ItemConversao; flags?: { tem_agendamento: boolean; tem_pagamento: boolean } };

// ---------------- Main component ----------------

export function ConversaoOrcamentoDialog({
  open,
  onClose,
  orcamentoId,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  orcamentoId: string;
  onChanged?: () => void;
}) {
  useClinica();
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<UIState | null>(null);
  const [action, setAction] = useState<ActionState>({ kind: "none" });
  const [emitindoNfse, setEmitindoNfse] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_orcamento_conversao", { p_orcamento_id: orcamentoId });
    if (error) { setLoading(false); mostrarErro(error); return; }
    const resp = data as unknown as Resp;
    if (!resp?.ok) { setLoading(false); toast.error(resp?.mensagem ?? "Falha ao carregar conversão"); return; }
    const clinicaId = resp.orcamento?.clinica_id ?? null;

    // buscar nfse_modo_emissao da clínica + sessão de caixa aberta do usuário
    let nfseModo: "por_item" | "agrupada" = "por_item";
    let caixaSessaoId: string | null = null;
    if (clinicaId) {
      const [{ data: clin }, { data: sess }] = await Promise.all([
        supabase.from("clinicas").select("nfse_modo_emissao").eq("id", clinicaId).maybeSingle(),
        supabase.from("caixa_sessoes").select("id").eq("clinica_id", clinicaId).eq("status", "aberto").order("aberto_em", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (clin && (clin as { nfse_modo_emissao?: string }).nfse_modo_emissao === "agrupada") nfseModo = "agrupada";
      caixaSessaoId = (sess as { id?: string } | null)?.id ?? null;
    }
    setPayload({
      orcamento_id: resp.orcamento?.id ?? orcamentoId,
      orcamento_status: resp.orcamento?.status,
      clinica_id: clinicaId ?? undefined,
      nfse_modo_emissao: nfseModo,
      caixa_aberto: !!resp.caixa_aberto,
      caixa_sessao_id: caixaSessaoId,
      itens: resp.itens ?? [],
    });
    setLoading(false);
  }, [orcamentoId]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const refresh = async () => { await load(); onChanged?.(); };

  const podeEmitirAgrupada = useMemo(() => {
    if (!payload) return false;
    if (payload.nfse_modo_emissao !== "agrupada") return false;
    const itens = payload.itens ?? [];
    if (itens.length === 0) return false;
    return itens.every((i) => i.status_financeiro === "pago" || i.status_financeiro === "nao_aplicavel");
  }, [payload]);

  const emitirNfseAgrupada = async () => {
    setEmitindoNfse(true);
    const { data, error } = await supabase.rpc("emitir_nfse_orcamento", { p_orcamento_id: orcamentoId });
    setEmitindoNfse(false);
    if (error) { mostrarErro(error); return; }
    const resp = data as unknown as { ok: boolean; codigo?: string; mensagem?: string };
    if (!resp?.ok) { toast.error(resp?.mensagem ?? `Erro: ${resp?.codigo ?? "?"}`); return; }
    toast.success("NFS-e agrupada emitida.");
    await refresh();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Conversão do orçamento</DialogTitle>
            <DialogDescription>
              Cada item é tratado conforme a regra configurada no procedimento / unidade. Financeiro e operacional evoluem de forma independente.
            </DialogDescription>
          </DialogHeader>

          {loading && <div className="py-8 text-center text-muted-foreground">Carregando…</div>}

          {!loading && payload && (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap border rounded-md p-3 bg-muted/30">
                <div className="flex items-center gap-3 text-sm">
                  <Badge variant="outline" className="capitalize">Orçamento: {payload.orcamento_status ?? "—"}</Badge>
                  <Badge variant="outline">
                    NFS-e: {payload.nfse_modo_emissao === "agrupada" ? "agrupada" : "por item"}
                  </Badge>
                  <Badge variant={payload.caixa_aberto ? "default" : "secondary"}>
                    Caixa: {payload.caixa_aberto ? "aberto" : "fechado"}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={refresh} className="gap-1">
                    <RefreshCw className="h-3.5 w-3.5" /> Atualizar
                  </Button>
                  {payload.nfse_modo_emissao === "agrupada" && (
                    <Button
                      size="sm"
                      onClick={emitirNfseAgrupada}
                      disabled={!podeEmitirAgrupada || emitindoNfse}
                      className="gap-1"
                      title={podeEmitirAgrupada ? "Emitir 1 NFS-e para o orçamento inteiro" : "Todos os itens precisam estar pagos"}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {emitindoNfse ? "Emitindo…" : "Emitir NFS-e agrupada"}
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-3 mt-3">
                {(payload.itens ?? []).map((it) => (
                  <ItemCard
                    key={it.id}
                    item={it}
                    caixaAberto={!!payload.caixa_aberto}
                    onAction={(kind) => setAction({ kind, item: it } as ActionState)}
                  />
                ))}
                {(payload.itens ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhum item neste orçamento.
                  </p>
                )}
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {action.kind === "venda" && (
        <VendaSheet
          item={action.item}
          caixaSessaoId={payload?.caixa_sessao_id ?? null}
          onClose={() => setAction({ kind: "none" })}
          onDone={() => { setAction({ kind: "none" }); void refresh(); }}
        />
      )}
      {action.kind === "agendar" && (
        <AgendarSheet
          item={action.item}
          onClose={() => setAction({ kind: "none" })}
          onDone={() => { setAction({ kind: "none" }); void refresh(); }}
        />
      )}
      {action.kind === "nao_aplicavel" && (
        <NaoAplicavelSheet
          item={action.item}
          onClose={() => setAction({ kind: "none" })}
          onDone={() => { setAction({ kind: "none" }); void refresh(); }}
        />
      )}
      {action.kind === "cancelar" && (
        <CancelarSheet
          item={action.item}
          flags={action.flags}
          onFlags={(f) => setAction({ kind: "cancelar", item: action.item, flags: f })}
          onClose={() => setAction({ kind: "none" })}
          onDone={() => { setAction({ kind: "none" }); void refresh(); }}
        />
      )}
    </>
  );
}

// -------- Item card --------

function ItemCard({
  item,
  caixaAberto,
  onAction,
}: {
  item: ItemConversao;
  caixaAberto: boolean;
  onAction: (kind: "venda" | "agendar" | "nao_aplicavel" | "cancelar") => void;
}) {
  const op = labelOp(item.status_operacional);
  const fin = labelFin(item.status_financeiro);
  const acoes = new Set(item.acoes_disponiveis ?? []);
  const total = Number(item.valor_total || 0);

  const chip = (label: string, ativa: boolean | null | undefined) => (
    <span
      key={label}
      className={
        "px-1.5 py-0.5 rounded text-[10px] border " +
        (ativa ? "border-primary/50 text-primary bg-primary/5" : "border-muted-foreground/30 text-muted-foreground")
      }
    >
      {label}
    </span>
  );

  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-medium">{item.descricao}</div>
          <div className="text-xs text-muted-foreground">
            Qtd {item.quantidade} · Total <b>{BRL(total)}</b>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge variant="outline" className={op.className}>Op: {op.label}</Badge>
          <Badge variant="outline" className={fin.className}>Fin: {fin.label}</Badge>
        </div>
      </div>

      <div className="text-xs text-muted-foreground flex flex-wrap gap-1 items-center">
        <Info className="h-3 w-3" />
        <span>Regra:</span>
        {chip(`fluxo=${item.regras?.fluxo_atendimento ?? "—"}`, true)}
        {chip("agenda obrigatória", !!item.regras?.agenda_obrigatoria)}
        {chip("médico obrigatório", !!item.regras?.medico_obrigatorio)}
        {chip("sala obrigatória", !!item.regras?.sala_obrigatoria)}
        {chip("equipamento obrigatório", !!item.regras?.equipamento_obrigatorio)}
        {chip("venda antecipada", !!item.regras?.permite_venda_antecipada)}
        {chip("venda direta", !!item.regras?.permite_venda_direta)}
        {item.regra_invalida && (
          <span className="ml-2 text-amber-700 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> regra não configurada — usando padrão
          </span>
        )}
      </div>

      <div className="flex gap-2 flex-wrap pt-1">
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          disabled={!acoes.has("vender") || !caixaAberto}
          onClick={() => onAction("venda")}
          title={!caixaAberto ? "Abra o caixa para registrar venda" : undefined}
        >
          <DollarSign className="h-3.5 w-3.5" /> Vender
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          disabled={!acoes.has("agendar")}
          onClick={() => onAction("agendar")}
        >
          <Calendar className="h-3.5 w-3.5" /> Agendar
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          disabled={!acoes.has("marcar_nao_aplicavel")}
          onClick={() => onAction("nao_aplicavel")}
        >
          <Ban className="h-3.5 w-3.5" /> Não aplicável
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1 text-destructive hover:text-destructive"
          disabled={!acoes.has("cancelar")}
          onClick={() => onAction("cancelar")}
        >
          <XCircle className="h-3.5 w-3.5" /> Cancelar
        </Button>
        {item.status_financeiro === "pago" && !item.regra_invalida && (
          <span className="text-[11px] text-emerald-700 flex items-center gap-1 self-center">
            <CheckCircle2 className="h-3 w-3" /> pagamento registrado
          </span>
        )}
      </div>
    </div>
  );
}

// -------- Venda --------

function VendaSheet({
  item,
  caixaSessaoId,
  onClose,
  onDone,
}: {
  item: ItemConversao;
  caixaSessaoId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [forma, setForma] = useState<string>("Dinheiro");
  const [desconto, setDesconto] = useState<string>("0");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!caixaSessaoId) { toast.error("Nenhuma sessão de caixa aberta."); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc("converter_item_venda", {
      p_item_id: item.id,
      p_caixa_sessao_id: caixaSessaoId,
      p_forma_pagamento: forma,
      p_desconto: Number(desconto) || 0,
    });
    setSaving(false);
    if (error) { mostrarErro(error); return; }
    const resp = data as unknown as Resp;
    if (!resp?.ok) { toast.error(resp?.mensagem ?? `Erro: ${resp?.codigo ?? "?"}`); return; }
    toast.success("Venda registrada.");
    onDone();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Vender item</DialogTitle>
          <DialogDescription>{item.descricao}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Forma de pagamento</Label>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FORMAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Desconto (R$)</Label>
            <Input type="number" step="0.01" min="0" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Registrando…" : "Confirmar venda"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------- Agendar --------

function AgendarSheet({
  item,
  onClose,
  onDone,
}: {
  item: ItemConversao;
  onClose: () => void;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const agendaObrig = !!item.regras?.agenda_obrigatoria;

  const submit = async () => {
    setSaving(true);
    // Fluxo simplificado: sem agenda obrigatória, marca "aguardando_agendamento"; com agenda obrigatória, envia para tela de agenda.
    const payload = agendaObrig
      ? { redirect_para_agenda: true }
      : {}; // RPC decide via fn_regras_procedimento
    const { data, error } = await supabase.rpc("converter_item_agendamento", {
      p_item_id: item.id,
      p_payload: payload,
    });
    setSaving(false);
    if (error) { mostrarErro(error); return; }
    const resp = data as unknown as Resp;
    if (!resp?.ok) {
      toast.error(resp?.mensagem ?? `Erro: ${resp?.codigo ?? "?"}`);
      if (resp?.codigo === "AGENDA_OBRIGATORIA_USE_TELA") {
        toast.info("Use a tela de Agenda para escolher médico, sala e horário deste item.");
      }
      return;
    }
    toast.success(agendaObrig ? "Item pronto para agendamento na Agenda." : "Item marcado como aguardando agendamento.");
    onDone();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agendar item</DialogTitle>
          <DialogDescription>{item.descricao}</DialogDescription>
        </DialogHeader>
        <div className="text-sm space-y-2">
          {agendaObrig ? (
            <p>
              Este procedimento exige agenda formal. O agendamento completo (médico, sala, horário) é feito na tela
              <b> Orçamentos → Agendar</b>. Confirme para preparar o item.
            </p>
          ) : (
            <p>
              Este procedimento não exige agenda formal. Vamos marcá-lo como <b>aguardando atendimento</b>,
              disponível para execução direta.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Salvando…" : "Confirmar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------- Não aplicável --------

function NaoAplicavelSheet({
  item,
  onClose,
  onDone,
}: {
  item: ItemConversao;
  onClose: () => void;
  onDone: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (motivo.trim().length < 3) { toast.error("Descreva o motivo."); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc("marcar_item_nao_aplicavel", {
      p_item_id: item.id,
      p_motivo: motivo.trim(),
    });
    setSaving(false);
    if (error) { mostrarErro(error); return; }
    const resp = data as unknown as Resp;
    if (!resp?.ok) { toast.error(resp?.mensagem ?? `Erro: ${resp?.codigo ?? "?"}`); return; }
    toast.success("Item marcado como não aplicável.");
    onDone();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como não aplicável</DialogTitle>
          <DialogDescription>{item.descricao}</DialogDescription>
        </DialogHeader>
        <div>
          <Label>Motivo</Label>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Ex.: venda balcão sem atendimento." />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Salvando…" : "Confirmar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------- Cancelar (fluxo 2 passos) --------

function CancelarSheet({
  item,
  flags,
  onFlags,
  onClose,
  onDone,
}: {
  item: ItemConversao;
  flags?: { tem_agendamento: boolean; tem_pagamento: boolean };
  onFlags: (f: { tem_agendamento: boolean; tem_pagamento: boolean }) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [step2, setStep2] = useState(false);

  const prever = async () => {
    if (motivo.trim().length < 3) { toast.error("Descreva o motivo."); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc("cancelar_item", {
      p_item_id: item.id,
      p_motivo: motivo.trim(),
      p_confirmar_cascata: false,
    });
    setSaving(false);
    if (error) { mostrarErro(error); return; }
    const resp = data as unknown as {
      ok: boolean; codigo?: string; mensagem?: string;
      requer_confirmacao?: boolean; tem_agendamento?: boolean; tem_pagamento?: boolean;
    };
    if (!resp?.ok) { toast.error(resp?.mensagem ?? `Erro: ${resp?.codigo ?? "?"}`); return; }
    if (resp.requer_confirmacao) {
      onFlags({
        tem_agendamento: !!resp.tem_agendamento,
        tem_pagamento: !!resp.tem_pagamento,
      });
      setStep2(true);
    } else {
      toast.success("Item cancelado.");
      onDone();
    }
  };

  const confirmar = async () => {
    setSaving(true);
    const { data, error } = await supabase.rpc("cancelar_item", {
      p_item_id: item.id,
      p_motivo: motivo.trim(),
      p_confirmar_cascata: true,
    });
    setSaving(false);
    if (error) { mostrarErro(error); return; }
    const resp = data as unknown as { ok: boolean; codigo?: string; mensagem?: string; aviso_pagamento?: boolean };
    if (!resp?.ok) { toast.error(resp?.mensagem ?? `Erro: ${resp?.codigo ?? "?"}`); return; }
    if (resp.aviso_pagamento) {
      toast.warning("Item cancelado. O pagamento não foi estornado automaticamente — verifique no Caixa/Financeiro.", { duration: 8000 });
    } else {
      toast.success("Item cancelado.");
    }
    onDone();
  };

  return (
    <>
      {!step2 && (
        <Dialog open onOpenChange={(v) => !v && onClose()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Cancelar item</DialogTitle>
              <DialogDescription>{item.descricao}</DialogDescription>
            </DialogHeader>
            <div>
              <Label>Motivo do cancelamento</Label>
              <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={saving}>Voltar</Button>
              <Button variant="destructive" onClick={prever} disabled={saving}>{saving ? "Verificando…" : "Prosseguir"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {step2 && (
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar cancelamento em cascata</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p>Ao confirmar, o item será cancelado com os efeitos abaixo:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    {flags?.tem_agendamento && <li>O agendamento vinculado será <b>cancelado</b> e o horário liberado.</li>}
                    {flags?.tem_pagamento && (
                      <li className="text-amber-700">
                        Existe pagamento registrado. <b>O valor NÃO será estornado automaticamente.</b> Abra o estorno manualmente no Caixa/Financeiro.
                      </li>
                    )}
                    {!flags?.tem_agendamento && !flags?.tem_pagamento && <li>Nenhum efeito colateral detectado.</li>}
                  </ul>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setStep2(false)} disabled={saving}>Voltar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmar} disabled={saving}>
                {saving ? "Cancelando…" : "Confirmar cancelamento"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}