import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Target, TrendingUp, TrendingDown, Wallet, Stethoscope, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ProjecaoInteligencia } from "@/components/financeiro/projecao-inteligencia";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  projetarMes,
  serieTendencia,
  simularCrescimento,
  type DiaCaixa,
  type EntradaProjecao,
  type ResultadoProjecao,
} from "@/lib/financeiro/projecao";
import {
  atendimentosPorDiaDaSemana,
  interpretarMeta,
  type DiaReceita,
} from "@/lib/financeiro/projecao-meta-semana";
import { MiniLineChart } from "@/components/charts/MiniLineChart";

export const Route = createFileRoute("/_authenticated/app/financeiro/projecao")({
  component: Page,
  head: () => ({ meta: [{ title: "Projeção — Financeiro" }] }),
});

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const iso = (d: Date) => d.toLocaleDateString("en-CA");

/**
 * 6 semanas fechadas: seis de cada dia da semana para a média, recentes o
 * bastante para refletir o movimento atual da clínica.
 */
const SEMANAS_HISTORICO = 6;

/** O banco devolve no máximo 1.000 linhas por consulta. */
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

type LancRow = { data: string; tipo: string; valor: number; status: string };
type AtendRow = { data: string; valor_total: number | null; status: string };

function Page() {
  const { clinicaAtual } = useClinica();
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState<DiaCaixa[]>([]);
  /** Meta como foi escrita na caixa de texto ("600 mil", "10% acima"…). */
  const [metaTexto, setMetaTexto] = useState("");
  /** Receita e pagamentos por dia, das últimas semanas até ontem. */
  const [historico, setHistorico] = useState<DiaReceita[] | null>(null);
  /** Receita confirmada do mês anterior fechado — base das metas de crescimento. */
  const [baseMesAnterior, setBaseMesAnterior] = useState(0);

  const hoje = useMemo(() => new Date(), []);
  const inicio = useMemo(() => iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), [hoje]);
  const fim = useMemo(() => iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)), [hoje]);
  const hojeIso = useMemo(() => iso(hoje), [hoje]);
  const ontemIso = useMemo(
    () => iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1)),
    [hoje],
  );
  const historicoDe = useMemo(
    () =>
      iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - SEMANAS_HISTORICO * 7)),
    [hoje],
  );

  const mesAnterior = useMemo(() => {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    return {
      de: iso(ini),
      ate: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 0)),
      nome: ini.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    };
  }, [hoje]);

  const chaveMeta = clinicaAtual ? `fin-meta-${clinicaAtual.clinica_id}-${inicio}` : "";
  const chaveMetaTexto = chaveMeta ? `${chaveMeta}-texto` : "";

  useEffect(() => {
    if (!chaveMetaTexto) return;
    try {
      const texto = localStorage.getItem(chaveMetaTexto);
      if (texto != null) {
        setMetaTexto(texto);
        return;
      }
      // Meta guardada antes, quando o campo era só número.
      const antigo = Number(localStorage.getItem(chaveMeta) ?? 0);
      setMetaTexto(Number.isFinite(antigo) && antigo > 0 ? antigo.toLocaleString("pt-BR") : "");
    } catch {
      setMetaTexto("");
    }
  }, [chaveMeta, chaveMetaTexto]);

  useEffect(() => {
    (async () => {
      if (!clinicaAtual) return;
      setLoading(true);
      try {
        const [lancs, atends] = await Promise.all([
          paginado<LancRow>(() =>
            supabase
              .from("fin_lancamentos")
              .select("data, tipo, valor, status")
              .eq("clinica_id", clinicaAtual.clinica_id)
              .eq("status", "confirmado")
              .gte("data", inicio)
              .lte("data", hojeIso)
              .order("data")
              .order("id"),
          ),
          paginado<AtendRow>(() =>
            supabase
              .from("fin_atendimentos")
              .select("data, valor_total, status")
              .eq("clinica_id", clinicaAtual.clinica_id)
              .gte("data", inicio)
              .lte("data", hojeIso)
              .order("data")
              .order("id"),
          ),
        ]);

        const mapa = new Map<string, DiaCaixa>();
        const pegar = (data: string) => {
          const d = String(data).slice(0, 10);
          let linha = mapa.get(d);
          if (!linha) {
            linha = { data: d, receita: 0, despesa: 0, atendimentos: 0 };
            mapa.set(d, linha);
          }
          return linha;
        };

        for (const l of lancs) {
          const linha = pegar(l.data);
          const v = Number(l.valor) || 0;
          if (l.tipo === "receita") {
            linha.receita += v;
            // Mesma régua das outras telas: cada pagamento conta 1 atendimento.
            linha.atendimentos += 1;
          } else if (l.tipo === "despesa") {
            linha.despesa += v;
          }
        }
        // Cortesias: atendidos sem cobrança, contam na produção.
        for (const a of atends) {
          if (a.status === "cancelado") continue;
          if ((Number(a.valor_total) || 0) > 0) continue;
          pegar(a.data).atendimentos += 1;
        }

        setDias([...mapa.values()].sort((x, y) => x.data.localeCompare(y.data)));
      } finally {
        setLoading(false);
      }
    })();
  }, [clinicaAtual?.clinica_id, inicio, hojeIso]);

  // A base de comparação sai agregada do banco (`fin_resumo_periodo`): são
  // milhares de lançamentos no mês anterior, e aqui só interessa o total.
  useEffect(() => {
    (async () => {
      if (!clinicaAtual) return;
      const { data, error } = await supabase.rpc("fin_resumo_periodo", {
        p_clinica: clinicaAtual.clinica_id,
        p_ini: mesAnterior.de,
        p_fim: mesAnterior.ate,
      });
      if (error) return;
      const linhas = (data ?? []) as Array<{ tipo: string; status: string; total: number }>;
      const receita = linhas
        .filter((l) => l.tipo === "receita" && l.status === "confirmado")
        .reduce((s, l) => s + (Number(l.total) || 0), 0);
      setBaseMesAnterior(receita);
    })();
  }, [clinicaAtual?.clinica_id, mesAnterior.de, mesAnterior.ate]);

  // Peso de cada dia da semana: receita e pagamentos das últimas semanas,
  // só dias fechados (até ontem).
  useEffect(() => {
    let cancelado = false;
    setHistorico(null);
    (async () => {
      if (!clinicaAtual) return;
      try {
        const linhas = await paginado<{ dia: string; pagamentos: number; receita: number }>(() =>
          // Função fora dos tipos gerados do Supabase.
          (supabase as any).rpc("fin_receita_resumo_dia", {
            p_clinica: clinicaAtual.clinica_id,
            p_ini: historicoDe,
            p_fim: ontemIso,
          }),
        );
        const porDia = new Map<string, DiaReceita>();
        for (const l of linhas) {
          const dia = String(l.dia).slice(0, 10);
          const d = porDia.get(dia) ?? { dia, receita: 0, pagamentos: 0 };
          d.receita += Number(l.receita) || 0;
          d.pagamentos += Number(l.pagamentos) || 0;
          porDia.set(dia, d);
        }
        if (!cancelado) setHistorico([...porDia.values()]);
      } catch (e) {
        console.error("projeção: falha ao ler receita por dia", e);
        if (!cancelado) setHistorico([]);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaAtual?.clinica_id, historicoDe, ontemIso]);

  const metaLida = useMemo(
    () =>
      interpretarMeta(metaTexto, {
        mesAnterior: baseMesAnterior,
        nomeMesAnterior: mesAnterior.nome,
      }),
    [metaTexto, baseMesAnterior, mesAnterior.nome],
  );
  const meta = metaLida.ok ? metaLida.valor : 0;

  const entrada: EntradaProjecao = useMemo(
    () => ({ inicio, fim, hoje: hojeIso, dias, meta: meta || undefined }),
    [inicio, fim, hojeIso, dias, meta],
  );
  const r: ResultadoProjecao = useMemo(() => projetarMes(entrada), [entrada]);

  const metas = useMemo(
    () => simularCrescimento(r, { baseMesAnterior, metaCustomizada: meta || undefined }),
    [r, baseMesAnterior, meta],
  );

  const tendencia = useMemo(() => serieTendencia(entrada, r), [entrada, r]);
  const seriesTendencia = useMemo(
    () => [
      {
        name: "Realizado",
        color: "#13b5a3",
        values: tendencia.map((p) => p.realizado),
      },
      {
        name: "Projetado",
        color: "#3b82f6",
        values: tendencia.map((p) => p.projetado),
        tracejada: true,
      },
    ],
    [tendencia],
  );

  const metaSemana = useMemo(
    () =>
      meta > 0 && historico
        ? atendimentosPorDiaDaSemana({
            meta,
            realizadoAteOntem: r.realizado.receitaFechada,
            historico,
            hoje: hojeIso,
            fimMes: fim,
          })
        : null,
    [meta, historico, r.realizado.receitaFechada, hojeIso, fim],
  );

  const salvarMetaTexto = (texto: string) => {
    setMetaTexto(texto);
    try {
      if (chaveMetaTexto) localStorage.setItem(chaveMetaTexto, texto);
    } catch {
      // Navegador sem armazenamento: a meta vale só enquanto a tela está aberta.
    }
  };

  const confiancaTexto =
    r.confianca === "alta"
      ? "Estimativa firme — já há bastante movimento no mês."
      : r.confianca === "media"
        ? "Estimativa razoável — poucos dias de movimento ainda."
        : "Estimativa fraca — o mês mal começou.";

  const Bloco = ({
    label,
    realizado,
    projetado,
    icon: Icon,
    color,
    explicacao,
    nota,
  }: {
    label: string;
    realizado: string;
    projetado: string;
    icon: typeof Wallet;
    color: string;
    /** Texto da dica do "i" ao lado do título. */
    explicacao?: string;
    /** Linha extra, sempre visível, abaixo do realizado. */
    nota?: string;
  }) => (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              {label}
              {explicacao && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label={`O que é ${label}`}>
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-72 px-3 py-2 text-xs">
                    {explicacao}
                  </TooltipContent>
                </Tooltip>
              )}
            </p>
            <p className="text-2xl font-semibold mt-1">{loading ? "..." : projetado}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Já realizado: <span className="font-medium text-foreground">{realizado}</span>
            </p>
            {nota && !loading && <p className="text-xs text-muted-foreground mt-1">{nota}</p>}
          </div>
          <div
            className={`h-10 w-10 shrink-0 rounded-lg flex items-center justify-center ${color}`}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const atendimentosFaltantes = Math.max(r.projetado.atendimentos - r.realizado.atendimentos, 0);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            Projeção do mês
          </h1>
          <p className="text-sm text-muted-foreground">
            Fechamento estimado de {inicio.slice(8)}/{inicio.slice(5, 7)} a {fim.slice(8)}/
            {fim.slice(5, 7)} · {r.diasCorridos} dia(s) fechados (até ontem), {r.diasRestantes} pela
            frente com hoje · {confiancaTexto}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Bloco
            label="Receita projetada"
            projetado={fmt(r.projetado.receita)}
            realizado={fmt(r.realizado.receita)}
            icon={TrendingUp}
            color="bg-green-500/10 text-green-600"
          />
          <Bloco
            label="Despesa projetada"
            projetado={fmt(r.projetado.despesa)}
            realizado={fmt(r.realizado.despesa)}
            icon={TrendingDown}
            color="bg-red-500/10 text-red-600"
          />
          <Bloco
            label="Saldo projetado"
            projetado={fmt(r.projetado.saldo)}
            realizado={fmt(r.realizado.saldo)}
            icon={Wallet}
            color="bg-primary/10 text-primary"
          />
          <Bloco
            label="Atendimentos projetados"
            projetado={String(r.projetado.atendimentos)}
            realizado={String(r.realizado.atendimentos)}
            icon={Stethoscope}
            color="bg-blue-500/10 text-blue-600"
            explicacao={`É uma estimativa do total do mês inteiro, não de atendimentos já concluídos: soma o que foi atendido de 01/${inicio.slice(5, 7)} até ontem com uma previsão para os dias que faltam até ${fim.slice(8)}/${fim.slice(5, 7)} (hoje inclusive), no ritmo médio dos dias de movimento já fechados deste mês. O dia de hoje ainda está em andamento e não entra na média.`}
            nota={`Estimativa do mês: ${r.realizado.atendimentos} já atendidos + ~${atendimentosFaltantes} previstos em ${r.diasRestantes} dia(s) restantes.`}
          />
        </div>

        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-lg font-semibold">Tendência do mês</h2>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Realizado</span> — o que já entrou,
                somado dia a dia · <span className="font-medium text-foreground">Projetado</span>{" "}
                (tracejado) — o acumulado até ontem seguindo no ritmo dos dias fechados até{" "}
                {fim.slice(8)}/{fim.slice(5, 7)}.
              </p>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : (
              <MiniLineChart
                labels={tendencia.map((p) => p.rotulo)}
                series={seriesTendencia}
                height={280}
                formatY={(n) => fmt(n)}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="space-y-1 w-full md:max-w-xl">
                <Label htmlFor="meta">Meta de receita do mês</Label>
                <Input
                  id="meta"
                  type="text"
                  value={metaTexto}
                  placeholder='Ex.: "600 mil", "R$ 650.000" ou "10% acima do mês passado"'
                  onChange={(ev) => salvarMetaTexto(ev.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {metaTexto.trim() === ""
                    ? "Escreva a meta do jeito que preferir. Fica guardada neste navegador, por clínica e por mês."
                    : metaLida.ok
                      ? `Entendido: ${metaLida.explicacao}`
                      : metaLida.motivo}
                </p>
              </div>
              <div className="text-sm">
                <p className="text-muted-foreground">
                  Ritmo atual (até ontem):{" "}
                  <span className="font-medium text-foreground">{fmt(r.mediaDiaria)}</span> e{" "}
                  {r.mediaAtendimentosDia} atendimento(s) por dia de movimento.
                </p>
              </div>
            </div>

            {r.meta ? (
              <div className="rounded-lg border p-4 text-sm space-y-1">
                <p className="font-medium">
                  {r.meta.alcancavel
                    ? "No ritmo de hoje, a meta é alcançada."
                    : "No ritmo de hoje, a meta não é alcançada."}
                </p>
                <p className="text-muted-foreground">
                  Faltam {fmt(r.meta.falta)} para a meta de {fmt(r.meta.meta)}.
                </p>
                <p className="text-muted-foreground">
                  Precisa entrar {fmt(r.meta.porDiaRestante)} por dia de movimento restante — cerca
                  de {r.meta.atendimentosPorDia} atendimento(s) por dia no ticket atual de{" "}
                  {fmt(r.realizado.ticket)}.
                </p>
              </div>
            ) : null}

            {r.meta ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">
                  Atendimentos necessários por dia da semana
                </h3>
                {!metaSemana ? (
                  <p className="text-sm text-muted-foreground">Carregando histórico...</p>
                ) : metaSemana.linhas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {metaSemana.diasRestantes === 0
                      ? "Não há mais dias de funcionamento neste mês."
                      : "Sem histórico de receita nas últimas semanas para estimar."}
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Dia</th>
                            <th className="px-3 py-2 text-right font-medium">Faltam</th>
                            <th className="px-3 py-2 text-right font-medium">Costuma fazer</th>
                            <th className="px-3 py-2 text-right font-medium">Precisa fazer</th>
                            <th className="px-3 py-2 text-right font-medium">Diferença</th>
                            <th className="px-3 py-2 text-right font-medium">Receita/dia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {metaSemana.linhas.map((l) => {
                            const dif = l.atendimentosNecessarios - l.atendimentosHoje;
                            return (
                              <tr key={l.diaSemana} className="border-t">
                                <td className="px-3 py-2 font-medium">{l.nome}</td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {l.diasRestantes}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {l.atendimentosHoje}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                                  {l.atendimentosNecessarios}
                                </td>
                                <td
                                  className={`px-3 py-2 text-right tabular-nums ${
                                    dif > 0 ? "text-amber-600" : "text-green-600"
                                  }`}
                                >
                                  {dif > 0 ? `+${dif}` : dif}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {fmt(l.receitaNecessaria)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {metaSemana.falta <= 0
                        ? "A meta já foi alcançada com o que entrou até ontem."
                        : `Até ontem entraram ${fmt(metaSemana.realizadoAteOntem)}; faltam ${fmt(metaSemana.falta)} em ${metaSemana.diasRestantes} dia(s) de funcionamento (hoje inclusive). No ritmo normal de cada dia da semana esses dias rendem ${fmt(metaSemana.rendeNoRitmo)} — ${
                            metaSemana.esforcoPercentual > 0
                              ? `é preciso ${metaSemana.esforcoPercentual}% a mais em cada dia`
                              : "o ritmo normal já basta"
                          }.`}{" "}
                      "Costuma fazer" é a média de pagamentos de cada dia da semana nas últimas{" "}
                      {SEMANAS_HISTORICO} semanas (até ontem); domingo não entra.
                    </p>
                    {metaSemana.semHistorico.length > 0 && (
                      <p className="text-xs text-amber-600">
                        Sem histórico para {metaSemana.semHistorico.join(", ")}: a conta acima supõe
                        que esses dias não terão movimento.
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Informe uma meta para ver quanto falta e quantos atendimentos por dia são
                necessários.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-lg font-semibold">Simulação de crescimento</h2>
              {baseMesAnterior > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Base de comparação: {mesAnterior.nome} fechou em{" "}
                  <span className="font-medium text-foreground">{fmt(baseMesAnterior)}</span>.
                </p>
              ) : null}
            </div>

            {metas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem receita registrada em {mesAnterior.nome} para comparar. Digite uma meta acima
                para simular.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {metas.map((m) => (
                  <div key={m.rotulo} className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{m.rotulo}</span>
                      <span
                        className={
                          m.alcancavel
                            ? "text-[11px] font-medium uppercase tracking-wide text-green-600"
                            : "text-[11px] font-medium uppercase tracking-wide text-amber-600"
                        }
                      >
                        {m.alcancavel ? "no ritmo" : "exige mais"}
                      </span>
                    </div>
                    <p className="text-xl font-semibold tabular-nums">{fmt(m.alvo)}</p>
                    <dl className="text-xs text-muted-foreground space-y-1">
                      <div className="flex justify-between gap-2">
                        <dt>Falta</dt>
                        <dd className="tabular-nums text-foreground">{fmt(m.falta)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>Por dia de movimento</dt>
                        <dd className="tabular-nums text-foreground">{fmt(m.porDiaRestante)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>Atendimentos/dia</dt>
                        <dd className="tabular-nums text-foreground">{m.atendimentosPorDia}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>Ritmo x hoje</dt>
                        <dd className="tabular-nums text-foreground">
                          {m.esforcoPercentual > 0
                            ? `+${m.esforcoPercentual}%`
                            : `${m.esforcoPercentual}%`}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              "Dia de movimento" é dia com caixa aberto — a clínica atende de segunda a sábado, e o
              domingo não entra na conta.
            </p>
          </CardContent>
        </Card>

        {clinicaAtual && (
          <ProjecaoInteligencia
            clinicaId={clinicaAtual.clinica_id}
            inicioMes={inicio}
            fimMes={fim}
            hoje={hojeIso}
            pontosCaixa={loading ? [] : r.pontos}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
