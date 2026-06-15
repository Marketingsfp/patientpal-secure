import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileText, Plus, Printer, Trash2, Search, AlertTriangle, Calendar, Columns2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
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

export const Route = createFileRoute("/_authenticated/app/orcamentos")({
  component: OrcamentosPage,
  head: () => ({ meta: [{ title: "Orçamentos — ClinicaOS" }] }),
});

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
  const navigate = useNavigate();
  const [list, setList] = useState<Orc[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("orcamentos")
      .select("id, numero, paciente_nome, paciente_telefone, medico_nome, forma_pagamento, valor_total, valores_pagamento, status, created_at, categoria")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setList((data ?? []) as Orc[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clinicaAtual?.clinica_id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((o) =>
      o.paciente_nome.toLowerCase().includes(q) ||
      String(o.numero).includes(q) ||
      (o.medico_nome ?? "").toLowerCase().includes(q),
    );
  }, [list, query]);

  const remover = async (id: string) => {
    if (!confirm("Excluir este orçamento?")) return;
    const { error } = await supabase.from("orcamentos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Orçamento excluído");
    load();
  };

  const imprimir = async (id: string) => {
    if (!clinicaAtual) return;
    try { await printOrcamento(id, clinicaAtual.clinica_id); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10"><FileText className="h-6 w-6 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-bold">Orçamentos</h1>
            <p className="text-sm text-muted-foreground">Orçamentos rápidos com impressão térmica 80mm</p>
          </div>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Novo orçamento</Button>
      </div>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por paciente, número ou médico…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
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
                <td className="px-3 py-2 font-mono">#{String(o.numero).padStart(5, "0")}</td>
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
                    <Button size="sm" variant="ghost" onClick={() => imprimir(o.id)} title="Imprimir"><Printer className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remover(o.id)} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
  const [labProcIds, setLabProcIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: esps } = await supabase
        .from("especialidades")
        .select("id")
        .ilike("nome", "%labor%");
      const espIds = (esps ?? []).map((e) => e.id);
      if (espIds.length === 0) { setLabProcIds(new Set()); return; }
      const { data: pe } = await supabase
        .from("procedimento_especialidades")
        .select("procedimento_id")
        .eq("clinica_id", clinicaId)
        .in("especialidade_id", espIds);
      setLabProcIds(new Set((pe ?? []).map((r) => r.procedimento_id as string)));
    })();
  }, [open, clinicaId]);

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
    if (externo) {
      setMedicoId("");
    } else {
      setClinicaSolicitante("");
    }
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
    if (categoria && labProcIds == null) return;
    setSearchingProc(true);
    const t = setTimeout(async () => {
      const norm = procQuery.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      let q = supabase
        .from("procedimentos")
        .select("id, nome, valor_dinheiro_pix, valor_cartao, valor_dinheiro, valor_pix, valor_cartao_credito, valor_cartao_debito, valor_padrao, preparo")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .or(`nome.ilike.%${procQuery}%,nome.ilike.%${norm}%`);
      if (categoria === "laboratorio") {
        const ids = Array.from(labProcIds ?? []);
        if (ids.length === 0) {
          if (!cancel) { setProcResults([]); setSearchingProc(false); }
          return;
        }
        q = q.in("id", ids);
      } else if (categoria === "demais") {
        const ids = Array.from(labProcIds ?? []);
        if (ids.length > 0) {
          q = q.not("id", "in", `(${ids.join(",")})`);
        }
      }
      const { data } = await q.limit(20);
      if (!cancel) { setProcResults((data ?? []) as Procedimento[]); setSearchingProc(false); }
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [procQuery, clinicaId, categoria, labProcIds]);

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
    setValoresPagamento({});
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
    if (itens.length === 0) return toast.error("Adicione ao menos um serviço");
    if (formasPagamento.length === 0) return toast.error("Selecione ao menos uma forma de pagamento");
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
        medico_nome: medicoNome.trim() || null,
        medico_externo: medicoExterno,
        clinica_solicitante: medicoExterno ? (clinicaSolicitante.trim() || null) : null,
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

    if (error || !orc) { setSaving(false); return toast.error(error?.message ?? "Erro ao salvar"); }

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
    if (e2) return toast.error(e2.message);
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
            <div className="space-y-1"><Label>Paciente *</Label><Input value={pacienteNome} onChange={(e) => setPacienteNome(e.target.value)} /></div>
            <div className="space-y-1"><Label>Telefone</Label><Input value={pacienteTelefone} onChange={(e) => setPacienteTelefone(e.target.value)} /></div>
            <div className="space-y-1 md:col-span-2">
              <Label>Médico solicitante</Label>
              <div className="flex gap-1 rounded-md border p-1 w-fit">
                <button
                  type="button"
                  onClick={() => alternarMedicoExterno(false)}
                  className={`px-3 py-1 text-sm rounded ${!medicoExterno ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  Da nossa clínica
                </button>
                <button
                  type="button"
                  onClick={() => alternarMedicoExterno(true)}
                  className={`px-3 py-1 text-sm rounded ${medicoExterno ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  De outro local
                </button>
              </div>
              {!medicoExterno ? (
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
                  return (
                    <label key={f}
                      className={`flex items-center gap-2 px-2 py-1 rounded-md text-sm cursor-pointer border ${
                        checked ? "bg-primary/10 border-primary/40" : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleForma(f)} />
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
            <div className="space-y-1"><Label>Validade (dias)</Label><Input type="number" min={1} value={validade} onChange={(e) => setValidade(Number(e.target.value) || 30)} /></div>
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
                      <td className="px-2 py-1"><Input type="number" min={1} step="1" value={it.quantidade} onChange={(e) => setItens((a) => a.map((x, i) => i === idx ? { ...x, quantidade: Number(e.target.value) || 0 } : x))} /></td>
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
            <div className="space-y-1"><Label>Observações</Label><Textarea rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} /></div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-medium">{BRL(subtotal)}</span></div>
              <div className="flex justify-between items-center gap-2 text-sm">
                <span>Desconto</span>
                <CurrencyInput className="w-32 text-right" value={String(desconto ?? "")} onChange={(v) => setDesconto(Number(v) || 0)} />
              </div>
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