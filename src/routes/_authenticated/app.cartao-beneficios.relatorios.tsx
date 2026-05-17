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
type Lanc = { id: string; tipo: string; valor: number; data: string };

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
      supabase.from("fin_lancamentos").select("id, tipo, valor, data").eq("clinica_id", cid).eq("tipo", "despesa").gte("data", from).lte("data", to).limit(5000),
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4"/>Período</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)}/></div>
          <div><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)}/></div>
          <Button variant="outline" onClick={exportarPlanos}><Download className="h-4 w-4 mr-2"/>Exportar planos (CSV)</Button>
        </CardContent>
      </Card>

      {loading ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI icon={<Users className="h-4 w-4"/>} label="Titulares" value={stats.titulares}/>
        <KPI icon={<UserPlus className="h-4 w-4"/>} label="Dependentes" value={stats.dependentesCount}/>
        <KPI icon={<Users className="h-4 w-4"/>} label="Total pessoas" value={stats.totalPessoas}/>
        <KPI icon={<Activity className="h-4 w-4"/>} label="Pagantes no período" value={stats.pagantes}/>
        <KPI icon={<TrendingUp className="h-4 w-4 text-green-600"/>} label="Receita (mensal. + adesão)" value={BRL(stats.receita)}/>
        <KPI icon={<TrendingUp className="h-4 w-4 text-orange-600"/>} label="A receber" value={BRL(stats.aReceber)}/>
        <KPI icon={<TrendingDown className="h-4 w-4 text-red-600"/>} label="Despesas (período)" value={BRL(stats.despesa)}/>
        <KPI icon={<Activity className="h-4 w-4"/>} label="Atendimentos usados" value={stats.usoTotal}/>
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
    </div>
  );
}

function KPI({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="text-xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}