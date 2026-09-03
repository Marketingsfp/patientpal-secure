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
  janelaDaSerie,
  matrizAtendimentos,
  serieAtendimentos,
  totaisDaSerie,
  MESES_PT,
  type LinhaMatriz,
  type LinhaSerieDiaria,
  type MatrizAtend,
  type PontoAtend,
  type PontoSerie,
} from "@/lib/financeiro/bi-serie";

export const Route = createFileRoute("/_authenticated/app/financeiro/bi")({
  component: Page,
  head: () => ({ meta: [{ title: "BI — Financeiro" }] }),
});

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Quantos meses o gráfico de atendimentos mostra. */
const MESES_NO_GRAFICO = 12;

type RespostaRpc = { data: unknown[] | null; error: { code?: string; message?: string } | null };

/**
 * Busca a matriz de atendimentos.
 *
 * A versão da função no banco que aceita janela de datas (_ini/_fim) é
 * recente: sem ela, a função varre o histórico inteiro da clínica — hoje 842
 * mil lançamentos, cerca de 7 segundos — e estoura o limite de 8 segundos por
 * consulta do usuário logado, o que devolvia erro e desenhava um gráfico
 * zerado. Enquanto o SQL novo não estiver aplicado, cai na função antiga, para
 * a tela não quebrar dependendo da ordem entre aplicar o SQL e publicar.
 */
async function buscarMatriz(clinica: string, janela?: { from: string; to: string }) {
  const rpc = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<RespostaRpc>;
  if (janela) {
    const r = await rpc("fin_atendimentos_matriz", {
      _clinica: clinica,
      _ini: janela.from,
      _fim: janela.to,
    });
    const semAssinatura =
      r.error?.code === "PGRST202" ||
      /could not find the function|does not exist/i.test(r.error?.message ?? "");
    if (!r.error || !semAssinatura) return r;
  }
  return rpc("fin_atendimentos_matriz", { _clinica: clinica });
}

function Page() {
  const { clinicaAtual } = useClinica();
  // O período parte do mês corrente, como nas telas de Estatísticas e
  // Relatórios, para a equipe não ter que reaprender o filtro em cada aba.
  const [preset, setPreset] = useState<DatePreset>("mes");
  const [range, setRange] = useState<DateRange>(() => computeRange("mes"));
  const [data, setData] = useState<PontoSerie[]>([]);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<null | "receitas" | "despesas" | "saldo">(null);
  const [atend12, setAtend12] = useState<PontoAtend[]>([]);
  const [atendCarregando, setAtendCarregando] = useState(true);
  // Guardado para a tela poder dizer que falhou, em vez de mostrar zero:
  // gráfico zerado foi lido como "os atendimentos sumiram".
  const [atendErro, setAtendErro] = useState<string | null>(null);
  const [atendTentativa, setAtendTentativa] = useState(0);
  const [atendMatriz, setAtendMatriz] = useState<MatrizAtend | null>(null);
  const [matrizCarregando, setMatrizCarregando] = useState(false);
  const [matrizErro, setMatrizErro] = useState<string | null>(null);
  const [atendDrill, setAtendDrill] = useState(false);
  const janela = useMemo(() => janelaDaSerie(MESES_NO_GRAFICO), []);

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

  // Gráfico de atendimentos: pede ao banco só a janela que ele desenha.
  useEffect(() => {
    (async () => {
      if (!clinicaAtual) {
        setAtend12([]);
        setAtendErro(null);
        setAtendCarregando(false);
        return;
      }
      setAtendCarregando(true);
      setAtendErro(null);
      const { data: rows, error } = await buscarMatriz(clinicaAtual.clinica_id, janela);
      if (error) {
        setAtend12([]);
        setAtendErro(error.message ?? "Falha ao consultar o banco.");
        setAtendCarregando(false);
        return;
      }
      setAtend12(serieAtendimentos(rows as LinhaMatriz[] | null, MESES_NO_GRAFICO));
      setAtendCarregando(false);
    })();
  }, [clinicaAtual?.clinica_id, janela, atendTentativa]);

  // Tabela ano × mês: histórico inteiro, então só é buscada quando alguém
  // abre a janela de detalhe.
  useEffect(() => {
    if (!atendDrill || !clinicaAtual || atendMatriz || matrizCarregando) return;
    (async () => {
      setMatrizCarregando(true);
      setMatrizErro(null);
      const { data: rows, error } = await buscarMatriz(clinicaAtual.clinica_id);
      if (error) setMatrizErro(error.message ?? "Falha ao consultar o banco.");
      else setAtendMatriz(matrizAtendimentos(rows as LinhaMatriz[] | null));
      setMatrizCarregando(false);
    })();
  }, [atendDrill, clinicaAtual?.clinica_id, atendMatriz, matrizCarregando]);

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
          {atendErro ? (
            /* Antes o erro era engolido e a tela desenhava barras zeradas, o
               que foi lido como "os atendimentos sumiram". */
            <div className="py-10 text-center">
              <p className="text-sm font-medium">Não foi possível carregar os atendimentos.</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                O banco recusou a consulta: {atendErro}
              </p>
              <button
                type="button"
                onClick={() => setAtendTentativa((n) => n + 1)}
                className="mt-3 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Tentar de novo
              </button>
            </div>
          ) : atendCarregando ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Carregando...</div>
          ) : atend12.length === 0 ? (
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
          <p className="text-[12px] text-muted-foreground mt-2" hidden={!!atendErro}>
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
            <DialogTitle>
              Atendimentos por ano × mês
              {atendMatriz ? ` — Total: ${atendMatriz.totalGeral.toLocaleString("pt-BR")}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-auto">
            {matrizCarregando ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Somando o histórico completo...
              </p>
            ) : matrizErro ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Não foi possível somar o histórico completo: {matrizErro}
              </p>
            ) : !atendMatriz || atendMatriz.anos.length === 0 ? (
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
