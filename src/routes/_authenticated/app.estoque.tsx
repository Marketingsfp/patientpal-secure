import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Package, Plus, Minus, FileText, History, Pencil, Search, AlertTriangle,
  CalendarClock, PackageX, Boxes, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { PageHeader } from "@/components/page/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { printPedidoCompra } from "@/lib/print-pedido-compra";
import {
  CATEGORIAS_ESTOQUE, MOTIVOS_BAIXA, STATUS_ESTOQUE_CLASS, STATUS_ESTOQUE_LABEL,
  alocarFefo, diasParaVencer, fmtValidade, labelCategoria, labelMotivo,
  statusEstoque, statusValidade,
} from "@/lib/estoque/status";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/estoque")({
  component: EstoquePage,
  head: () => ({
    meta: [
      { title: "Estoque e insumos — ClinicaOS" },
      { name: "description", content: "Controle de insumos, lotes, validade, estoque mínimo e reposição da clínica." },
      { property: "og:title", content: "Estoque e insumos — ClinicaOS" },
      { property: "og:description", content: "Controle de insumos, lotes, validade e reposição." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface Produto {
  id: string; nome: string; codigo: string | null; unidade: string;
  estoque_atual: number; estoque_minimo: number; custo_unitario: number;
  categoria: string; fornecedor: string | null; observacoes: string | null; ativo: boolean;
}
interface Lote {
  id: string; produto_id: string; lote: string | null; validade: string | null;
  quantidade: number; custo_unitario: number; fornecedor: string | null;
}
interface Movimento {
  id: string; produto_id: string; tipo: string; quantidade: number;
  motivo: string | null; observacoes: string | null; data: string; lote_id: string | null;
}

type Filtro = "todos" | "abaixo" | "vencendo" | "sem";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

function EstoquePage() {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const podeEscrever = usePodeEscrever("estoque");

  const [loading, setLoading] = useState(true);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [categoria, setCategoria] = useState<string>("todas");

  const [openEntrada, setOpenEntrada] = useState(false);
  const [openBaixa, setOpenBaixa] = useState(false);
  const [openProduto, setOpenProduto] = useState<Produto | "novo" | null>(null);
  const [historicoDe, setHistoricoDe] = useState<Produto | null>(null);

  const clinicaId = clinicaAtual?.clinica_id;

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    setLoading(true);
    const [p, l] = await Promise.all([
      supabase.from("estoque_produtos")
        .select("id, nome, codigo, unidade, estoque_atual, estoque_minimo, custo_unitario, categoria, fornecedor, observacoes, ativo")
        .eq("clinica_id", clinicaId).order("nome"),
      supabase.from("estoque_lotes")
        .select("id, produto_id, lote, validade, quantidade, custo_unitario, fornecedor")
        .eq("clinica_id", clinicaId).order("validade", { nullsFirst: false }),
    ]);
    if (p.error) toast.error("Não foi possível carregar o estoque.");
    setProdutos(((p.data ?? []) as unknown as Produto[]));
    setLotes(((l.data ?? []) as unknown as Lote[]));
    setLoading(false);
  }, [clinicaId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const lotesPorProduto = useMemo(() => {
    const m = new Map<string, Lote[]>();
    for (const l of lotes) {
      const arr = m.get(l.produto_id) ?? [];
      arr.push(l);
      m.set(l.produto_id, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.validade ?? "9999").localeCompare(b.validade ?? "9999"));
    }
    return m;
  }, [lotes]);

  /** Lote que vence primeiro com saldo — usado na coluna Lote/Validade. */
  const loteVigente = useCallback(
    (produtoId: string) => (lotesPorProduto.get(produtoId) ?? []).find((l) => Number(l.quantidade) > 0) ?? null,
    [lotesPorProduto],
  );

  const enriquecidos = useMemo(() => produtos.map((p) => {
    const st = statusEstoque(Number(p.estoque_atual), Number(p.estoque_minimo));
    const lote = loteVigente(p.id);
    const sv = statusValidade(lote?.validade);
    const temVencido = (lotesPorProduto.get(p.id) ?? []).some(
      (l) => Number(l.quantidade) > 0 && statusValidade(l.validade) === "vencido",
    );
    return { ...p, st, lote, sv, temVencido };
  }), [produtos, loteVigente, lotesPorProduto]);

  const kpis = useMemo(() => ({
    total: enriquecidos.length,
    abaixo: enriquecidos.filter((p) => p.st === "minimo").length,
    sem: enriquecidos.filter((p) => p.st === "sem_estoque").length,
    vencendo: enriquecidos.filter((p) => p.sv === "vencendo" || p.temVencido).length,
    valor: enriquecidos.reduce((s, p) => s + Number(p.estoque_atual) * Number(p.custo_unitario || 0), 0),
  }), [enriquecidos]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return enriquecidos.filter((p) => {
      if (categoria !== "todas" && p.categoria !== categoria) return false;
      if (filtro === "abaixo" && p.st !== "minimo") return false;
      if (filtro === "sem" && p.st !== "sem_estoque") return false;
      if (filtro === "vencendo" && !(p.sv === "vencendo" || p.temVencido)) return false;
      if (!q) return true;
      return p.nome.toLowerCase().includes(q) || (p.codigo ?? "").toLowerCase().includes(q);
    });
  }, [enriquecidos, busca, filtro, categoria]);

  const gerarPedido = () => {
    const itens = enriquecidos
      .filter((p) => p.ativo && (p.st === "minimo" || p.st === "sem_estoque"))
      .map((p) => {
        const minimo = Number(p.estoque_minimo) || 0;
        const atual = Number(p.estoque_atual) || 0;
        // Sugestão: repor até o dobro do mínimo (colchão de segurança).
        const sugestao = Math.max(1, Math.ceil(minimo * 2 - atual));
        return {
          codigo: p.codigo, nome: p.nome, categoria: labelCategoria(p.categoria),
          unidade: p.unidade, atual, minimo, sugestao,
          custo: Number(p.custo_unitario || 0), fornecedor: p.fornecedor,
        };
      });
    if (itens.length === 0) { toast.info("Nenhum item abaixo do mínimo no momento."); return; }
    printPedidoCompra({
      clinicaNome: clinicaAtual?.clinica?.nome ?? "Clínica",
      solicitante: user?.user_metadata?.nome || user?.email || "—",
      itens,
    });
  };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader
        icon={<Package />}
        title="Estoque e insumos"
        meta={<span className="text-sm font-normal text-muted-foreground">{kpis.total} itens</span>}
        description="Lotes, validade, estoque mínimo e reposição."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={gerarPedido}>
              <FileText className="mr-1.5 h-4 w-4" /> Gerar pedido de compra
            </Button>
            {podeEscrever && (
              <>
                <Button variant="outline" size="sm" onClick={() => setOpenBaixa(true)}>
                  <Minus className="mr-1.5 h-4 w-4 text-rose-600" /> Registrar baixa / perda
                </Button>
                <Button variant="outline" size="sm" onClick={() => setOpenProduto("novo")}>
                  <Boxes className="mr-1.5 h-4 w-4" /> Novo item
                </Button>
              </>
            )}
          </>
        }
        primaryAction={podeEscrever ? (
          <Button size="sm" onClick={() => setOpenEntrada(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Entrada de estoque
          </Button>
        ) : undefined}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={<Boxes className="h-4 w-4" />} label="Itens cadastrados" value={String(kpis.total)} hint={fmtBRL(kpis.valor) + " em estoque"} />
        <KpiCard icon={<AlertTriangle className="h-4 w-4" />} label="Abaixo do mínimo" value={String(kpis.abaixo)} tone="amber" />
        <KpiCard icon={<PackageX className="h-4 w-4" />} label="Sem estoque" value={String(kpis.sem)} tone="rose" />
        <KpiCard icon={<CalendarClock className="h-4 w-4" />} label="Vencendo / vencidos" value={String(kpis.vencendo)} tone="amber" hint="Janela de 30 dias" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
          <TabsList>
            <TabsTrigger value="todos">Todos os itens</TabsTrigger>
            <TabsTrigger value="abaixo">Abaixo do mínimo</TabsTrigger>
            <TabsTrigger value="vencendo">Vencendo em breve</TabsTrigger>
            <TabsTrigger value="sem">Sem estoque</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por item ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {CATEGORIAS_ESTOQUE.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando estoque…
          </div>
        ) : filtrados.length === 0 ? (
          <div className="space-y-1 py-14 text-center">
            <Package className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm font-medium">Nenhum item encontrado</p>
            <p className="text-xs text-muted-foreground">Ajuste os filtros ou registre uma entrada de estoque.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Código</TableHead>
                <TableHead>Item / medicamento</TableHead>
                <TableHead className="w-36">Categoria</TableHead>
                <TableHead className="w-44">Lote / validade</TableHead>
                <TableHead className="w-40 text-right">Quantidade</TableHead>
                <TableHead className="w-24 text-right">Mínimo</TableHead>
                <TableHead className="w-16 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((p) => {
                const sv = p.temVencido ? "vencido" : p.sv;
                const dias = diasParaVencer(p.lote?.validade);
                return (
                  <TableRow key={p.id} className={cn(!p.ativo && "opacity-60")}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{p.codigo || "—"}</TableCell>
                    <TableCell>
                      <div className="font-medium">{p.nome}</div>
                      {p.fornecedor && <div className="text-xs text-muted-foreground">{p.fornecedor}</div>}
                    </TableCell>
                    <TableCell><span className="text-sm text-muted-foreground">{labelCategoria(p.categoria)}</span></TableCell>
                    <TableCell>
                      {!p.lote ? (
                        <span className="text-xs text-muted-foreground">Sem lote registrado</span>
                      ) : (
                        <div className="space-y-1">
                          <div className="text-xs font-medium">{p.lote.lote || "Lote —"}</div>
                          {sv === "vencido" ? (
                            <Badge variant="outline" className="animate-pulse border border-rose-500/30 bg-rose-500/20 text-rose-700">
                              Vencido {fmtValidade(p.lote.validade)}
                            </Badge>
                          ) : sv === "vencendo" ? (
                            <Badge variant="outline" className="border-amber-500/25 bg-amber-500/15 text-amber-700">
                              Vence em {dias}d · {fmtValidade(p.lote.validade)}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">{fmtValidade(p.lote.validade)}</span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="tabular-nums font-semibold">{Number(p.estoque_atual)} {p.unidade}</span>
                        <Badge variant="outline" className={cn("text-[11px]", STATUS_ESTOQUE_CLASS[p.st])}>
                          {STATUS_ESTOQUE_LABEL[p.st]}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{Number(p.estoque_minimo)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" aria-label={`Ações de ${p.nome}`}>···</Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setOpenProduto(p)} disabled={!podeEscrever}>
                            <Pencil className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setOpenBaixa(true)} disabled={!podeEscrever}>
                            <Minus className="mr-2 h-4 w-4" /> Dar baixa
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setHistoricoDe(p)}>
                            <History className="mr-2 h-4 w-4" /> Histórico de movimentações
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {clinicaId && (
        <>
          <EntradaDialog open={openEntrada} onOpenChange={setOpenEntrada} produtos={produtos} clinicaId={clinicaId} onSaved={carregar} />
          <BaixaDialog open={openBaixa} onOpenChange={setOpenBaixa} produtos={produtos} lotesPorProduto={lotesPorProduto} clinicaId={clinicaId} onSaved={carregar} />
          <ProdutoDialog alvo={openProduto} onOpenChange={(v) => !v && setOpenProduto(null)} clinicaId={clinicaId} onSaved={carregar} />
          <HistoricoDialog produto={historicoDe} onOpenChange={(v) => !v && setHistoricoDe(null)} lotes={lotes} />
        </>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, hint, tone = "slate" }: {
  icon: React.ReactNode; label: string; value: string; hint?: string; tone?: "slate" | "amber" | "rose";
}) {
  const toneCls = tone === "amber" ? "text-amber-600" : tone === "rose" ? "text-rose-600" : "text-muted-foreground";
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className={cn("flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider", toneCls)}>
        {icon} {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/* ------------------------------- Entrada -------------------------------- */

function EntradaDialog({ open, onOpenChange, produtos, clinicaId, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; produtos: Produto[]; clinicaId: string; onSaved: () => Promise<void>;
}) {
  const [produtoId, setProdutoId] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [cat, setCat] = useState("insumos");
  const [qtd, setQtd] = useState("1");
  const [lote, setLote] = useState("");
  const [validade, setValidade] = useState("");
  const [custo, setCusto] = useState("0");
  const [fornecedor, setFornecedor] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProdutoId(""); setNovoNome(""); setCat("insumos"); setQtd("1");
    setLote(""); setValidade(""); setCusto("0"); setFornecedor(""); setObs("");
  }, [open]);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const quantidade = Number(qtd);
    if (!quantidade || quantidade <= 0) { toast.error("Informe uma quantidade maior que zero."); return; }
    if (!produtoId && !novoNome.trim()) { toast.error("Selecione um item ou informe o nome do novo item."); return; }
    setSaving(true);
    try {
      let pid = produtoId;
      if (!pid) {
        const { data, error } = await supabase.from("estoque_produtos").insert({
          clinica_id: clinicaId, nome: novoNome.trim(), categoria: cat,
          custo_unitario: Number(custo) || 0, fornecedor: fornecedor || null, estoque_atual: 0,
        } as never).select("id").single();
        if (error) throw error;
        pid = (data as { id: string }).id;
      }

      const { data: loteRow, error: erroLote } = await supabase.from("estoque_lotes").insert({
        clinica_id: clinicaId, produto_id: pid, lote: lote || null,
        validade: validade || null, quantidade, quantidade_inicial: quantidade,
        custo_unitario: Number(custo) || 0, fornecedor: fornecedor || null,
      } as never).select("id").single();
      if (erroLote) throw erroLote;

      const { error: erroMov } = await supabase.from("estoque_movimentos").insert({
        clinica_id: clinicaId, produto_id: pid, tipo: "entrada", quantidade,
        custo_unitario: Number(custo) || 0, lote_id: (loteRow as { id: string }).id,
        motivo: "compra", observacoes: obs || null,
      } as never);
      if (erroMov) throw erroMov;

      if (fornecedor || Number(custo) > 0) {
        await supabase.from("estoque_produtos")
          .update({ fornecedor: fornecedor || null, custo_unitario: Number(custo) || 0 } as never)
          .eq("id", pid);
      }

      toast.success("Entrada registrada.");
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      toast.error("Não foi possível registrar a entrada.", { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Entrada de estoque</DialogTitle>
          <DialogDescription>Registre a compra ou recebimento informando lote e validade.</DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Item já cadastrado</Label>
              <Select value={produtoId || "novo"} onValueChange={(v) => setProdutoId(v === "novo" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="novo">+ Cadastrar novo item</SelectItem>
                  {produtos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!produtoId && (
              <>
                <div className="space-y-1">
                  <Label>Nome do novo item *</Label>
                  <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex.: Lidocaína 2%" />
                </div>
                <div className="space-y-1">
                  <Label>Categoria</Label>
                  <Select value={cat} onValueChange={setCat}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIAS_ESTOQUE.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label>Quantidade *</Label>
              <Input type="number" min="0" step="any" value={qtd} onChange={(e) => setQtd(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Lote</Label>
              <Input value={lote} onChange={(e) => setLote(e.target.value)} placeholder="Ex.: L2024-88" />
            </div>
            <div className="space-y-1">
              <Label>Validade</Label>
              <Input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Preço de compra (unitário)</Label>
              <CurrencyInput value={custo} onChange={setCusto} />
            </div>
            <div className="space-y-1">
              <Label>Fornecedor</Label>
              <Input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Observações</Label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Registrar entrada
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- Baixa --------------------------------- */

function BaixaDialog({ open, onOpenChange, produtos, lotesPorProduto, clinicaId, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; produtos: Produto[];
  lotesPorProduto: Map<string, Lote[]>; clinicaId: string; onSaved: () => Promise<void>;
}) {
  const [produtoId, setProdutoId] = useState("");
  const [qtd, setQtd] = useState("1");
  const [motivo, setMotivo] = useState("consumo");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setProdutoId(""); setQtd("1"); setMotivo("consumo"); setObs(""); } }, [open]);

  const produto = produtos.find((p) => p.id === produtoId) ?? null;
  const lotesDoProduto = produtoId ? (lotesPorProduto.get(produtoId) ?? []) : [];
  const previa = useMemo(
    () => alocarFefo(lotesDoProduto, Number(qtd) || 0),
    [lotesDoProduto, qtd],
  );

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const quantidade = Number(qtd);
    if (!produtoId) { toast.error("Selecione o item."); return; }
    if (!quantidade || quantidade <= 0) { toast.error("Informe uma quantidade maior que zero."); return; }
    if (produto && quantidade > Number(produto.estoque_atual)) {
      toast.error("Quantidade maior que o saldo disponível.");
      return;
    }
    setSaving(true);
    try {
      // FEFO: consome primeiro os lotes com validade mais próxima.
      for (const a of previa.alocacoes) {
        const atual = lotesDoProduto.find((l) => l.id === a.lote_id);
        const { error } = await supabase.from("estoque_lotes")
          .update({ quantidade: Number(atual?.quantidade ?? 0) - a.quantidade } as never)
          .eq("id", a.lote_id);
        if (error) throw error;
      }

      type MovInsert = {
        clinica_id: string; produto_id: string; tipo: string; quantidade: number;
        lote_id: string | null; motivo: string; observacoes: string | null;
      };
      const registros: MovInsert[] = previa.alocacoes.length > 0
        ? previa.alocacoes.map((a) => ({
            clinica_id: clinicaId, produto_id: produtoId, tipo: "saida",
            quantidade: a.quantidade, lote_id: a.lote_id, motivo,
            observacoes: [obs, a.lote ? `Lote ${a.lote}` : null].filter(Boolean).join(" · ") || null,
          }))
        : [{ clinica_id: clinicaId, produto_id: produtoId, tipo: "saida", quantidade, lote_id: null, motivo, observacoes: obs || null }];

      if (previa.restante > 0 && previa.alocacoes.length > 0) {
        registros.push({
          clinica_id: clinicaId, produto_id: produtoId, tipo: "saida",
          quantidade: previa.restante, lote_id: null, motivo,
          observacoes: [obs, "Sem lote identificado"].filter(Boolean).join(" · "),
        });
      }

      const { error } = await supabase.from("estoque_movimentos").insert(registros as never);
      if (error) throw error;

      toast.success("Baixa registrada.");
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      toast.error("Não foi possível registrar a baixa.", { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Registrar baixa / perda</DialogTitle>
          <DialogDescription>Os lotes com validade mais próxima são consumidos primeiro (FEFO).</DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-4">
          <div className="space-y-1">
            <Label>Item *</Label>
            <Select value={produtoId} onValueChange={setProdutoId}>
              <SelectTrigger><SelectValue placeholder="Selecione o item" /></SelectTrigger>
              <SelectContent>
                {produtos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome} — saldo {Number(p.estoque_atual)} {p.unidade}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Quantidade *</Label>
              <Input type="number" min="0" step="any" value={qtd} onChange={(e) => setQtd(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Motivo</Label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MOTIVOS_BAIXA.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {produtoId && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Lotes que serão consumidos (FEFO)
              </div>
              {previa.alocacoes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum lote com saldo — a baixa sai do saldo geral do item.</p>
              ) : (
                <ul className="space-y-1">
                  {previa.alocacoes.map((a) => (
                    <li key={a.lote_id} className="flex justify-between gap-3">
                      <span>{a.lote || "Lote —"} · venc. {fmtValidade(a.validade)}</span>
                      <span className="font-semibold tabular-nums">-{a.quantidade}</span>
                    </li>
                  ))}
                </ul>
              )}
              {previa.restante > 0 && previa.alocacoes.length > 0 && (
                <p className="mt-2 text-xs font-medium text-amber-700">
                  {previa.restante} unidade(s) sem lote correspondente serão baixadas do saldo geral.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label>Observação</Label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" variant="destructive" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Registrar baixa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------- Cadastro do item --------------------------- */

function ProdutoDialog({ alvo, onOpenChange, clinicaId, onSaved }: {
  alvo: Produto | "novo" | null; onOpenChange: (v: boolean) => void; clinicaId: string; onSaved: () => Promise<void>;
}) {
  const editando = alvo && alvo !== "novo" ? alvo : null;
  const [form, setForm] = useState({
    nome: "", codigo: "", unidade: "un", categoria: "insumos",
    estoque_minimo: "0", custo_unitario: "0", fornecedor: "", observacoes: "", ativo: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!alvo) return;
    setForm(editando ? {
      nome: editando.nome, codigo: editando.codigo ?? "", unidade: editando.unidade,
      categoria: editando.categoria ?? "insumos", estoque_minimo: String(editando.estoque_minimo),
      custo_unitario: String(editando.custo_unitario), fornecedor: editando.fornecedor ?? "",
      observacoes: editando.observacoes ?? "", ativo: editando.ativo,
    } : {
      nome: "", codigo: "", unidade: "un", categoria: "insumos",
      estoque_minimo: "0", custo_unitario: "0", fornecedor: "", observacoes: "", ativo: true,
    });
  }, [alvo, editando]);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) { toast.error("Informe o nome do item."); return; }
    setSaving(true);
    try {
      const payload = {
        nome: form.nome.trim(), codigo: form.codigo || null, unidade: form.unidade,
        categoria: form.categoria, estoque_minimo: Number(form.estoque_minimo) || 0,
        custo_unitario: Number(form.custo_unitario) || 0, fornecedor: form.fornecedor || null,
        observacoes: form.observacoes || null, ativo: form.ativo,
      };
      const { error } = editando
        ? await supabase.from("estoque_produtos").update(payload as never).eq("id", editando.id)
        : await supabase.from("estoque_produtos").insert({ ...payload, clinica_id: clinicaId } as never);
      if (error) throw error;
      toast.success(editando ? "Item atualizado." : "Item cadastrado.");
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      toast.error("Não foi possível salvar o item.", { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!alvo} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar item" : "Novo item"}</DialogTitle>
          <DialogDescription>O saldo é alterado apenas por entradas e baixas.</DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-2">
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>Código / SKU</Label>
              <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_ESTOQUE.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Unidade</Label>
              <Input value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Estoque mínimo</Label>
              <Input type="number" min="0" value={form.estoque_minimo} onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Custo unitário</Label>
              <CurrencyInput value={form.custo_unitario} onChange={(v) => setForm({ ...form, custo_unitario: v })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Fornecedor</Label>
            <Input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Observações</Label>
            <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: !!v })} /> Ativo
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- Histórico ------------------------------- */

function HistoricoDialog({ produto, onOpenChange, lotes }: {
  produto: Produto | null; onOpenChange: (v: boolean) => void; lotes: Lote[];
}) {
  const [movs, setMovs] = useState<Movimento[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!produto) return;
    setLoading(true);
    void supabase.from("estoque_movimentos")
      .select("id, produto_id, tipo, quantidade, motivo, observacoes, data, lote_id")
      .eq("produto_id", produto.id).order("data", { ascending: false }).limit(100)
      .then(({ data }) => { setMovs((data ?? []) as unknown as Movimento[]); setLoading(false); });
  }, [produto]);

  const loteLabel = (id: string | null) => {
    if (!id) return "—";
    const l = lotes.find((x) => x.id === id);
    return l ? `${l.lote || "Lote —"} (${fmtValidade(l.validade)})` : "—";
  };

  return (
    <Dialog open={!!produto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Histórico de movimentações</DialogTitle>
          <DialogDescription>{produto?.nome}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : movs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Data</TableHead>
                  <TableHead className="w-24">Tipo</TableHead>
                  <TableHead className="w-24 text-right">Qtd.</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Motivo / observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movs.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(m.data).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={m.tipo === "entrada"
                        ? "border-emerald-500/25 bg-emerald-500/15 text-emerald-700"
                        : "border-rose-500/25 bg-rose-500/15 text-rose-700"}>
                        {m.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {m.tipo === "entrada" ? "+" : "-"}{Number(m.quantidade)}
                    </TableCell>
                    <TableCell className="text-xs">{loteLabel(m.lote_id)}</TableCell>
                    <TableCell className="text-xs">
                      <span className="font-medium">{labelMotivo(m.motivo)}</span>
                      {m.observacoes && <span className="text-muted-foreground"> · {m.observacoes}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
