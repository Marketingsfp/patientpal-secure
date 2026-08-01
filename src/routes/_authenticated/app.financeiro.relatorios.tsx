import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileBarChart, Download } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/financeiro/relatorios")({
  component: Page,
  head: () => ({ meta: [{ title: "Relatórios — Financeiro" }] }),
});

function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}
function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

async function fetchAll(builder: () => any): Promise<Record<string, unknown>[]> {
  const PAGE = 1000;
  let offset = 0;
  const all: Record<string, unknown>[] = [];
  while (true) {
    const { data, error } = await builder().range(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as Record<string, unknown>[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

function Page() {
  const { clinicaAtual } = useClinica();
  const [tipo, setTipo] = useState<"lancamentos" | "atendimentos" | "notas">("lancamentos");
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  const gerar = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    let data: Record<string, unknown>[] = [];
    try {
      if (tipo === "lancamentos") {
        data = await fetchAll(() => supabase.from("fin_lancamentos")
          .select("data, tipo, descricao, valor, status, forma_pagamento")
          .eq("clinica_id", clinicaAtual.clinica_id).gte("data", from).lte("data", to).order("data"));
      } else if (tipo === "atendimentos") {
        data = await fetchAll(() => supabase.from("fin_atendimentos")
          .select("data, procedimento, valor_total, valor_medico, valor_clinica, status, forma_pagamento")
          .eq("clinica_id", clinicaAtual.clinica_id).gte("data", from).lte("data", to).order("data"));
      } else {
        data = await fetchAll(() => supabase.from("fin_notas_pacientes")
          .select("data_emissao, numero, serie, valor, status")
          .eq("clinica_id", clinicaAtual.clinica_id).gte("data_emissao", from).lte("data_emissao", to).order("data_emissao"));
      }
    } catch (e: any) {
      setLoading(false);
      mostrarErro(e);
      return;
    }
    setLoading(false);
    if (!data || data.length === 0) { toast.info("Nenhum dado no período"); return; }
    download(`relatorio_${tipo}_${from}_${to}.csv`, toCsv(data));
    toast.success(`Relatório gerado (${data.length} linhas)`);
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold flex items-center gap-2"><FileBarChart className="h-6 w-6 text-primary" />Relatórios</h1>
        <p className="text-sm text-muted-foreground">Exporte dados em CSV para análise externa</p></div>
      <Card>
        <CardHeader><CardTitle>Gerar relatório</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2"><Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lancamentos">Lançamentos</SelectItem>
                  <SelectItem value="atendimentos">Atendimentos</SelectItem>
                  <SelectItem value="notas">Notas</SelectItem>
                </SelectContent>
              </Select></div>
            <div className="space-y-2"><Label>De</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="space-y-2"><Label>Até</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
          <Button onClick={gerar} disabled={loading || !clinicaAtual}>
            <Download className="h-4 w-4 mr-2" />{loading ? "Gerando..." : "Baixar CSV"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
