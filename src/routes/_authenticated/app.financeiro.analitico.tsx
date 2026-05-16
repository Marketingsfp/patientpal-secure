import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LineChart as LineIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/app/financeiro/analitico")({
  component: Page,
  head: () => ({ meta: [{ title: "Analítico — Financeiro" }] }),
});

const COLORS = ["#13b5a3", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#10b981", "#ec4899", "#6366f1"];
const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Page() {
  const { clinicaAtual } = useClinica();
  const [byCat, setByCat] = useState<{ name: string; value: number }[]>([]);
  const [daily, setDaily] = useState<{ dia: string; Saldo: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!clinicaAtual) return;
      setLoading(true);
      const since = new Date(); since.setDate(since.getDate() - 30);
      const [lancs, cats] = await Promise.all([
        supabase.from("fin_lancamentos").select("tipo, valor, data, categoria_id")
          .eq("clinica_id", clinicaAtual.clinica_id).gte("data", since.toISOString().slice(0, 10)).neq("status", "cancelado"),
        supabase.from("fin_categorias").select("id, nome").eq("clinica_id", clinicaAtual.clinica_id),
      ]);
      const catMap = new Map((cats.data ?? []).map((c) => [c.id as string, c.nome as string]));
      const map: Record<string, number> = {};
      const dayMap: Record<string, number> = {};
      (lancs.data ?? []).forEach((r) => {
        if (r.tipo === "despesa") {
          const k = r.categoria_id ? catMap.get(r.categoria_id as string) ?? "Sem categoria" : "Sem categoria";
          map[k] = (map[k] ?? 0) + Number(r.valor);
        }
        const k = r.data as string;
        dayMap[k] = (dayMap[k] ?? 0) + (r.tipo === "receita" ? Number(r.valor) : -Number(r.valor));
      });
      setByCat(Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8));
      setDaily(Object.entries(dayMap).sort(([a], [b]) => a.localeCompare(b))
        .map(([d, v]) => ({ dia: new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), Saldo: +v.toFixed(2) })));
      setLoading(false);
    })();
  }, [clinicaAtual?.clinica_id]);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold flex items-center gap-2"><LineIcon className="h-6 w-6 text-primary" />Analítico</h1>
        <p className="text-sm text-muted-foreground">Últimos 30 dias</p></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle>Despesas por categoria</CardTitle></CardHeader>
          <CardContent>
            {loading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div>
              : byCat.length === 0 ? <div className="py-12 text-center text-muted-foreground">Sem dados</div>
              : <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={byCat} dataKey="value" nameKey="name" outerRadius={100} label={(e: { name: string }) => e.name}>
                    {byCat.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>}
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle>Saldo diário</CardTitle></CardHeader>
          <CardContent>
            {loading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div>
              : <ResponsiveContainer width="100%" height={300}>
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="dia" /><YAxis />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Line type="monotone" dataKey="Saldo" stroke="#13b5a3" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
