import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PieChart as PieIcon, TrendingUp, TrendingDown, Wallet, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent } from "@/components/ui/card";
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
import { MiniBarChart } from "@/components/charts/MiniBarChart";
import { MiniLineChart } from "@/components/charts/MiniLineChart";
import { MiniPieChart } from "@/components/charts/MiniPieChart";
import {
  carregarContextoRateio,
  carregarRateio,
  ehProcedimentoDeLaudo,
  type RateioLinha,
} from "@/lib/financeiro/rateio-receita";
import {
  corteDePareto,
  distribuicaoPorModalidade,
  evolucao,
  rankingPorChave,
  type Agrupamento,
  type LinhaRanking,
} from "@/lib/financeiro/estatisticas-analise";

export const Route = createFileRoute("/_authenticated/app/financeiro/estatisticas")({
  component: Page,
  head: () => ({ meta: [{ title: "Estatísticas — Financeiro" }] }),
});

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * O banco devolve no máximo 1.000 linhas por consulta. Sem paginar, um mês
 * cheio de caixa era cortado em 1.000 lançamentos e o card de Atendimentos
 * mostrava um número muito menor que o Dashboard/Movimento/Rateio.
 */
const PAGINA = 1000;
const MAX_PAGINAS = 50;

async function paginado<T>(montar: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const { data, error } = await montar().range(p * PAGINA, (p + 1) * PAGINA - 1);
    if (error) throw error;
    const lote = (data ?? []) as T[];
    out.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return out;
}

/**
 * Ranking com barra de participação.
 *
 * A barra é proporcional à MAIOR linha, e não a 100%: num ranking em que o
 * primeiro colocado faz 18% da receita, barras medidas contra 100% ficariam
 * todas rentes a zero e não mostrariam diferença nenhuma entre o primeiro e o
 * décimo. O número exato continua escrito ao lado.
 */
function PainelRanking({
  titulo,
  descricao,
  linhas,
  limite = 10,
  carregando,
}: {
  titulo: string;
  descricao: string;
  linhas: LinhaRanking[];
  limite?: number;
  carregando: boolean;
}) {
  const topo = linhas.slice(0, limite);
  const maior = topo[0]?.participacao ?? 0;
  const corte = corteDePareto(linhas, 80);
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <p className="text-xs text-muted-foreground">{descricao}</p>
        </div>
        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : topo.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem atendimentos no período.</p>
        ) : (
          <>
            <ul className="space-y-2.5">
              {topo.map((l, i) => (
                <li key={l.nome} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate">
                      <span className="text-muted-foreground tabular-nums mr-2">{i + 1}.</span>
                      {l.nome}
                    </span>
                    <span className="shrink-0 tabular-nums font-medium">{fmt(l.receita)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${maior > 0 ? (l.participacao / maior) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between gap-3 text-[11px] text-muted-foreground tabular-nums">
                    <span>
                      {l.participacao.toLocaleString("pt-BR")}% da receita · acumulado{" "}
                      {l.acumulado.toLocaleString("pt-BR")}%
                    </span>
                    <span>
                      {l.atendimentos} atend. · ticket {fmt(l.ticket)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {corte > 0 ? (
              <p className="text-xs text-muted-foreground border-t pt-3">
                <span className="font-medium text-foreground">{corte}</span> de {linhas.length}{" "}
                respondem por 80% da receita do período.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Page() {
  const { clinicaAtual } = useClinica();
  const [stats, setStats] = useState({
    receita: 0,
    despesa: 0,
    atendimentos: 0,
    pagos: 0,
    cortesias: 0,
    notas: 0,
    pendentes: 0,
    ticket: 0,
  });
  const [loading, setLoading] = useState(true);
  const [lancs, setLancs] = useState<
    Array<{
      id: string;
      tipo: string;
      descricao: string;
      valor: number;
      data: string;
      status: string;
      paciente_id: string | null;
    }>
  >([]);
  const [atends, setAtends] = useState<
    Array<{
      id: string;
      data: string;
      procedimento: string | null;
      valor_total: number;
      status: string;
    }>
  >([]);
  const [notasList, setNotasList] = useState<
    Array<{
      id: string;
      numero: string | null;
      tomador_nome: string | null;
      data_emissao: string;
      valor_servicos: number;
      status: string;
    }>
  >([]);
  const [drill, setDrill] = useState<
    null | "receita" | "despesa" | "saldo" | "atendimentos" | "notas" | "ticket" | "pendentes"
  >(null);
  const [preset, setPreset] = useState<DatePreset>("mes");
  const [range, setRange] = useState<DateRange>(() => computeRange("mes"));
  /**
   * O caixa tem parcelas já confirmadas com data futura. O Dashboard fecha o
   * período no dia de hoje; aqui é a mesma régua, senão "Mês" somaria os dias
   * que ainda não aconteceram e os dois números não batiam.
   */
  const fimEfetivo = useMemo(() => {
    const hojeIso = new Date().toLocaleDateString("en-CA");
    return range.to > hojeIso ? hojeIso : range.to;
  }, [range.to]);

  const periodoLabel = useMemo(() => {
    const f = new Date(range.from + "T00:00:00").toLocaleDateString("pt-BR");
    const t = new Date(fimEfetivo + "T00:00:00").toLocaleDateString("pt-BR");
    return `${f} a ${t}`;
  }, [range.from, fimEfetivo]);

  /**
   * As análises de gestão (ranking, modalidade, evolução) saem do Rateio, a
   * mesma base do Dashboard, do Movimento de Caixa e dos Relatórios — é o que
   * garante que o total daqui bata com o das outras telas. Os cards do topo
   * continuam vindo das consultas diretas, que já estavam conferidas.
   */
  const [linhas, setLinhas] = useState<RateioLinha[]>([]);
  const [carregandoAnalise, setCarregandoAnalise] = useState(true);
  const [agrupamento, setAgrupamento] = useState<Agrupamento>("dia");

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (!clinicaAtual) return;
      setCarregandoAnalise(true);
      try {
        const ctx = await carregarContextoRateio(clinicaAtual.clinica_id);
        const dados = await carregarRateio(ctx, {
          clinicaId: clinicaAtual.clinica_id,
          de: range.from,
          ate: fimEfetivo,
        });
        if (!cancelado) setLinhas(dados);
      } finally {
        if (!cancelado) setCarregandoAnalise(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaAtual?.clinica_id, range.from, fimEfetivo]);

  const porEspecialidade = useMemo(() => rankingPorChave(linhas, "especialidade"), [linhas]);
  const porMedico = useMemo(() => rankingPorChave(linhas, "medico"), [linhas]);
  const porServico = useMemo(() => rankingPorChave(linhas, "servico"), [linhas]);
  const modalidades = useMemo(() => distribuicaoPorModalidade(linhas), [linhas]);
  const serie = useMemo(() => evolucao(linhas, agrupamento), [linhas, agrupamento]);

  useEffect(() => {
    (async () => {
      if (!clinicaAtual) return;
      setLoading(true);
      const since = range.from;
      const hoje = fimEfetivo;
      const [resumoRes, atendRows, notas, lancRows, notasFull] = await Promise.all([
        supabase.rpc("fin_resumo_periodo", {
          p_clinica: clinicaAtual.clinica_id,
          p_ini: since,
          p_fim: hoje,
        }),
        paginado<{
          id: string;
          data: string;
          procedimento: string | null;
          valor_total: number;
          status: string;
        }>(() =>
          supabase
            .from("fin_atendimentos")
            .select("id, data, procedimento, valor_total, status")
            .eq("clinica_id", clinicaAtual.clinica_id)
            .gte("data", since)
            .lte("data", hoje)
            .order("data", { ascending: false })
            .order("id"),
        ),
        // Notas emitidas saem de `nfse`, que é onde o sistema grava a NFS-e de
        // verdade. Antes vinham de `fin_notas_pacientes` — um cadastro manual
        // que nunca foi usado (zero registros em produção), então este card
        // batia zero mesmo com centenas de notas emitidas no mês.
        // Conta só o status "emitida": cancelada não faturou e "erro" não
        // chegou a existir na prefeitura. É o mesmo conjunto que a lista abaixo
        // mostra, senão o número do card não bateria com o detalhamento.
        supabase
          .from("nfse")
          .select("id", { count: "exact", head: true })
          .eq("clinica_id", clinicaAtual.clinica_id)
          .eq("status", "emitida")
          .gte("data_emissao", since)
          .lte("data_emissao", hoje),
        paginado<{
          id: string;
          tipo: string;
          descricao: string;
          valor: number;
          data: string;
          status: string;
          paciente_id: string | null;
        }>(() =>
          supabase
            .from("fin_lancamentos")
            .select("id, tipo, descricao, valor, data, status, paciente_id")
            .eq("clinica_id", clinicaAtual.clinica_id)
            .gte("data", since)
            .lte("data", hoje)
            .order("data", { ascending: false })
            .order("id"),
        ),
        supabase
          .from("nfse")
          .select("id, numero, tomador_nome, data_emissao, valor_servicos, status")
          .eq("clinica_id", clinicaAtual.clinica_id)
          .eq("status", "emitida")
          .gte("data_emissao", since)
          .lte("data_emissao", hoje)
          // `data_emissao` é uma data sem hora: os empates do mesmo dia voltam
          // em ordem arbitrária. `created_at` (e o id no desempate) mantém a
          // lista parada entre uma consulta e outra.
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(1000),
      ]);
      let r = 0,
        d = 0,
        p = 0;
      for (const row of (resumoRes.data ?? []) as Array<{
        tipo: string;
        status: string;
        total: number;
      }>) {
        const v = Number(row.total) || 0;
        if (row.status === "pendente") p += v;
        else if (row.status !== "cancelado") {
          if (row.tipo === "receita") r += v;
          else if (row.tipo === "despesa") d += v;
        }
      }
      // Mesma régua do Dashboard, do Movimento de Caixa e do Rateio: cada
      // pagamento que entrou no caixa conta 1 atendimento — consulta, exame,
      // procedimento, adesão, mensalidade, avulso, qualquer serviço pago.
      // Cortesias (atendimento feito sem cobrança) também contam, por isso
      // entram os atendimentos de valor zero que não geraram lançamento.
      let pagos = 0;
      let cortesias = 0;
      let totA = 0;
      for (const l of lancRows) {
        if (l.tipo !== "receita" || l.status !== "confirmado") continue;
        pagos += 1;
        totA += Number(l.valor) || 0;
      }
      // O repasse de laudo ("[LAUDO]") também tem valor zero, mas não é
      // atendimento: é a remuneração da leitura de um exame já contado.
      const atendReais = atendRows.filter((a) => !ehProcedimentoDeLaudo(a.procedimento));
      for (const a of atendReais) {
        if (a.status === "cancelado") continue;
        if ((Number(a.valor_total) || 0) > 0) continue; // já contado pelo pagamento no caixa
        cortesias += 1;
      }
      const cntA = pagos + cortesias;

      setStats({
        receita: r,
        despesa: d,
        atendimentos: cntA,
        pagos,
        cortesias,
        notas: notas.count ?? 0,
        pendentes: p,
        ticket: cntA > 0 ? totA / cntA : 0,
      });
      setAtends(atendReais as typeof atends);
      setLancs(lancRows as typeof lancs);
      setNotasList((notasFull.data ?? []) as typeof notasList);
      setLoading(false);
    })();
  }, [clinicaAtual?.clinica_id, range.from, fimEfetivo]);

  const Stat = ({
    label,
    value,
    icon: Icon,
    color,
    onClick,
    detalhe,
  }: {
    label: string;
    value: string;
    icon: typeof PieIcon;
    color: string;
    onClick?: () => void;
    detalhe?: React.ReactNode;
  }) => (
    <Card
      onClick={onClick}
      className={onClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}
    >
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold mt-1">{loading ? "..." : value}</p>
            {!loading && detalhe ? (
              <div className="mt-2 text-xs text-muted-foreground leading-relaxed">{detalhe}</div>
            ) : null}
          </div>
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const fmtDt = (s: string) => new Date(s).toLocaleDateString("pt-BR");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <PieIcon className="h-6 w-6 text-primary" />
            Estatísticas
          </h1>
          <p className="text-sm text-muted-foreground">Período: {periodoLabel}</p>
        </div>
        <DateRangeFilter
          value={range}
          preset={preset}
          onChange={(r, p) => {
            setRange(r);
            setPreset(p);
          }}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Stat
          onClick={() => setDrill("receita")}
          label="Receitas"
          value={fmt(stats.receita)}
          icon={TrendingUp}
          color="bg-green-500/10 text-green-600"
        />
        <Stat
          onClick={() => setDrill("despesa")}
          label="Despesas"
          value={fmt(stats.despesa)}
          icon={TrendingDown}
          color="bg-red-500/10 text-red-600"
        />
        <Stat
          onClick={() => setDrill("saldo")}
          label="Saldo"
          value={fmt(stats.receita - stats.despesa)}
          icon={Wallet}
          color="bg-primary/10 text-primary"
        />
        <Stat
          onClick={() => setDrill("atendimentos")}
          label="Atendimentos"
          value={String(stats.atendimentos)}
          icon={TrendingUp}
          color="bg-blue-500/10 text-blue-600"
          detalhe={
            <>
              <p>
                {stats.pagos.toLocaleString("pt-BR")} pagamentos recebidos no caixa +{" "}
                {stats.cortesias.toLocaleString("pt-BR")} cortesias sem cobrança
              </p>
              <p className="mt-1">
                Cada pagamento de entrada conta 1 atendimento: consulta, exame, procedimento,
                adesão, mensalidade e demais serviços.
              </p>
            </>
          }
        />
        <Stat
          onClick={() => setDrill("notas")}
          label="Notas emitidas"
          value={String(stats.notas)}
          icon={FileText}
          color="bg-purple-500/10 text-purple-600"
        />
        <Stat
          onClick={() => setDrill("ticket")}
          label="Ticket médio"
          value={fmt(stats.ticket)}
          icon={TrendingUp}
          color="bg-amber-500/10 text-amber-600"
        />
        <Stat
          onClick={() => setDrill("pendentes")}
          label="Pendentes"
          value={fmt(stats.pendentes)}
          icon={TrendingDown}
          color="bg-orange-500/10 text-orange-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PainelRanking
          titulo="Receita por especialidade"
          descricao="Quanto cada especialidade trouxe no período, e quantas fazem a maior parte do faturamento."
          linhas={porEspecialidade}
          carregando={carregandoAnalise}
        />
        <PainelRanking
          titulo="Receita por profissional"
          descricao="Os dez maiores do período. Mensalidade e adesão não entram aqui — não têm profissional."
          linhas={porMedico}
          carregando={carregandoAnalise}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Particular x Cartão Benefícios</h2>
              <p className="text-xs text-muted-foreground">
                Como o paciente foi atendido. A venda do Cartão (mensalidade e adesão) não entra:
                aqui é só atendimento realizado.
              </p>
            </div>
            {carregandoAnalise ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : modalidades.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem atendimentos no período.</p>
            ) : (
              <>
                <MiniPieChart
                  data={modalidades.map((m) => ({ name: m.modalidade, value: m.atendimentos }))}
                  height={240}
                  formatValue={(n) => `${n.toLocaleString("pt-BR")} atend.`}
                />
                <ul className="space-y-1.5 text-sm border-t pt-3">
                  {modalidades.map((m) => (
                    <li key={m.modalidade} className="flex justify-between gap-3">
                      <span className="truncate">{m.modalidade}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {m.atendimentos.toLocaleString("pt-BR")} atend. ·{" "}
                        {m.participacao.toLocaleString("pt-BR")}% · {fmt(m.receita)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        <PainelRanking
          titulo="Receita por serviço"
          descricao="Inclui mensalidade e adesão do Cartão, que também são venda da clínica."
          linhas={porServico}
          carregando={carregandoAnalise}
        />
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <div>
              <h2 className="text-lg font-semibold">Evolução de atendimentos e ticket médio</h2>
              <p className="text-xs text-muted-foreground">
                Volume por {agrupamento === "dia" ? "dia" : "semana"} e o valor médio de cada
                atendimento no mesmo recorte.
              </p>
            </div>
            <div className="flex gap-1">
              {(["dia", "semana"] as Agrupamento[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAgrupamento(a)}
                  className={
                    agrupamento === a
                      ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                      : "rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  }
                >
                  {a === "dia" ? "Por dia" : "Por semana"}
                </button>
              ))}
            </div>
          </div>
          {carregandoAnalise ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : serie.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem atendimentos no período.</p>
          ) : (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Atendimentos</p>
                <MiniBarChart
                  labels={serie.map((p) => p.rotulo)}
                  series={[
                    {
                      name: "Atendimentos",
                      color: "#3b82f6",
                      values: serie.map((p) => p.atendimentos),
                    },
                  ]}
                  height={240}
                  formatY={(n) => n.toLocaleString("pt-BR")}
                />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Ticket médio</p>
                <MiniLineChart
                  labels={serie.map((p) => p.rotulo)}
                  values={serie.map((p) => p.ticket)}
                  color="#f59e0b"
                  height={220}
                  formatY={(n) => fmt(n)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={drill !== null}
        onOpenChange={(o) => {
          if (!o) setDrill(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {drill === "receita" && `Receitas — ${fmt(stats.receita)}`}
              {drill === "despesa" && `Despesas — ${fmt(stats.despesa)}`}
              {drill === "saldo" && `Saldo — ${fmt(stats.receita - stats.despesa)}`}
              {drill === "atendimentos" && `Atendimentos — ${stats.atendimentos}`}
              {drill === "ticket" && `Ticket médio — ${fmt(stats.ticket)}`}
              {drill === "notas" && `Notas emitidas — ${stats.notas}`}
              {drill === "pendentes" && `Pendentes — ${fmt(stats.pendentes)}`}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto flex-1">
            {drill === "receita" ||
            drill === "despesa" ||
            drill === "saldo" ||
            drill === "pendentes"
              ? (() => {
                  const lista = lancs.filter((l) => {
                    if (drill === "pendentes") return l.status === "pendente";
                    if (l.status === "cancelado") return false;
                    if (drill === "saldo") return l.status !== "pendente";
                    return (
                      l.status !== "pendente" &&
                      l.tipo === (drill === "receita" ? "receita" : "despesa")
                    );
                  });
                  if (lista.length === 0)
                    return (
                      <p className="text-sm text-muted-foreground py-6 text-center">
                        Sem lançamentos.
                      </p>
                    );
                  return (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lista.map((l) => (
                          <TableRow key={l.id}>
                            <TableCell className="whitespace-nowrap">{fmtDt(l.data)}</TableCell>
                            <TableCell className="capitalize">{l.tipo}</TableCell>
                            <TableCell>{l.descricao}</TableCell>
                            <TableCell>{l.status}</TableCell>
                            <TableCell
                              className={`text-right font-medium ${l.tipo === "receita" ? "text-green-600" : "text-red-600"}`}
                            >
                              {fmt(Number(l.valor))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  );
                })()
              : drill === "atendimentos" || drill === "ticket"
                ? (() => {
                    if (atends.length === 0)
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
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {atends.map((a) => (
                            <TableRow key={a.id}>
                              <TableCell className="whitespace-nowrap">{fmtDt(a.data)}</TableCell>
                              <TableCell>{a.procedimento ?? "—"}</TableCell>
                              <TableCell>{a.status}</TableCell>
                              <TableCell className="text-right">
                                {fmt(Number(a.valor_total))}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    );
                  })()
                : drill === "notas"
                  ? (() => {
                      if (notasList.length === 0)
                        return (
                          <p className="text-sm text-muted-foreground py-6 text-center">
                            Sem notas emitidas.
                          </p>
                        );
                      return (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data</TableHead>
                              <TableHead>Número</TableHead>
                              <TableHead>Tomador</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Valor</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {notasList.map((n) => (
                              <TableRow key={n.id}>
                                <TableCell className="whitespace-nowrap">
                                  {fmtDt(n.data_emissao)}
                                </TableCell>
                                <TableCell>{n.numero ?? "—"}</TableCell>
                                <TableCell>{n.tomador_nome ?? "—"}</TableCell>
                                <TableCell>{n.status}</TableCell>
                                <TableCell className="text-right">
                                  {fmt(Number(n.valor_servicos))}
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
