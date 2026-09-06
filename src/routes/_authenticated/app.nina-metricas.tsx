/**
 * Nina → Métricas de Aprendizado (FASE 6).
 *
 * Painel somente leitura. Nenhuma ação aqui altera planilha, Base de
 * Conhecimentos, embeddings, prompt, modelo, regras, ferramentas ou
 * feedbacks. Os números não expõem texto ou dados pessoais do paciente.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { mostrarErro } from "@/lib/traduzir-erro";
import {
  CATEGORIAS_FEEDBACK_NINA,
  rotuloCategoriaFeedback,
} from "@/lib/nina/feedback-erros";
import {
  CAUSAS_RAIZ_NINA,
  PRIORIDADES_NINA,
  rotuloCausaRaiz,
  rotuloPrioridade,
} from "@/lib/nina/feedback-diagnostico";
import {
  FUSO_OPERACAO_PADRAO,
  validarRecorte,
} from "@/lib/nina/metricas-filtros";
import {
  metricasAprendizadoNina,
  trilhaAuditoriaAprendizadoNina,
} from "@/lib/nina/feedback-metricas.functions";

export const Route = createFileRoute("/_authenticated/app/nina-metricas")({
  head: () => ({
    meta: [
      { title: "Nina — Métricas de Aprendizado" },
      {
        name: "description",
        content:
          "Indicadores de evolução da Nina: erros reportados, causas, correções aplicadas, revertidas e taxa de erro por período.",
      },
      { property: "og:title", content: "Nina — Métricas de Aprendizado" },
      {
        property: "og:description",
        content: "Evolução medida dos erros reportados e das correções aplicadas na Nina.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

type Metricas = Awaited<ReturnType<typeof metricasAprendizadoNina>>;
type Trilha = Awaited<ReturnType<typeof trilhaAuditoriaAprendizadoNina>>;

const TODOS = "__todos__";

const STATUS_ROTULO: Record<string, string> = {
  pending: "Pendentes",
  under_review: "Em revisão",
  approved: "Aprovados",
  rejected: "Rejeitados",
  applied: "Aplicados",
  reverted: "Revertidos",
};

function pct(v: number | null) {
  return v === null ? "—" : `${v.toFixed(2)}%`;
}

function dataISO(diasAtras: number) {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  return d.toISOString().slice(0, 10);
}

function Indicador({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
        {detalhe ? <p className="text-xs text-muted-foreground">{detalhe}</p> : null}
      </CardContent>
    </Card>
  );
}

function Pagina() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;

  const buscarMetricas = useServerFn(metricasAprendizadoNina);
  const buscarTrilha = useServerFn(trilhaAuditoriaAprendizadoNina);

  const [carregando, setCarregando] = useState(false);
  const [dados, setDados] = useState<Metricas | null>(null);
  const [unidades, setUnidades] = useState<{ id: string; nome: string }[]>([]);

  const [granularidade, setGranularidade] = useState<"dia" | "semana" | "mes">("dia");
  const [de, setDe] = useState(dataISO(30));
  const [ate, setAte] = useState(dataISO(0));
  const [diaInteiro, setDiaInteiro] = useState(true);
  const [horaInicio, setHoraInicio] = useState("07:00");
  const [horaFim, setHoraFim] = useState("12:00");
  const [ambiente, setAmbiente] = useState<"producao" | "todos">("producao");
  const [erroConsulta, setErroConsulta] = useState<string | null>(null);
  const [status, setStatus] = useState(TODOS);
  const [categoria, setCategoria] = useState(TODOS);
  const [rootCause, setRootCause] = useState(TODOS);
  const [prioridade, setPrioridade] = useState(TODOS);
  const [unidadeId, setUnidadeId] = useState(TODOS);
  const [assunto, setAssunto] = useState("");

  const [trilhaId, setTrilhaId] = useState("");
  const [trilha, setTrilha] = useState<Trilha | null>(null);
  const [carregandoTrilha, setCarregandoTrilha] = useState(false);

  // Evita que uma consulta antiga sobrescreva uma seleção mais recente.
  const consultaRef = useRef(0);

  const erroFiltro = useMemo(
    () => validarRecorte({ de, ate, diaInteiro, horaInicio, horaFim }),
    [de, ate, diaInteiro, horaInicio, horaFim],
  );

  useEffect(() => {
    if (!clinicaId) return;
    let ativo = true;
    void supabase
      .from("unidades")
      .select("id, nome")
      .eq("clinica_id", clinicaId)
      .order("nome")
      .then(({ data }) => {
        if (ativo) setUnidades((data ?? []) as { id: string; nome: string }[]);
      });
    return () => {
      ativo = false;
    };
  }, [clinicaId]);

  const carregar = useCallback(async () => {
    if (!clinicaId || erroFiltro) return;
    const meu = ++consultaRef.current;
    setCarregando(true);
    try {
      const res = await buscarMetricas({
        data: {
          clinicaId,
          granularidade,
          de,
          ate,
          diaInteiro,
          horaInicio: diaInteiro ? null : horaInicio,
          horaFim: diaInteiro ? null : horaFim,
          fuso: FUSO_OPERACAO_PADRAO,
          status: status === TODOS ? null : (status as never),
          categoria: categoria === TODOS ? null : (categoria as never),
          rootCause: rootCause === TODOS ? null : (rootCause as never),
          prioridade: prioridade === TODOS ? null : (prioridade as never),
          unidadeId: unidadeId === TODOS ? null : unidadeId,
          assunto: assunto.trim() || null,
          ambiente,
        },
      });
      if (meu === consultaRef.current) {
        setDados(res);
        setErroConsulta(null);
      }
    } catch (e) {
      // Falha nunca vira zero na tela: os cartões saem de cena e entra o aviso.
      if (meu === consultaRef.current) {
        setDados(null);
        setErroConsulta(e instanceof Error ? e.message : "Não foi possível carregar os números.");
        mostrarErro(e);
      }
    } finally {
      if (meu === consultaRef.current) setCarregando(false);
    }
  }, [
    buscarMetricas,
    clinicaId,
    erroFiltro,
    granularidade,
    de,
    ate,
    diaInteiro,
    horaInicio,
    horaFim,
    status,
    categoria,
    rootCause,
    prioridade,
    unidadeId,
    assunto,
    ambiente,
  ]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const abrirTrilha = async () => {
    if (!clinicaId || !trilhaId.trim()) return;
    setCarregandoTrilha(true);
    try {
      setTrilha(await buscarTrilha({ data: { clinicaId, feedbackId: trilhaId.trim() } }));
    } catch (e) {
      mostrarErro(e);
    } finally {
      setCarregandoTrilha(false);
    }
  };


  const maxSerie = useMemo(
    () => Math.max(1, ...(dados?.evolucao ?? []).map((p) => p.reportados)),
    [dados],
  );

  const ind = dados?.indicadores;
  const op = dados?.operacionais;

  // Resumo do recorte ativo, sempre visível (mesmo antes da primeira resposta).
  const resumoRecorte = useMemo(() => {
    const nomeUnidade =
      unidadeId === TODOS ? "todas as unidades" : (unidades.find((u) => u.id === unidadeId)?.nome ?? "unidade selecionada");
    const faixa = diaInteiro ? "dia inteiro" : `das ${horaInicio} às ${horaFim} em cada dia`;
    const amb = ambiente === "producao" ? "somente produção" : "produção + testes";
    return `${de} a ${ate} · ${faixa} · ${nomeUnidade} · ${amb} · fuso ${FUSO_OPERACAO_PADRAO}`;
  }, [de, ate, diaInteiro, horaInicio, horaFim, unidadeId, unidades, ambiente]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <BarChart3 className="h-6 w-6 text-primary" aria-hidden />
            Nina — Métricas de Aprendizado
          </h1>
          <p className="text-sm text-muted-foreground">
            Painel somente leitura. Sem dados pessoais do paciente e sem alterar nada da Nina.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void carregar()}
          disabled={carregando || Boolean(erroFiltro)}
        >
          {carregando ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
          )}
          Atualizar
        </Button>
      </header>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="de">De</Label>
            <Input id="de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ate">Até</Label>
            <Input id="ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hora-inicio">Horário inicial</Label>
            <Input
              id="hora-inicio"
              type="time"
              value={horaInicio}
              disabled={diaInteiro}
              onChange={(e) => setHoraInicio(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hora-fim">Horário final</Label>
            <Input
              id="hora-fim"
              type="time"
              value={horaFim}
              disabled={diaInteiro}
              onChange={(e) => setHoraFim(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 md:col-span-4">
            <input
              id="dia-inteiro"
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={diaInteiro}
              onChange={(e) => setDiaInteiro(e.target.checked)}
            />
            <Label htmlFor="dia-inteiro" className="cursor-pointer">
              Dia inteiro
            </Label>
            <span className="text-xs text-muted-foreground">
              A faixa de horário vale em cada dia do período (10 a 12/09 das 07:00 às 12:00 conta só
              essas manhãs). O horário inicial entra e o final não entra: 07:00 sim, 12:00 não.
              Horários no fuso da operação ({FUSO_OPERACAO_PADRAO}), não no do seu computador.
            </span>
          </div>
          {erroFiltro ? (
            <p className="text-sm font-medium text-destructive md:col-span-4">{erroFiltro}</p>
          ) : null}

          <div className="space-y-1">
            <Label>Período do gráfico</Label>
            <Select value={granularidade} onValueChange={(v) => setGranularidade(v as never)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dia">Por dia</SelectItem>
                <SelectItem value="semana">Por semana</SelectItem>
                <SelectItem value="mes">Por mês</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Unidade</Label>
            <Select value={unidadeId} onValueChange={setUnidadeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas</SelectItem>
                {unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Ambiente</Label>
            <Select value={ambiente} onValueChange={(v) => setAmbiente(v as never)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="producao">Somente produção</SelectItem>
                <SelectItem value="todos">Produção + testes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground md:col-span-4">
            Recorte em uso: {resumoRecorte}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filtros específicos dos erros reportados</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0 md:grid-cols-4">
          <p className="text-xs text-muted-foreground md:col-span-4">
            Estes filtros afetam apenas os erros reportados e a seção de aprendizado. Eles não
            reduzem as mensagens totais do sistema nem os demais números operacionais acima.
          </p>
          <div className="space-y-1">
            <Label>Situação</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas</SelectItem>
                {Object.entries(STATUS_ROTULO).map(([v, r]) => (
                  <SelectItem key={v} value={v}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Tipo de erro</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {CATEGORIAS_FEEDBACK_NINA.map((c) => (
                  <SelectItem key={c.valor} value={c.valor}>{c.rotulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Causa</Label>
            <Select value={rootCause} onValueChange={setRootCause}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas</SelectItem>
                {CAUSAS_RAIZ_NINA.map((c) => (
                  <SelectItem key={c.valor} value={c.valor}>{c.rotulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Prioridade</Label>
            <Select value={prioridade} onValueChange={setPrioridade}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas</SelectItem>
                {PRIORIDADES_NINA.map((p) => (
                  <SelectItem key={p.valor} value={p.valor}>{p.rotulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="assunto">Assunto / procedimento</Label>
            <Input
              id="assunto"
              placeholder="Ex.: Cardiologia"
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Alcance: filtra apenas os erros reportados que têm assunto registrado. Não é aplicado
              a indicadores sem vínculo confiável com esse assunto.
            </p>
          </div>
          {dados?.recorte ? (
            <p className="text-xs text-muted-foreground md:col-span-4">
              Recorte em uso: {dados.recorte.descricao}
              {dados.recorte.filtrosErroAtivos
                ? " A taxa mostra os erros filtrados sobre o total do recorte operacional, que não é reduzido por esses filtros."
                : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {erroConsulta ? (
        <Card className="border-destructive">
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-medium text-destructive">
              Não foi possível carregar os números deste recorte.
            </p>
            <p className="text-xs text-muted-foreground">
              Os cartões ficam ocultos de propósito: uma falha de consulta não é o mesmo que
              “nenhuma ocorrência”. Detalhe técnico: {erroConsulta}
            </p>
            <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={carregando}>
              Tentar de novo
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {carregando && !dados && !erroConsulta ? (
        <section
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy="true"
          aria-label="Carregando indicadores"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-2 p-4">
                <span className="block h-3 w-32 animate-pulse rounded bg-muted" />
                <span className="block h-7 w-20 animate-pulse rounded bg-muted" />
                <span className="block h-3 w-44 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      {op ? (
        <Card className={carregando ? "opacity-60 transition-opacity" : undefined}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Indicadores operacionais do período</CardTitle>
            <p className="text-xs text-muted-foreground">
              {carregando ? "Atualizando com o recorte novo…" : `Recorte: ${dados?.recorte?.descricao ?? resumoRecorte}`}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {op.mensagensTotais === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                Nenhuma mensagem de atendimento neste recorte. Os números abaixo são zero reais, não
                falha de consulta.
              </p>
            ) : null}
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Indicador
                titulo="Mensagens totais do sistema"
                valor={String(op.mensagensTotais)}
                detalhe={`${op.msgsPaciente} de pacientes · ${op.msgsNina} da Nina · ${op.msgsHumano} de atendentes · ${op.msgsAutomaticas} automáticas`}
              />
              <Indicador
                titulo="Mensagens com participação da Nina"
                valor={String(op.ninaParticipacao)}
                detalhe={`${op.ninaEntrada} recebidas e processadas · ${op.ninaSaida} respostas enviadas`}
              />
              <Indicador
                titulo="Erros reportados da Nina"
                valor={String(op.errosReportados)}
                detalhe={
                  op.errosSemVinculo
                    ? `${op.errosSemVinculo} reporte(s) sem vínculo com a mensagem original — não entram na taxa`
                    : "Pela data e hora da mensagem original"
                }
              />
              <Indicador
                titulo="Agendamentos concluídos pela Nina"
                valor={String(op.agendamentosNina)}
                detalhe="Pelo momento da conclusão, não pela data da consulta"
              />
              <Indicador
                titulo="Encaminhamentos para atendentes"
                valor={String(op.encaminhamentos)}
                detalhe="Inclui a entrada em “Não atribuídas”"
              />
              <Indicador
                titulo="Taxa de erro"
                valor={op.taxaErroSistema === null ? "—" : pct(op.taxaErroSistema)}
                detalhe={
                  op.mensagensTotais === 0
                    ? "Sem mensagens no período"
                    : `${op.errosReportados} erros reportados / ${op.mensagensTotais} mensagens totais`
                }
              />
            </section>
            <p className="text-xs text-muted-foreground">
              A taxa é baseada em reportes, inclusive os ainda não confirmados. Não é uma medida
              definitiva de acurácia da Nina. Ambiente:{" "}
              {op.ambiente === "producao" ? "produção" : "produção + testes"}.
            </p>
            {op.ninaEntrada === 0 ? (
              <p className="text-xs text-muted-foreground">
                Mensagens recebidas processadas pela Nina só passaram a ser registradas a partir
                desta versão
                {op.entradaMedidaDesde
                  ? ` (medição confiável desde ${new Date(op.entradaMedidaDesde).toLocaleString("pt-BR")})`
                  : " (ainda sem nenhum registro)"}
                . Períodos anteriores não são estimados.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {ind ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador titulo="Erros reportados" valor={String(ind.reportados)} />
            <Indicador
              titulo="Erros confirmados"
              valor={String(ind.confirmados)}
              detalhe={`${ind.pendentes} pendentes · ${ind.emRevisao} em revisão`}
            />
            <Indicador titulo="Feedbacks rejeitados" valor={String(ind.rejeitados)} />
            <Indicador
              titulo="Correções aplicadas"
              valor={String(ind.aplicados)}
              detalhe={`${ind.validados} validadas · ${ind.falhasValidacao} falharam no teste`}
            />
            <Indicador titulo="Correções revertidas" valor={String(ind.revertidos)} />
            <Indicador
              titulo="Reportes por resposta da Nina (referência)"
              valor={pct(ind.taxaErro)}
              detalhe={`${ind.execucoes} respostas da Nina no período · a taxa oficial usa as mensagens totais do sistema`}
            />
            <Indicador titulo="Alucinações" valor={String(ind.porCausa.hallucination)} />
            <Indicador
              titulo="Prioridade crítica"
              valor={String(ind.porPrioridade.critico)}
              detalhe={`${ind.porPrioridade.alto} alto · ${ind.porPrioridade.normal} normal`}
            />
          </section>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Erros por causa</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {CAUSAS_RAIZ_NINA.map((c) => (
                <div
                  key={c.valor}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <span className="text-sm">{c.rotulo}</span>
                  <span className="font-semibold tabular-nums">
                    {ind.porCausa[c.valor as keyof typeof ind.porCausa] ?? 0}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Evolução temporal</CardTitle>
            </CardHeader>
            <CardContent>
              {dados.evolucao.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem registros no período.</p>
              ) : (
                <ul className="space-y-2">
                  {dados.evolucao.map((p) => (
                    <li key={p.periodo} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">
                        {p.periodo}
                      </span>
                      <span className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${(p.reportados / maxSerie) * 100}%` }}
                        />
                      </span>
                      <span className="w-56 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {p.reportados} reportados · {p.aplicados} aplicados · {p.revertidos}{" "}
                        revertidos · taxa {pct(p.taxaErro)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Problemas mais reportados</CardTitle>
            </CardHeader>
            <CardContent>
              {dados.recorrentes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem registros no período.</p>
              ) : (
                <ul className="divide-y">
                  {dados.recorrentes.map((r) => (
                    <li
                      key={`${r.assunto}-${r.categoria}`}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <span className="text-sm font-medium">{r.assunto}</span>
                      <span className="flex items-center gap-2">
                        <Badge variant="secondary">{rotuloCategoriaFeedback(r.categoria)}</Badge>
                        {r.rootCause ? (
                          <Badge variant="outline">{rotuloCausaRaiz(r.rootCause)}</Badge>
                        ) : null}
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {r.ocorrencias} ocorrência{r.ocorrencias > 1 ? "s" : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Auditoria de um feedback</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1 space-y-1">
            <Label htmlFor="trilha">Código do feedback</Label>
            <Input
              id="trilha"
              placeholder="Cole aqui o código do feedback"
              value={trilhaId}
              onChange={(e) => setTrilhaId(e.target.value)}
            />
          </div>
          <Button onClick={() => void abrirTrilha()} disabled={carregandoTrilha || !trilhaId.trim()}>
            {carregandoTrilha ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Search className="mr-2 h-4 w-4" aria-hidden />
            )}
            Ver trilha completa
          </Button>
        </CardContent>
      </Card>

      <Dialog open={Boolean(trilha)} onOpenChange={(o) => !o && setTrilha(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Trilha do aprendizado</DialogTitle>
            <DialogDescription>
              Erro → feedback → revisão → diagnóstico → aprovação → alteração → teste → resultado.
            </DialogDescription>
          </DialogHeader>
          {trilha ? (
            <div className="space-y-3 text-sm">
              <p>
                <strong>Tipo de erro:</strong> {rotuloCategoriaFeedback(trilha.feedback.categoria)} ·{" "}
                <strong>Situação:</strong>{" "}
                {STATUS_ROTULO[trilha.feedback.status] ?? trilha.feedback.status}
              </p>
              <p>
                <strong>Causa:</strong>{" "}
                {trilha.feedback.root_cause ? rotuloCausaRaiz(trilha.feedback.root_cause) : "—"} ·{" "}
                <strong>Prioridade:</strong>{" "}
                {trilha.feedback.prioridade ? rotuloPrioridade(trilha.feedback.prioridade) : "—"}
              </p>
              <p>
                <strong>Reportado em:</strong>{" "}
                {new Date(trilha.feedback.created_at).toLocaleString("pt-BR")} ·{" "}
                <strong>Revisado em:</strong>{" "}
                {trilha.feedback.revisado_em
                  ? new Date(trilha.feedback.revisado_em).toLocaleString("pt-BR")
                  : "—"}
              </p>
              <p>
                <strong>Aplicado em:</strong>{" "}
                {trilha.feedback.aplicado_em
                  ? new Date(trilha.feedback.aplicado_em).toLocaleString("pt-BR")
                  : "—"}{" "}
                · <strong>Teste:</strong> {trilha.feedback.validacao_status ?? "—"}
              </p>
              <div>
                <p className="font-medium">Ações técnicas ({trilha.acoes.length})</p>
                <ul className="mt-1 space-y-1">
                  {trilha.acoes.map((a) => (
                    <li key={a.id} className="rounded-md border px-3 py-2">
                      {a.titulo} — {a.status}
                      {a.homologado ? " · homologada" : ""}
                    </li>
                  ))}
                  {trilha.acoes.length === 0 ? (
                    <li className="text-muted-foreground">Nenhuma ação registrada.</li>
                  ) : null}
                </ul>
              </div>
              <div>
                <p className="font-medium">Versões ({trilha.versoes.length})</p>
                <ul className="mt-1 space-y-1">
                  {trilha.versoes.map((v) => (
                    <li key={v.id} className="rounded-md border px-3 py-2">
                      v{v.versao} · {v.item}: {v.valor_anterior ?? "—"} → {v.valor_novo ?? "—"} ·{" "}
                      {v.status}
                      {v.teste_status ? ` · teste ${v.teste_status}` : ""}
                    </li>
                  ))}
                  {trilha.versoes.length === 0 ? (
                    <li className="text-muted-foreground">Nenhuma versão registrada.</li>
                  ) : null}
                </ul>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
