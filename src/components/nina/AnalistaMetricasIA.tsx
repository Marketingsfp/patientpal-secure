/**
 * FASE 9 — Seção "Análise com IA" dentro do painel de métricas da Nina.
 *
 * Nada aqui altera os filtros do painel sozinho, e o modelo só é chamado por
 * clique explícito. Tabelas e números vêm sempre dos dados estruturados
 * devolvidos pelo servidor, nunca de texto escrito pelo modelo.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ChevronDown,
  History,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mostrarErro } from "@/lib/traduzir-erro";
import {
  listarAnalisesMetricasNina,
  perguntarAnalistaMetricas,
} from "@/lib/nina/analista-metricas.functions";

export type FiltrosPainel = {
  de: string;
  ate: string;
  diaInteiro: boolean;
  horaInicio: string | null;
  horaFim: string | null;
  ambiente: "producao" | "todos";
  unidadeId: string | null;
};

type Resultado = Awaited<ReturnType<typeof perguntarAnalistaMetricas>>;
type Turno = { pergunta: string; resultado: Resultado };

const SUGESTOES = [
  "Analise o mês selecionado.",
  "Como foi o desempenho pela manhã?",
  "Analise somente os sábados.",
  "Compare dentro e fora do horário de atendimento.",
  "Quais foram os principais pontos de atenção?",
];

function dataHora(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString("pt-BR") : "—";
}

function numero(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (!itens?.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{titulo}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {itens.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

/** Dados estruturados que sustentam a resposta (nunca texto do modelo). */
function DadosUtilizados({ resultado }: { resultado: Resultado }) {
  const consultas = (resultado.resultados ?? []) as any[];
  return (
    <div className="space-y-4">
      {consultas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma consulta foi executada.</p>
      ) : null}
      {consultas.map((c) => (
        <div key={c.id} className="space-y-2 rounded-md border p-3">
          <p className="text-xs font-medium text-muted-foreground">{c.id}</p>
          {(c.dados?.periodos ?? []).map((p: any, i: number) => (
            <div key={i} className="space-y-2">
              <p className="text-sm font-medium">{p.rotulo}</p>
              <p className="text-xs text-muted-foreground">{p.filtros?.descricao}</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Indicador</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(p.indicadores ?? {}).map(([k, v]) => (
                    <TableRow key={k}>
                      <TableCell className="text-sm">{k}</TableCell>
                      <TableCell className="text-right text-sm">{numero(Number(v))}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="text-sm">Taxa de erro (%)</TableCell>
                    <TableCell className="text-right text-sm">
                      {p.taxaErro?.valor === null || p.taxaErro?.valor === undefined
                        ? "indisponível"
                        : numero(p.taxaErro.valor)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">
                Fórmula: {p.taxaErro?.formula ?? "—"} · Numerador {p.taxaErro?.numerador ?? "—"} ·
                Denominador {p.taxaErro?.denominador ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                Cobertura: {p.cobertura?.dias ?? "—"} dia(s), {p.cobertura?.horas ?? "—"} hora(s)
                {p.cobertura?.parcial ? " · período parcial (ainda em andamento)" : ""}
              </p>
              {(p.cobertura?.limitacoes ?? []).length ? (
                <ul className="list-disc pl-5 text-xs text-muted-foreground">
                  {p.cobertura.limitacoes.map((l: string, j: number) => (
                    <li key={j}>{l}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Regras de cálculo {resultado.versao_regras} · modelo {resultado.modelo} · dados consultados
        em {dataHora(resultado.dados_atualizados_em)} · {resultado.input_tokens} tokens de entrada e{" "}
        {resultado.output_tokens} de saída
        {resultado.custo_estimado !== null && resultado.custo_estimado !== undefined
          ? ` · custo estimado ${resultado.custo_estimado} ${resultado.custo_moeda ?? ""} (preços de ${resultado.custo_preco_vigencia ?? "data não informada"})`
          : " · custo não calculado (sem preços cadastrados)"}
      </p>
    </div>
  );
}

function Resposta({
  resultado,
  onAplicarRecorte,
}: {
  resultado: Resultado;
  onAplicarRecorte?: (r: {
    de: string;
    ate: string;
    diaInteiro: boolean;
    horaInicio: string | null;
    horaFim: string | null;
  }) => void;
}) {
  const r = resultado.resposta as any;
  const primeiroFiltro = (resultado.resultados as any[])?.[0]?.dados?.periodos?.[0]?.filtros;
  const compativel =
    primeiroFiltro?.de &&
    primeiroFiltro?.ate &&
    (resultado.resultados as any[])?.length === 1 &&
    ((resultado.resultados as any[])[0]?.dados?.periodos ?? []).length === 1 &&
    !primeiroFiltro?.diasSemana;

  if (resultado.status === "falha") {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <p className="font-medium text-destructive">Análise não concluída</p>
        <p className="text-muted-foreground">{resultado.erro}</p>
      </div>
    );
  }

  if (!r) return null;

  return (
    <div className="space-y-4">
      {resultado.status === "invalida" ? (
        <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <div>
            <p className="font-medium text-destructive">Relatório não validado</p>
            <p className="text-muted-foreground">
              Alguns números citados não conferem com as consultas. Este texto não deve ser usado
              como resultado final.
            </p>
            <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
              {(resultado.problemas as any[]).map((p, i) => (
                <li key={i}>
                  {p.campo}: {p.detalhe}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {r.precisa_esclarecimento ? (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="font-medium">O analista precisa de uma informação</p>
          <p className="text-muted-foreground">{r.pergunta_ao_usuario}</p>
        </div>
      ) : (
        <>
          {/* Conclusão principal primeiro. */}
          <p className="text-sm font-medium leading-relaxed">{r.resumo}</p>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Recorte: {r.recorte_utilizado}</Badge>
            {compativel && onAplicarRecorte ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  onAplicarRecorte({
                    de: primeiroFiltro.de,
                    ate: primeiroFiltro.ate,
                    diaInteiro: primeiroFiltro.diaInteiro !== false,
                    horaInicio: primeiroFiltro.horaInicio ?? null,
                    horaFim: primeiroFiltro.horaFim ?? null,
                  })
                }
              >
                Aplicar este recorte ao painel
              </Button>
            ) : null}
          </div>

          {r.indicadores?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Indicador</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.indicadores.map((i: any, k: number) => (
                  <TableRow key={k}>
                    <TableCell className="text-sm">{i.rotulo}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{i.periodo}</TableCell>
                    <TableCell className="text-right text-sm">{numero(i.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}

          {r.comparacoes?.length ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">Comparações</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {r.comparacoes.map((c: any, k: number) => (
                  <li key={k}>
                    {c.descricao}: {numero(c.valor)}
                    {c.tipo === "percentual"
                      ? "% (variação)"
                      : c.tipo === "pontos_percentuais"
                        ? " ponto(s) percentual(is)"
                        : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Lista titulo="O que os dados mostram" itens={r.o_que_os_dados_mostram} />
          <Lista titulo="Interpretação possível" itens={r.interpretacao_possivel} />
          <Lista titulo="Hipóteses a investigar" itens={r.hipoteses_a_investigar} />
          <Lista titulo="Pontos de atenção" itens={r.pontos_de_atencao} />
          <Lista titulo="Recomendações (para avaliação humana)" itens={r.recomendacoes} />
          <Lista titulo="Limitações" itens={r.limitacoes} />
        </>
      )}

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm">
            <ChevronDown className="mr-1 h-4 w-4" aria-hidden />
            Ver dados utilizados
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <DadosUtilizados resultado={resultado} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function AnalistaMetricasIA({
  clinicaId,
  filtros,
  resumoRecorte,
  filtrosErroAtivos,
  onAplicarRecorte,
}: {
  clinicaId: string | null;
  filtros: FiltrosPainel;
  resumoRecorte: string;
  filtrosErroAtivos: boolean;
  onAplicarRecorte?: (r: {
    de: string;
    ate: string;
    diaInteiro: boolean;
    horaInicio: string | null;
    horaFim: string | null;
  }) => void;
}) {
  const perguntar = useServerFn(perguntarAnalistaMetricas);
  const listar = useServerFn(listarAnalisesMetricasNina);

  const [pergunta, setPergunta] = useState("");
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [rodando, setRodando] = useState(false);
  const [ativa, setAtiva] = useState<boolean | null>(null);
  const [modelo, setModelo] = useState<string>("");
  const [limites, setLimites] = useState<any>(null);
  const [historico, setHistorico] = useState<any[]>([]);

  // Só o histórico é carregado ao abrir a página — o modelo NÃO é chamado.
  const carregarHistorico = useCallback(async () => {
    if (!clinicaId) return;
    try {
      const r = await listar({ data: { clinicaId } });
      setHistorico(r.analises as any[]);
      setAtiva(r.ativa);
      setModelo(r.modelo);
      setLimites(r.limites);
    } catch {
      setAtiva(false);
    }
  }, [clinicaId, listar]);

  useEffect(() => {
    void carregarHistorico();
  }, [carregarHistorico]);

  const contexto = useMemo(
    () =>
      turnos.slice(-6).map((t) => ({
        pergunta: t.pergunta,
        recorteUtilizado: (t.resultado.resposta as any)?.recorte_utilizado ?? "",
        resumo: (t.resultado.resposta as any)?.resumo ?? "",
      })),
    [turnos],
  );

  const executar = useCallback(
    async (texto: string, origem: "pergunta" | "filtros_atuais" | "atualizacao") => {
      if (!clinicaId || !texto.trim() || rodando) return;
      setRodando(true);
      try {
        const resultado = await perguntar({
          data: {
            clinicaId,
            pergunta: texto.trim(),
            painel: filtros,
            historico: contexto,
            origem,
          },
        });
        setTurnos((t) => [...t, { pergunta: texto.trim(), resultado }]);
        setPergunta("");
        void carregarHistorico();
      } catch (e) {
        mostrarErro(e);
      } finally {
        setRodando(false);
      }
    },
    [clinicaId, rodando, perguntar, filtros, contexto, carregarHistorico],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          Análise com IA
          {modelo ? <Badge variant="outline">Modelo: {modelo}</Badge> : null}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Analista interno, separado da Nina que atende pacientes. Ele só consulta indicadores
          agregados e só roda quando você clica. Recorte atual do painel: {resumoRecorte}.
        </p>
        {filtrosErroAtivos ? (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            Há filtros específicos de erro ativos. A análise sai filtrada e não é um diagnóstico
            geral de todos os erros.
          </p>
        ) : null}
        {ativa === false ? (
          <p className="text-xs text-muted-foreground">
            A análise com IA não está liberada para esta clínica.
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {SUGESTOES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant="secondary"
              disabled={rodando || ativa === false}
              onClick={() => setPergunta(s)}
            >
              {s}
            </Button>
          ))}
        </div>

        <Textarea
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          placeholder="Pergunte em linguagem natural. Ex.: compare as manhãs deste mês com as do mês passado."
          rows={3}
          disabled={rodando || ativa === false}
        />

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void executar(pergunta, "pergunta")}
            disabled={rodando || !pergunta.trim() || ativa === false}
          >
            {rodando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Send className="mr-2 h-4 w-4" aria-hidden />
            )}
            Enviar pergunta
          </Button>
          <Button
            variant="outline"
            disabled={rodando || ativa === false}
            onClick={() =>
              void executar(
                "Analise o recorte exatamente como está nos filtros atuais do painel, sem alterá-lo.",
                "filtros_atuais",
              )
            }
          >
            Analisar filtros atuais
          </Button>
          {turnos.length ? (
            <Button variant="ghost" disabled={rodando} onClick={() => setTurnos([])}>
              Limpar conversa
            </Button>
          ) : null}
        </div>

        {rodando ? (
          <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Consultando os dados e gerando a análise…
            </p>
            <p className="text-xs text-muted-foreground">
              Preparado o contexto · consultando os indicadores autorizados · redigindo a análise. O
              resultado só aparece quando estiver completo e conferido.
            </p>
          </div>
        ) : null}

        {turnos.map((t, i) => (
          <div key={i} className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">Você: {t.pergunta}</p>
            <Resposta resultado={t.resultado} onAplicarRecorte={onAplicarRecorte} />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Gerada em {dataHora(t.resultado.created_at)}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={rodando}
                onClick={() => void executar(t.pergunta, "atualizacao")}
              >
                <RefreshCw className="mr-1 h-3 w-3" aria-hidden />
                Atualizar análise
              </Button>
            </div>
          </div>
        ))}

        {historico.length ? (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                <History className="mr-1 h-4 w-4" aria-hidden />
                Análises anteriores ({historico.length})
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              {historico.map((h) => (
                <div key={h.id} className="space-y-1 rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Histórica</Badge>
                    <span className="text-xs text-muted-foreground">
                      {dataHora(h.created_at)} · dados de {dataHora(h.dados_atualizados_em)} ·
                      regras {h.versao_regras} · {h.modelo}
                    </span>
                  </div>
                  <p className="text-sm">{h.pergunta}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.status === "ok"
                      ? (h.resposta?.resumo ?? "")
                      : h.status === "invalida"
                        ? "Relatório não validado."
                        : `Falha: ${h.erro ?? ""}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Recorte: {h.recorte_utilizado ?? "—"}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={rodando}
                    onClick={() => void executar(h.pergunta, "atualizacao")}
                  >
                    <RefreshCw className="mr-1 h-3 w-3" aria-hidden />
                    Atualizar análise
                  </Button>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ) : null}

        {limites ? (
          <p className="text-xs text-muted-foreground">
            Limites desta clínica: {limites.max_consultas_por_pergunta} consultas por pergunta,{" "}
            {limites.max_rodadas} rodadas, {limites.max_tokens_saida} tokens de resposta,{" "}
            {Math.round(limites.timeout_ms / 1000)}s de execução e {limites.max_analises_por_dia}{" "}
            análises por dia.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
