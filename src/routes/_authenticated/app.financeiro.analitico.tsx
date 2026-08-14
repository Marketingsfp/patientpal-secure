import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LineChart as LineIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MiniPieChart } from "@/components/charts/MiniPieChart";
import { MiniLineChart } from "@/components/charts/MiniLineChart";

export const Route = createFileRoute("/_authenticated/app/financeiro/analitico")({
  component: Page,
  head: () => ({ meta: [{ title: "Analítico — Financeiro" }] }),
});

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
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const ini = since.toISOString().slice(0, 10);
      const fim = new Date().toISOString().slice(0, 10);
      const [serieRes, catRes, cats] = await Promise.all([
        supabase.rpc("fin_serie_diaria", {
          p_clinica: clinicaAtual.clinica_id,
          p_ini: ini,
          p_fim: fim,
          p_status: "confirmado",
        }),
        supabase.rpc("fin_resumo_categoria", {
          p_clinica: clinicaAtual.clinica_id,
          p_ini: ini,
          p_fim: fim,
          p_status: "confirmado",
        }),
        supabase
          .from("fin_categorias")
          .select("id, nome")
          .eq("clinica_id", clinicaAtual.clinica_id),
      ]);
      const catMap = new Map((cats.data ?? []).map((c) => [c.id as string, c.nome as string]));
      const map: Record<string, number> = {};
      const dayMap: Record<string, number> = {};
      for (const row of (catRes.data ?? []) as Array<{
        categoria_id: string | null;
        tipo: string;
        total: number;
      }>) {
        if (row.tipo !== "despesa") continue;
        const k = row.categoria_id
          ? (catMap.get(row.categoria_id) ?? "Sem categoria")
          : "Sem categoria";
        map[k] = (map[k] ?? 0) + Number(row.total);
      }
      for (const row of (serieRes.data ?? []) as Array<{
        data: string;
        tipo: string;
        total: number;
      }>) {
        const v = Number(row.total) || 0;
        dayMap[row.data] = (dayMap[row.data] ?? 0) + (row.tipo === "receita" ? v : -v);
      }
      setByCat(
        Object.entries(map)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 8),
      );
      setDaily(
        Object.entries(dayMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([d, v]) => ({
            dia: new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
            Saldo: +v.toFixed(2),
          })),
      );
      setLoading(false);
    })();
  }, [clinicaAtual?.clinica_id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <LineIcon className="h-6 w-6 text-primary" />
          Analítico
        </h1>
        <p className="text-sm text-muted-foreground">Últimos 30 dias</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Despesas por categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-muted-foreground">Carregando...</div>
            ) : byCat.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">Sem dados</div>
            ) : (
              <MiniPieChart data={byCat} height={300} formatValue={fmt} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Saldo diário</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-muted-foreground">Carregando...</div>
            ) : (
              <MiniLineChart
                labels={daily.map((d) => d.dia)}
                values={daily.map((d) => d.Saldo)}
                height={300}
                formatY={fmt}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
