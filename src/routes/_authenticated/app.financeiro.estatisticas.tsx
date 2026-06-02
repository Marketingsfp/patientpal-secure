import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PieChart as PieIcon, TrendingUp, TrendingDown, Wallet, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/app/financeiro/estatisticas")({
  component: Page,
  head: () => ({ meta: [{ title: "Estatísticas — Financeiro" }] }),
});

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Page() {
  const { clinicaAtual } = useClinica();
  const [stats, setStats] = useState({ receita: 0, despesa: 0, atendimentos: 0, notas: 0, pendentes: 0, ticket: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!clinicaAtual) return;
      setLoading(true);
      const ini = new Date(); ini.setDate(1);
      const since = ini.toISOString().slice(0, 10);
      const hoje = new Date().toISOString().slice(0, 10);
      const [resumoRes, atend, notas] = await Promise.all([
        supabase.rpc("fin_resumo_periodo", { p_clinica: clinicaAtual.clinica_id, p_ini: since, p_fim: hoje }),
        supabase.from("fin_atendimentos").select("valor_total").eq("clinica_id", clinicaAtual.clinica_id).gte("data", since),
        supabase.from("fin_notas_pacientes").select("id", { count: "exact", head: true }).eq("clinica_id", clinicaAtual.clinica_id).gte("data_emissao", since),
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
      setLoading(false);
    })();
  }, [clinicaAtual?.clinica_id]);

  const Stat = ({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof PieIcon; color: string }) => (
    <Card><CardContent className="pt-6">
      <div className="flex items-start justify-between">
        <div><p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold mt-1">{loading ? "..." : value}</p></div>
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${color}`}><Icon className="h-5 w-5" /></div>
      </div>
    </CardContent></Card>
  );

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold flex items-center gap-2"><PieIcon className="h-6 w-6 text-primary" />Estatísticas</h1>
        <p className="text-sm text-muted-foreground">Resumo do mês atual</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Stat label="Receitas" value={fmt(stats.receita)} icon={TrendingUp} color="bg-green-500/10 text-green-600" />
        <Stat label="Despesas" value={fmt(stats.despesa)} icon={TrendingDown} color="bg-red-500/10 text-red-600" />
        <Stat label="Saldo" value={fmt(stats.receita - stats.despesa)} icon={Wallet} color="bg-primary/10 text-primary" />
        <Stat label="Atendimentos" value={String(stats.atendimentos)} icon={TrendingUp} color="bg-blue-500/10 text-blue-600" />
        <Stat label="Notas emitidas" value={String(stats.notas)} icon={FileText} color="bg-purple-500/10 text-purple-600" />
        <Stat label="Ticket médio" value={fmt(stats.ticket)} icon={TrendingUp} color="bg-amber-500/10 text-amber-600" />
        <Stat label="Pendentes" value={fmt(stats.pendentes)} icon={TrendingDown} color="bg-orange-500/10 text-orange-600" />
      </div>
    </div>
  );
}
