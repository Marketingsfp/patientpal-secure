import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Wallet, PlusCircle, MinusCircle, ArrowDownToLine, ArrowUpFromLine, Lock,
  Unlock, Eye, FileDown, Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { exportToExcel } from "@/lib/export-csv";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/caixa")({
  component: Page,
  head: () => ({ meta: [{ title: "Caixa — ClinicaOS" }] }),
});

type MovTipo = "abertura" | "sangria" | "suprimento" | "recebimento" | "despesa" | "fechamento";
interface Sessao {
  id: string; clinica_id: string; user_id: string; user_nome: string | null;
  aberto_em: string; valor_abertura: number;
  fechado_em: string | null; valor_fechamento_informado: number | null;
  valor_fechamento_calculado: number | null; diferenca: number | null;
  status: "aberto" | "fechado"; observacoes: string | null;
}
interface Mov {
  id: string; sessao_id: string; user_id: string; tipo: MovTipo;
  valor: number; descricao: string | null; forma_pagamento: string | null;
  created_at: string;
}

const fmt = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDT = (s: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const TIPO_LABEL: Record<MovTipo, string> = {
  abertura: "Abertura", sangria: "Sangria", suprimento: "Suprimento",
  recebimento: "Recebimento", despesa: "Despesa", fechamento: "Fechamento",
};
const TIPO_SINAL: Record<MovTipo, 1 | -1 | 0> = {
  abertura: 1, suprimento: 1, recebimento: 1,
  sangria: -1, despesa: -1, fechamento: 0,
};

function Page() {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const isManager = clinicaAtual?.role === "admin" || clinicaAtual?.role === "gestor";

  const [tab, setTab] = useState<"meu" | "todos">("meu");
  const [loading, setLoading] = useState(true);
  const [minhaSessao, setMinhaSessao] = useState<Sessao | null>(null);
  const [minhasMovs, setMinhasMovs] = useState<Mov[]>([]);
  const [minhasSessoes, setMinhasSessoes] = useState<Sessao[]>([]);

  const [todasSessoes, setTodasSessoes] = useState<Sessao[]>([]);
  const [todosMovs, setTodosMovs] = useState<Mov[]>([]);
  const [fIni, setFIni] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [fFim, setFFim] = useState(new Date().toISOString().slice(0, 10));
  const [fUserId, setFUserId] = useState<string>("");
  const [usersList, setUsersList] = useState<Array<{ user_id: string; nome: string }>>([]);

  // Modais
  const [openAbrir, setOpenAbrir] = useState(false);
  const [openMov, setOpenMov] = useState<{ tipo: MovTipo } | null>(null);
  const [openFechar, setOpenFechar] = useState(false);
  const [openDetalhe, setOpenDetalhe] = useState<Sessao | null>(null);
  const [detalheMovs, setDetalheMovs] = useState<Mov[]>([]);

  // Formularios
  const [valorAbertura, setValorAbertura] = useState("0");
  const [obsAbertura, setObsAbertura] = useState("");
  const [movValor, setMovValor] = useState("");
  const [movDesc, setMovDesc] = useState("");
  const [movForma, setMovForma] = useState("dinheiro");
  const [valorInformado, setValorInformado] = useState("");
  const [obsFechamento, setObsFechamento] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!clinicaAtual || !user) return;
    setLoading(true);
    // Sessao aberta do usuario
    const { data: aberta } = await supabase
      .from("caixa_sessoes")
      .select("*")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("user_id", user.id)
      .eq("status", "aberto")
      .order("aberto_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    setMinhaSessao((aberta ?? null) as Sessao | null);

    if (aberta) {
      const { data: movs } = await supabase
        .from("caixa_movimentos")
        .select("*")
        .eq("sessao_id", (aberta as Sessao).id)
        .order("created_at", { ascending: true });
      setMinhasMovs((movs ?? []) as Mov[]);
    } else {
      setMinhasMovs([]);
    }

    // Historico do usuario (ultimas 20)
    const { data: hist } = await supabase
      .from("caixa_sessoes")
      .select("*")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("user_id", user.id)
      .order("aberto_em", { ascending: false })
      .limit(20);
    setMinhasSessoes((hist ?? []) as Sessao[]);
    setLoading(false);
  }, [clinicaAtual, user]);

  const loadTodos = useCallback(async () => {
    if (!clinicaAtual || !isManager) return;
    const ini = new Date(fIni + "T00:00:00").toISOString();
    const fim = new Date(fFim + "T23:59:59").toISOString();
    let q = supabase
      .from("caixa_sessoes")
      .select("*")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .gte("aberto_em", ini)
      .lte("aberto_em", fim)
      .order("aberto_em", { ascending: false });
    if (fUserId) q = q.eq("user_id", fUserId);
    const { data } = await q;
    const sess = (data ?? []) as Sessao[];
    setTodasSessoes(sess);

    if (sess.length > 0) {
      const ids = sess.map((s) => s.id);
      const { data: movs } = await supabase
        .from("caixa_movimentos")
        .select("*")
        .in("sessao_id", ids);
      setTodosMovs((movs ?? []) as Mov[]);
    } else {
      setTodosMovs([]);
    }

    // Lista de operadores que abriram caixa
    const nomes = new Map<string, string>();
    sess.forEach((s) => { if (s.user_id) nomes.set(s.user_id, s.user_nome || s.user_id.slice(0, 8)); });
    setUsersList(Array.from(nomes.entries()).map(([user_id, nome]) => ({ user_id, nome })));
  }, [clinicaAtual, isManager, fIni, fFim, fUserId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (tab === "todos") void loadTodos(); }, [tab, loadTodos]);

  // Calculos
  const saldoAtual = useMemo(() => {
    if (!minhaSessao) return 0;
    return minhasMovs.reduce(
      (acc, m) => acc + TIPO_SINAL[m.tipo] * Number(m.valor || 0),
      0,
    );
  }, [minhaSessao, minhasMovs]);

  const resumoTipos = useMemo(() => {
    const r: Record<MovTipo, number> = {
      abertura: 0, sangria: 0, suprimento: 0,
      recebimento: 0, despesa: 0, fechamento: 0,
    };
    minhasMovs.forEach((m) => { r[m.tipo] += Number(m.valor || 0); });
    return r;
  }, [minhasMovs]);

  // Calculo por sessao (todos)
  const calcSaldoSessao = useCallback((sid: string) => {
    return todosMovs
      .filter((m) => m.sessao_id === sid)
      .reduce((acc, m) => acc + TIPO_SINAL[m.tipo] * Number(m.valor || 0), 0);
  }, [todosMovs]);

  // Acoes
  const abrirCaixa = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual || !user) return;
    setSaving(true);
    const v = Number(valorAbertura) || 0;
    const nome = user.user_metadata?.nome || user.email || null;
    const { data: sess, error } = await supabase
      .from("caixa_sessoes")
      .insert({
        clinica_id: clinicaAtual.clinica_id,
        user_id: user.id,
        user_nome: nome,
        valor_abertura: v,
        observacoes: obsAbertura || null,
      })
      .select("*")
      .single();
    if (error || !sess) {
      setSaving(false);
      toast.error(error?.message || "Erro ao abrir caixa");
      return;
    }
    // movimento abertura
    await supabase.from("caixa_movimentos").insert({
      sessao_id: (sess as Sessao).id,
      clinica_id: clinicaAtual.clinica_id,
      user_id: user.id,
      tipo: "abertura",
      valor: v,
      descricao: obsAbertura || "Abertura de caixa",
    });
    setSaving(false);
    setOpenAbrir(false);
    setValorAbertura("0");
    setObsAbertura("");
    toast.success("Caixa aberto");
    void load();
  };

  const lancarMov = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual || !user || !minhaSessao || !openMov) return;
    const v = Number(movValor) || 0;
    if (v <= 0) { toast.error("Informe um valor"); return; }
    setSaving(true);
    const { error } = await supabase.from("caixa_movimentos").insert({
      sessao_id: minhaSessao.id,
      clinica_id: clinicaAtual.clinica_id,
      user_id: user.id,
      tipo: openMov.tipo,
      valor: v,
      descricao: movDesc || null,
      forma_pagamento: openMov.tipo === "recebimento" || openMov.tipo === "despesa" ? movForma : null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setOpenMov(null);
    setMovValor(""); setMovDesc(""); setMovForma("dinheiro");
    toast.success(`${TIPO_LABEL[openMov.tipo]} registrada`);
    void load();
  };

  const fecharCaixa = async (e: FormEvent) => {
    e.preventDefault();
    if (!minhaSessao || !clinicaAtual || !user) return;
    const informado = Number(valorInformado) || 0;
    const diff = informado - saldoAtual;
    setSaving(true);
    const { error } = await supabase
      .from("caixa_sessoes")
      .update({
        status: "fechado",
        fechado_em: new Date().toISOString(),
        valor_fechamento_informado: informado,
        valor_fechamento_calculado: saldoAtual,
        diferenca: diff,
        observacoes: obsFechamento
          ? `${minhaSessao.observacoes ? minhaSessao.observacoes + " | " : ""}${obsFechamento}`
          : minhaSessao.observacoes,
      })
      .eq("id", minhaSessao.id);
    if (!error) {
      await supabase.from("caixa_movimentos").insert({
        sessao_id: minhaSessao.id,
        clinica_id: clinicaAtual.clinica_id,
        user_id: user.id,
        tipo: "fechamento",
        valor: informado,
        descricao: `Fechamento. Calculado: ${fmt(saldoAtual)} | Informado: ${fmt(informado)} | Diferença: ${fmt(diff)}`,
      });
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setOpenFechar(false);
    setValorInformado(""); setObsFechamento("");
    toast.success("Caixa fechado");
    void load();
  };

  const verDetalhe = async (s: Sessao) => {
    setOpenDetalhe(s);
    const { data } = await supabase
      .from("caixa_movimentos")
      .select("*")
      .eq("sessao_id", s.id)
      .order("created_at", { ascending: true });
    setDetalheMovs((data ?? []) as Mov[]);
  };

  const exportarTodos = () => {
    const rows = todasSessoes.map((s) => ({
      Operador: s.user_nome || s.user_id.slice(0, 8),
      Abertura: fmtDT(s.aberto_em),
      Fechamento: fmtDT(s.fechado_em),
      Status: s.status,
      "Valor abertura": Number(s.valor_abertura || 0),
      "Saldo calculado": calcSaldoSessao(s.id),
      "Valor informado": Number(s.valor_fechamento_informado || 0),
      Diferenca: Number(s.diferenca || 0),
    }));
    exportToExcel(rows, `caixas_${fIni}_a_${fFim}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" /> Caixa
          </h1>
          <p className="text-sm text-muted-foreground">
            Abertura, sangria, suprimento, recebimentos e fechamento.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "meu" | "todos")}>
        <TabsList>
          <TabsTrigger value="meu">Meu caixa</TabsTrigger>
          {isManager && <TabsTrigger value="todos"><Users className="h-4 w-4 mr-1" /> Todos (Financeiro)</TabsTrigger>}
        </TabsList>

        {/* ===================== MEU CAIXA ===================== */}
        <TabsContent value="meu" className="space-y-4 pt-4">
          {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

          {!loading && !minhaSessao && (
            <Card>
              <CardContent className="py-10 text-center space-y-3">
                <Wallet className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="text-muted-foreground">Nenhum caixa aberto.</p>
                <Button onClick={() => setOpenAbrir(true)}>
                  <Unlock className="h-4 w-4 mr-2" /> Abrir caixa
                </Button>
              </CardContent>
            </Card>
          )}

          {!loading && minhaSessao && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Saldo atual</CardTitle></CardHeader>
                  <CardContent className="text-2xl font-bold text-primary">{fmt(saldoAtual)}</CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Abertura</CardTitle></CardHeader>
                  <CardContent className="text-lg">{fmt(minhaSessao.valor_abertura)}</CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Entradas</CardTitle></CardHeader>
                  <CardContent className="text-lg text-emerald-600">
                    {fmt(resumoTipos.suprimento + resumoTipos.recebimento)}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Saídas</CardTitle></CardHeader>
                  <CardContent className="text-lg text-rose-600">
                    {fmt(resumoTipos.sangria + resumoTipos.despesa)}
                  </CardContent>
                </Card>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setOpenMov({ tipo: "suprimento" })}>
                  <ArrowDownToLine className="h-4 w-4 mr-2 text-emerald-600" /> Suprimento
                </Button>
                <Button variant="outline" onClick={() => setOpenMov({ tipo: "sangria" })}>
                  <ArrowUpFromLine className="h-4 w-4 mr-2 text-rose-600" /> Sangria
                </Button>
                <Button variant="outline" onClick={() => setOpenMov({ tipo: "recebimento" })}>
                  <PlusCircle className="h-4 w-4 mr-2 text-emerald-600" /> Recebimento
                </Button>
                <Button variant="outline" onClick={() => setOpenMov({ tipo: "despesa" })}>
                  <MinusCircle className="h-4 w-4 mr-2 text-rose-600" /> Despesa
                </Button>
                <div className="flex-1" />
                <Button variant="destructive" onClick={() => { setValorInformado(saldoAtual.toFixed(2)); setOpenFechar(true); }}>
                  <Lock className="h-4 w-4 mr-2" /> Fechar caixa
                </Button>
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base">Movimentos da sessão</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hora</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Forma</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {minhasMovs.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sem movimentos</TableCell></TableRow>
                      )}
                      {minhasMovs.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="whitespace-nowrap">{new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</TableCell>
                          <TableCell><Badge variant="outline">{TIPO_LABEL[m.tipo]}</Badge></TableCell>
                          <TableCell>{m.descricao || "—"}</TableCell>
                          <TableCell>{m.forma_pagamento || "—"}</TableCell>
                          <TableCell className={`text-right font-medium ${TIPO_SINAL[m.tipo] < 0 ? "text-rose-600" : TIPO_SINAL[m.tipo] > 0 ? "text-emerald-600" : ""}`}>
                            {TIPO_SINAL[m.tipo] < 0 ? "-" : ""}{fmt(m.valor)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}

          {minhasSessoes.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Meu histórico</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Abertura</TableHead>
                      <TableHead>Fechamento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Abertura</TableHead>
                      <TableHead className="text-right">Informado</TableHead>
                      <TableHead className="text-right">Diferença</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {minhasSessoes.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{fmtDT(s.aberto_em)}</TableCell>
                        <TableCell>{fmtDT(s.fechado_em)}</TableCell>
                        <TableCell>
                          <Badge variant={s.status === "aberto" ? "default" : "secondary"}>{s.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{fmt(s.valor_abertura)}</TableCell>
                        <TableCell className="text-right">{fmt(s.valor_fechamento_informado)}</TableCell>
                        <TableCell className={`text-right ${Number(s.diferenca || 0) < 0 ? "text-rose-600" : Number(s.diferenca || 0) > 0 ? "text-amber-600" : ""}`}>
                          {fmt(s.diferenca)}
                        </TableCell>
                        <TableCell><Button size="sm" variant="ghost" onClick={() => verDetalhe(s)}><Eye className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===================== TODOS (FINANCEIRO) ===================== */}
        {isManager && (
          <TabsContent value="todos" className="space-y-4 pt-4">
            <Card>
              <CardContent className="pt-4 flex flex-wrap items-end gap-3">
                <div>
                  <Label className="text-xs">De</Label>
                  <Input type="date" value={fIni} onChange={(e) => setFIni(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Até</Label>
                  <Input type="date" value={fFim} onChange={(e) => setFFim(e.target.value)} />
                </div>
                <div className="min-w-[200px]">
                  <Label className="text-xs">Operador</Label>
                  <Select value={fUserId || "all"} onValueChange={(v) => setFUserId(v === "all" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {usersList.map((u) => (
                        <SelectItem key={u.user_id} value={u.user_id}>{u.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => void loadTodos()}>Filtrar</Button>
                <Button variant="outline" onClick={exportarTodos}><FileDown className="h-4 w-4 mr-2" /> Excel</Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Operador</TableHead>
                      <TableHead>Abertura</TableHead>
                      <TableHead>Fechamento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Abertura</TableHead>
                      <TableHead className="text-right">Calculado</TableHead>
                      <TableHead className="text-right">Informado</TableHead>
                      <TableHead className="text-right">Diferença</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {todasSessoes.length === 0 && (
                      <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Sem sessões no período</TableCell></TableRow>
                    )}
                    {todasSessoes.map((s) => {
                      const calc = calcSaldoSessao(s.id);
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.user_nome || s.user_id.slice(0, 8)}</TableCell>
                          <TableCell>{fmtDT(s.aberto_em)}</TableCell>
                          <TableCell>{fmtDT(s.fechado_em)}</TableCell>
                          <TableCell><Badge variant={s.status === "aberto" ? "default" : "secondary"}>{s.status}</Badge></TableCell>
                          <TableCell className="text-right">{fmt(s.valor_abertura)}</TableCell>
                          <TableCell className="text-right">{fmt(calc)}</TableCell>
                          <TableCell className="text-right">{fmt(s.valor_fechamento_informado)}</TableCell>
                          <TableCell className={`text-right ${Number(s.diferenca || 0) < 0 ? "text-rose-600" : Number(s.diferenca || 0) > 0 ? "text-amber-600" : ""}`}>
                            {fmt(s.diferenca)}
                          </TableCell>
                          <TableCell><Button size="sm" variant="ghost" onClick={() => verDetalhe(s)}><Eye className="h-4 w-4" /></Button></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* === Modal Abrir === */}
      <Dialog open={openAbrir} onOpenChange={setOpenAbrir}>
        <DialogContent>
          <DialogHeader><DialogTitle>Abrir caixa</DialogTitle></DialogHeader>
          <form onSubmit={abrirCaixa} className="space-y-3">
            <div>
              <Label>Valor de abertura (fundo de troco)</Label>
              <CurrencyInput value={valorAbertura} onChange={setValorAbertura} />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={obsAbertura} onChange={(e) => setObsAbertura(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpenAbrir(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>Abrir</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* === Modal Movimento === */}
      <Dialog open={!!openMov} onOpenChange={(o) => { if (!o) setOpenMov(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{openMov ? TIPO_LABEL[openMov.tipo] : ""}</DialogTitle>
            <DialogDescription>
              {openMov?.tipo === "sangria" && "Retirada de dinheiro do caixa."}
              {openMov?.tipo === "suprimento" && "Adição de dinheiro ao caixa."}
              {openMov?.tipo === "recebimento" && "Entrada de pagamento avulsa."}
              {openMov?.tipo === "despesa" && "Pagamento avulso de despesa pelo caixa."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={lancarMov} className="space-y-3">
            <div>
              <Label>Valor</Label>
              <CurrencyInput value={movValor} onChange={setMovValor} />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={movDesc} onChange={(e) => setMovDesc(e.target.value)} placeholder="Motivo / referência" />
            </div>
            {openMov && (openMov.tipo === "recebimento" || openMov.tipo === "despesa") && (
              <div>
                <Label>Forma de pagamento</Label>
                <Select value={movForma} onValueChange={setMovForma}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="debito">Débito</SelectItem>
                    <SelectItem value="credito">Crédito</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpenMov(null)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>Lançar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* === Modal Fechar === */}
      <Dialog open={openFechar} onOpenChange={setOpenFechar}>
        <DialogContent>
          <DialogHeader><DialogTitle>Fechar caixa</DialogTitle>
            <DialogDescription>Saldo calculado: <strong>{fmt(saldoAtual)}</strong></DialogDescription>
          </DialogHeader>
          <form onSubmit={fecharCaixa} className="space-y-3">
            <div>
              <Label>Valor conferido em caixa</Label>
              <CurrencyInput value={valorInformado} onChange={setValorInformado} />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={obsFechamento} onChange={(e) => setObsFechamento(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpenFechar(false)}>Cancelar</Button>
              <Button type="submit" variant="destructive" disabled={saving}>Confirmar fechamento</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* === Modal Detalhe === */}
      <Dialog open={!!openDetalhe} onOpenChange={(o) => { if (!o) { setOpenDetalhe(null); setDetalheMovs([]); } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Sessão de caixa</DialogTitle>
            {openDetalhe && (
              <DialogDescription>
                {openDetalhe.user_nome || "—"} · {fmtDT(openDetalhe.aberto_em)} → {fmtDT(openDetalhe.fechado_em)}
              </DialogDescription>
            )}
          </DialogHeader>
          {openDetalhe && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div><span className="text-muted-foreground">Abertura:</span> <strong>{fmt(openDetalhe.valor_abertura)}</strong></div>
                <div><span className="text-muted-foreground">Calculado:</span> <strong>{fmt(openDetalhe.valor_fechamento_calculado)}</strong></div>
                <div><span className="text-muted-foreground">Informado:</span> <strong>{fmt(openDetalhe.valor_fechamento_informado)}</strong></div>
                <div><span className="text-muted-foreground">Diferença:</span> <strong>{fmt(openDetalhe.diferenca)}</strong></div>
              </div>
              <div className="max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hora</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Forma</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detalheMovs.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</TableCell>
                        <TableCell><Badge variant="outline">{TIPO_LABEL[m.tipo]}</Badge></TableCell>
                        <TableCell>{m.descricao || "—"}</TableCell>
                        <TableCell>{m.forma_pagamento || "—"}</TableCell>
                        <TableCell className={`text-right ${TIPO_SINAL[m.tipo] < 0 ? "text-rose-600" : TIPO_SINAL[m.tipo] > 0 ? "text-emerald-600" : ""}`}>
                          {TIPO_SINAL[m.tipo] < 0 ? "-" : ""}{fmt(m.valor)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
