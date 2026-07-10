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
import { brl, rangeFromPeriodo, type Periodo } from "@/lib/financeiro/format";
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

function FinDashboard() {
  const { clinicaAtual } = useClinica();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [stats, setStats] = useState({
    receitas: 0,
    despesas: 0,
    repasse: 0,
    cartaoConsulta: 0,
    consultaPart: 0,
    exames: 0,
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
  const [rawAtends, setRawAtends] = useState<
    Array<{
      id: string;
      data: string;
      procedimento: string | null;
      valor_total: number;
      valor_medico: number;
      status: string;
    }>
  >([]);
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
    const { from, to } = rangeFromPeriodo(periodo);
    (async () => {
      const [resumoRes, { data: at }, { data: lancs }] = await Promise.all([
        supabase.rpc("fin_resumo_periodo", {
          p_clinica: clinicaAtual.clinica_id,
          p_ini: from,
          p_fim: to,
        }),
        supabase
          .from("fin_atendimentos")
          .select("id, data, procedimento, valor_total, valor_medico, status")
          .eq("clinica_id", clinicaAtual.clinica_id)
          .gte("created_at", from + "T00:00:00")
          .lte("created_at", to + "T23:59:59"),
        supabase
          .from("fin_lancamentos")
          .select("id, tipo, descricao, valor, data, status")
          .eq("clinica_id", clinicaAtual.clinica_id)
          .eq("status", "confirmado")
          .gte("data", from)
          .lte("data", to)
          .order("data", { ascending: false })
          .limit(10000),
      ]);
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
      const repasse = (at ?? []).reduce((s, a) => s + Number(a.valor_medico ?? 0), 0);
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
        exames = 0;
      for (const l of classified) {
        if (l.cat === "cartao_consulta") cartaoConsulta++;
        else if (l.cat === "consulta_particular") consultaPart++;
        else if (l.cat === "exame") exames++;
      }
      setStats({ receitas, despesas, repasse, cartaoConsulta, consultaPart, exames });
      setRawAtends((at ?? []) as typeof rawAtends);
      setRawLancs(classified);
    })();
  }, [clinicaAtual, periodo, reload]);

  const saldo = stats.receitas - stats.despesas;
  const atendTotal = stats.cartaoConsulta + stats.consultaPart + stats.exames;
  const media = atendTotal > 0 ? stats.receitas / atendTotal : 0;

  const fmtDt = (d: string) => new Date(d).toLocaleDateString("pt-BR");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Financeiro — {clinicaAtual?.clinica.nome}</h1>
          <p className="text-sm text-muted-foreground">Visão geral do período</p>
        </div>
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
          value={brl(stats.repasse)}
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
              {drill === "repasse" && `Repasse a médicos — ${brl(stats.repasse)}`}
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
                      if (rawAtends.length === 0)
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
                              <TableHead>Procedimento</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Valor</TableHead>
                              <TableHead className="text-right">Repasse médico</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rawAtends.map((a) => (
                              <TableRow key={a.id}>
                                <TableCell className="whitespace-nowrap">{fmtDt(a.data)}</TableCell>
                                <TableCell>{a.procedimento ?? "—"}</TableCell>
                                <TableCell>{a.status}</TableCell>
                                <TableCell className="text-right">
                                  {brl(Number(a.valor_total))}
                                </TableCell>
                                <TableCell className="text-right text-amber-600">
                                  {brl(Number(a.valor_medico))}
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
      <CardContent className="pt-6 flex items-center gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-lg ${colorMap[accent]}`}
        >
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
