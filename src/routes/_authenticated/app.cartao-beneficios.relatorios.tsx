import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, Download, Users, UserPlus, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { exportToExcel } from "@/lib/export-csv";

export const Route = createFileRoute("/_authenticated/app/cartao-beneficios/relatorios")({
  component: RelatoriosPage,
  head: () => ({ meta: [{ title: "Relatórios — Cartão Benefícios" }] }),
});

const BRL = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Contrato = { id: string; numero: number; paciente_id: string; paciente_nome: string; plano_id: string; valor_mensal: number; taxa_adesao: number; status: string; data_inicio: string; assinado_em: string | null };
type Plano = { id: string; nome: string; tipo: string; valor_mensal: number };
type Mens = { id: string; contrato_id: string; valor: number; status: string; pago_em: string | null; vencimento: string };
type Dep = { id: string; contrato_id: string; paciente_id: string; paciente_nome: string; tipo: string; ativo: boolean };
type Pac = { id: string; data_nascimento: string | null };
type Atend = { id: string; paciente_id: string | null; data: string };
type Lanc = { id: string; tipo: string; valor: number; data: string; descricao?: string | null };

function idade(dn: string | null): number | null {
  if (!dn) return null;
  const d = new Date(dn + "T00:00:00");
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

const faixas = [
  { min: 0, max: 12, label: "0-12" },
  { min: 13, max: 17, label: "13-17" },
  { min: 18, max: 29, label: "18-29" },
  { min: 30, max: 44, label: "30-44" },
  { min: 45, max: 59, label: "45-59" },
  { min: 60, max: 200, label: "60+" },
];

function RelatoriosPage() {
  const { clinicaAtual } = useClinica();
  const hoje = new Date().toISOString().slice(0, 10);
  const primeiroDoAno = `${new Date().getFullYear()}-01-01`;
  const [from, setFrom] = useState(primeiroDoAno);
  const [to, setTo] = useState(hoje);
  const [showCustom, setShowCustom] = useState(false);
  const [drill, setDrill] = useState<null | {
    title: string;
    columns: { key: string; label: string; align?: "left" | "right" }[];
    rows: Array<Record<string, string | number>>;
  }>(null);
  const [loading, setLoading] = useState(true);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [mens, setMens] = useState<Mens[]>([]);
  const [deps, setDeps] = useState<Dep[]>([]);
  const [pacs, setPacs] = useState<Map<string, Pac>>(new Map());
  const [atends, setAtends] = useState<Atend[]>([]);
  const [despesas, setDespesas] = useState<Lanc[]>([]);

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const cid = clinicaAtual.clinica_id;

    const [cs, ps, ds, ls] = await Promise.all([
      supabase.from("contratos_assinatura").select("id, numero, paciente_id, paciente_nome, plano_id, valor_mensal, taxa_adesao, status, data_inicio, assinado_em").eq("clinica_id", cid).gte("data_inicio", from).lte("data_inicio", to).limit(2000),
      supabase.from("planos_assinatura").select("id, nome, tipo, valor_mensal").eq("clinica_id", cid),
      // dependents and lancamentos parallel
      supabase.from("contrato_dependentes").select("id, contrato_id, paciente_id, paciente_nome, tipo, ativo").eq("ativo", true).limit(5000),
      supabase.from("fin_lancamentos").select("id, tipo, valor, data, descricao").eq("clinica_id", cid).eq("tipo", "despesa").gte("data", from).lte("data", to).limit(5000),
    ]);
    const cList = (cs.data ?? []) as Contrato[];
    const cIds = cList.map((c) => c.id);

    // Mensalidades para contratos do período
    const mensRes = cIds.length
      ? await supabase.from("contrato_mensalidades").select("id, contrato_id, valor, status, pago_em, vencimento").in("contrato_id", cIds).limit(20000)
      : { data: [] as Mens[] };

    // Coletar todos paciente_ids (titulares + deps)
    const depsFiltered = ((ds.data ?? []) as Dep[]).filter((d) => cIds.includes(d.contrato_id));
    const pacIds = Array.from(new Set([
      ...cList.map((c) => c.paciente_id).filter(Boolean),
      ...depsFiltered.map((d) => d.paciente_id).filter(Boolean),
    ]));

    const [pacsRes, atendsRes] = await Promise.all([
      pacIds.length
        ? supabase.from("pacientes").select("id, data_nascimento").in("id", pacIds)
        : Promise.resolve({ data: [] as Pac[] }),
      pacIds.length
        ? supabase.from("fin_atendimentos").select("id, paciente_id, data").eq("clinica_id", cid).in("paciente_id", pacIds).gte("data", from).lte("data", to).limit(20000)
        : Promise.resolve({ data: [] as Atend[] }),
    ]);

    const pacMap = new Map<string, Pac>();
    ((pacsRes.data ?? []) as Pac[]).forEach((p) => pacMap.set(p.id, p));

    setContratos(cList);
    setPlanos((ps.data ?? []) as Plano[]);
    setMens((mensRes.data ?? []) as Mens[]);
    setDeps(depsFiltered);
    setPacs(pacMap);
    setAtends((atendsRes.data ?? []) as Atend[]);
    setDespesas((ls.data ?? []) as Lanc[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clinicaAtual?.clinica_id, from, to]);

  const stats = useMemo(() => {
    const totalContratos = contratos.length;
    const ativos = contratos.filter((c) => c.status === "ativo").length;
    const titulares = new Set(contratos.map((c) => c.paciente_id)).size;
    const dependentesCount = deps.length;
    const totalPessoas = titulares + dependentesCount;

    // Pagantes: titulares com pelo menos uma mensalidade paga no período
    const contratosComPag = new Set(
      mens.filter((m) => m.status === "pago" && m.pago_em && m.pago_em >= from && m.pago_em <= to).map((m) => m.contrato_id),
    );
    const pagantes = contratos.filter((c) => contratosComPag.has(c.id)).length;

    const receitaMens = mens
      .filter((m) => m.status === "pago" && m.pago_em && m.pago_em >= from && m.pago_em <= to)
      .reduce((s, m) => s + Number(m.valor), 0);
    const receitaAdesao = contratos.reduce((s, c) => s + Number(c.taxa_adesao || 0), 0);
    const receita = receitaMens + receitaAdesao;
    const aReceber = mens.filter((m) => m.status !== "pago").reduce((s, m) => s + Number(m.valor), 0);
    const despesa = despesas.reduce((s, l) => s + Number(l.valor), 0);

    // Utilização: atendimentos por paciente vinculado
    const usoTotal = atends.length;
    const usoPorPac = new Map<string, number>();
    atends.forEach((a) => {
      if (!a.paciente_id) return;
      usoPorPac.set(a.paciente_id, (usoPorPac.get(a.paciente_id) ?? 0) + 1);
    });

    // Por plano
    const porPlano = planos.map((p) => {
      const cs = contratos.filter((c) => c.plano_id === p.id);
      const depsCount = deps.filter((d) => cs.find((c) => c.id === d.contrato_id)).length;
      const titularesCount = cs.length;
      return {
        plano: p.nome,
        tipo: p.tipo,
        contratos: titularesCount,
        pessoas: titularesCount + depsCount,
        receita: cs.reduce((s, c) => {
          const pago = mens.filter((m) => m.contrato_id === c.id && m.status === "pago" && m.pago_em && m.pago_em >= from && m.pago_em <= to).reduce((a, m) => a + Number(m.valor), 0);
          return s + pago + Number(c.taxa_adesao || 0);
        }, 0),
      };
    }).sort((a, b) => b.contratos - a.contratos);

    // Por idade
    const todasPessoas: { id: string; tipo: "titular" | "dependente" }[] = [
      ...contratos.map((c) => ({ id: c.paciente_id, tipo: "titular" as const })),
      ...deps.map((d) => ({ id: d.paciente_id, tipo: "dependente" as const })),
    ];
    const porIdade = faixas.map((f) => ({ faixa: f.label, count: 0 }));
    let semData = 0;
    todasPessoas.forEach((p) => {
      const pac = pacs.get(p.id);
      const a = idade(pac?.data_nascimento ?? null);
      if (a == null) { semData++; return; }
      const i = faixas.findIndex((f) => a >= f.min && a <= f.max);
      if (i >= 0) porIdade[i].count++;
    });

    // Top usuários (mais utilizaram)
    const pessoaNome = new Map<string, string>();
    contratos.forEach((c) => pessoaNome.set(c.paciente_id, c.paciente_nome));
    deps.forEach((d) => pessoaNome.set(d.paciente_id, d.paciente_nome));
    const topUso = Array.from(usoPorPac.entries())
      .map(([id, qtd]) => ({ nome: pessoaNome.get(id) ?? "—", qtd }))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 10);

    return {
      totalContratos, ativos, titulares, dependentesCount, totalPessoas, pagantes,
      receita, receitaMens, receitaAdesao, aReceber, despesa,
      usoTotal, porPlano, porIdade, semData, topUso,
    };
  }, [contratos, planos, mens, deps, pacs, atends, despesas, from, to]);

  const exportarPlanos = () => {
    exportToExcel(stats.porPlano, `cartao_beneficios_planos_${from}_${to}`, [
      { key: "plano", label: "Plano" }, { key: "tipo", label: "Tipo" },
      { key: "contratos", label: "Contratos" }, { key: "pessoas", label: "Pessoas" },
      { key: "receita", label: "Receita (R$)" },
    ]);
    toast.success("CSV gerado");
  };

  if (!clinicaAtual) return <p className="text-sm text-muted-foreground">Selecione uma clínica.</p>;

  const setQuick = (kind: "diario" | "semanal" | "quinzenal" | "mensal") => {
    const end = new Date();
    const start = new Date();
    if (kind === "diario") { /* mesmo dia */ }
    else if (kind === "semanal") start.setDate(end.getDate() - 6);
    else if (kind === "quinzenal") start.setDate(end.getDate() - 14);
    else if (kind === "mensal") start.setDate(end.getDate() - 29);
    setFrom(start.toISOString().slice(0, 10));
    setTo(end.toISOString().slice(0, 10));
  };

  const planoNome = new Map(planos.map((p) => [p.id, p.nome] as const));
  const pessoaNomeAll = new Map<string, string>();
  contratos.forEach((c) => pessoaNomeAll.set(c.paciente_id, c.paciente_nome));
  deps.forEach((d) => pessoaNomeAll.set(d.paciente_id, d.paciente_nome));

  const openDrill = (which: string) => {
    const fmtDate = (d: string) => d ? d.slice(0,10).split("-").reverse().join("/") : "—";
    if (which === "titulares") {
      setDrill({
        title: `Titulares (${contratos.length})`,
        columns: [{key:"nome",label:"Titular"},{key:"plano",label:"Plano"},{key:"status",label:"Status"},{key:"valor",label:"Mensal",align:"right"}],
        rows: contratos.map((c) => ({ nome: c.paciente_nome, plano: planoNome.get(c.plano_id) ?? "—", status: c.status, valor: BRL(c.valor_mensal) })),
      });
    } else if (which === "dependentes") {
      const tituPorContrato = new Map(contratos.map((c) => [c.id, c.paciente_nome] as const));
      setDrill({
        title: `Dependentes (${deps.length})`,
        columns: [{key:"nome",label:"Dependente"},{key:"titular",label:"Titular"},{key:"tipo",label:"Tipo"}],
        rows: deps.map((d) => ({ nome: d.paciente_nome, titular: tituPorContrato.get(d.contrato_id) ?? "—", tipo: d.tipo ?? "—" })),
      });
    } else if (which === "totalPessoas") {
      const tituPorContrato = new Map(contratos.map((c) => [c.id, c.paciente_nome] as const));
      const rows = [
        ...contratos.map((c) => ({ nome: c.paciente_nome, tipo: "Titular", vinculo: planoNome.get(c.plano_id) ?? "—" })),
        ...deps.map((d) => ({ nome: d.paciente_nome, tipo: "Dependente", vinculo: `Titular: ${tituPorContrato.get(d.contrato_id) ?? "—"}` })),
      ];
      setDrill({
        title: `Total de pessoas (${rows.length})`,
        columns: [{key:"nome",label:"Pessoa"},{key:"tipo",label:"Tipo"},{key:"vinculo",label:"Plano / Titular"}],
        rows,
      });
    } else if (which === "pagantes") {
      const contratosComPag = new Set(
        mens.filter((m) => m.status === "pago" && m.pago_em && m.pago_em >= from && m.pago_em <= to).map((m) => m.contrato_id),
      );
      const lista = contratos.filter((c) => contratosComPag.has(c.id));
      setDrill({
        title: `Pagantes no período (${lista.length})`,
        columns: [{key:"nome",label:"Titular"},{key:"plano",label:"Plano"},{key:"valor",label:"Mensal",align:"right"}],
        rows: lista.map((c) => ({ nome: c.paciente_nome, plano: planoNome.get(c.plano_id) ?? "—", valor: BRL(c.valor_mensal) })),
      });
    } else if (which === "receita") {
      const contratoNome = new Map(contratos.map((c) => [c.id, c.paciente_nome] as const));
      const pagas = mens.filter((m) => m.status === "pago" && m.pago_em && m.pago_em >= from && m.pago_em <= to);
      const rows = [
        ...pagas.map((m) => ({ data: fmtDate(m.pago_em ?? ""), descricao: `Mensalidade — ${contratoNome.get(m.contrato_id) ?? "—"}`, valor: BRL(m.valor) })),
        ...contratos.filter((c) => Number(c.taxa_adesao || 0) > 0).map((c) => ({ data: fmtDate(c.data_inicio), descricao: `Adesão — ${c.paciente_nome}`, valor: BRL(c.taxa_adesao) })),
      ];
      setDrill({
        title: `Receita do período (${rows.length})`,
        columns: [{key:"data",label:"Data"},{key:"descricao",label:"Descrição"},{key:"valor",label:"Valor",align:"right"}],
        rows,
      });
    } else if (which === "aReceber") {
      const contratoNome = new Map(contratos.map((c) => [c.id, c.paciente_nome] as const));
      const lista = mens.filter((m) => m.status !== "pago");
      setDrill({
        title: `A receber (${lista.length})`,
        columns: [{key:"venc",label:"Vencimento"},{key:"titular",label:"Titular"},{key:"status",label:"Status"},{key:"valor",label:"Valor",align:"right"}],
        rows: lista.map((m) => ({ venc: fmtDate(m.vencimento), titular: contratoNome.get(m.contrato_id) ?? "—", status: m.status, valor: BRL(m.valor) })),
      });
    } else if (which === "despesas") {
      setDrill({
        title: `Despesas do período (${despesas.length})`,
        columns: [{key:"data",label:"Data"},{key:"descricao",label:"Descrição"},{key:"valor",label:"Valor",align:"right"}],
        rows: despesas.map((l) => ({ data: fmtDate(l.data), descricao: l.descricao ?? "—", valor: BRL(l.valor) })),
      });
    } else if (which === "atendimentos") {
      setDrill({
        title: `Atendimentos usados (${atends.length})`,
        columns: [{key:"data",label:"Data"},{key:"paciente",label:"Paciente"}],
        rows: atends.map((a) => ({ data: fmtDate(a.data), paciente: a.paciente_id ? (pessoaNomeAll.get(a.paciente_id) ?? "—") : "—" })),
      });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4"/>Período</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div className="flex gap-1 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => { setShowCustom(false); setQuick("diario"); }}>Diário</Button>
            <Button size="sm" variant="outline" onClick={() => { setShowCustom(false); setQuick("semanal"); }}>Semanal</Button>
            <Button size="sm" variant="outline" onClick={() => { setShowCustom(false); setQuick("quinzenal"); }}>Quinzenal</Button>
            <Button size="sm" variant="outline" onClick={() => { setShowCustom(false); setQuick("mensal"); }}>Mensal</Button>
            <Button size="sm" variant={showCustom ? "default" : "outline"} onClick={() => setShowCustom((v) => !v)}>Personalizado</Button>
          </div>
          {showCustom && (
            <>
              <div><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)}/></div>
              <div><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)}/></div>
            </>
          )}
          <Button variant="outline" onClick={exportarPlanos}><Download className="h-4 w-4 mr-2"/>Exportar planos (CSV)</Button>
          <div className="text-xs text-muted-foreground ml-auto">
            Período: {from.split("-").reverse().join("/")} até {to.split("-").reverse().join("/")}
          </div>
        </CardContent>
      </Card>

      {loading ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI onClick={() => openDrill("titulares")} icon={<Users className="h-4 w-4"/>} label="Titulares" value={stats.titulares}/>
        <KPI onClick={() => openDrill("dependentes")} icon={<UserPlus className="h-4 w-4"/>} label="Dependentes" value={stats.dependentesCount}/>
        <KPI onClick={() => openDrill("totalPessoas")} icon={<Users className="h-4 w-4"/>} label="Total pessoas" value={stats.totalPessoas}/>
        <KPI onClick={() => openDrill("pagantes")} icon={<Activity className="h-4 w-4"/>} label="Pagantes no período" value={stats.pagantes}/>
        <KPI onClick={() => openDrill("receita")} icon={<TrendingUp className="h-4 w-4 text-green-600"/>} label="Receita (mensal. + adesão)" value={BRL(stats.receita)}/>
        <KPI onClick={() => openDrill("aReceber")} icon={<TrendingUp className="h-4 w-4 text-orange-600"/>} label="A receber" value={BRL(stats.aReceber)}/>
        <KPI onClick={() => openDrill("despesas")} icon={<TrendingDown className="h-4 w-4 text-red-600"/>} label="Despesas (período)" value={BRL(stats.despesa)}/>
        <KPI onClick={() => openDrill("atendimentos")} icon={<Activity className="h-4 w-4"/>} label="Atendimentos usados" value={stats.usoTotal}/>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Planos — mais vendem</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Plano</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Contratos</TableHead><TableHead className="text-right">Pessoas (tit+dep)</TableHead><TableHead className="text-right">Receita</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {stats.porPlano.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">Sem dados.</TableCell></TableRow> : null}
              {stats.porPlano.map((p) => (
                <TableRow key={p.plano}>
                  <TableCell className="font-medium">{p.plano}</TableCell>
                  <TableCell><Badge variant="outline">{p.tipo}</Badge></TableCell>
                  <TableCell className="text-right">{p.contratos}</TableCell>
                  <TableCell className="text-right">{p.pessoas}</TableCell>
                  <TableCell className="text-right">{BRL(p.receita)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Distribuição por idade</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {stats.porIdade.map((f) => {
              const max = Math.max(1, ...stats.porIdade.map((x) => x.count));
              const pct = (f.count / max) * 100;
              return (
                <div key={f.faixa} className="space-y-1">
                  <div className="flex justify-between text-sm"><span>{f.faixa} anos</span><span className="font-semibold">{f.count}</span></div>
                  <div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }}/></div>
                </div>
              );
            })}
            {stats.semData > 0 ? <p className="text-xs text-muted-foreground">{stats.semData} pessoa(s) sem data de nascimento.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top 10 — quem mais utilizou</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Pessoa</TableHead><TableHead className="text-right">Atendimentos</TableHead></TableRow></TableHeader>
              <TableBody>
                {stats.topUso.length === 0 ? <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-4">Nenhuma utilização no período.</TableCell></TableRow> : null}
                {stats.topUso.map((u, i) => (
                  <TableRow key={i}><TableCell>{u.nome}</TableCell><TableCell className="text-right font-semibold">{u.qtd}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={drill !== null} onOpenChange={(o) => { if (!o) setDrill(null); }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle>{drill?.title}</DialogTitle></DialogHeader>
          <div className="overflow-auto flex-1">
            {drill && drill.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhum registro.</p>
            ) : drill ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    {drill.columns.map((c) => (
                      <TableHead key={c.key} className={c.align === "right" ? "text-right" : ""}>{c.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drill.rows.map((r, i) => (
                    <TableRow key={i}>
                      {drill.columns.map((c) => (
                        <TableCell key={c.key} className={c.align === "right" ? "text-right" : ""}>{r[c.key]}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KPI({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value: string | number; onClick?: () => void }) {
  return (
    <Card onClick={onClick} className={onClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="text-xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}