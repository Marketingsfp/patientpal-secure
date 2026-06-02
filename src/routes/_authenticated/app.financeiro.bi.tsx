import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MiniBarChart } from "@/components/charts/MiniBarChart";

export const Route = createFileRoute("/_authenticated/app/financeiro/bi")({
  component: Page,
  head: () => ({ meta: [{ title: "BI — Financeiro" }] }),
});

interface Row { mes: string; Receitas: number; Despesas: number }
const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Page() {
  const { clinicaAtual } = useClinica();
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!clinicaAtual) { setData([]); setLoading(false); return; }
      setLoading(true);
      const since = new Date(); since.setMonth(since.getMonth() - 5); since.setDate(1);
      const ini = since.toISOString().slice(0, 10);
      const fim = new Date().toISOString().slice(0, 10);
      const { data: rows } = await supabase.rpc("fin_serie_diaria", {
        p_clinica: clinicaAtual.clinica_id, p_ini: ini, p_fim: fim, p_status: "confirmado",
      });
      const buckets: Record<string, Row> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i); d.setDate(1);
        const key = d.toISOString().slice(0, 7);
        buckets[key] = { mes: d.toLocaleDateString("pt-BR", { month: "short" }), Receitas: 0, Despesas: 0 };
      }
      ((rows ?? []) as Array<{ data: string; tipo: string; total: number }>).forEach((r) => {
        const key = r.data.slice(0, 7);
        const b = buckets[key]; if (!b) return;
        if (r.tipo === "receita") b.Receitas += Number(r.total); else if (r.tipo === "despesa") b.Despesas += Number(r.total);
      });
      setData(Object.values(buckets));
      setLoading(false);
    })();
  }, [clinicaAtual?.clinica_id]);

  const totalR = data.reduce((s, r) => s + r.Receitas, 0);
  const totalD = data.reduce((s, r) => s + r.Despesas, 0);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold flex items-center gap-2"><BarChart3 className="h-6 w-6 text-primary" />BI Financeiro</h1>
        <p className="text-sm text-muted-foreground">Comparativo dos últimos 6 meses</p></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Receitas (6m)</p><p className="text-2xl font-semibold text-green-600">{fmt(totalR)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Despesas (6m)</p><p className="text-2xl font-semibold text-red-600">{fmt(totalD)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Saldo (6m)</p><p className={`text-2xl font-semibold ${totalR - totalD >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(totalR - totalD)}</p></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Receitas vs Despesas</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div>
            : <MiniBarChart
                labels={data.map((r) => r.mes)}
                series={[
                  { name: "Receitas", color: "#10b981", values: data.map((r) => r.Receitas) },
                  { name: "Despesas", color: "#ef4444", values: data.map((r) => r.Despesas) },
                ]}
                height={320}
                formatY={fmt}
              />}
        </CardContent>
      </Card>
    </div>
  );
}
