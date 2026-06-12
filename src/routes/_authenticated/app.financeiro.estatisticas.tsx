import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PieChart as PieIcon, TrendingUp, TrendingDown, Wallet, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/financeiro/estatisticas")({
  component: Page,
  head: () => ({ meta: [{ title: "Estatísticas — Financeiro" }] }),
});

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Page() {
  const { clinicaAtual } = useClinica();
  const [stats, setStats] = useState({ receita: 0, despesa: 0, atendimentos: 0, notas: 0, pendentes: 0, ticket: 0 });
  const [loading, setLoading] = useState(true);
  const [lancs, setLancs] = useState<Array<{ id: string; tipo: string; descricao: string; valor: number; data: string; status: string }>>([]);
  const [atends, setAtends] = useState<Array<{ id: string; data: string; procedimento: string | null; valor_total: number; status: string }>>([]);
  const [notasList, setNotasList] = useState<Array<{ id: string; numero: number | null; serie: string | null; data_emissao: string; valor: number; status: string }>>([]);
  const [drill, setDrill] = useState<null | "receita" | "despesa" | "saldo" | "atendimentos" | "notas" | "ticket" | "pendentes">(null);

  useEffect(() => {
    (async () => {
      if (!clinicaAtual) return;
      setLoading(true);
      const ini = new Date(); ini.setDate(1);
      const since = ini.toISOString().slice(0, 10);
      const hoje = new Date().toISOString().slice(0, 10);
      const [resumoRes, atend, notas, lancRes, notasFull] = await Promise.all([
        supabase.rpc("fin_resumo_periodo", { p_clinica: clinicaAtual.clinica_id, p_ini: since, p_fim: hoje }),
        supabase.from("fin_atendimentos").select("id, data, procedimento, valor_total, status").eq("clinica_id", clinicaAtual.clinica_id).gte("data", since).order("data", { ascending: false }).limit(2000),
        supabase.from("fin_notas_pacientes").select("id", { count: "exact", head: true }).eq("clinica_id", clinicaAtual.clinica_id).gte("data_emissao", since),
        supabase.from("fin_lancamentos").select("id, tipo, descricao, valor, data, status").eq("clinica_id", clinicaAtual.clinica_id).gte("data", since).lte("data", hoje).order("data", { ascending: false }).limit(3000),
        supabase.from("fin_notas_pacientes").select("id, numero, serie, data_emissao, valor, status").eq("clinica_id", clinicaAtual.clinica_id).gte("data_emissao", since).order("data_emissao", { ascending: false }).limit(1000),
      ]);
      let r = 0, d = 0, p = 0;
      for (const row of ((resumoRes.data ?? []) as Array<{ tipo: string; status: string; total: number }>)) {
        const v = Number(row.total) || 0;
        if (row.status === "pendente") p += v;
        else if (row.status !== "cancelado") {
          if (row.tipo === "receita") r += v; else if (row.tipo === "despesa") d += v;
        }
      }
      const totA = (atend.data ?? []).reduce((s, a) => s + Number(a.valor_total), 0);
      const cntA = (atend.data ?? []).length;
      setStats({
        receita: r, despesa: d, atendimentos: cntA, notas: notas.count ?? 0,
        pendentes: p, ticket: cntA > 0 ? totA / cntA : 0,
      });
      setAtends((atend.data ?? []) as typeof atends);
      setLancs((lancRes.data ?? []) as typeof lancs);
      setNotasList((notasFull.data ?? []) as typeof notasList);
      setLoading(false);
    })();
  }, [clinicaAtual?.clinica_id]);

  const Stat = ({ label, value, icon: Icon, color, onClick }: { label: string; value: string; icon: typeof PieIcon; color: string; onClick?: () => void }) => (
    <Card onClick={onClick} className={onClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}><CardContent className="pt-6">
      <div className="flex items-start justify-between">
        <div><p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold mt-1">{loading ? "..." : value}</p></div>
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${color}`}><Icon className="h-5 w-5" /></div>
      </div>
    </CardContent></Card>
  );

  const fmtDt = (s: string) => new Date(s).toLocaleDateString("pt-BR");

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold flex items-center gap-2"><PieIcon className="h-6 w-6 text-primary" />Estatísticas</h1>
        <p className="text-sm text-muted-foreground">Resumo do mês atual</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Stat onClick={() => setDrill("receita")} label="Receitas" value={fmt(stats.receita)} icon={TrendingUp} color="bg-green-500/10 text-green-600" />
        <Stat onClick={() => setDrill("despesa")} label="Despesas" value={fmt(stats.despesa)} icon={TrendingDown} color="bg-red-500/10 text-red-600" />
        <Stat onClick={() => setDrill("saldo")} label="Saldo" value={fmt(stats.receita - stats.despesa)} icon={Wallet} color="bg-primary/10 text-primary" />
        <Stat onClick={() => setDrill("atendimentos")} label="Atendimentos" value={String(stats.atendimentos)} icon={TrendingUp} color="bg-blue-500/10 text-blue-600" />
        <Stat onClick={() => setDrill("notas")} label="Notas emitidas" value={String(stats.notas)} icon={FileText} color="bg-purple-500/10 text-purple-600" />
        <Stat onClick={() => setDrill("ticket")} label="Ticket médio" value={fmt(stats.ticket)} icon={TrendingUp} color="bg-amber-500/10 text-amber-600" />
        <Stat onClick={() => setDrill("pendentes")} label="Pendentes" value={fmt(stats.pendentes)} icon={TrendingDown} color="bg-orange-500/10 text-orange-600" />
      </div>

      <Dialog open={drill !== null} onOpenChange={(o) => { if (!o) setDrill(null); }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {drill === "receita" && `Receitas — ${fmt(stats.receita)}`}
              {drill === "despesa" && `Despesas — ${fmt(stats.despesa)}`}
              {drill === "saldo" && `Saldo — ${fmt(stats.receita - stats.despesa)}`}
              {drill === "atendimentos" && `Atendimentos — ${stats.atendimentos}`}
              {drill === "ticket" && `Ticket médio — ${fmt(stats.ticket)}`}
              {drill === "notas" && `Notas emitidas — ${stats.notas}`}
              {drill === "pendentes" && `Pendentes — ${fmt(stats.pendentes)}`}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto flex-1">
            {(drill === "receita" || drill === "despesa" || drill === "saldo" || drill === "pendentes") ? (() => {
              const lista = lancs.filter(l => {
                if (drill === "pendentes") return l.status === "pendente";
                if (l.status === "cancelado") return false;
                if (drill === "saldo") return l.status !== "pendente";
                return l.status !== "pendente" && l.tipo === (drill === "receita" ? "receita" : "despesa");
              });
              if (lista.length === 0) return <p className="text-sm text-muted-foreground py-6 text-center">Sem lançamentos.</p>;
              return (
                <Table>
                  <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Descrição</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
                  <TableBody>{lista.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap">{fmtDt(l.data)}</TableCell>
                      <TableCell className="capitalize">{l.tipo}</TableCell>
                      <TableCell>{l.descricao}</TableCell>
                      <TableCell>{l.status}</TableCell>
                      <TableCell className={`text-right font-medium ${l.tipo === "receita" ? "text-green-600" : "text-red-600"}`}>{fmt(Number(l.valor))}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              );
            })() : (drill === "atendimentos" || drill === "ticket") ? (() => {
              if (atends.length === 0) return <p className="text-sm text-muted-foreground py-6 text-center">Sem atendimentos.</p>;
              return (
                <Table>
                  <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Procedimento</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
                  <TableBody>{atends.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap">{fmtDt(a.data)}</TableCell>
                      <TableCell>{a.procedimento ?? "—"}</TableCell>
                      <TableCell>{a.status}</TableCell>
                      <TableCell className="text-right">{fmt(Number(a.valor_total))}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              );
            })() : drill === "notas" ? (() => {
              if (notasList.length === 0) return <p className="text-sm text-muted-foreground py-6 text-center">Sem notas emitidas.</p>;
              return (
                <Table>
                  <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Número</TableHead><TableHead>Série</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
                  <TableBody>{notasList.map(n => (
                    <TableRow key={n.id}>
                      <TableCell className="whitespace-nowrap">{fmtDt(n.data_emissao)}</TableCell>
                      <TableCell>{n.numero ?? "—"}</TableCell>
                      <TableCell>{n.serie ?? "—"}</TableCell>
                      <TableCell>{n.status}</TableCell>
                      <TableCell className="text-right">{fmt(Number(n.valor))}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              );
            })() : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
