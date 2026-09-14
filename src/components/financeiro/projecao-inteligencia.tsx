/**
 * Blocos de inteligência da aba Financeiro → Projeção que leem a AGENDA:
 * clima × comparecimento, especialidades (ranking + diagnóstico) e agendas
 * agrupadas por volume. As contas vivem em `@/lib/financeiro/projecao-agenda`
 * (código puro, com teste); aqui fica só a busca dos dados e a montagem.
 *
 * Fonte: `fin_agenda_resumo_dia` (agregado por dia × agenda no banco) e a
 * Open-Meteo, pelo `@/lib/clima` que o relatório Movimento × Clima já usa.
 * Se qualquer uma falhar, só o bloco dela mostra o aviso — a projeção de
 * receita, acima na página, não depende disto.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Info,
  Sun,
  ThermometerSun,
  TrendingDown,
  TrendingUp,
  CalendarRange,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getClimaPeriodo, getPrevisaoClima, type PrevisaoDia } from "@/lib/clima";
import { addDias } from "@/lib/financeiro/periodos";
import { diaDaSemana } from "@/lib/financeiro/preset-periodo";
import {
  agendasPorVolume,
  contextoComparacao,
  diagnosticoEspecialidades,
  diasDoMes,
  diasValidos,
  FAIXAS_VOLUME,
  faixaDoVolume,
  impactoDoClima,
  MIN_DIAS_GRUPO,
  prognosticoDoMes,
  rankingEspecialidades,
  ROTULO_TEMPO,
  tempoPrevisto,
  type ClimaMinimo,
  type ContextoComparacao,
  type LinhaAgendaDia,
} from "@/lib/financeiro/projecao-agenda";
import {
  diagnosticarQuedas,
  ociosidadeEOportunidade,
  type LinhaReceitaDia,
} from "@/lib/financeiro/projecao-melhorias";
import type { PontoAtencao } from "@/lib/financeiro/projecao";
import { CardMelhorias } from "@/components/financeiro/projecao-melhorias-card";

const PAGINA = 1000;
/** Janela do histórico: cobre o mês anterior inteiro e dá amostra ao clima. */
const DIAS_HISTORICO = 100;

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const n = (v: number) => v.toLocaleString("pt-BR");

/** Ícone e nome do código de tempo WMO devolvido pela Open-Meteo. */
function descreverTempo(code: number | null) {
  const c = code ?? -1;
  if (c >= 95) return { Icon: CloudLightning, nome: "Tempestade" };
  if (c >= 80) return { Icon: CloudRain, nome: "Pancadas" };
  if (c >= 61) return { Icon: CloudRain, nome: "Chuva" };
  if (c >= 51) return { Icon: CloudDrizzle, nome: "Garoa" };
  if (c >= 45) return { Icon: CloudFog, nome: "Neblina" };
  if (c === 3) return { Icon: Cloud, nome: "Nublado" };
  if (c >= 1) return { Icon: CloudSun, nome: "Parcialmente nublado" };
  if (c === 0) return { Icon: Sun, nome: "Céu limpo" };
  return { Icon: Cloud, nome: "—" };
}

interface Props {
  clinicaId: string;
  inicioMes: string;
  fimMes: string;
  hoje: string;
  /** Pontos de atenção do caixa (`projetarMes`): dias parados, despesa alta… */
  pontosCaixa: PontoAtencao[];
}

/** Receita: 9 semanas bastam para ter ao menos dois dias iguais da semana de referência. */
const DIAS_HISTORICO_RECEITA = 63;

/** Lê uma função do banco em páginas de 1.000 linhas (limite do Supabase). */
async function lerPaginado<T>(funcao: string, args: Record<string, unknown>): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < 30; p++) {
    // Funções novas, ainda fora dos tipos gerados do Supabase.
    const { data, error } = await (supabase as any)
      .rpc(funcao, args)
      .range(p * PAGINA, (p + 1) * PAGINA - 1);
    if (error) throw error;
    const lote = (data ?? []) as T[];
    out.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return out;
}

export function ProjecaoInteligencia({ clinicaId, inicioMes, fimMes, hoje, pontosCaixa }: Props) {
  const [linhas, setLinhas] = useState<LinhaAgendaDia[] | null>(null);
  const [erroAgenda, setErroAgenda] = useState(false);
  const [receitas, setReceitas] = useState<LinhaReceitaDia[] | null>(null);
  const [erroReceita, setErroReceita] = useState(false);
  const [clima, setClima] = useState<Map<string, ClimaMinimo> | null>(null);
  const [previsao, setPrevisao] = useState<PrevisaoDia[] | null>(null);
  const [climaCarregado, setClimaCarregado] = useState(false);

  const historicoDe = useMemo(() => addDias(hoje, -DIAS_HISTORICO), [hoje]);

  useEffect(() => {
    let cancelado = false;
    setLinhas(null);
    setErroAgenda(false);
    (async () => {
      try {
        const brutas = await lerPaginado<any>("fin_agenda_resumo_dia", {
          p_clinica: clinicaId,
          p_ini: historicoDe,
          p_fim: hoje,
        });
        const out = brutas.map((r) => ({
          ...r,
          dia: String(r.dia).slice(0, 10),
          vagas: Number(r.vagas) || 0,
          marcados: Number(r.marcados) || 0,
          compareceu: Number(r.compareceu) || 0,
          cancelados: r.cancelados == null ? undefined : Number(r.cancelados) || 0,
        })) as LinhaAgendaDia[];
        if (!cancelado) setLinhas(out);
      } catch (e) {
        console.error("projeção: falha ao ler resumo da agenda", e);
        if (!cancelado) setErroAgenda(true);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaId, historicoDe, hoje]);

  useEffect(() => {
    let cancelado = false;
    setReceitas(null);
    setErroReceita(false);
    (async () => {
      try {
        const brutas = await lerPaginado<any>("fin_receita_resumo_dia", {
          p_clinica: clinicaId,
          p_ini: addDias(hoje, -DIAS_HISTORICO_RECEITA),
          p_fim: addDias(hoje, -1),
        });
        const out = brutas.map((r) => ({
          ...r,
          dia: String(r.dia).slice(0, 10),
          cartao: !!r.cartao,
          pagamentos: Number(r.pagamentos) || 0,
          receita: Number(r.receita) || 0,
        })) as LinhaReceitaDia[];
        if (!cancelado) setReceitas(out);
      } catch (e) {
        console.error("projeção: falha ao ler receita por dia", e);
        if (!cancelado) setErroReceita(true);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaId, hoje]);

  useEffect(() => {
    let cancelado = false;
    setClimaCarregado(false);
    (async () => {
      const [hist, prev] = await Promise.all([
        getClimaPeriodo(clinicaId, historicoDe, addDias(hoje, -1)).catch(() => null),
        getPrevisaoClima(clinicaId, 16).catch(() => null),
      ]);
      if (cancelado) return;
      setClima(hist);
      setPrevisao(prev);
      setClimaCarregado(true);
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaId, historicoDe, hoje]);

  const periodo = useMemo(() => {
    const [ano, mes] = inicioMes.split("-").map(Number);
    const antIni = new Date(Date.UTC(ano, mes - 2, 1));
    const antFim = new Date(Date.UTC(ano, mes - 1, 0));
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return {
      inicioMes,
      fimMes,
      hoje,
      mesAnteriorDe: iso(antIni),
      mesAnteriorAte: iso(antFim),
      nomeMesAnterior: antIni.toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" }),
    };
  }, [inicioMes, fimMes, hoje]);

  const validos = useMemo(() => (linhas ? diasValidos(linhas, hoje) : null), [linhas, hoje]);
  const contexto = useMemo(
    () => (validos ? contextoComparacao(validos, periodo) : null),
    [validos, periodo],
  );

  const impacto = useMemo(
    () => (linhas && clima ? impactoDoClima(linhas, clima, hoje) : null),
    [linhas, clima, hoje],
  );

  const mediaAtendidosDia = useMemo(() => {
    if (!validos) return 0;
    const doMes = validos.dias.filter((d) => d.dia >= inicioMes && validos.validos.has(d.dia));
    return doMes.length ? doMes.reduce((s, d) => s + d.compareceu, 0) / doMes.length : 0;
  }, [validos, inicioMes]);

  const prognostico = useMemo(
    () =>
      previsao && impacto
        ? prognosticoDoMes(previsao, impacto, mediaAtendidosDia, hoje, fimMes)
        : null,
    [previsao, impacto, mediaAtendidosDia, hoje, fimMes],
  );

  const ranking = useMemo(
    () => (linhas && validos ? rankingEspecialidades(linhas, periodo, validos) : []),
    [linhas, periodo, validos],
  );
  const diagnostico = useMemo(
    () => diagnosticoEspecialidades(ranking, periodo.nomeMesAnterior),
    [ranking, periodo.nomeMesAnterior],
  );
  const agendas = useMemo(
    () => (linhas && validos ? agendasPorVolume(linhas, periodo, validos) : []),
    [linhas, periodo, validos],
  );
  const dias = useMemo(() => diasDoMes(periodo), [periodo]);

  const quedas = useMemo(
    () =>
      receitas && linhas ? diagnosticarQuedas(receitas, linhas, clima, { inicioMes, hoje }) : null,
    [receitas, linhas, clima, inicioMes, hoje],
  );
  const ocupacao = useMemo(
    () =>
      linhas && validos ? ociosidadeEOportunidade(linhas, { inicioMes, hoje }, validos) : null,
    [linhas, validos, inicioMes, hoje],
  );

  return (
    <TooltipProvider delayDuration={150}>
      <CardMelhorias
        carregando={(linhas === null && !erroAgenda) || (receitas === null && !erroReceita)}
        erro={erroAgenda || erroReceita}
        quedas={quedas}
        ocupacao={ocupacao}
        especialidades={diagnostico}
        pontosCaixa={pontosCaixa}
      />
      <BlocoClima
        carregado={climaCarregado && (linhas !== null || erroAgenda)}
        previsao={previsao}
        impacto={impacto}
        prognostico={prognostico}
        hoje={hoje}
        fimMes={fimMes}
        historicoDe={historicoDe}
      />
      <BlocoEspecialidades
        linhasCarregadas={linhas !== null}
        erro={erroAgenda}
        ranking={ranking}
        nomeMesAnterior={periodo.nomeMesAnterior}
        dias={dias}
        contexto={contexto}
      />
      <BlocoAgendas linhasCarregadas={linhas !== null} erro={erroAgenda} agendas={agendas} />
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------

function Carregando() {
  return <p className="text-sm text-muted-foreground">Carregando...</p>;
}

function AvisoErro({ texto }: { texto: string }) {
  return <p className="text-sm text-amber-700">{texto}</p>;
}

function Dica({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex text-muted-foreground" aria-label="Explicação">
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-72 px-3 py-2 text-xs">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

function BlocoClima({
  carregado,
  previsao,
  impacto,
  prognostico,
  hoje,
  fimMes,
  historicoDe,
}: {
  carregado: boolean;
  previsao: PrevisaoDia[] | null;
  impacto: ReturnType<typeof impactoDoClima> | null;
  prognostico: ReturnType<typeof prognosticoDoMes> | null;
  hoje: string;
  fimMes: string;
  historicoDe: string;
}) {
  const proximos = (previsao ?? []).filter((p) => p.data >= hoje).slice(0, 7);
  const nomeMes = new Date(`${hoje}T12:00:00`).toLocaleDateString("pt-BR", { month: "long" });
  const estavel = impacto?.grupos.find((g) => g.tipo === "estavel");

  return (
    <Card>
      <CardContent className="pt-6 space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ThermometerSun className="h-5 w-5 text-sky-600" />
            Clima e comparecimento
          </h2>
          <p className="text-xs text-muted-foreground">
            Previsão da Open-Meteo para a localização da clínica · histórico desde{" "}
            {ddmm(historicoDe)}
          </p>
        </div>

        {!carregado ? (
          <Carregando />
        ) : (
          <>
            {/* Próximos dias */}
            {proximos.length === 0 ? (
              <AvisoErro texto="Previsão do tempo indisponível agora (sem conexão com o serviço de clima ou clínica sem localização cadastrada)." />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {proximos.map((p) => {
                  const { Icon, nome } = descreverTempo(p.weather_code);
                  const tipo = tempoPrevisto(p);
                  const domingo = diaDaSemana(p.data) === 0;
                  return (
                    <div
                      key={p.data}
                      className={
                        "rounded-lg border p-3 text-center space-y-1 " +
                        (tipo === "tempestade"
                          ? "border-red-300 bg-red-50/60 dark:bg-red-950/20"
                          : tipo === "chuva"
                            ? "border-sky-300 bg-sky-50/60 dark:bg-sky-950/20"
                            : "") +
                        (domingo ? " opacity-60" : "")
                      }
                    >
                      <p className="text-xs font-medium">
                        {p.data === hoje ? "Hoje" : DIAS_SEMANA[diaDaSemana(p.data)]} {ddmm(p.data)}
                      </p>
                      <Icon className="h-6 w-6 mx-auto text-sky-700 dark:text-sky-400" />
                      <p className="text-[11px] text-muted-foreground leading-tight">{nome}</p>
                      <p className="text-xs tabular-nums">
                        {p.temp_min != null ? Math.round(p.temp_min) : "–"}° /{" "}
                        {p.temp_max != null ? Math.round(p.temp_max) : "–"}°
                      </p>
                      <p className="text-[11px] tabular-nums text-muted-foreground">
                        {p.probabilidade_chuva != null ? `${p.probabilidade_chuva}% chuva` : ""}
                        {p.precipitacao_mm ? ` · ${p.precipitacao_mm.toFixed(1)} mm` : ""}
                      </p>
                      {domingo && <p className="text-[10px] text-muted-foreground">fechado</p>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Prognóstico do mês */}
            {prognostico && (
              <div className="rounded-lg border p-4 text-sm space-y-1">
                <p className="font-medium">Prognóstico para o resto de {nomeMes}</p>
                {prognostico.diasRestantes === 0 ? (
                  <p className="text-muted-foreground">O mês termina hoje.</p>
                ) : (
                  <>
                    <p className="text-muted-foreground">
                      Faltam {prognostico.diasRestantes} dia(s) de funcionamento. A previsão alcança{" "}
                      {prognostico.diasComPrevisao} deles
                      {prognostico.previsaoAte
                        ? ` (até ${ddmm(prognostico.previsaoAte)})`
                        : ""}:{" "}
                      <span className="font-medium text-foreground">
                        {prognostico.diasChuva} com chuva provável
                      </span>
                      {prognostico.diasTempestade > 0 && (
                        <>
                          {" "}
                          e{" "}
                          <span className="font-medium text-red-600">
                            {prognostico.diasTempestade} com chuva forte
                          </span>
                        </>
                      )}
                      .
                    </p>
                    {prognostico.diasComPrevisao < prognostico.diasRestantes && (
                      <p className="text-xs text-muted-foreground">
                        Depois de {ddmm(prognostico.previsaoAte ?? hoje)} até {ddmm(fimMes)} não há
                        previsão confiável — a meteorologia só prevê até 16 dias à frente.
                      </p>
                    )}
                    {prognostico.perdaEstimada > 0 && (
                      <p className="text-muted-foreground">
                        Pelo histórico da clínica, isso deve custar cerca de{" "}
                        <span className="font-medium text-foreground">
                          {n(prognostico.perdaEstimada)} comparecimento(s)
                        </span>{" "}
                        a menos. Nesses dias, reforçar a confirmação dos pacientes na véspera.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Impacto histórico */}
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5">
                Impacto histórico da chuva
                <Dica>
                  Cada dia é comparado com o normal do mesmo dia da semana (sábado com sábado, terça
                  com terça), porque sábado sempre tem menos gente. "Compareceram" são os pacientes
                  marcados que vieram. Feriados e dias fora da curva ficam de fora. Chuva = 1 mm ou
                  mais no dia; chuva forte = 15 mm ou mais, ou trovoada.
                </Dica>
              </p>
              {!impacto || impacto.grupos.length === 0 ? (
                <AvisoErro texto="Sem histórico de clima ou de agenda suficiente para medir o impacto." />
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {impacto.grupos.map((g) => (
                      <div key={g.tipo} className="rounded-lg border p-4 space-y-1">
                        <p className="text-sm font-semibold">{ROTULO_TEMPO[g.tipo]}</p>
                        {g.tipo === "estavel" ? (
                          <p className="text-xl font-semibold">Referência</p>
                        ) : g.dias < MIN_DIAS_GRUPO ? (
                          <p className="text-sm text-muted-foreground">
                            Poucos dias para concluir ({g.variacao > 0 ? "+" : ""}
                            {g.variacao.toLocaleString("pt-BR")}% até agora)
                          </p>
                        ) : Math.abs(g.variacao) < 3 ? (
                          <p className="text-xl font-semibold">Sem diferença relevante</p>
                        ) : (
                          <p
                            className={
                              "text-xl font-semibold tabular-nums " +
                              (g.variacao < 0 ? "text-red-600" : "text-green-600")
                            }
                          >
                            {g.variacao > 0 ? "+" : ""}
                            {g.variacao.toLocaleString("pt-BR")}% de comparecimento
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Faltas:{" "}
                          <span className="text-foreground">
                            {g.taxaFalta.toLocaleString("pt-BR")}%
                          </span>{" "}
                          dos marcados
                          {g.tipo !== "estavel" && estavel
                            ? ` (tempo estável: ${estavel.taxaFalta.toLocaleString("pt-BR")}%)`
                            : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {g.dias} dia(s) analisado(s)
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {impacto.diasAnalisados} dias de funcionamento analisados
                    {impacto.diasDescartados > 0
                      ? ` · ${impacto.diasDescartados} fora da curva descartado(s)`
                      : ""}
                    .{" "}
                    {!impacto.confiavel &&
                      "Ainda são poucos dias de chuva ou de tempo estável para uma conclusão firme — o número vai ficando mais confiável com o tempo."}
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Variacao({ v }: { v: number | null }) {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  const Icon = v < 0 ? TrendingDown : TrendingUp;
  return (
    <span
      className={
        "inline-flex items-center gap-1 tabular-nums " +
        (v <= -15 ? "text-red-600" : v >= 15 ? "text-green-600" : "text-muted-foreground")
      }
    >
      <Icon className="h-3.5 w-3.5" />
      {v > 0 ? "+" : ""}
      {v.toLocaleString("pt-BR")}%
    </span>
  );
}

function BlocoEspecialidades({
  linhasCarregadas,
  erro,
  ranking,
  nomeMesAnterior,
  dias,
  contexto,
}: {
  linhasCarregadas: boolean;
  erro: boolean;
  ranking: ReturnType<typeof rankingEspecialidades>;
  nomeMesAnterior: string;
  dias: ReturnType<typeof diasDoMes>;
  contexto: ContextoComparacao | null;
}) {
  const [verTodas, setVerTodas] = useState(false);
  const maior = Math.max(1, ...ranking.map((e) => Math.max(e.projetado, e.ritmoAnteriorNoMes)));
  const lista = verTodas ? ranking : ranking.slice(0, 12);

  return (
    <>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-lg font-semibold">Volume por especialidade</h2>
            <p className="text-xs text-muted-foreground">
              Pacientes que compareceram, pela agenda · {dias.decorridos} de {dias.totais} dias de
              funcionamento já fechados
              {contexto
                ? ` · comparação por média diária: ${contexto.diasValidosMes} dia(s) válidos neste mês e ${contexto.diasValidosAnterior} em ${nomeMesAnterior}`
                : ""}
            </p>
          </div>
          {contexto && !contexto.temBaseAnterior && linhasCarregadas && (
            <p className="text-xs text-amber-700">
              {nomeMesAnterior[0].toUpperCase() + nomeMesAnterior.slice(1)} tem poucos dias com a
              agenda em uso neste sistema — a comparação com o mês anterior fica em branco.
            </p>
          )}
          {erro ? (
            <AvisoErro texto="Não foi possível ler o resumo da agenda. Se esta tela acabou de ser publicada, a consulta nova do banco pode ainda não ter sido aplicada." />
          ) : !linhasCarregadas ? (
            <Carregando />
          ) : ranking.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem atendimentos na agenda no período.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-4 rounded-sm bg-primary" /> Já atendidos no mês
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-4 rounded-sm bg-primary/30" /> Projeção até o fim do mês
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-0.5 bg-foreground/60" /> Onde o mês fecharia no ritmo de{" "}
                  {nomeMesAnterior}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="py-2 pr-2 font-medium">#</th>
                      <th className="py-2 pr-2 font-medium">Especialidade</th>
                      <th className="py-2 pr-2 font-medium w-[34%]">Volume</th>
                      <th className="py-2 pr-2 font-medium text-right">Atendidos</th>
                      <th className="py-2 pr-2 font-medium text-right">Projeção</th>
                      <th className="py-2 pr-2 font-medium text-right">
                        <span className="inline-flex items-center gap-1">
                          x {nomeMesAnterior}
                          <Dica>
                            Média de pacientes por dia neste mês contra a média por dia de{" "}
                            {nomeMesAnterior}. Usa média, e não total, porque houve dias em que a
                            agenda não foi usada neste sistema (a recepção estava no sistema antigo)
                            — esses dias ficam fora da conta.
                          </Dica>
                        </span>
                      </th>
                      <th className="py-2 pr-2 font-medium text-right">
                        <span className="inline-flex items-center gap-1">
                          Ocupação
                          <Dica>
                            Vagas com paciente ÷ vagas da grade no mês. Agenda por ordem de chegada
                            não entra. Marcações feitas só no sistema antigo não aparecem aqui.
                          </Dica>
                        </span>
                      </th>
                      <th className="py-2 font-medium text-right">Faltas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((e, i) => (
                      <tr key={e.especialidade} className="border-b last:border-0">
                        <td className="py-2 pr-2 text-muted-foreground tabular-nums">{i + 1}</td>
                        <td className="py-2 pr-2 font-medium">{e.especialidade}</td>
                        <td className="py-2 pr-2">
                          <div className="relative h-3 rounded-sm bg-muted">
                            <div
                              className="absolute inset-y-0 left-0 rounded-sm bg-primary/30"
                              style={{ width: `${(e.projetado / maior) * 100}%` }}
                            />
                            <div
                              className="absolute inset-y-0 left-0 rounded-sm bg-primary"
                              style={{ width: `${(e.atendidos / maior) * 100}%` }}
                            />
                            {e.ritmoAnteriorNoMes > 0 && (
                              <div
                                className="absolute -inset-y-0.5 w-0.5 bg-foreground/60"
                                style={{ left: `${(e.ritmoAnteriorNoMes / maior) * 100}%` }}
                              />
                            )}
                          </div>
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums">{n(e.atendidos)}</td>
                        <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">
                          {n(e.projetado)}
                        </td>
                        <td className="py-2 pr-2 text-right">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Variacao v={e.variacao} />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="px-3 py-2 text-xs">
                              {e.mediaDia.toLocaleString("pt-BR")}/dia agora ·{" "}
                              {e.mediaDiaAnterior.toLocaleString("pt-BR")}/dia em {nomeMesAnterior}
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums">
                          {e.ocupacao == null ? "—" : `${e.ocupacao.toLocaleString("pt-BR")}%`}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {e.taxaFalta.toLocaleString("pt-BR")}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ranking.length > 12 && (
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => setVerTodas((v) => !v)}
                >
                  {verTodas ? "Mostrar só as 12 maiores" : `Ver todas as ${ranking.length}`}
                </button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

type OrdemAgendas = "projetado" | "atendidos" | "ocupacao";

function BlocoAgendas({
  linhasCarregadas,
  erro,
  agendas,
}: {
  linhasCarregadas: boolean;
  erro: boolean;
  agendas: ReturnType<typeof agendasPorVolume>;
}) {
  const [ordem, setOrdem] = useState<OrdemAgendas>("projetado");

  const grupos = useMemo(() => {
    const ordenadas = [...agendas].sort((a, b) =>
      ordem === "ocupacao" ? (b.ocupacao ?? -1) - (a.ocupacao ?? -1) : b[ordem] - a[ordem],
    );
    return FAIXAS_VOLUME.map((f) => ({
      ...f,
      itens: ordenadas.filter((a) => faixaDoVolume(a.projetado) === f.id),
    })).filter((g) => g.itens.length > 0);
  }, [agendas, ordem]);

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CalendarRange className="h-5 w-5 text-primary" />
              Agendas por número de atendimentos
            </h2>
            <p className="text-xs text-muted-foreground">
              Agrupadas pela projeção do mês. Cada linha é um profissional numa agenda.
            </p>
          </div>
          <Select value={ordem} onValueChange={(v) => setOrdem(v as OrdemAgendas)}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="projetado">Ordenar por projeção</SelectItem>
              <SelectItem value="atendidos">Ordenar por já atendidos</SelectItem>
              <SelectItem value="ocupacao">Ordenar por ocupação</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {erro ? (
          <AvisoErro texto="Não foi possível ler o resumo da agenda." />
        ) : !linhasCarregadas ? (
          <Carregando />
        ) : grupos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem agendas com movimento neste mês.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-2 pr-2 font-medium">Profissional · agenda</th>
                  <th className="py-2 pr-2 font-medium">Especialidade</th>
                  <th className="py-2 pr-2 font-medium text-right">Atendidos</th>
                  <th className="py-2 pr-2 font-medium text-right">Projeção</th>
                  <th className="py-2 pr-2 font-medium text-right">Ocupação</th>
                  <th className="py-2 font-medium text-right">Faltas</th>
                </tr>
              </thead>
              {grupos.map((g) => (
                <tbody key={g.id}>
                  <tr className="bg-muted/50">
                    <td colSpan={6} className="py-1.5 px-2 text-xs font-semibold">
                      {g.rotulo} · {g.itens.length} agenda(s) ·{" "}
                      {n(g.itens.reduce((s, a) => s + a.projetado, 0))} projetados
                    </td>
                  </tr>
                  {g.itens.map((a) => (
                    <tr key={a.chave} className="border-b last:border-0">
                      <td className="py-2 pr-2">
                        <span className="font-medium">{a.medico}</span>
                        <span className="text-muted-foreground"> · {a.agenda}</span>
                        {a.ordemChegada && (
                          <span className="ml-1 text-[11px] text-muted-foreground">
                            (ordem de chegada)
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-muted-foreground">{a.especialidade}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{n(a.atendidos)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{n(a.projetado)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {a.ocupacao == null ? "—" : `${a.ocupacao.toLocaleString("pt-BR")}%`}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {a.taxaFalta.toLocaleString("pt-BR")}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
