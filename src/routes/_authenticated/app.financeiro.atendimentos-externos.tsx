import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { toast } from "sonner";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2 } from "lucide-react";

type Row = {
  id: string;
  inicio: string;
  paciente_nome: string | null;
  procedimento: string | null;
  origem_clinica_nome: string | null;
  origem_valor: number | null;
  medico: { nome: string | null } | null;
};

export const Route = createFileRoute("/_authenticated/app/financeiro/atendimentos-externos")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Atendimentos externos · ClinicOS" },
      { name: "description", content: "Relatório de atendimentos faturados em outras clínicas parceiras." },
    ],
  }),
});

function Page() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const [de, setDe] = useState<string>(() => format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"));
  const [ate, setAte] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = async () => {
    if (!clinicaId) return;
    setLoading(true);
    const inicioIso = new Date(`${de}T00:00:00`).toISOString();
    const fimIso = new Date(`${ate}T23:59:59`).toISOString();
    const { data, error } = await supabase
      .from("agendamentos")
      .select("id,inicio,paciente_nome,procedimento,origem_clinica_nome,origem_valor,medico:medicos(nome)")
      .eq("clinica_id", clinicaId)
      .eq("origem_externa", true)
      .gte("inicio", inicioIso)
      .lte("inicio", fimIso)
      .order("inicio", { ascending: false });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as unknown as Row[]);
  };

  useEffect(() => { void carregar(); }, [clinicaId, de, ate]);

  const totais = useMemo(() => {
    const total = rows.reduce((acc, r) => acc + Number(r.origem_valor ?? 0), 0);
    const porClinica = new Map<string, { qtd: number; total: number }>();
    rows.forEach((r) => {
      const k = r.origem_clinica_nome?.trim() || "(sem clínica)";
      const cur = porClinica.get(k) ?? { qtd: 0, total: 0 };
      cur.qtd += 1;
      cur.total += Number(r.origem_valor ?? 0);
      porClinica.set(k, cur);
    });
    return { qtd: rows.length, total, porClinica: [...porClinica.entries()] };
  }, [rows]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-orange-600" />
        <h1 className="text-xl font-semibold">Atendimentos externos</h1>
      </div>
      <p className="text-sm text-slate-600">
        Pacientes atendidos aqui mas faturados em outra clínica. Não geram caixa —
        alimentam o repasse do médico local e o acerto entre clínicas.
      </p>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <Label>De</Label>
            <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label>Até</Label>
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="w-40" />
          </div>
          <Button onClick={carregar} disabled={loading}>{loading ? "Carregando…" : "Atualizar"}</Button>
          <div className="ml-auto text-sm text-slate-600">
            <b>{totais.qtd}</b> atendimentos · Total origem <b>R$ {totais.total.toFixed(2)}</b>
          </div>
        </CardContent>
      </Card>

      {totais.porClinica.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Acerto por clínica</div>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {totais.porClinica.map(([nome, v]) => (
                <div key={nome} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="font-medium">{nome}</span>
                  <span className="tabular-nums text-slate-700">{v.qtd} · R$ {v.total.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Médico</TableHead>
                <TableHead>Procedimento</TableHead>
                <TableHead>Clínica origem</TableHead>
                <TableHead className="text-right">Valor origem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-slate-500 py-8">Nenhum atendimento externo no período.</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="tabular-nums">{format(new Date(r.inicio), "dd/MM/yyyy HH:mm")}</TableCell>
                  <TableCell>{r.paciente_nome}</TableCell>
                  <TableCell>{r.medico?.nome ?? "—"}</TableCell>
                  <TableCell>{r.procedimento ?? "—"}</TableCell>
                  <TableCell>{r.origem_clinica_nome ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.origem_valor != null ? `R$ ${Number(r.origem_valor).toFixed(2)}` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
