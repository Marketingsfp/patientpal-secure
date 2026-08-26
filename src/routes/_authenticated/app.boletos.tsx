import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Barcode, Copy, FileDown, Pencil, Plus, Search, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { mostrarErro } from "@/lib/traduzir-erro";
import { confirmDialog } from "@/lib/confirm";
import { formatarCPF } from "@/lib/cpf";
import { brl, fmtDate } from "@/lib/financeiro/format";
import { gerarBoletosContrato } from "@/lib/boleto.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DateInputBR } from "@/components/ui/date-input-br";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/boletos")({
  component: BoletosPage,
  head: () => ({
    meta: [
      { title: "Boletos — ClinicaOS" },
      {
        name: "description",
        content: "Emita, acompanhe e concilie boletos bancários dos pacientes.",
      },
      { property: "og:title", content: "Boletos — ClinicaOS" },
      {
        property: "og:description",
        content: "Emita, acompanhe e concilie boletos bancários dos pacientes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface Row {
  id: string;
  paciente_id: string | null;
  contrato_id: string | null;
  valor: number;
  vencimento: string;
  nosso_numero: string | null;
  linha_digitavel: string | null;
  codigo_barras: string | null;
  url_pdf: string | null;
  status: string;
  observacoes: string | null;
}
interface Form {
  valor: string;
  vencimento: string;
  nosso_numero: string;
  linha_digitavel: string;
  status: string;
  observacoes: string;
}

const STATUS_OPCOES = ["pendente", "pendente_emissao", "emitido", "pago", "vencido", "cancelado"];

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  pendente_emissao: "Pendente de Emissão",
  emitido: "Emitido",
  pago: "Pago",
  vencido: "Vencido",
  cancelado: "Cancelado",
};

function statusClasses(status: string) {
  const s = (status ?? "").toLowerCase();
  if (s.startsWith("pendente")) return "bg-amber-500/15 text-amber-700 border border-amber-500/30";
  if (s === "emitido") return "bg-blue-500/15 text-blue-700 border border-blue-500/30";
  if (s === "pago") return "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30";
  if (s === "vencido" || s === "cancelado")
    return "bg-rose-500/15 text-rose-700 border border-rose-500/30";
  return "bg-muted text-muted-foreground border border-border";
}

function StatusBadge({ status }: { status: string }) {
  const s = (status ?? "").toLowerCase();
  const label = STATUS_LABEL[s] ?? s.replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap",
        statusClasses(s),
      )}
    >
      {label}
    </span>
  );
}

type Aba = "todos" | "pendentes" | "emitidos" | "pagos" | "vencidos";
const ABAS: { value: Aba; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "pendentes", label: "Pendentes" },
  { value: "emitidos", label: "Emitidos" },
  { value: "pagos", label: "Pagos" },
  { value: "vencidos", label: "Vencidos" },
];

function naAba(status: string, aba: Aba) {
  const s = (status ?? "").toLowerCase();
  if (aba === "todos") return true;
  if (aba === "pendentes") return s.startsWith("pendente");
  if (aba === "emitidos") return s === "emitido";
  if (aba === "pagos") return s === "pago";
  return s === "vencido";
}

const FORM_VAZIO: Form = {
  valor: "0",
  vencimento: new Date().toISOString().slice(0, 10),
  nosso_numero: "",
  linha_digitavel: "",
  status: "pendente",
  observacoes: "",
};

function BoletosPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("boletos");
  const [rows, setRows] = useState<Row[]>([]);
  const [pacientes, setPacientes] = useState<Map<string, { nome: string; cpf: string | null }>>(
    new Map(),
  );
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<Aba>("todos");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Form>(FORM_VAZIO);
  const [saving, setSaving] = useState(false);
  const [emitindo, setEmitindo] = useState<string | null>(null);

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("boletos")
      .select(
        "id, paciente_id, contrato_id, valor, vencimento, nosso_numero, linha_digitavel, codigo_barras, url_pdf, status, observacoes",
      )
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("vencimento", { ascending: false });
    if (error) {
      setLoading(false);
      mostrarErro(error);
      return;
    }
    const lista = (data ?? []) as Row[];
    setRows(lista);
    const ids = Array.from(new Set(lista.map((r) => r.paciente_id).filter(Boolean))) as string[];
    if (ids.length > 0) {
      const { data: pacs } = await supabase.from("pacientes").select("id, nome, cpf").in("id", ids);
      const map = new Map<string, { nome: string; cpf: string | null }>();
      for (const p of pacs ?? [])
        map.set(p.id as string, {
          nome: (p as { nome: string }).nome,
          cpf: (p as { cpf: string | null }).cpf,
        });
      setPacientes(map);
    } else {
      setPacientes(new Map());
    }
    setLoading(false);
  };
  useEffect(() => {
    void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [clinicaAtual?.clinica_id]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (!naAba(r.status, aba)) return false;
      if (!q) return true;
      const p = r.paciente_id ? pacientes.get(r.paciente_id) : undefined;
      const alvo = [p?.nome ?? "", p?.cpf ?? "", r.nosso_numero ?? ""].join(" ").toLowerCase();
      return (
        alvo.includes(q) ||
        (p?.cpf ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "\u0000")
      );
    });
  }, [rows, busca, aba, pacientes]);

  const contagem = useMemo(() => {
    const c: Record<Aba, number> = {
      todos: rows.length,
      pendentes: 0,
      emitidos: 0,
      pagos: 0,
      vencidos: 0,
    };
    for (const r of rows) {
      for (const a of ["pendentes", "emitidos", "pagos", "vencidos"] as Aba[])
        if (naAba(r.status, a)) c[a]++;
    }
    return c;
  }, [rows]);

  const kpis = useMemo(() => {
    const hoje = new Date();
    const ym = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
    let totalPendente = 0;
    let doMes = 0;
    let valorMes = 0;
    for (const r of rows) {
      const s = (r.status ?? "").toLowerCase();
      if (s.startsWith("pendente") || s === "emitido" || s === "vencido")
        totalPendente += Number(r.valor) || 0;
      if ((r.vencimento ?? "").startsWith(ym)) {
        doMes++;
        valorMes += Number(r.valor) || 0;
      }
    }
    return { totalPendente, doMes, valorMes };
  }, [rows]);

  const abrirNovo = () => {
    setEditing(null);
    setForm(FORM_VAZIO);
    setOpen(true);
  };
  const abrirEdicao = (r: Row) => {
    setEditing(r);
    setForm({
      valor: String(r.valor),
      vencimento: r.vencimento,
      nosso_numero: r.nosso_numero ?? "",
      linha_digitavel: r.linha_digitavel ?? "",
      status: r.status,
      observacoes: r.observacoes ?? "",
    });
    setOpen(true);
  };

  const salvar = async () => {
    if (!clinicaAtual || !podeEscrever) return;
    setSaving(true);
    const payload = {
      valor: Number(form.valor) || 0,
      vencimento: form.vencimento,
      nosso_numero: form.nosso_numero || null,
      linha_digitavel: form.linha_digitavel || null,
      status: form.status,
      observacoes: form.observacoes || null,
      clinica_id: clinicaAtual.clinica_id,
    };
    const { error } = editing
      ? await supabase.from("boletos").update(payload).eq("id", editing.id)
      : await supabase.from("boletos").insert(payload);
    setSaving(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success(editing ? "Boleto atualizado." : "Boleto cadastrado.");
    setOpen(false);
    void load();
  };

  const excluir = async (r: Row) => {
    if (!podeEscrever) return;
    if (
      !(await confirmDialog({
        title: "Excluir boleto?",
        description: "Esta ação não pode ser desfeita.",
        tone: "danger",
        confirmText: "Excluir",
      }))
    )
      return;
    const { error } = await supabase.from("boletos").delete().eq("id", r.id);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Boleto excluído.");
    void load();
  };

  const emitir = async (r: Row) => {
    if (!podeEscrever) return;
    if (!r.contrato_id) {
      toast.info(
        "Emissão automática disponível apenas para boletos de contrato. Configure a integração bancária para emitir avulsos.",
      );
      return;
    }
    setEmitindo(r.id);
    try {
      const res = await gerarBoletosContrato({ data: { contratoId: r.contrato_id } });
      if (res.erro) toast.error(res.mensagem);
      else toast.success(res.mensagem);
      void load();
    } catch (e) {
      mostrarErro(e);
    } finally {
      setEmitindo(null);
    }
  };

  const copiar = async (r: Row) => {
    const codigo = r.codigo_barras || r.linha_digitavel;
    if (!codigo) {
      toast.info("Boleto ainda sem código de barras.");
      return;
    }
    try {
      await navigator.clipboard.writeText(codigo);
      toast.success("Código de barras copiado.");
    } catch {
      toast.error("Não foi possível copiar o código.");
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Barcode className="h-6 w-6 text-primary shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight truncate">Boletos</h1>
            <p className="text-sm text-muted-foreground">Emita e acompanhe boletos integrados.</p>
          </div>
        </div>
        {podeEscrever && (
          <Button onClick={abrirNovo} className="gap-2">
            <Plus className="h-4 w-4" /> Novo
          </Button>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
            Total pendente
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-700">
            {brl(kpis.totalPendente)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
            Boletos do mês
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{kpis.doMes}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
            Valor do mês
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{brl(kpis.valorMes)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
          <TabsList className="h-9">
            {ABAS.map((a) => (
              <TabsTrigger key={a.value} value={a.value} className="text-xs gap-1.5">
                {a.label}
                <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums">
                  {contagem[a.value]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative flex-1 min-w-[220px]">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por paciente, CPF ou nosso número…"
            className="pl-9 h-9"
            aria-label="Buscar boletos"
          />
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {loading ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : filtrados.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhum boleto encontrado.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paciente / Sacado</TableHead>
                <TableHead className="w-44">Nosso número</TableHead>
                <TableHead className="w-32">Vencimento</TableHead>
                <TableHead className="w-32 text-right">Valor</TableHead>
                <TableHead className="w-40">Status</TableHead>
                <TableHead className="w-40 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((r) => {
                const p = r.paciente_id ? pacientes.get(r.paciente_id) : undefined;
                const s = (r.status ?? "").toLowerCase();
                return (
                  <TableRow key={r.id}>
                    <TableCell className="min-w-0">
                      <div className="font-medium truncate">{p?.nome ?? "—"}</div>
                      {p?.cpf && (
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {formatarCPF(p.cpf)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.nosso_numero ? (
                        <span className="tabular-nums text-sm">{r.nosso_numero}</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[12px] text-muted-foreground border border-border">
                          Aguardando emissão
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums text-sm">{fmtDate(r.vencimento)}</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(r.valor)}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {podeEscrever && s.startsWith("pendente") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1 text-xs"
                            disabled={emitindo === r.id}
                            onClick={() => void emitir(r)}
                          >
                            <Send className="h-3.5 w-3.5" /> Emitir
                          </Button>
                        )}
                        {(r.codigo_barras || r.linha_digitavel) && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title="Copiar código de barras"
                            onClick={() => void copiar(r)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                        {r.url_pdf && (
                          <a
                            href={r.url_pdf}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir PDF"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
                          >
                            <FileDown className="h-4 w-4" />
                          </a>
                        )}
                        {podeEscrever && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              title="Editar"
                              onClick={() => abrirEdicao(r)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive"
                              title="Excluir"
                              onClick={() => void excluir(r)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar boleto" : "Novo boleto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Valor *</Label>
                <CurrencyInput
                  value={form.valor}
                  onChange={(v) => setForm({ ...form, valor: v })}
                />
              </div>
              <div className="space-y-1">
                <Label>Vencimento *</Label>
                <DateInputBR
                  required
                  value={form.vencimento}
                  onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPCOES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Nosso número</Label>
              <Input
                value={form.nosso_numero}
                onChange={(e) => setForm({ ...form, nosso_numero: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Linha digitável</Label>
              <Input
                value={form.linha_digitavel}
                onChange={(e) => setForm({ ...form, linha_digitavel: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea
                rows={2}
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void salvar()} disabled={saving || !podeEscrever}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
