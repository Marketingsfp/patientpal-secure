import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, Stethoscope, Download, Filter, Wallet, CheckCircle2, Clock, Undo2, Check, ChevronsUpDown, BellRing } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useMedicoContext } from "@/hooks/use-medico-context";
import { logAction } from "@/hooks/use-crud";
import { exportToExcel } from "@/lib/export-csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/app/financeiro/atendimentos")({
  component: Page,
  head: () => ({ meta: [{ title: "Atendimentos — Financeiro" }] }),
});

interface Atend {
  id: string; data: string; procedimento: string | null;
  valor_total: number; valor_medico: number; valor_clinica: number;
  status: string; forma_pagamento: string | null;
  medico_id: string | null; paciente_id: string | null;
  origem?: "manual" | "agenda";
  repasse_pago?: boolean;
  repasse_pago_em?: string | null;
  repasse_forma_pagamento?: string | null;
}
interface Medico { id: string; nome: string; tipo_repasse: string; percentual_repasse_padrao: number; valor_repasse_padrao: number | null }
interface Pac { id: string; nome: string }
interface Convenio { medico_id: string; nome: string; tipo_repasse: string; percentual: number | null; valor: number | null }
interface Conta { id: string; nome: string }

const EMPTY = {
  data: new Date().toISOString().slice(0, 10), medico_id: "", paciente_id: "",
  procedimento: "", valor_total: "", forma_pagamento: "", status: "realizado",
};
const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Page() {
  const { clinicaAtual } = useClinica();
  const { medicoId: medicoLogadoId, isMedicoOnly } = useMedicoContext();
  const podeEstornar = ["admin", "gestor", "financeiro"].includes(clinicaAtual?.role ?? "");
  const [items, setItems] = useState<Atend[]>([]);
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [pacientes, setPacientes] = useState<Pac[]>([]);
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Atend | null>(null);
  const [form, setForm] = useState(EMPTY);
  // Filtros do relatório
  const hoje = new Date().toISOString().slice(0, 10);
  const primeiroDia = new Date();
  primeiroDia.setDate(1);
  const [fMedico, setFMedico] = useState<string>("todos");
  const [fIni, setFIni] = useState<string>(primeiroDia.toISOString().slice(0, 10));
  const [fFim, setFFim] = useState<string>(hoje);
  const [fStatus, setFStatus] = useState<"todos" | "aberto" | "pago">("aberto");
  const [contas, setContas] = useState<Conta[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ data: hoje, conta_id: "", forma_pagamento: "" });
  const [payingNow, setPayingNow] = useState(false);

  // Solicitações de estorno pendentes (vindas do caixa/recepção)
  interface SolicEst {
    id: string; paciente_nome: string | null; descricao: string | null;
    valor: number | null; motivo: string; solicitado_em: string;
    lancamento_id: string | null;
    tipo: "erro_caixa" | "devolucao" | null;
    data_pagamento_original: string | null;
    data_estorno: string | null;
  }
  const [solicitacoes, setSolicitacoes] = useState<SolicEst[]>([]);
  const loadSolicitacoes = async () => {
    if (!clinicaAtual) { setSolicitacoes([]); return; }
    const { data } = await supabase
      .from("estorno_solicitacoes")
      .select("id, paciente_nome, descricao, valor, motivo, solicitado_em, lancamento_id, tipo, data_pagamento_original, data_estorno")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("status", "pendente")
      .order("solicitado_em", { ascending: false });
    setSolicitacoes((data ?? []) as SolicEst[]);
  };
  useEffect(() => { void loadSolicitacoes(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clinicaAtual?.clinica_id]);
  useEffect(() => {
    if (!clinicaAtual) return;
    const ch = supabase
      .channel(`fin-estornos-${clinicaAtual.clinica_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "estorno_solicitacoes", filter: `clinica_id=eq.${clinicaAtual.clinica_id}` },
        () => { void loadSolicitacoes(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaAtual?.clinica_id]);

  const aprovarSolicitacao = async (s: SolicEst) => {
    if (!podeEstornar) { toast.error("Sem permissão"); return; }
    // Tenta encontrar o atendimento referente para estornar de fato
    const alvo = s.lancamento_id ? items.find((x) => x.id === s.lancamento_id) : null;
    if (alvo) {
      await estornar(alvo);
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("estorno_solicitacoes").update({
      status: "aprovado",
      resolvido_por: user?.id ?? null,
      resolvido_em: new Date().toISOString(),
      resposta: alvo ? "Estorno executado" : "Aprovado manualmente (processar baixa)",
    }).eq("id", s.id);
    if (error) toast.error(error.message);
    else { toast.success("Solicitação aprovada"); void loadSolicitacoes(); }
  };

  const rejeitarSolicitacao = async (s: SolicEst) => {
    if (!podeEstornar) { toast.error("Sem permissão"); return; }
    const resp = window.prompt("Motivo da recusa (opcional):") ?? "";
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("estorno_solicitacoes").update({
      status: "rejeitado",
      resolvido_por: user?.id ?? null,
      resolvido_em: new Date().toISOString(),
      resposta: resp || null,
    }).eq("id", s.id);
    if (error) toast.error(error.message);
    else { toast.success("Solicitação recusada"); void loadSolicitacoes(); }
  };

  // Perfil médico: trava o filtro no próprio profissional
  useEffect(() => {
    if (isMedicoOnly && medicoLogadoId) setFMedico(medicoLogadoId);
  }, [isMedicoOnly, medicoLogadoId]);

  const norm = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const calcRepasse = (medicoId: string | null, total: number, procNome: string | null): number => {
    if (!medicoId || !total) return 0;
    const med = medicos.find((m) => m.id === medicoId);
    // 1) tenta convenio por nome do procedimento
    if (procNome) {
      const alvo = norm(procNome);
      const c = convenios.find((cv) => cv.medico_id === medicoId && norm(cv.nome) === alvo);
      if (c) {
        if (c.tipo_repasse === "valor" && c.valor != null) return Math.min(Number(c.valor), total);
        if (c.tipo_repasse === "percentual" && c.percentual != null) {
          return +(total * Number(c.percentual) / 100).toFixed(2);
        }
        // sem tipo/valor cadastrado no item → cai no padrão do médico
      }
    }
    // 2) fallback repasse padrão do médico
    if (med) {
      if (med.tipo_repasse === "valor" && med.valor_repasse_padrao != null) {
        return Math.min(Number(med.valor_repasse_padrao), total);
      }
      return +(total * Number(med.percentual_repasse_padrao ?? 0) / 100).toFixed(2);
    }
    return 0;
  };

  const load = async () => {
    if (!clinicaAtual) { setItems([]); setLoading(false); return; }
    setLoading(true);
    // Une atendimentos manuais (fin_atendimentos) com pagamentos da agenda (fin_lancamentos receita).
    let qManual = supabase
      .from("fin_atendimentos")
      .select("id, data, procedimento, valor_total, valor_medico, valor_clinica, status, forma_pagamento, medico_id, paciente_id, repasse_pago, repasse_pago_em, repasse_forma_pagamento")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .gte("data", fIni)
      .lte("data", fFim);
    let qAgenda = supabase
      .from("fin_lancamentos")
      .select("id, data, descricao, valor, forma_pagamento, medico_id, paciente_id, agendamento_id, repasse_pago, repasse_pago_em, repasse_forma_pagamento")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("tipo", "receita")
      .eq("status", "confirmado")
      .not("medico_id", "is", null)
      .gte("data", fIni)
      .lte("data", fFim);
    if (fMedico !== "todos") {
      qManual = qManual.eq("medico_id", fMedico);
      qAgenda = qAgenda.eq("medico_id", fMedico);
    }
    const [mr, ar] = await Promise.all([qManual.order("data", { ascending: false }), qAgenda.order("data", { ascending: false })]);
    if (mr.error) { toast.error(mr.error.message); setLoading(false); return; }
    if (ar.error) { toast.error(ar.error.message); setLoading(false); return; }
    const manuais: Atend[] = (mr.data ?? []).map((r) => ({
      id: r.id, data: r.data, procedimento: r.procedimento,
      valor_total: Number(r.valor_total), valor_medico: Number(r.valor_medico), valor_clinica: Number(r.valor_clinica),
      status: r.status, forma_pagamento: r.forma_pagamento, medico_id: r.medico_id, paciente_id: r.paciente_id,
      origem: "manual",
      repasse_pago: !!r.repasse_pago, repasse_pago_em: r.repasse_pago_em, repasse_forma_pagamento: r.repasse_forma_pagamento,
    }));
    const agend: Atend[] = (ar.data ?? []).map((r): Atend => {
      const proc = (r.descricao ?? "").split("—").slice(1).join("—").trim() || r.descricao;
      const total = Number(r.valor);
      const repasse = calcRepasse(r.medico_id, total, proc);
      return {
        id: r.id, data: r.data, procedimento: proc,
        valor_total: total, valor_medico: repasse, valor_clinica: +(total - repasse).toFixed(2),
        status: "realizado", forma_pagamento: r.forma_pagamento,
        medico_id: r.medico_id, paciente_id: r.paciente_id,
        origem: "agenda",
        repasse_pago: !!r.repasse_pago, repasse_pago_em: r.repasse_pago_em, repasse_forma_pagamento: r.repasse_forma_pagamento,
      };
    });
    let unif = [...manuais, ...agend].sort((a, b) => (a.data < b.data ? 1 : -1));
    if (fStatus === "aberto") unif = unif.filter((x) => !x.repasse_pago);
    else if (fStatus === "pago") unif = unif.filter((x) => x.repasse_pago);
    setItems(unif);
    setSel(new Set());
    setLoading(false);
  };
  const loadOpts = async () => {
    if (!clinicaAtual) return;
    const [m, p, c] = await Promise.all([
      supabase.from("medicos").select("id, nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
      supabase.from("pacientes").select("id, nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome").limit(500),
      supabase.from("fin_contas").select("id, nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
    ]);
    const { data: rep } = await supabase.rpc("medicos_repasse_lista", { _clinica_id: clinicaAtual.clinica_id });
    const repMap = new Map<string, { tipo_repasse: string; percentual_repasse_padrao: number | null; valor_repasse_padrao: number | null }>();
    for (const r of (rep as any[] | null) ?? []) repMap.set(r.id, r);
    const merged: Medico[] = ((m.data ?? []) as { id: string; nome: string }[]).map((x) => {
      const r = repMap.get(x.id);
      return { id: x.id, nome: x.nome, tipo_repasse: r?.tipo_repasse ?? "percentual", percentual_repasse_padrao: Number(r?.percentual_repasse_padrao ?? 0), valor_repasse_padrao: r?.valor_repasse_padrao ?? null };
    });
    setMedicos(merged); setPacientes((p.data ?? []) as Pac[]);
    setContas((c.data ?? []) as Conta[]);
    const ids = ((m.data ?? []) as Medico[]).map((x) => x.id);
    if (ids.length) {
      const { data: cv } = await supabase
        .from("medico_convenios")
        .select("medico_id, nome, tipo_repasse, percentual, valor, ativo")
        .in("medico_id", ids)
        .eq("ativo", true);
      setConvenios((cv ?? []) as Convenio[]);
    }
  };
  useEffect(() => { void loadOpts(); }, [clinicaAtual?.clinica_id]);
  useEffect(() => { void load(); /* refaz ao mudar filtros ou opções de repasse */ },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clinicaAtual?.clinica_id, fMedico, fIni, fFim, fStatus, medicos.length, convenios.length]);

  const calc = useMemo(() => {
    const total = Number(form.valor_total || 0);
    const med = medicos.find((m) => m.id === form.medico_id);
    if (!med || !total) return { medico: 0, clinica: total };
    if (med.tipo_repasse === "valor" && med.valor_repasse_padrao != null) {
      const v = Number(med.valor_repasse_padrao);
      return { medico: v, clinica: Math.max(0, total - v) };
    }
    const pct = Number(med.percentual_repasse_padrao || 0);
    const medico = +(total * pct / 100).toFixed(2);
    return { medico, clinica: +(total - medico).toFixed(2) };
  }, [form.valor_total, form.medico_id, medicos]);

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (a: Atend) => { setEditing(a); setForm({
    data: a.data, medico_id: a.medico_id ?? "", paciente_id: a.paciente_id ?? "",
    procedimento: a.procedimento ?? "", valor_total: String(a.valor_total),
    forma_pagamento: a.forma_pagamento ?? "", status: a.status,
  }); setOpen(true); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    setSaving(true);
    const payload = {
      clinica_id: clinicaAtual.clinica_id, data: form.data,
      medico_id: form.medico_id || null, paciente_id: form.paciente_id || null,
      procedimento: form.procedimento || null, valor_total: Number(form.valor_total),
      valor_medico: calc.medico, valor_clinica: calc.clinica,
      forma_pagamento: form.forma_pagamento || null, status: form.status,
    };
    const { error } = editing
      ? await supabase.from("fin_atendimentos").update(payload).eq("id", editing.id)
      : await supabase.from("fin_atendimentos").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Salvo"); setOpen(false); await load();
  };

  const remove = async (a: Atend) => {
    if (!confirm("Excluir atendimento?")) return;
    const { error } = await supabase.from("fin_atendimentos").delete().eq("id", a.id);
    if (error) toast.error(error.message); else { toast.success("Removido"); await load(); }
  };

  const estornar = async (a: Atend) => {
    if (a.repasse_pago) {
      toast.error("Repasse já pago — não é possível estornar. Estorne o pagamento do repasse primeiro.");
      return;
    }
    if (a.origem !== "agenda") {
      toast.error("Apenas atendimentos vindos da agenda podem ser estornados (voltam para 'Agendado').");
      return;
    }
    if (!confirm("Estornar este atendimento? O agendamento voltará para o status 'Agendado'.")) return;
    const { data: lanc, error: eLanc } = await supabase
      .from("fin_lancamentos")
      .select("agendamento_id")
      .eq("id", a.id)
      .maybeSingle();
    if (eLanc) { toast.error(eLanc.message); return; }
    const agId = lanc?.agendamento_id;
    if (!agId) { toast.error("Agendamento de origem não encontrado."); return; }
    const { data: agAntes } = await supabase
      .from("agendamentos").select("id, status").eq("id", agId).maybeSingle();
    const { error: eUpd } = await supabase
      .from("agendamentos").update({ status: "agendado" }).eq("id", agId);
    if (eUpd) { toast.error(eUpd.message); return; }
    try {
      await logAction({
        table_name: "agendamentos",
        record_id: agId,
        action: "ESTORNO",
        clinica_id: clinicaAtual?.clinica_id,
        dados_antes: agAntes ?? { id: agId },
        dados_depois: { id: agId, status: "agendado" },
      });
    } catch { /* auditoria best-effort */ }
    toast.success("Atendimento estornado — agendamento voltou para 'Agendado'.");
    await load();
  };

  const medMap = new Map(medicos.map((m) => [m.id, m.nome]));
  const pacMap = new Map(pacientes.map((p) => [p.id, p.nome]));
  const totais = useMemo(() => items.reduce(
    (acc, a) => {
      acc.total += Number(a.valor_total) || 0;
      acc.medico += Number(a.valor_medico) || 0;
      acc.clinica += Number(a.valor_clinica) || 0;
      if (a.repasse_pago) acc.pago += Number(a.valor_medico) || 0;
      else acc.aReceber += Number(a.valor_medico) || 0;
      return acc;
    },
    { total: 0, medico: 0, clinica: 0, pago: 0, aReceber: 0 },
  ), [items]);

  const selectables = items.filter((a) => !a.repasse_pago && (a.valor_medico ?? 0) > 0);
  const allSelected = selectables.length > 0 && selectables.every((a) => sel.has(`${a.origem}:${a.id}`));
  const toggleAll = () => {
    if (allSelected) setSel(new Set());
    else setSel(new Set(selectables.map((a) => `${a.origem}:${a.id}`)));
  };
  const toggleOne = (a: Atend) => {
    const k = `${a.origem}:${a.id}`;
    const next = new Set(sel);
    if (next.has(k)) next.delete(k); else next.add(k);
    setSel(next);
  };
  const selectedItems = items.filter((a) => sel.has(`${a.origem}:${a.id}`));
  const selectedTotal = selectedItems.reduce((s, a) => s + (Number(a.valor_medico) || 0), 0);

  const openPay = () => {
    if (!selectedItems.length) { toast.info("Selecione ao menos um atendimento."); return; }
    setPayForm({ data: hoje, conta_id: contas[0]?.id ?? "", forma_pagamento: "" });
    setPayOpen(true);
  };

  const confirmarPagamento = async () => {
    if (!clinicaAtual || !selectedItems.length) return;
    setPayingNow(true);
    try {
      // Agrupa por médico para gerar um lançamento de despesa por médico
      const byMed = new Map<string, Atend[]>();
      for (const a of selectedItems) {
        const k = a.medico_id ?? "sem";
        if (!byMed.has(k)) byMed.set(k, []);
        byMed.get(k)!.push(a);
      }
      for (const [medId, list] of byMed) {
        const total = list.reduce((s, x) => s + (Number(x.valor_medico) || 0), 0);
        if (total <= 0) continue;
        const medNome = medId !== "sem" ? medMap.get(medId) ?? "" : "—";
        const { data: lanc, error: eLanc } = await supabase.from("fin_lancamentos").insert({
          clinica_id: clinicaAtual.clinica_id,
          tipo: "despesa",
          descricao: `Repasse médico — ${medNome} (${list.length} atend.)`,
          valor: total,
          data: payForm.data,
          data_vencimento: payForm.data,
          status: "confirmado",
          medico_id: medId !== "sem" ? medId : null,
          conta_id: payForm.conta_id || null,
          forma_pagamento: payForm.forma_pagamento || null,
        }).select("id").single();
        if (eLanc) throw eLanc;
        const lancId = lanc?.id ?? null;
        const upd = {
          repasse_pago: true,
          repasse_pago_em: payForm.data,
          repasse_forma_pagamento: payForm.forma_pagamento || null,
          repasse_conta_id: payForm.conta_id || null,
          repasse_lancamento_id: lancId,
        };
        const manualIds = list.filter((x) => x.origem === "manual").map((x) => x.id);
        const agendaIds = list.filter((x) => x.origem === "agenda").map((x) => x.id);
        if (manualIds.length) {
          const { error } = await supabase.from("fin_atendimentos").update(upd).in("id", manualIds);
          if (error) throw error;
        }
        if (agendaIds.length) {
          const { error } = await supabase.from("fin_lancamentos").update(upd).in("id", agendaIds);
          if (error) throw error;
        }
      }
      toast.success("Repasses pagos com sucesso");
      setPayOpen(false);
      await load();
    } catch (e) {
      const err = e as { message?: string };
      toast.error(err.message ?? "Falha ao registrar pagamento");
    } finally {
      setPayingNow(false);
    }
  };

  return (
    <div className="space-y-3">
      {podeEstornar && solicitacoes.length > 0 && (
        <Card className="border-rose-300 bg-rose-50/60">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <BellRing className="h-4 w-4 text-rose-700" />
              <strong className="text-sm text-rose-900">
                {solicitacoes.length} solicitação(ões) de estorno pendente(s)
              </strong>
              <span className="text-xs text-rose-700/80">enviadas pelo caixa/recepção</span>
            </div>
            <ul className="divide-y divide-rose-200/60">
              {solicitacoes.map((s) => (
                <li key={s.id} className="py-2 flex flex-wrap items-start gap-2 text-sm">
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-medium flex flex-wrap items-center gap-1.5">
                      <span>{s.paciente_nome ?? "—"}</span>
                      {s.valor != null && <span className="text-muted-foreground font-normal">• {fmt(Number(s.valor))}</span>}
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] h-4 px-1.5",
                          s.tipo === "devolucao"
                            ? "border-amber-400 text-amber-900 bg-amber-100"
                            : "border-rose-400 text-rose-900 bg-rose-100",
                        )}
                      >
                        {s.tipo === "devolucao" ? "Devolução" : "Erro de caixa"}
                      </Badge>
                    </div>
                    {s.descricao && <div className="text-xs text-muted-foreground">{s.descricao}</div>}
                    <div className="text-xs italic text-rose-800/80 mt-0.5">"{s.motivo}"</div>
                    {s.tipo === "devolucao" && (s.data_pagamento_original || s.data_estorno) && (
                      <div className="text-[10px] text-muted-foreground">
                        {s.data_pagamento_original && <>Pago em {new Date(s.data_pagamento_original).toLocaleDateString("pt-BR")} • </>}
                        {s.data_estorno && <>Devolver em {new Date(s.data_estorno).toLocaleDateString("pt-BR")}</>}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground">{new Date(s.solicitado_em).toLocaleString("pt-BR")}</div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" className="h-7 text-xs" onClick={() => aprovarSolicitacao(s)}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Aprovar e estornar
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => rejeitarSolicitacao(s)}>
                      Recusar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-semibold leading-tight">Atendimentos</h1>
          <p className="text-xs text-muted-foreground">{isMedicoOnly ? "Seus atendimentos e o repasse devido por serviço" : "Serviços realizados com repasse automático (inclui pagamentos da agenda)"}</p></div>
        <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => {
            if (!items.length) { toast.info("Sem dados para exportar."); return; }
            exportToExcel(
              items.map((a) => ({
                data: new Date(a.data).toLocaleDateString("pt-BR"),
                medico: a.medico_id ? medMap.get(a.medico_id) ?? "" : "",
                paciente: a.paciente_id ? pacMap.get(a.paciente_id) ?? "" : "",
                procedimento: a.procedimento ?? "",
                valor_total: Number(a.valor_total).toFixed(2),
                valor_medico: Number(a.valor_medico).toFixed(2),
                valor_clinica: Number(a.valor_clinica).toFixed(2),
                forma_pagamento: a.forma_pagamento ?? "",
                status: a.status,
              })),
              `atendimentos-${new Date().toISOString().slice(0, 10)}`,
              isMedicoOnly ? [
                { key: "data", label: "Data" },
                { key: "paciente", label: "Paciente" },
                { key: "procedimento", label: "Serviço" },
                { key: "valor_medico", label: "Repasse (R$)" },
                { key: "status", label: "Status" },
              ] : [
                { key: "data", label: "Data" },
                { key: "medico", label: "Médico" },
                { key: "paciente", label: "Paciente" },
                { key: "procedimento", label: "Serviço" },
                { key: "valor_total", label: "Valor total (R$)" },
                { key: "valor_medico", label: "Repasse médico (R$)" },
                { key: "valor_clinica", label: "Clínica (R$)" },
                { key: "forma_pagamento", label: "Forma pagamento" },
                { key: "status", label: "Status" },
              ],
            );
          }}
        >
          <Download className="h-4 w-4 mr-2" />Exportar Excel
        </Button>
        {!isMedicoOnly && (
          <Button onClick={openPay} disabled={!selectedItems.length}>
            <Wallet className="h-4 w-4 mr-2" />Pagar repasse{selectedItems.length ? ` (${selectedItems.length} • ${fmt(selectedTotal)})` : ""}
          </Button>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          {!isMedicoOnly && (
            <DialogTrigger asChild><Button onClick={openNew} disabled={!clinicaAtual}><Plus className="h-4 w-4 mr-2" />Novo atendimento</Button></DialogTrigger>
          )}
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"} atendimento</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Data</Label>
                  <Input type="date" required value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></div>
                <div className="space-y-2"><Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="realizado">Realizado</SelectItem>
                      <SelectItem value="agendado">Agendado</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select></div>
              </div>
              <div className="space-y-2"><Label>Médico</Label>
                <Select value={form.medico_id || "none"} onValueChange={(v) => setForm({ ...form, medico_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {medicos.map((m) => <SelectItem key={m.id} value={m.id} className="uppercase">{m.nome}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div className="space-y-2"><Label>Paciente</Label>
                <Select value={form.paciente_id || "none"} onValueChange={(v) => setForm({ ...form, paciente_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {pacientes.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div className="space-y-2"><Label>Serviço</Label>
                <Input value={form.procedimento} onChange={(e) => setForm({ ...form, procedimento: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Valor total *</Label>
                  <CurrencyInput value={form.valor_total} onChange={(v) => setForm({ ...form, valor_total: v })} /></div>
                <div className="space-y-2"><Label>Forma de pagamento</Label>
                  <Input value={form.forma_pagamento} onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })} /></div>
              </div>
              <div className="bg-muted rounded-md p-3 text-sm flex justify-between">
                <span>Repasse médico: <strong>{fmt(calc.medico)}</strong></span>
                <span>Clínica: <strong>{fmt(calc.clinica)}</strong></span>
              </div>
              <DialogFooter><Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-2">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-[10px] flex items-center gap-1"><Filter className="h-3 w-3" />Médico</Label>
              <MedicoCombobox
                value={fMedico}
                onChange={(v) => { if (!isMedicoOnly) setFMedico(v); }}
                medicos={isMedicoOnly ? medicos.filter((m) => m.id === medicoLogadoId) : medicos}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">De</Label>
              <Input type="date" className="h-8" value={fIni} onChange={(e) => setFIni(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Até</Label>
              <Input type="date" className="h-8" value={fFim} onChange={(e) => setFFim(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Status repasse</Label>
              <Select value={fStatus} onValueChange={(v) => setFStatus(v as "todos" | "aberto" | "pago")}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberto">A receber</SelectItem>
                  <SelectItem value="pago">Pagos</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isMedicoOnly ? (
              <div className="grid grid-cols-2 gap-1">
                <div className="rounded-md border px-2 py-1 bg-primary/5 text-center">
                  <div className="text-[9px] text-muted-foreground uppercase leading-tight">A receber</div>
                  <div className="text-sm font-semibold text-primary leading-tight">{fmt(totais.aReceber)}</div>
                </div>
                <div className="rounded-md border px-2 py-1 text-center">
                  <div className="text-[9px] text-muted-foreground uppercase leading-tight">Recebido</div>
                  <div className="text-sm font-semibold leading-tight">{fmt(totais.pago)}</div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-md border p-2 bg-amber-500/5">
                  <div className="text-[10px] text-muted-foreground uppercase">A pagar</div>
                  <div className="text-sm font-semibold text-amber-600">{fmt(totais.aReceber)}</div>
                </div>
                <div className="rounded-md border p-2 bg-emerald-500/5">
                  <div className="text-[10px] text-muted-foreground uppercase">Pago</div>
                  <div className="text-sm font-semibold text-emerald-600">{fmt(totais.pago)}</div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card><CardContent className="p-0">
        {loading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div>
          : items.length === 0 ? <div className="py-12 text-center text-muted-foreground"><Stethoscope className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />Nenhum atendimento no período/filtro selecionado.</div>
          : <Table>
            <TableHeader><TableRow>
              {!isMedicoOnly && (
                <TableHead className="w-8">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                </TableHead>
              )}
              <TableHead>Data</TableHead><TableHead>Médico</TableHead><TableHead>Paciente</TableHead>
              <TableHead>Serviço</TableHead>
              {!isMedicoOnly && <TableHead className="text-right">Total</TableHead>}
              <TableHead className="text-right">{isMedicoOnly ? "Repasse" : "Médico"}</TableHead>
              {!isMedicoOnly && <TableHead className="text-right">Clínica</TableHead>}
              <TableHead className="text-center">Status</TableHead>
              {!isMedicoOnly && <TableHead className="w-24"></TableHead>}
            </TableRow></TableHeader>
            <TableBody>{items.map((a) => (
              <TableRow key={`${a.origem}:${a.id}`}>
                {!isMedicoOnly && (
                  <TableCell>
                    {!a.repasse_pago && (a.valor_medico ?? 0) > 0 ? (
                      <Checkbox checked={sel.has(`${a.origem}:${a.id}`)} onCheckedChange={() => toggleOne(a)} aria-label="Selecionar" />
                    ) : null}
                  </TableCell>
                )}
                <TableCell className="text-sm">{new Date(a.data).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell className="text-sm">{a.medico_id ? medMap.get(a.medico_id) ?? "—" : "—"}</TableCell>
                <TableCell className="text-sm">{a.paciente_id ? pacMap.get(a.paciente_id) ?? "—" : "—"}</TableCell>
                <TableCell className="text-sm">{a.procedimento ?? "—"}</TableCell>
                {!isMedicoOnly && <TableCell className="text-right font-medium">{fmt(Number(a.valor_total))}</TableCell>}
                <TableCell className="text-right font-semibold text-primary">{fmt(Number(a.valor_medico))}</TableCell>
                {!isMedicoOnly && <TableCell className="text-right text-muted-foreground">{fmt(Number(a.valor_clinica))}</TableCell>}
                <TableCell className="text-center">
                  {a.repasse_pago ? (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Pago{a.repasse_pago_em ? ` ${new Date(a.repasse_pago_em).toLocaleDateString("pt-BR")}` : ""}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
                      <Clock className="h-3 w-3 mr-1" />A receber
                    </Badge>
                  )}
                </TableCell>
                {!isMedicoOnly && (
                  <TableCell className="text-right">
                    {a.origem === "agenda" ? (
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase">Agenda</span>
                        {podeEstornar && !a.repasse_pago && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Estornar atendimento (volta para Agendado)"
                            onClick={() => estornar(a)}
                          >
                            <Undo2 className="h-3.5 w-3.5 text-amber-600" />
                          </Button>
                        )}
                      </div>
                    ) : (<>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(a)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </>)}
                  </TableCell>
                )}
              </TableRow>))}
            </TableBody>
          </Table>}
      </CardContent></Card>

      {/* Diálogo pagar repasse */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Pagar repasse médico</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 p-3 text-sm flex justify-between">
              <span>{selectedItems.length} atendimento(s)</span>
              <span className="font-semibold text-primary">{fmt(selectedTotal)}</span>
            </div>
            <div className="space-y-2">
              <Label>Data do pagamento</Label>
              <Input type="date" value={payForm.data} onChange={(e) => setPayForm({ ...payForm, data: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Conta</Label>
              <Select value={payForm.conta_id || "none"} onValueChange={(v) => setPayForm({ ...payForm, conta_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select value={payForm.forma_pagamento || undefined} onValueChange={(v) => setPayForm({ ...payForm, forma_pagamento: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pix">Pix</SelectItem>
                  <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="Transferência">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancelar</Button>
            <Button onClick={confirmarPagamento} disabled={payingNow}>
              {payingNow ? "Registrando..." : "Confirmar pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MedicoCombobox({ value, onChange, medicos }: { value: string; onChange: (v: string) => void; medicos: Array<{ id: string; nome: string }> }) {
  const [open, setOpen] = useState(false);
  const selected = medicos.find((m) => m.id === value);
  const label = value === "todos" || !selected ? "Todos os médicos" : selected.nome;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm",
          "uppercase text-left"
        )}>
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command>
          <CommandInput placeholder="Buscar médico..." />
          <CommandList>
            <CommandEmpty>Nenhum médico encontrado.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="todos os médicos" onSelect={() => { onChange("todos"); setOpen(false); }}>
                <Check className={cn("mr-2 h-4 w-4", value === "todos" ? "opacity-100" : "opacity-0")} />
                Todos os médicos
              </CommandItem>
              {medicos.map((m) => (
                <CommandItem key={m.id} value={m.nome} onSelect={() => { onChange(m.id); setOpen(false); }} className="uppercase">
                  <Check className={cn("mr-2 h-4 w-4", value === m.id ? "opacity-100" : "opacity-0")} />
                  {m.nome}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
