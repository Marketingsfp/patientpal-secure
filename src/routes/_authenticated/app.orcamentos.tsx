import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileText, Plus, Printer, Trash2, Search, AlertTriangle, Calendar, Columns2, CheckCircle2, CircleDashed, Download, History, Workflow } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";
import { printOrcamento } from "@/lib/print-orcamento";
import { ConversaoOrcamentoDialog } from "@/components/orcamentos/conversao-orcamento-dialog";
import { useOrcamentosV2Flag } from "@/hooks/use-orcamentos-v2-flag";
import { OrcamentosV2Mount } from "@/components/orcamentos-v2/orcamentos-v2-mount";

import { DateInputBR } from "@/components/ui/date-input-br";
type AuditRow = {
  id: string;
  user_email: string | null;
  table_name: string;
  record_id: string | null;
  action: string;
  dados_antes: Record<string, unknown> | null;
  dados_depois: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

function HistoricoOrcamentoDialog({
  open, onClose, orcamentoId, clinicaId,
}: { open: boolean; onClose: () => void; orcamentoId: string; clinicaId: string }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setLoading(true);
    void (async () => {
      // orçamento (record_id = id do orçamento) + itens (record_id do item cujo orcamento_id = id)
      const { data: itens } = await supabase
        .from("orcamento_itens")
        .select("id")
        .eq("orcamento_id", orcamentoId);
      const itemIds = (itens ?? []).map((i) => i.id);
      const ids = [orcamentoId, ...itemIds];
      const { data, error } = await supabase
        .from("audit_log" as never)
        .select("*")
        .eq("clinica_id", clinicaId)
        .in("record_id", ids)
        .order("created_at", { ascending: false })
        .limit(500);
      if (cancel) return;
      setLoading(false);
      if (error) { mostrarErro(error); return; }
      setRows((data as unknown as AuditRow[]) ?? []);
    })();
    return () => { cancel = true; };
  }, [open, orcamentoId, clinicaId]);

  const label = (a: string) => a === "INSERT" ? "Criou" : a === "UPDATE" ? "Alterou" : a === "DELETE" ? "Excluiu"
    : a === "blocked_UPDATE" ? "Tentou alterar (bloqueado)" : a === "blocked_DELETE" ? "Tentou excluir (bloqueado)" : a;

  const diff = (r: AuditRow): string[] => {
    if (!r.dados_antes || !r.dados_depois) return [];
    const before = r.dados_antes as Record<string, unknown>;
    const after = r.dados_depois as Record<string, unknown>;
    const out: string[] = [];
    for (const k of Object.keys(after)) {
      if (k === "updated_at" || k === "atualizado_por") continue;
      const a = JSON.stringify(before[k] ?? null);
      const b = JSON.stringify(after[k] ?? null);
      if (a !== b) out.push(`${k}: ${a} → ${b}`);
    }
    return out;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Histórico do orçamento</DialogTitle></DialogHeader>
        {loading ? (
          <p className="py-8 text-center text-muted-foreground">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">Nenhum registro de alteração.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const isBlocked = r.action.startsWith("blocked_");
              const isItem = r.table_name === "orcamento_itens";
              const changes = diff(r);
              return (
                <div key={r.id} className={`border rounded p-3 text-sm ${isBlocked ? "border-rose-300 bg-rose-50" : ""}`}>
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="font-medium">
                        {label(r.action)} {isItem ? "item" : "orçamento"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.user_email ?? "—"} · {new Date(r.created_at).toLocaleString("pt-BR")}
                        {r.ip_address ? ` · IP ${r.ip_address}` : ""}
                      </div>
                    </div>
                  </div>
                  {changes.length > 0 && (
                    <ul className="mt-2 text-xs font-mono text-muted-foreground space-y-0.5">
                      {changes.map((c, i) => <li key={i}>• {c}</li>)}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export const Route = createFileRoute("/_authenticated/app/orcamentos")({
  component: OrcamentosRouteDispatcher,
  head: () => ({ meta: [{ title: "Orçamentos — ClinicaOS" }] }),
});

/**
 * Promoção controlada do OrcamentosShellV2 para `/app/orcamentos`, atrás da
 * flag `orcamentos_v2` E limitado a admin/gestor. Recepção, médico, caixa,
 * financeiro e demais perfis continuam vendo o `<OrcamentosPage />` clássico
 * intocado — mesmo com a flag ligada. Kill-switch imediato: desligar a flag
 * volta ao clássico sem reload (o hook escuta `orcamentos:flag-changed`).
 *
 * Este dispatcher é o ÚNICO ponto novo; nenhuma linha do fluxo clássico
 * (criação, edição, conversão, impressão, histórico, cobrança, splits ou
 * permissões) muda.
 */
function OrcamentosRouteDispatcher() {
  const { clinicaAtual } = useClinica();
  const { enabled, loading } = useOrcamentosV2Flag();
  const role = clinicaAtual?.role ?? null;
  const v2Allowed = role === "admin" || role === "gestor";
  if (!loading && enabled && v2Allowed) return <OrcamentosV2Mount />;
  return <OrcamentosPage />;
}

type Orc = {
  id: string;
  numero: number;
  paciente_nome: string;
  paciente_telefone: string | null;
  medico_nome: string | null;
  forma_pagamento: string | null;
  valor_total: number;
  valores_pagamento: Record<string, number> | null;
  status: string;
  created_at: string;
  categoria: "laboratorio" | "demais" | null;
  agendamentos_total?: number;
  agendamentos_realizados?: number;
  itens_total?: number;
  itens_consumidos?: number;
};

type Procedimento = {
  id: string;
  nome: string;
  valor_dinheiro_pix: number | null;
  valor_cartao: number | null;
  valor_dinheiro: number | null;
  valor_pix: number | null;
  valor_cartao_credito: number | null;
  valor_cartao_debito: number | null;
  valor_padrao: number | null;
  preparo: string | null;
  valor_variavel?: boolean | null;
};

type Item = {
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  procedimento_id: string | null;
  preparo: string | null;
  valores_formas?: Record<string, number> | null;
};

type MedicoOpt = {
  id: string;
  nome: string;
  crm: string | null;
  crm_uf: string | null;
};

const FORMAS = ["Dinheiro", "PIX", "Cartão de Crédito", "Cartão de Débito", "Boleto", "Outro"];
const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function OrcamentosPage() {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const podeEscrever = usePodeEscrever("orcamentos");
  const navigate = useNavigate();
  const [list, setList] = useState<Orc[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [historicoId, setHistoricoId] = useState<string | null>(null);
  const [conversaoId, setConversaoId] = useState<string | null>(null);
  const podeVerHistorico = clinicaAtual?.role === "admin" || clinicaAtual?.role === "gestor";
  const [filtroRealizacao, setFiltroRealizacao] = useState<"todos" | "realizados" | "nao_realizados">("todos");
  const [periodo, setPeriodo] = useState<"hoje" | "semana" | "quinzena" | "mes" | "personalizado" | "todos">("todos");
  const hojeIso = new Date().toISOString().slice(0, 10);
  const [dataIni, setDataIni] = useState<string>(hojeIso);
  const [dataFim, setDataFim] = useState<string>(hojeIso);

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("orcamentos")
      .select("id, numero, paciente_nome, paciente_telefone, medico_nome, forma_pagamento, valor_total, valores_pagamento, status, created_at, categoria")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) mostrarErro(error);
    const orcs = (data ?? []) as Orc[];
    const ids = orcs.map((o) => o.id);
    if (ids.length > 0) {
      const { data: ags } = await supabase
        .from("agendamentos")
        .select("orcamento_id, status")
        .in("orcamento_id", ids)
        .neq("status", "cancelado");
      const tot = new Map<string, number>();
      const real = new Map<string, number>();
      for (const a of (ags ?? []) as { orcamento_id: string; status: string }[]) {
        tot.set(a.orcamento_id, (tot.get(a.orcamento_id) ?? 0) + 1);
        if (a.status === "realizado") real.set(a.orcamento_id, (real.get(a.orcamento_id) ?? 0) + 1);
      }
      for (const o of orcs) {
        o.agendamentos_total = tot.get(o.id) ?? 0;
        o.agendamentos_realizados = real.get(o.id) ?? 0;
      }
      // Itens totais e consumidos (uso parcial vs total)
      const [{ data: itens }, { data: links }] = await Promise.all([
        supabase.from("orcamento_itens").select("orcamento_id, quantidade").in("orcamento_id", ids),
        supabase.from("agendamento_orcamento_itens").select("orcamento_id, orcamento_item_id").in("orcamento_id", ids),
      ]);
      const totItens = new Map<string, number>();
      for (const it of (itens ?? []) as { orcamento_id: string; quantidade: number }[]) {
        totItens.set(it.orcamento_id, (totItens.get(it.orcamento_id) ?? 0) + Number(it.quantidade || 1));
      }
      const consumidos = new Map<string, Set<string>>();
      for (const l of (links ?? []) as { orcamento_id: string; orcamento_item_id: string }[]) {
        if (!consumidos.has(l.orcamento_id)) consumidos.set(l.orcamento_id, new Set());
        consumidos.get(l.orcamento_id)!.add(l.orcamento_item_id);
      }
      for (const o of orcs) {
        o.itens_total = totItens.get(o.id) ?? 0;
        o.itens_consumidos = consumidos.get(o.id)?.size ?? 0;
      }
    }
    setList(orcs);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clinicaAtual?.clinica_id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // calcula intervalo do período
    let ini: Date | null = null;
    let fim: Date | null = null;
    if (periodo !== "todos") {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      if (periodo === "hoje") { ini = start; fim = end; }
      else if (periodo === "semana") { ini = new Date(start); ini.setDate(ini.getDate() - 6); fim = end; }
      else if (periodo === "quinzena") { ini = new Date(start); ini.setDate(ini.getDate() - 14); fim = end; }
      else if (periodo === "mes") { ini = new Date(start); ini.setDate(ini.getDate() - 29); fim = end; }
      else if (periodo === "personalizado") {
        ini = new Date(`${dataIni}T00:00:00`);
        fim = new Date(`${dataFim}T23:59:59.999`);
      }
    }
    return list.filter((o) => {
      if (q && !(
        o.paciente_nome.toLowerCase().includes(q) ||
        String(o.numero).includes(q) ||
        (o.medico_nome ?? "").toLowerCase().includes(q)
      )) return false;
      const realizado = (o.agendamentos_total ?? 0) > 0;
      if (filtroRealizacao === "realizados" && !realizado) return false;
      if (filtroRealizacao === "nao_realizados" && realizado) return false;
      if (ini && fim) {
        const d = new Date(o.created_at);
        if (d < ini || d > fim) return false;
      }
      return true;
    });
  }, [list, query, filtroRealizacao, periodo, dataIni, dataFim]);

  const exportarCsv = () => {
    const header = ["Numero","Data","Paciente","Telefone","Medico","Pagamento","Total","Categoria","Realizado","Agendamentos","Realizados"];
    const rows = filtered.map((o) => [
      o.numero,
      new Date(o.created_at).toLocaleDateString("pt-BR"),
      o.paciente_nome,
      o.paciente_telefone ?? "",
      o.medico_nome ?? "",
      o.forma_pagamento ?? "",
      Number(o.valor_total).toFixed(2).replace(".", ","),
      o.categoria ?? "",
      (o.agendamentos_total ?? 0) > 0 ? "Sim" : "Nao",
      o.agendamentos_total ?? 0,
      o.agendamentos_realizados ?? 0,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orcamentos-${filtroRealizacao}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const remover = async (id: string) => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!confirm("Excluir este orçamento?")) return;
    const { error } = await supabase.from("orcamentos").delete().eq("id", id);
    if (error) return mostrarErro(error);
    toast.success("Orçamento excluído");
    load();
  };

  const imprimir = async (id: string) => {
    if (!clinicaAtual) return;
    try { await printOrcamento(id, clinicaAtual.clinica_id); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-4 flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10"><FileText className="h-6 w-6 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-bold">Orçamentos</h1>
            <p className="text-sm text-muted-foreground">Orçamentos rápidos com impressão térmica 80mm</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/app/orcamentos-agenda" })}
            className="gap-2"
            title="Abrir orçamentos e agenda lado a lado"
          >
            <Columns2 className="h-4 w-4" /> Abrir c/ agenda
          </Button>
          <Button variant="outline" onClick={exportarCsv} className="gap-2" title="Exportar relatório CSV">
            <Download className="h-4 w-4" /> Exportar
          </Button>
          {podeEscrever && (
            <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Novo orçamento</Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por paciente, número ou médico…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex items-center gap-1 rounded-md border bg-card p-0.5 text-xs">
          {([
            ["hoje", "Dia"],
            ["semana", "Semana"],
            ["quinzena", "Quinzena"],
            ["mes", "Mês"],
            ["personalizado", "Período"],
            ["todos", "Todos"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setPeriodo(k)}
              className={`px-3 py-1.5 rounded ${periodo === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              title={label}
            >
              {label}
            </button>
          ))}
        </div>
        {periodo === "personalizado" && (
          <div className="flex items-center gap-1">
            <DateInputBR value={dataIni} onChange={(e) => setDataIni(e.target.value)} className="h-8 w-[150px] text-xs" />
            <span className="text-xs text-muted-foreground">até</span>
            <DateInputBR value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="h-8 w-[150px] text-xs" />
          </div>
        )}
        <div className="flex items-center gap-1 rounded-md border bg-card p-0.5 text-xs">
          {([
            ["todos", "Todos"],
            ["realizados", "Realizados"],
            ["nao_realizados", "Não realizados"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFiltroRealizacao(k)}
              className={`px-3 py-1.5 rounded ${filtroRealizacao === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {label}
              {k !== "todos" && (
                <span className="ml-1 opacity-70">
                  ({k === "realizados"
                    ? list.filter((o) => (o.agendamentos_total ?? 0) > 0).length
                    : list.filter((o) => (o.agendamentos_total ?? 0) === 0).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-sm max-lg:table max-lg:overflow-visible">
          <thead className="bg-muted sticky top-0 z-20">
            <tr className="text-left">
              <th className="px-3 py-2 w-20">Nº</th>
              <th className="px-3 py-2 w-32">Data</th>
              <th className="px-3 py-2">Paciente</th>
              <th className="px-3 py-2">Médico</th>
              <th className="px-3 py-2">Pagamento</th>
              <th className="px-3 py-2 text-right w-32">Total</th>
              <th className="px-3 py-2 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Carregando…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Nenhum orçamento</td></tr>
            ) : filtered.map((o) => (
              <tr key={o.id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2 font-mono">
                  <div className="flex items-center gap-1.5">
                    <span>#{String(o.numero).padStart(5, "0")}</span>
                     {(o.agendamentos_total ?? 0) > 0 && (() => {
                       const total = o.itens_total ?? 0;
                       const usados = o.itens_consumidos ?? 0;
                       const parcial = total > 0 && usados > 0 && usados < total;
                       const titulo = total > 0
                         ? (parcial
                             ? `Uso parcial · ${usados} de ${total} itens agendados`
                             : `Totalmente agendado · ${usados}/${total} itens`)
                         : `${o.agendamentos_total} agendamento(s)`;
                       return (
                         <span
                           title={titulo}
                           className={`inline-flex items-center gap-0.5 ${parcial ? "text-amber-600" : "text-emerald-600"}`}
                         >
                           {parcial
                             ? <CircleDashed className="h-4 w-4" />
                             : <CheckCircle2 className="h-4 w-4" />}
                           {total > 0 && (
                             <span className="text-[10px] font-semibold">{usados}/{total}</span>
                           )}
                         </span>
                       );
                     })()}
                  </div>
                </td>
                <td className="px-3 py-2">{new Date(o.created_at).toLocaleDateString("pt-BR")}</td>
                <td className="px-3 py-2 font-medium">
                  <div className="flex items-center gap-2">
                    <span>{o.paciente_nome}</span>
                    {o.categoria === "laboratorio" ? (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 uppercase">Laboratório</span>
                    ) : o.categoria === "demais" ? (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">Serviços</span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{o.medico_nome ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{o.forma_pagamento ?? "—"}</td>
                <td className="px-3 py-2 text-right font-semibold">
                  {BRL(Number(o.valor_total))}
                  {o.valores_pagamento && Object.keys(o.valores_pagamento).length > 1 && (
                    <div className="mt-1 text-[11px] font-normal text-muted-foreground space-y-0.5">
                      {Object.entries(o.valores_pagamento).map(([f, v]) => (
                        <div key={f}>
                          <span className="uppercase">{f.replace("Cartão de ", "")}:</span> {BRL(Number(v))}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const numero = o.numero;
                        const isEmbed = typeof window !== "undefined" &&
                          new URLSearchParams(window.location.search).get("embed") === "1";
                        if (isEmbed && window.parent && window.parent !== window) {
                          window.parent.postMessage({ type: "agendar-orcamento", numero }, "*");
                        } else {
                          navigate({ to: "/app/orcamentos-agenda", search: { orc: numero } as never });
                        }
                      }}
                      title="Agendar este orçamento"
                    >
                      <Calendar className="h-4 w-4 text-emerald-600" />
                    </Button>
                    {podeEscrever && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConversaoId(o.id)}
                        title="Converter itens (vender, agendar, cancelar, NFS-e)"
                      >
                        <Workflow className="h-4 w-4 text-primary" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => imprimir(o.id)} title="Imprimir"><Printer className="h-4 w-4" /></Button>
                    {podeVerHistorico && (
                      <Button size="sm" variant="ghost" onClick={() => setHistoricoId(o.id)} title="Histórico">
                        <History className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                    {podeEscrever && (
                      <Button size="sm" variant="ghost" onClick={() => remover(o.id)} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {open && clinicaAtual && (
        <NovoOrcamentoDialog
          open={open}
          onClose={() => setOpen(false)}
          clinicaId={clinicaAtual.clinica_id}
          userId={user?.id ?? null}
          onCreated={async (id) => {
            setOpen(false);
            await load();
            try { await printOrcamento(id, clinicaAtual.clinica_id); }
            catch (e) { toast.error((e as Error).message); }
          }}
        />
      )}

      {historicoId && clinicaAtual && (
        <HistoricoOrcamentoDialog
          open={!!historicoId}
          onClose={() => setHistoricoId(null)}
          orcamentoId={historicoId}
          clinicaId={clinicaAtual.clinica_id}
        />
      )}

      {conversaoId && (
        <ConversaoOrcamentoDialog
          open={!!conversaoId}
          onClose={() => setConversaoId(null)}
          orcamentoId={conversaoId}
          onChanged={() => { void load(); }}
        />
      )}
    </div>
  );
}

function NovoOrcamentoDialog({
  open, onClose, clinicaId, userId, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  clinicaId: string;
  userId: string | null;
  onCreated: (id: string) => void;
}) {
  const [pacienteNome, setPacienteNome] = useState("");
  const [pacienteTelefone, setPacienteTelefone] = useState("");
  const [medicoNome, setMedicoNome] = useState("");
  const [categoria, setCategoria] = useState<"laboratorio" | "demais" | null>(null);
  const [pacienteId, setPacienteId] = useState<string>("");
  const [pacienteSelecionado, setPacienteSelecionado] = useState<PatientOption | null>(null);
  const [medicoId, setMedicoId] = useState<string>("");
  const [medicoExterno, setMedicoExterno] = useState(false);
  const [clinicaSolicitante, setClinicaSolicitante] = useState("");
  const [medicoParticular, setMedicoParticular] = useState(false);
  const [medicos, setMedicos] = useState<MedicoOpt[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<string[]>(["Dinheiro"]);
  const [valoresPagamento, setValoresPagamento] = useState<Record<string, number>>({});
  const [desconto, setDesconto] = useState(0);
  const [validade, setValidade] = useState(30);
  const [observacoes, setObservacoes] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);

  // busca de procedimentos
  const [procQuery, setProcQuery] = useState("");
  const [procResults, setProcResults] = useState<Procedimento[]>([]);
  const [searchingProc, setSearchingProc] = useState(false);
  // Categoria Laboratório é identificada diretamente em `procedimentos`
  // (tipo_procedimento/grupo) — mesma fonte usada pelo cadastro de Serviços.
  // Nada de prefetch de IDs: a lista completa (~4.4k) estouraria a URL do
  // PostgREST no `.in("id", ids)`.

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("medicos")
        .select("id,nome,crm,crm_uf")
        .eq("clinica_id", clinicaId)
        .order("nome")
        .limit(500);
      setMedicos((data ?? []) as MedicoOpt[]);
    })();
  }, [clinicaId]);

  const medicoOptions = useMemo(
    () =>
      medicos.map((m) => ({
        value: m.id,
        label: [m.nome, m.crm ? `CRM ${m.crm}${m.crm_uf ? `/${m.crm_uf}` : ""}` : null]
          .filter(Boolean)
          .join(" · "),
      })),
    [medicos],
  );

  const selecionarMedico = (id: string) => {
    setMedicoId(id);
    const m = medicos.find((x) => x.id === id);
    if (m) setMedicoNome(m.nome ?? "");
  };

  const alternarMedicoExterno = (externo: boolean) => {
    setMedicoExterno(externo);
    setMedicoParticular(false);
    if (externo) {
      setMedicoId("");
    } else {
      setClinicaSolicitante("");
    }
  };

  const ativarParticular = () => {
    setMedicoParticular(true);
    setMedicoExterno(false);
    setMedicoId("");
    setMedicoNome("");
    setClinicaSolicitante("");
  };

  const selecionarPaciente = (p: PatientOption | null) => {
    setPacienteSelecionado(p);
    setPacienteId(p?.id ?? "");
    if (p) {
      setPacienteNome(p.nome ?? "");
      setPacienteTelefone(p.telefone ?? "");
    }
  };

  useEffect(() => {
    let cancel = false;
    if (procQuery.trim().length < 2) { setProcResults([]); return; }
    setSearchingProc(true);
    const t = setTimeout(async () => {
      const norm = procQuery.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      let q = supabase
        .from("procedimentos")
        .select("id, nome, valor_dinheiro_pix, valor_cartao, valor_dinheiro, valor_pix, valor_cartao_credito, valor_cartao_debito, valor_padrao, preparo, valor_variavel")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .or(`nome.ilike.%${procQuery}%,nome.ilike.%${norm}%`);
      if (categoria === "laboratorio") {
        q = q.or("tipo_procedimento.eq.laboratorio,grupo.ilike.%labor%");
      } else if (categoria === "demais") {
        q = q.not("tipo_procedimento", "eq", "laboratorio").not("grupo", "ilike", "%labor%");
      }
      const { data } = await q.limit(20);
      if (!cancel) { setProcResults((data ?? []) as Procedimento[]); setSearchingProc(false); }
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [procQuery, clinicaId, categoria]);

  const valorPorForma = (p: Procedimento, f: string) => {
    if (f === "Dinheiro") return Number(p.valor_dinheiro ?? p.valor_dinheiro_pix ?? p.valor_padrao ?? 0);
    if (f === "PIX") return Number(p.valor_pix ?? p.valor_dinheiro_pix ?? p.valor_padrao ?? 0);
    if (f === "Cartão de Crédito") return Number(p.valor_cartao_credito ?? p.valor_cartao ?? p.valor_padrao ?? 0);
    if (f === "Cartão de Débito") return Number(p.valor_cartao_debito ?? p.valor_cartao ?? p.valor_padrao ?? 0);
    return Number(p.valor_padrao ?? p.valor_dinheiro_pix ?? 0);
  };
  const valorDoProc = (p: Procedimento) => valorPorForma(p, formasPagamento[0] ?? "Dinheiro");
  const abreviar = (f: string) =>
    f === "Cartão de Crédito" ? "Crédito"
    : f === "Cartão de Débito" ? "Débito"
    : f;

  const toggleForma = (f: string) => {
    setFormasPagamento((cur) => {
      if (cur.includes(f)) return cur.filter((x) => x !== f);
      if (cur.length >= 2) {
        toast.info("Máximo de 2 formas de pagamento");
        return cur;
      }
      return [...cur, f];
    });
    // Não limpa `valoresPagamento`: usuário pode desmarcar/remarcar sem perder valores digitados.
  };

  // Quando o usuário troca/adiciona uma forma de pagamento DEPOIS de já ter
  // incluído procedimentos, busca os valores faltantes daquela forma para
  // cada item já adicionado — evita que o cupom mostre o valor da forma
  // antiga (ex.: Crédito repetindo o valor de Dinheiro).
  useEffect(() => {
    if (formasPagamento.length === 0 || itens.length === 0) return;
    const idsFaltando = Array.from(new Set(
      itens
        .filter((i) => i.procedimento_id && formasPagamento.some((f) => i.valores_formas?.[f] == null))
        .map((i) => i.procedimento_id as string)
    ));
    if (idsFaltando.length === 0) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("procedimentos")
        .select("id, valor_dinheiro_pix, valor_cartao, valor_dinheiro, valor_pix, valor_cartao_credito, valor_cartao_debito, valor_padrao, preparo")
        .in("id", idsFaltando);
      if (cancel || !data) return;
      const byId = new Map(data.map((p) => [p.id, p as Procedimento]));
      setItens((arr) => arr.map((it) => {
        if (!it.procedimento_id) return it;
        const p = byId.get(it.procedimento_id);
        if (!p) return it;
        const next = { ...(it.valores_formas ?? {}) };
        for (const f of formasPagamento) {
          if (next[f] == null) next[f] = valorPorForma(p, f);
        }
        return { ...it, valores_formas: next };
      }));
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formasPagamento.join("|"), itens.length]);

  const adicionarProc = (p: Procedimento) => {
    if (itens.some((it) => it.procedimento_id === p.id)) {
      toast.warning(`${p.nome} já foi adicionado ao orçamento`);
      setProcQuery("");
      setProcResults([]);
      return;
    }
    const formas = formasPagamento.length ? formasPagamento : ["Dinheiro"];
    const valores: Record<string, number> = {};
    for (const f of formas) valores[f] = valorPorForma(p, f);
    setItens((arr) => [...arr, {
      descricao: p.nome,
      quantidade: 1,
      valor_unitario: valorDoProc(p),
      procedimento_id: p.id,
      preparo: p.preparo ?? null,
      valores_formas: valores,
    }]);
    if (p.preparo && p.preparo.trim()) {
      toast.warning(`⚠ ${p.nome} exige preparo`, { description: p.preparo, duration: 6000 });
    }
    if (p.valor_variavel) {
      toast.info(`${p.nome} tem valor variável — informe o valor cobrado.`, { duration: 6000 });
    }
    setProcQuery("");
    setProcResults([]);
  };

  const adicionarManual = () => {
    setItens((arr) => [...arr, { descricao: "", quantidade: 1, valor_unitario: 0, procedimento_id: null, preparo: null }]);
  };

  const subtotal = itens.reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.valor_unitario || 0), 0);
  const total = Math.max(0, subtotal - Number(desconto || 0));

  // Total por forma de pagamento: cada forma é uma alternativa de pagamento integral.
  // Ex.: "Se pagar tudo em Dinheiro = R$ X; se pagar tudo no Cartão = R$ Y".
  const totaisPorForma = (() => {
    const out: Record<string, number> = {};
    const desc = Number(desconto) || 0;
    for (const f of formasPagamento) {
      const sub = itens.reduce((s, i) => {
        const v = Number(i.valores_formas?.[f] ?? i.valor_unitario ?? 0);
        return s + Number(i.quantidade || 0) * v;
      }, 0);
      out[f] = Math.max(0, Math.round((sub - desc) * 100) / 100);
    }
    return out;
  })();

  const salvar = async () => {
    if (!categoria) return toast.error("Selecione o tipo do orçamento");
    if (!pacienteNome.trim()) return toast.error("Informe o nome do paciente");
    if (/[<>]/.test(pacienteNome) || /[<>]/.test(pacienteTelefone)) {
      return toast.error("Nome e telefone não podem conter os caracteres < ou >");
    }
    if (itens.length === 0) return toast.error("Adicione ao menos um serviço");
    if (formasPagamento.length === 0) return toast.error("Selecione ao menos uma forma de pagamento");
    for (let i = 0; i < itens.length; i++) {
      const it = itens[i];
      if (!it.descricao || !it.descricao.trim()) {
        return toast.error(`Item ${i + 1}: informe a descrição do serviço`);
      }
      const qtd = Number(it.quantidade);
      if (!Number.isFinite(qtd) || qtd < 1 || qtd > 999) {
        return toast.error(`Item ${i + 1} (${it.descricao}): quantidade deve estar entre 1 e 999`);
      }
      const vu = Number(it.valor_unitario);
      if (!Number.isFinite(vu) || vu <= 0) {
        return toast.error(`Item ${i + 1} (${it.descricao}): valor unitário deve ser maior que zero`);
      }
    }
    if (Number(desconto) < 0) return toast.error("Desconto não pode ser negativo");
    if (Number(desconto) > subtotal) return toast.error("Desconto não pode ser maior que o subtotal");
    if (!Number.isFinite(Number(validade)) || Number(validade) < 1) {
      return toast.error("Validade deve ser de pelo menos 1 dia");
    }
    if ((observacoes ?? "").length > 1000) {
      return toast.error("Observações não podem exceder 1000 caracteres");
    }
    const valoresPag: Record<string, number> | null =
      formasPagamento.length > 1 ? { ...totaisPorForma } : null;
    setSaving(true);

    const { data: orc, error } = await supabase
      .from("orcamentos")
      .insert({
        clinica_id: clinicaId,
        numero: 0,
        categoria,
        paciente_nome: pacienteNome.trim(),
        paciente_telefone: pacienteTelefone.trim() || null,
        medico_nome: medicoParticular ? "Particular" : (medicoNome.trim() || null),
        medico_externo: medicoParticular ? false : medicoExterno,
        clinica_solicitante: medicoParticular
          ? "Particular (sem solicitante)"
          : medicoExterno
            ? (clinicaSolicitante.trim() || null)
            : null,
        forma_pagamento: formasPagamento.join(" + "),
        valores_pagamento: valoresPag,
        validade_dias: validade,
        desconto: Number(desconto) || 0,
        valor_total: total,
        observacoes: observacoes.trim() || null,
        criado_por: userId,
      })
      .select("id")
      .single();

    if (error || !orc) { setSaving(false); return mostrarErro(error); }

    const itensPayload = itens.map((i, idx) => ({
      orcamento_id: orc.id,
      procedimento_id: i.procedimento_id,
      descricao: i.descricao,
      quantidade: Number(i.quantidade) || 1,
      valor_unitario: Number(i.valor_unitario) || 0,
      valor_total: (Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0),
      ordem: idx,
      valores_formas: i.valores_formas ?? null,
    }));
    const { error: e2 } = await supabase.from("orcamento_itens").insert(itensPayload);
    setSaving(false);
    if (e2) return mostrarErro(e2);
    toast.success("Orçamento criado");
    onCreated(orc.id);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Novo orçamento
            {categoria && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                · {categoria === "laboratorio" ? "Laboratório" : "Demais Serviços"}
                <button
                  type="button"
                  onClick={() => setCategoria(null)}
                  className="ml-2 text-primary hover:underline"
                >alterar</button>
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {!categoria ? (
          <div className="py-8 space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              Qual o tipo deste orçamento? Isso facilita o vínculo com a agenda.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setCategoria("laboratorio")}
                className="rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 p-6 text-left transition"
              >
                <div className="text-lg font-semibold">🧪 Laboratório</div>
                <p className="text-sm text-muted-foreground mt-1">
                  Exames de laboratório (1 ficha única na agenda, mesmo com vários exames).
                </p>
              </button>
              <button
                type="button"
                onClick={() => setCategoria("demais")}
                className="rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 p-6 text-left transition"
              >
                <div className="text-lg font-semibold">🩺 Demais Serviços</div>
                <p className="text-sm text-muted-foreground mt-1">
                  Consultas, procedimentos, exames de imagem e demais serviços.
                </p>
              </button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
            </DialogFooter>
          </div>
        ) : (
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Buscar paciente cadastrado</Label>
            <PatientSearchInput
              value={pacienteSelecionado}
              onSelect={selecionarPaciente}
              placeholder="Buscar por nome, CPF ou prontuário..."
            />
            <p className="text-xs text-muted-foreground">Ou preencha manualmente abaixo para paciente novo.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Paciente *</Label><Input maxLength={120} value={pacienteNome} onChange={(e) => setPacienteNome(e.target.value.replace(/[<>]/g, ""))} /></div>
            <div className="space-y-1"><Label>Telefone</Label><Input maxLength={20} value={pacienteTelefone} onChange={(e) => setPacienteTelefone(e.target.value.replace(/[<>]/g, ""))} /></div>
            <div className="space-y-1 md:col-span-2">
              <Label>Médico solicitante</Label>
               <div className="flex flex-wrap gap-1 rounded-md border p-1 w-fit">
                <button
                  type="button"
                  onClick={() => alternarMedicoExterno(false)}
                  className={`px-3 py-1 text-sm rounded ${!medicoExterno && !medicoParticular ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  Da nossa clínica
                </button>
                <button
                  type="button"
                  onClick={() => alternarMedicoExterno(true)}
                  className={`px-3 py-1 text-sm rounded ${medicoExterno && !medicoParticular ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  De outro local
                </button>
                <button
                  type="button"
                  onClick={ativarParticular}
                  className={`px-3 py-1 text-sm rounded ${medicoParticular ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  Particular
                </button>
              </div>
              {medicoParticular ? (
                <p className="text-xs text-muted-foreground">
                  Paciente sem médico solicitante — atendimento particular por procura direta.
                </p>
              ) : !medicoExterno ? (
                <SearchableSelect
                  options={medicoOptions}
                  value={medicoId}
                  onChange={selecionarMedico}
                  placeholder="Selecione o médico..."
                  searchPlaceholder="Buscar por nome ou CRM..."
                  emptyText="Nenhum médico cadastrado."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Nome do médico</Label>
                    <Input value={medicoNome} onChange={(e) => setMedicoNome(e.target.value)} placeholder="Dr(a). ..." />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Clínica solicitante *</Label>
                    <Input value={clinicaSolicitante} onChange={(e) => setClinicaSolicitante(e.target.value)} placeholder="Nome da clínica/local de origem" />
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Formas de pagamento <span className="text-xs text-muted-foreground font-normal">(selecione até 2)</span></Label>
              <div className="flex flex-wrap gap-2 rounded-md border p-2">
                {FORMAS.map((f) => {
                  const checked = formasPagamento.includes(f);
                  const disabled = !checked && formasPagamento.length >= 2;
                  return (
                    <label key={f}
                      className={`flex items-center gap-2 px-2 py-1 rounded-md text-sm border ${
                        checked
                          ? "bg-primary/10 border-primary/40 cursor-pointer"
                          : disabled
                            ? "border-border opacity-40 cursor-not-allowed"
                            : "border-border hover:bg-muted/40 cursor-pointer"
                      }`}
                      title={disabled ? "Máximo de 2 formas de pagamento" : undefined}
                    >
                      <Checkbox checked={checked} disabled={disabled} onCheckedChange={() => !disabled && toggleForma(f)} />
                      {f}
                    </label>
                  );
                })}
              </div>
              {formasPagamento.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  Cada serviço mostra o valor por forma; o total por forma é calculado automaticamente.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Validade (dias)</Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={validade}
                onChange={(e) => {
                  const n = Math.floor(Number(e.target.value));
                  setValidade(Number.isFinite(n) && n >= 1 ? n : 1);
                }}
              />
            </div>
          </div>

          <div className="space-y-2 border-t pt-3">
            <Label>Adicionar serviço</Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar serviço da tabela…" value={procQuery} onChange={(e) => setProcQuery(e.target.value)} />
              {procResults.length > 0 && (
                <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-popover border rounded-md shadow-lg max-h-64 overflow-y-auto">
                  {procResults.map((p) => (
                    <button key={p.id} type="button" onClick={() => adicionarProc(p)}
                      className="w-full text-left px-3 py-2 hover:bg-muted flex justify-between items-center gap-2 border-b last:border-0">
                      <span className="text-sm flex items-center gap-2">
                        {p.nome}
                        {p.preparo && p.preparo.trim() && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="h-3 w-3" /> PREPARO
                          </span>
                        )}
                      </span>
                      <span className="text-sm font-semibold whitespace-nowrap flex gap-2">
                        {(formasPagamento.length ? formasPagamento : ["Dinheiro"]).map((f, i) => (
                          <span key={f} className={i === 0 ? "text-primary" : "text-muted-foreground"}>
                            <span className="text-[10px] uppercase mr-1">{abreviar(f)}</span>
                            {BRL(valorPorForma(p, f))}
                          </span>
                        ))}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {searchingProc && <div className="text-xs text-muted-foreground mt-1">Buscando…</div>}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={adicionarManual} className="gap-1"><Plus className="h-3 w-3" /> Serviço manual</Button>
          </div>

          {itens.length > 0 && (
            <div className="border rounded-md overflow-hidden">
              {itens.some((i) => i.preparo && i.preparo.trim()) && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900 px-3 py-2 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4" /> Atenção: este orçamento contém exame(s) com preparo
                  </div>
                  <ul className="text-xs text-amber-900 dark:text-amber-100 space-y-0.5 pl-6 list-disc">
                    {itens.filter((i) => i.preparo && i.preparo.trim()).map((i, idx) => (
                      <li key={idx}><b>{i.descricao}:</b> {i.preparo}</li>
                    ))}
                  </ul>
                </div>
              )}
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-2 py-1.5">Descrição</th>
                    <th className="px-2 py-1.5 w-20">Qtd</th>
                    <th className="px-2 py-1.5 w-32">Valor unit.</th>
                    <th className="px-2 py-1.5 w-32 text-right">Total</th>
                    <th className="px-2 py-1.5 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((it, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-2 py-1">
                        <Input value={it.descricao} onChange={(e) => setItens((a) => a.map((x, i) => i === idx ? { ...x, descricao: e.target.value } : x))} />
                      </td>
                      <td className="px-2 py-1"><Input type="number" min={1} max={999} step="1" value={it.quantidade} onChange={(e) => {
                        const n = Math.min(999, Math.max(1, Math.floor(Number(e.target.value) || 1)));
                        setItens((a) => a.map((x, i) => i === idx ? { ...x, quantidade: n } : x));
                      }} /></td>
                      <td className="px-2 py-1"><CurrencyInput value={String(it.valor_unitario ?? "")} onChange={(v) => setItens((a) => a.map((x, i) => i === idx ? { ...x, valor_unitario: Number(v) || 0 } : x))} /></td>
                      <td className="px-2 py-1 text-right font-medium">
                        {BRL(it.quantidade * it.valor_unitario)}
                        {formasPagamento.length > 1 && (
                          <div className="mt-1 text-[11px] font-normal text-muted-foreground space-y-0.5">
                            {formasPagamento.map((f) => {
                              const v = Number(it.valores_formas?.[f] ?? it.valor_unitario ?? 0);
                              return (
                                <div key={f}>
                                  <b className="uppercase">{abreviar(f)}:</b> {BRL(it.quantidade * v)}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1"><Button size="sm" variant="ghost" onClick={() => setItens((a) => a.filter((_, i) => i !== idx))}><Trash2 className="h-3 w-3 text-destructive" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t pt-3 pb-8">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>Observações</Label>
                <span className={`text-[11px] ${observacoes.length > 1000 ? "text-destructive" : "text-muted-foreground"}`}>
                  {observacoes.length} / 1000
                </span>
              </div>
              <Textarea
                rows={3}
                maxLength={1000}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value.slice(0, 1000))}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-medium">{BRL(subtotal)}</span></div>
              <div className="flex justify-between items-center gap-2 text-sm">
                <span>Desconto</span>
                <CurrencyInput
                  className={`w-32 text-right ${Number(desconto) > subtotal || Number(desconto) < 0 ? "border-destructive" : ""}`}
                  value={String(desconto ?? "")}
                  onChange={(v) => {
                    const n = Math.max(0, Number(v) || 0);
                    setDesconto(n);
                  }}
                />
              </div>
              {Number(desconto) > subtotal && (
                <p className="text-xs text-destructive text-right">Desconto não pode ser maior que o subtotal ({BRL(subtotal)}).</p>
              )}
              <div className="flex justify-between text-lg font-bold border-t pt-2"><span>Total</span><span className="text-primary">{BRL(total)}</span></div>
              {formasPagamento.length > 1 && (
                <div className="space-y-1 border-t pt-2">
                  {formasPagamento.map((f) => (
                    <div key={f} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total {abreviar(f)}</span>
                      <span className="font-semibold">{BRL(totaisPorForma[f] ?? 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {categoria && (
          <DialogFooter className="sticky bottom-0 bg-background border-t -mx-6 -mb-6 px-6 py-5 z-10">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving} className="gap-2"><Printer className="h-4 w-4" /> Salvar e imprimir</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}