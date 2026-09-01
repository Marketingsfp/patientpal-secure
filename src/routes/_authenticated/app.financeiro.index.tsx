import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Plus,
  Minus,
  TrendingUp,
  TrendingDown,
  Wallet,
  Users,
  Calendar,
  Stethoscope,
  CreditCard,
  FlaskConical,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { brl, fmtDate, rangeFromPeriodo, type Periodo } from "@/lib/financeiro/format";
import { hojeBR } from "@/lib/date-utils";
import {
  carregarContextoRateio,
  carregarRateio,
  totaisRateio,
  type RateioLinha,
} from "@/lib/financeiro/rateio-receita";
import { LancamentoDialog } from "@/components/financeiro/lancamento-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { classifyAtendimento, type AtendCat } from "@/lib/atendimento-classify";

export const Route = createFileRoute("/_authenticated/app/financeiro/")({
  component: FinDashboard,
});

/**
 * O período do dashboard nunca passa de hoje.
 *
 * A base tem centenas de milhares de parcelas de carnê importadas do sistema
 * anterior, já gravadas como "confirmado" com a data de cada vencimento futuro.
 * Somando o mês inteiro, o card de Receitas mostrava dinheiro que ainda não
 * entrou (em 01/09/2026 eram R$ 9.547,00 de vencimentos de 02/09 a 29/09).
 */
function periodoAteHoje(periodo: Periodo) {
  const { from, to } = rangeFromPeriodo(periodo);
  const hoje = hojeBR();
  return { de: from, ate: to > hoje ? hoje : to };
}

function FinDashboard() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("financeiro");
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [stats, setStats] = useState({
    receitas: 0,
    despesas: 0,
    cartaoConsulta: 0,
    consultaPart: 0,
    exames: 0,
    /** Receita só dos atendimentos — base do ticket médio. */
    receitaAtend: 0,
  });
  const [open, setOpen] = useState<null | "receita" | "despesa">(null);
  const [reload, setReload] = useState(0);
  const [rawLancs, setRawLancs] = useState<
    Array<{
      id: string;
      tipo: string;
      descricao: string;
      valor: number;
      data: string;
      status: string;
      cat: AtendCat | null;
    }>
  >([]);
  const [repasse, setRepasse] = useState<{
    total: number;
    linhas: RateioLinha[];
    carregando: boolean;
  }>({ total: 0, linhas: [], carregando: true });
  const [drill, setDrill] = useState<
    | null
    | "saldo"
    | "receitas"
    | "despesas"
    | "atendTotal"
    | "cartaoConsulta"
    | "consultaPart"
    | "exames"
    | "ticket"
    | "repasse"
  >(null);

  useEffect(() => {
    if (!clinicaAtual) return;
    const { de, ate } = periodoAteHoje(periodo);
    let cancelado = false;
    (async () => {
      const [resumoRes, { data: lancs }] = await Promise.all([
        supabase.rpc("fin_resumo_periodo", {
          p_clinica: clinicaAtual.clinica_id,
          p_ini: de,
          p_fim: ate,
        }),
        supabase
          .from("fin_lancamentos")
          .select("id, tipo, descricao, valor, data, status")
          .eq("clinica_id", clinicaAtual.clinica_id)
          .eq("status", "confirmado")
          .gte("data", de)
          .lte("data", ate)
          .order("data", { ascending: false })
          .limit(10000),
      ]);
      if (cancelado) return;
      let receitas = 0,
        despesas = 0;
      for (const row of (resumoRes.data ?? []) as Array<{
        tipo: string;
        status: string;
        total: number;
      }>) {
        if (row.status !== "confirmado") continue;
        if (row.tipo === "receita") receitas += Number(row.total) || 0;
        else if (row.tipo === "despesa") despesas += Number(row.total) || 0;
      }
      const lancsList = (lancs ?? []) as Array<{
        id: string;
        tipo: string;
        descricao: string;
        valor: number;
        data: string;
        status: string;
      }>;
      const classified = lancsList.map((l) => ({
        ...l,
        cat: l.tipo === "receita" ? classifyAtendimento(l.descricao) : null,
      }));
      let cartaoConsulta = 0,
        consultaPart = 0,
        exames = 0,
        receitaAtend = 0;
      for (const l of classified) {
        if (l.cat === null) continue;
        if (l.cat === "cartao_consulta") cartaoConsulta++;
        else if (l.cat === "consulta_particular") consultaPart++;
        else exames++;
        // Mensalidade, adesão e recebimento avulso ficam de fora: são receita
        // da clínica, mas não são atendimento e afundariam o ticket médio.
        receitaAtend += Number(l.valor) || 0;
      }
      setStats({ receitas, despesas, cartaoConsulta, consultaPart, exames, receitaAtend });
      setRawLancs(classified);
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaAtual, periodo, reload]);

  /**
   * Repasse dos médicos.
   *
   * Vem da mesma conta do relatório Rateio da Receita: a grade cadastrada de
   * cada médico aplicada aos atendimentos do período. O card antigo somava a
   * coluna `valor_medico` de `fin_atendimentos`, que hoje só guarda atendimento
   * externo lançado à mão — em produção são poucas dezenas de linhas por mês, e
   * o card vivia mostrando R$ 0,00 enquanto a clínica pagava repasse.
   *
   * Fica num efeito separado porque é a busca mais pesada da tela; os outros
   * cards não esperam por ela.
   */
  useEffect(() => {
    if (!clinicaAtual) return;
    const { de, ate } = periodoAteHoje(periodo);
    let cancelado = false;
    setRepasse({ total: 0, linhas: [], carregando: true });
    (async () => {
      try {
        const ctx = await carregarContextoRateio(clinicaAtual.clinica_id);
        const linhas = await carregarRateio(ctx, { clinicaId: clinicaAtual.clinica_id, de, ate });
        if (cancelado) return;
        setRepasse({ total: totaisRateio(linhas).repasse, linhas, carregando: false });
      } catch {
        if (!cancelado) setRepasse({ total: 0, linhas: [], carregando: false });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaAtual, periodo, reload]);

  const saldo = stats.receitas - stats.despesas;
  const atendTotal = stats.cartaoConsulta + stats.consultaPart + stats.exames;
  const media = atendTotal > 0 ? stats.receitaAtend / atendTotal : 0;

  // `fmtDate` completa a hora antes de converter: `new Date("2026-09-01")` é
  // meia-noite em UTC, que no fuso da clínica ainda é o dia 31/08.
  const fmtDt = (d: string) => fmtDate(d);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Financeiro — {clinicaAtual?.clinica.nome}</h1>
          <p className="text-sm text-muted-foreground">Visão geral do período</p>
        </div>
        {podeEscrever && (
          <div className="flex gap-2">
            <Button
              onClick={() => setOpen("receita")}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4 mr-1" /> Receita
            </Button>
            <Button onClick={() => setOpen("despesa")} variant="destructive">
              <Minus className="h-4 w-4 mr-1" /> Despesa
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {(["hoje", "semana", "mes"] as Periodo[]).map((p) => (
          <Button
            key={p}
            size="sm"
            variant={periodo === p ? "default" : "outline"}
            onClick={() => setPeriodo(p)}
          >
            {p === "hoje" ? "Hoje" : p === "semana" ? "Semana" : "Mês"}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          onClick={() => setDrill("saldo")}
          icon={Wallet}
          label="Saldo do período"
          value={brl(saldo)}
          accent={saldo >= 0 ? "primary" : "destructive"}
        />
        <KpiCard
          onClick={() => setDrill("receitas")}
          icon={TrendingUp}
          label="Receitas"
          value={brl(stats.receitas)}
          accent="success"
        />
        <KpiCard
          onClick={() => setDrill("despesas")}
          icon={TrendingDown}
          label="Despesas"
          value={brl(stats.despesas)}
          accent="destructive"
        />
        <KpiCard
          onClick={() => setDrill("atendTotal")}
          icon={Users}
          label="Atendimentos (total)"
          value={String(atendTotal)}
          accent="primary"
        />
        <KpiCard
          onClick={() => setDrill("cartaoConsulta")}
          icon={CreditCard}
          label="Consultas Cartão"
          value={String(stats.cartaoConsulta)}
          accent="primary"
        />
        <KpiCard
          onClick={() => setDrill("consultaPart")}
          icon={Stethoscope}
          label="Consultas Particulares"
          value={String(stats.consultaPart)}
          accent="success"
        />
        <KpiCard
          onClick={() => setDrill("exames")}
          icon={FlaskConical}
          label="Exames"
          value={String(stats.exames)}
          accent="warning"
        />
        <KpiCard
          onClick={() => setDrill("ticket")}
          icon={Calendar}
          label="Ticket médio"
          value={brl(media)}
          accent="primary"
        />
        <KpiCard
          onClick={() => setDrill("repasse")}
          icon={Stethoscope}
          label="Repasse médicos"
          value={repasse.carregando ? "…" : brl(repasse.total)}
          accent="warning"
        />
      </div>

      <LancamentoDialog
        open={open !== null}
        onOpenChange={(v) => !v && setOpen(null)}
        tipo={open ?? "receita"}
        onSaved={() => setReload((r) => r + 1)}
      />

      <Dialog
        open={drill !== null}
        onOpenChange={(o) => {
          if (!o) setDrill(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {drill === "saldo" && `Saldo do período — ${brl(saldo)}`}
              {drill === "receitas" && `Receitas — ${brl(stats.receitas)}`}
              {drill === "despesas" && `Despesas — ${brl(stats.despesas)}`}
              {drill === "atendTotal" && `Atendimentos (total) — ${atendTotal}`}
              {drill === "cartaoConsulta" && `Consultas Cartão — ${stats.cartaoConsulta}`}
              {drill === "consultaPart" && `Consultas Particulares — ${stats.consultaPart}`}
              {drill === "exames" && `Exames — ${stats.exames}`}
              {drill === "ticket" && `Ticket médio — ${brl(media)}`}
              {drill === "repasse" && `Repasse a médicos — ${brl(repasse.total)}`}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto flex-1">
            {drill === "saldo" || drill === "receitas" || drill === "despesas"
              ? (() => {
                  const lista = rawLancs.filter((l) =>
                    drill === "saldo"
                      ? true
                      : l.tipo === (drill === "receitas" ? "receita" : "despesa"),
                  );
                  if (lista.length === 0)
                    return (
                      <p className="text-sm text-muted-foreground py-6 text-center">
                        Sem lançamentos confirmados.
                      </p>
                    );
                  return (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lista.map((l) => (
                          <TableRow key={l.id}>
                            <TableCell className="whitespace-nowrap">{fmtDt(l.data)}</TableCell>
                            <TableCell>{l.tipo}</TableCell>
                            <TableCell>{l.descricao}</TableCell>
                            <TableCell
                              className={`text-right font-medium ${l.tipo === "receita" ? "text-green-600" : "text-red-600"}`}
                            >
                              {brl(Number(l.valor))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  );
                })()
              : drill === "atendTotal" ||
                  drill === "cartaoConsulta" ||
                  drill === "consultaPart" ||
                  drill === "exames" ||
                  drill === "ticket"
                ? (() => {
                    const catFiltro: AtendCat | null =
                      drill === "cartaoConsulta"
                        ? "cartao_consulta"
                        : drill === "consultaPart"
                          ? "consulta_particular"
                          : drill === "exames"
                            ? "exame"
                            : null;
                    const lista = rawLancs.filter(
                      (l) => l.cat !== null && (catFiltro === null || l.cat === catFiltro),
                    );
                    if (lista.length === 0)
                      return (
                        <p className="text-sm text-muted-foreground py-6 text-center">
                          Sem atendimentos.
                        </p>
                      );
                    return (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Categoria</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lista.map((l) => (
                            <TableRow key={l.id}>
                              <TableCell className="whitespace-nowrap">{fmtDt(l.data)}</TableCell>
                              <TableCell>{l.descricao}</TableCell>
                              <TableCell className="text-xs">
                                {l.cat === "cartao_consulta"
                                  ? "Cartão"
                                  : l.cat === "consulta_particular"
                                    ? "Consulta Part."
                                    : "Exame"}
                              </TableCell>
                              <TableCell className="text-right">{brl(Number(l.valor))}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    );
                  })()
                : drill === "repasse"
                  ? (() => {
                      if (repasse.carregando)
                        return (
                          <p className="text-sm text-muted-foreground py-6 text-center">
                            Calculando o repasse pela grade dos médicos…
                          </p>
                        );
                      const comRepasse = repasse.linhas.filter((l) => l.repasse > 0);
                      if (comRepasse.length === 0)
                        return (
                          <p className="text-sm text-muted-foreground py-6 text-center">
                            Nenhum atendimento com repasse no período.
                          </p>
                        );
                      return (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data</TableHead>
                              <TableHead>Médico</TableHead>
                              <TableHead>Procedimento</TableHead>
                              <TableHead className="text-right">Receita</TableHead>
                              <TableHead className="text-right">Repasse médico</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {comRepasse.map((l) => (
                              <TableRow key={l.id}>
                                <TableCell className="whitespace-nowrap">{fmtDt(l.data)}</TableCell>
                                <TableCell>{l.medico_nome}</TableCell>
                                <TableCell>{l.procedimento ?? "—"}</TableCell>
                                <TableCell className="text-right">{brl(l.receita)}</TableCell>
                                <TableCell className="text-right text-amber-600">
                                  {brl(l.repasse)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      );
                    })()
                  : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  accent: "primary" | "success" | "destructive" | "warning";
  onClick?: () => void;
}) {
  const colorMap = {
    primary: "text-primary bg-primary/10",
    success: "text-success bg-success/10",
    destructive: "text-destructive bg-destructive/10",
    warning: "text-warning bg-warning/10",
  };
  return (
    <Card
      onClick={onClick}
      className={onClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}
    >
      <CardContent className="pt-6 flex items-center gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${colorMap[accent]}`}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] uppercase tracking-wide text-muted-foreground leading-tight line-clamp-2">
            {label}
          </p>
          <p
            className="mt-1 text-lg xl:text-xl font-semibold tabular-nums whitespace-nowrap overflow-hidden text-ellipsis leading-tight"
            title={value}
          >
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
