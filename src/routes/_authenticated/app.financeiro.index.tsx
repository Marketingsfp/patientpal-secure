import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Minus, TrendingUp, TrendingDown, Wallet, Users, Calendar, Activity, Stethoscope } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { brl, rangeFromPeriodo, type Periodo } from "@/lib/financeiro/format";
import { LancamentoDialog } from "@/components/financeiro/lancamento-dialog";

export const Route = createFileRoute("/_authenticated/app/financeiro/")({
  component: FinDashboard,
});

function FinDashboard() {
  const { clinicaAtual } = useClinica();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [stats, setStats] = useState({ receitas: 0, despesas: 0, atendimentos: 0, repasse: 0 });
  const [open, setOpen] = useState<null | "receita" | "despesa">(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!clinicaAtual) return;
    const { from, to } = rangeFromPeriodo(periodo);
    (async () => {
      const [resumoRes, { data: at }] = await Promise.all([
        supabase.rpc("fin_resumo_periodo", { p_clinica: clinicaAtual.clinica_id, p_ini: from, p_fim: to }),
        supabase.from("fin_atendimentos").select("valor_total, valor_medico")
          .eq("clinica_id", clinicaAtual.clinica_id).gte("data", from).lte("data", to),
      ]);
      let receitas = 0, despesas = 0;
      for (const row of ((resumoRes.data ?? []) as Array<{ tipo: string; status: string; total: number }>)) {
        if (row.status !== "confirmado") continue;
        if (row.tipo === "receita") receitas += Number(row.total) || 0;
        else if (row.tipo === "despesa") despesas += Number(row.total) || 0;
      }
      const repasse = (at ?? []).reduce((s, a) => s + Number(a.valor_medico ?? 0), 0);
      setStats({ receitas, despesas, atendimentos: at?.length ?? 0, repasse });
    })();
  }, [clinicaAtual, periodo, reload]);

  const saldo = stats.receitas - stats.despesas;
  const media = stats.atendimentos > 0 ? stats.receitas / stats.atendimentos : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Financeiro — {clinicaAtual?.clinica.nome}</h1>
          <p className="text-sm text-muted-foreground">Visão geral do período</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setOpen("receita")} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-1" /> Receita
          </Button>
          <Button onClick={() => setOpen("despesa")} variant="destructive">
            <Minus className="h-4 w-4 mr-1" /> Despesa
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        {(["hoje","semana","mes"] as Periodo[]).map((p) => (
          <Button key={p} size="sm" variant={periodo === p ? "default" : "outline"} onClick={() => setPeriodo(p)}>
            {p === "hoje" ? "Hoje" : p === "semana" ? "Semana" : "Mês"}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard icon={Wallet} label="Saldo do período" value={brl(saldo)} accent={saldo >= 0 ? "primary" : "destructive"} />
        <KpiCard icon={TrendingUp} label="Receitas" value={brl(stats.receitas)} accent="success" />
        <KpiCard icon={TrendingDown} label="Despesas" value={brl(stats.despesas)} accent="destructive" />
        <KpiCard icon={Users} label="Atendimentos" value={String(stats.atendimentos)} accent="primary" />
        <KpiCard icon={Calendar} label="Ticket médio" value={brl(media)} accent="primary" />
        <KpiCard icon={Stethoscope} label="Repasse médicos" value={brl(stats.repasse)} accent="warning" />
      </div>

      <LancamentoDialog open={open !== null} onOpenChange={(v) => !v && setOpen(null)} tipo={open ?? "receita"} onSaved={() => setReload(r => r+1)} />
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string; accent: "primary"|"success"|"destructive"|"warning"; }) {
  const colorMap = { primary: "text-primary bg-primary/10", success: "text-success bg-success/10", destructive: "text-destructive bg-destructive/10", warning: "text-warning bg-warning/10" };
  return (
    <Card>
      <CardContent className="pt-6 flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${colorMap[accent]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
