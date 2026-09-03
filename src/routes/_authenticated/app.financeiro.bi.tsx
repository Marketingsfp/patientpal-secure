import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, Fragment } from "react";
import { BarChart3, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MiniBarChart } from "@/components/charts/MiniBarChart";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DateRangeFilter,
  computeRange,
  type DateRange,
  type DatePreset,
} from "@/components/date-range-filter";
import { dataBR } from "@/lib/financeiro/preset-periodo";
import {
  agruparSerie,
  granularidadeDoIntervalo,
  totaisDaSerie,
  type LinhaSerieDiaria,
  type PontoSerie,
} from "@/lib/financeiro/bi-serie";

export const Route = createFileRoute("/_authenticated/app/financeiro/bi")({
  component: Page,
  head: () => ({ meta: [{ title: "BI — Financeiro" }] }),
});

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MESES_PT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

function Page() {
  const { clinicaAtual } = useClinica();
  // O período parte do mês corrente, como nas telas de Estatísticas e
  // Relatórios, para a equipe não ter que reaprender o filtro em cada aba.
  const [preset, setPreset] = useState<DatePreset>("mes");
  const [range, setRange] = useState<DateRange>(() => computeRange("mes"));
  const [data, setData] = useState<PontoSerie[]>([]);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<null | "receitas" | "despesas" | "saldo">(null);
  const [atend12, setAtend12] = useState<
    Array<{ label: string; cartao: number; particular: number; exames: number }>
  >([]);
  const [atendMatriz, setAtendMatriz] = useState<{
    anos: number[];
    linhas: Array<{
      mesIdx: number;
      porAno: Record<number, { cartao: number; particular: number; exames: number; total: number }>;
    }>;
    totalPorAno: Record<
      number,
      { cartao: number; particular: number; exames: number; total: number }
    >;
    totalGeral: number;
  }>({ anos: [], linhas: [], totalPorAno: {}, totalGeral: 0 });
  const [atendDrill, setAtendDrill] = useState(false);

  useEffect(() => {
    (async () => {
      if (!clinicaAtual) {
        setData([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data: rows } = await supabase.rpc("fin_serie_diaria", {
        p_clinica: clinicaAtual.clinica_id,
        p_ini: range.from,
        p_fim: range.to,
        p_status: "confirmado",
      });
      setData(agruparSerie(rows as LinhaSerieDiaria[] | null, range));
      setLoading(false);
    })();
  }, [clinicaAtual?.clinica_id, range.from, range.to]);

  useEffect(() => {
    (async () => {
      if (!clinicaAtual) {
        setAtend12([]);
        setAtendMatriz({ anos: [], linhas: [], totalPorAno: {}, totalGeral: 0 });
        return;
      }
      // Agregação feita server-side via RPC (a tabela tem centenas de milhares de linhas).
      type Cell = { cartao: number; particular: number; exames: number; total: number };
      const empty = (): Cell => ({ cartao: 0, particular: 0, exames: 0, total: 0 });
      const matriz: Record<number, Record<number, Cell>> = {};
      const { data: rows } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown[] | null; error: unknown }>
      )("fin_atendimentos_matriz", { _clinica: clinicaAtual.clinica_id });
      for (const r of (rows ?? []) as Array<{
        ano: number;
        mes: number;
        cartao: number;
        particular: number;
        exames: number;
      }>) {
        if (!matriz[r.ano]) matriz[r.ano] = {};
        const cartao = Number(r.cartao) || 0;
        const particular = Number(r.particular) || 0;
        const exames = Number(r.exames) || 0;
        matriz[r.ano][r.mes] = { cartao, particular, exames, total: cartao + particular + exames };
      }
      const anos = Object.keys(matriz)
        .map(Number)
        .sort((a, b) => a - b);
      const linhas = Array.from({ length: 12 }, (_, m) => {
        const porAno: Record<number, Cell> = {};
        for (const a of anos) porAno[a] = matriz[a][m] ?? empty();
        return { mesIdx: m, porAno };
      });
      const totalPorAno: Record<number, Cell> = {};
      for (const a of anos) {
        const t = empty();
        for (const l of linhas) {
          const c = l.porAno[a];
          t.cartao += c.cartao;
          t.particular += c.particular;
          t.exames += c.exames;
          t.total += c.total;
        }
        totalPorAno[a] = t;
      }
      const totalGeral = Object.values(totalPorAno).reduce((s, v) => s + v.total, 0);
      setAtendMatriz({ anos, linhas, totalPorAno, totalGeral });

      // Série dos últimos 12 meses
      const serie: Array<{ label: string; cartao: number; particular: number; exames: number }> =
        [];
      const hoje = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const ano = d.getFullYear();
        const mes = d.getMonth();
        const c = matriz[ano]?.[mes] ?? empty();
        serie.push({
          label: `${MESES_PT[mes]}/${String(ano).slice(2)}`,
          cartao: c.cartao,
          particular: c.particular,
          exames: c.exames,
        });
      }
      setAtend12(serie);
    })();
  }, [clinicaAtual?.clinica_id]);

  const { receitas: totalR, despesas: totalD } = totaisDaSerie(data);
  const periodoLabel = useMemo(
    () =>
      range.from === range.to ? dataBR(range.from) : `${dataBR(range.from)} a ${dataBR(range.to)}`,
    [range.from, range.to],
  );
  // Só muda o cabeçalho da coluna da tabela de detalhe: em recorte curto cada
  // linha é um dia, em recorte longo cada linha é um mês.
  const granularidade = granularidadeDoIntervalo(range);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          BI Financeiro
        </h1>
        <p className="text-sm text-muted-foreground">Período: {periodoLabel}</p>
      </div>

      {/* Barra de filtros: as pílulas Dia/Semana/Quinzena/Mês/Período são o
          mesmo componente das telas de Estatísticas e Relatórios, para o
          recorte significar exatamente a mesma coisa nas três. */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Filtros do BI
          </h2>
        </div>
        <DateRangeFilter
          value={range}
          preset={preset}
          onChange={(r, p) => {
            setRange(r);
            setPreset(p);
          }}
          className="lg:items-end"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="cursor-pointer hover:bg-muted/40" onClick={() => setDrill("receitas")}>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Receitas no período</p>
            <p className="text-2xl font-semibold text-green-600">{fmt(totalR)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Clique para ver detalhes</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/40" onClick={() => setDrill("despesas")}>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Despesas no período</p>
            <p className="text-2xl font-semibold text-red-600">{fmt(totalD)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Clique para ver detalhes</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/40" onClick={() => setDrill("saldo")}>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Saldo no período</p>
            <p
              className={`text-2xl font-semibold ${totalR - totalD >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {fmt(totalR - totalD)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">Clique para ver detalhes</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>Receitas vs Despesas</span>
            <span className="text-xs font-normal text-muted-foreground">
              {granularidade === "dia" ? "uma barra por dia" : "uma barra por mês"} — {periodoLabel}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">Carregando...</div>
          ) : (
            <MiniBarChart
              labels={data.map((r) => r.label)}
              series={[
                { name: "Receitas", color: "#10b981", values: data.map((r) => r.receitas) },
                { name: "Despesas", color: "#ef4444", values: data.map((r) => r.despesas) },
              ]}
              height={320}
              formatY={fmt}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>
              Atendimentos por mês — últimos 12 meses
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                (histórico completo, não segue os filtros acima)
              </span>
            </span>
            <button
              type="button"
              onClick={() => setAtendDrill(true)}
              className="text-xs font-normal text-primary hover:underline"
            >
              Ver tabela ano × mês
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {atend12.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Sem dados.</div>
          ) : (
            <MiniBarChart
              labels={atend12.map((r) => r.label)}
              series={[
                { name: "Cartão", color: "#3b82f6", values: atend12.map((r) => r.cartao) },
                { name: "Particular", color: "#10b981", values: atend12.map((r) => r.particular) },
                { name: "Exames", color: "#f59e0b", values: atend12.map((r) => r.exames) },
              ]}
              height={280}
              formatY={(n) => String(Math.round(n))}
            />
          )}
          <p className="text-[12px] text-muted-foreground mt-2">
            Total no período exibido:{" "}
            <b>{atend12.reduce((s, r) => s + r.cartao + r.particular + r.exames, 0)}</b>{" "}
            atendimentos (cartão: {atend12.reduce((s, r) => s + r.cartao, 0)}, particular:{" "}
            {atend12.reduce((s, r) => s + r.particular, 0)}, exames:{" "}
            {atend12.reduce((s, r) => s + r.exames, 0)}).
          </p>
        </CardContent>
      </Card>

      <Dialog
        open={drill !== null}
        onOpenChange={(o) => {
          if (!o) setDrill(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {drill === "receitas" && `Receitas — ${periodoLabel} (${fmt(totalR)})`}
              {drill === "despesas" && `Despesas — ${periodoLabel} (${fmt(totalD)})`}
              {drill === "saldo" && `Saldo — ${periodoLabel} (${fmt(totalR - totalD)})`}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{granularidade === "dia" ? "Dia" : "Mês"}</TableHead>
                  <TableHead className="text-right">Receitas</TableHead>
                  <TableHead className="text-right">Despesas</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r) => (
                  <TableRow key={r.chave}>
                    <TableCell className="capitalize">{r.label}</TableCell>
                    <TableCell className="text-right text-green-600">{fmt(r.receitas)}</TableCell>
                    <TableCell className="text-right text-red-600">{fmt(r.despesas)}</TableCell>
                    <TableCell
                      className={`text-right font-medium ${r.receitas - r.despesas >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {fmt(r.receitas - r.despesas)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={atendDrill} onOpenChange={setAtendDrill}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Atendimentos por ano × mês — Total: {atendMatriz.totalGeral}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-auto">
            {atendMatriz.anos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Sem atendimentos cadastrados.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    {atendMatriz.anos.map((a) => (
                      <TableHead key={a} className="text-right" colSpan={4}>
                        {a}
                      </TableHead>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableHead></TableHead>
                    {atendMatriz.anos.map((a) => (
                      <Fragment key={a}>
                        <TableHead className="text-right text-[11px]">Cartão</TableHead>
                        <TableHead className="text-right text-[11px]">Part.</TableHead>
                        <TableHead className="text-right text-[11px]">Exames</TableHead>
                        <TableHead className="text-right text-[11px] font-bold">Total</TableHead>
                      </Fragment>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {atendMatriz.linhas.map((l) => (
                    <TableRow key={l.mesIdx}>
                      <TableCell className="font-medium">{MESES_PT[l.mesIdx]}</TableCell>
                      {atendMatriz.anos.map((a) => {
                        const c = l.porAno[a];
                        return (
                          <Fragment key={a}>
                            <TableCell className="text-right tabular-nums text-xs">
                              {c.cartao || "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              {c.particular || "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              {c.exames || "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-semibold">
                              {c.total || "—"}
                            </TableCell>
                          </Fragment>
                        );
                      })}
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell>Total</TableCell>
                    {atendMatriz.anos.map((a) => {
                      const t = atendMatriz.totalPorAno[a] ?? {
                        cartao: 0,
                        particular: 0,
                        exames: 0,
                        total: 0,
                      };
                      return (
                        <Fragment key={a}>
                          <TableCell className="text-right tabular-nums text-xs">
                            {t.cartao.toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs">
                            {t.particular.toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs">
                            {t.exames.toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {t.total.toLocaleString("pt-BR")}
                          </TableCell>
                        </Fragment>
                      );
                    })}
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
