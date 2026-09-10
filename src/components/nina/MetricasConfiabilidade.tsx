/**
 * FASE 6 — Métricas de confiabilidade da Nina.
 *
 * Painel somente leitura, dentro do módulo de Métricas de Aprendizado.
 * Não altera nenhum indicador existente e não expõe texto do paciente.
 */
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Gauge, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  metricasConfiabilidadeNina,
} from "@/lib/nina/confianca.functions";
import type { MetricasConfiabilidade as Dados } from "@/lib/nina/confidence/metricas";

const ROTULO_PERIODO: Record<string, string> = {
  DENTRO_DO_HORARIO: "Dentro do horário",
  FORA_DO_HORARIO: "Fora do horário",
  NAO_CLASSIFICAVEL: "Sem horário publicado",
};

const ROTULO_TIPO: Record<string, string> = {
  valor: "Valores",
  horario: "Horários",
  profissional: "Profissionais",
  disponibilidade: "Disponibilidade",
  preparo: "Preparo de exame",
  regra: "Regras e restrições",
  agendamento: "Agendamento",
  consulta: "Consulta",
  exame: "Exame",
  clinico_administrativo: "Dados do paciente",
  nao_classificado: "Não classificado",
};

const formatarNumero = (n: number) => n.toLocaleString("pt-BR");
const formatarPercentual = (n: number) =>
  `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{titulo}</p>
      {children}
    </div>
  );
}

function ListaContagem({
  itens,
  vazio,
  rotulos,
}: {
  itens: Array<{ chave: string; total: number }>;
  vazio: string;
  rotulos?: Record<string, string>;
}) {
  if (itens.length === 0) return <p className="text-sm text-muted-foreground">{vazio}</p>;
  return (
    <ul className="space-y-1 text-sm">
      {itens.slice(0, 5).map((i) => (
        <li key={i.chave} className="flex items-center justify-between gap-2">
          <span className="truncate">{rotulos?.[i.chave] ?? i.chave}</span>
          <span className="tabular-nums text-muted-foreground">{i.total}</span>
        </li>
      ))}
    </ul>
  );
}

function ListaMedia({
  itens,
  vazio,
  rotulos,
}: {
  itens: Array<{ chave: string; total: number; scoreMedio: number; baixa: number }>;
  vazio: string;
  rotulos?: Record<string, string>;
}) {
  if (itens.length === 0) return <p className="text-sm text-muted-foreground">{vazio}</p>;
  return (
    <ul className="space-y-1 text-sm">
      {itens.slice(0, 8).map((i) => (
        <li key={i.chave} className="flex items-center justify-between gap-2">
          <span className="truncate">{rotulos?.[i.chave] ?? i.chave}</span>
          <span className="tabular-nums text-muted-foreground">
            {i.scoreMedio}% · {i.total}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function MetricasConfiabilidade({ clinicaId }: { clinicaId: string | null | undefined }) {
  const buscar = useServerFn(metricasConfiabilidadeNina);
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [dias, setDias] = useState<7 | 30 | 90>(30);
  const [ambiente, setAmbiente] = useState<"todos" | "producao" | "homologacao">("producao");

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    setCarregando(true);
    try {
      const r = (await buscar({ data: { clinicaId, dias, ambiente } })) as Dados;
      setDados(r);
    } catch {
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [buscar, clinicaId, dias, ambiente]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!clinicaId) return null;

  const total = dados?.total ?? 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4" aria-hidden />
          Métricas de confiabilidade
        </CardTitle>
        <div className="flex flex-wrap items-center gap-1">
          {([7, 30, 90] as const).map((d) => (
            <Button key={d} size="sm" variant={dias === d ? "default" : "outline"} onClick={() => setDias(d)}>
              {d}d
            </Button>
          ))}
          {(["producao", "homologacao", "todos"] as const).map((a) => (
            <Button
              key={a}
              size="sm"
              variant={ambiente === a ? "default" : "outline"}
              onClick={() => setAmbiente(a)}
            >
              {a === "todos" ? "Tudo" : a === "producao" ? "Atendimento" : "Homologação"}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => void carregar()} disabled={carregando}>
            {carregando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            <span className="sr-only">Atualizar</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ainda não há decisões de confiabilidade registradas neste período.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Bloco titulo="Mensagens de saída">
                <p className="text-2xl font-semibold tabular-nums">
                  {formatarNumero(dados?.denominadores.mensagensDeSaida ?? 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatarNumero(dados?.denominadores.avaliacoesResposta ?? 0)} avaliações de
                  resposta · {formatarNumero(dados?.denominadores.avaliacoesAcao ?? 0)} de ação ·{" "}
                  {formatarNumero(dados?.denominadores.operacoes ?? 0)} operações
                </p>
                {dados?.amostra.truncado && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    Recorte parcial: leitura limitada a {formatarNumero(dados.amostra.limite)}{" "}
                    registros do período.
                  </p>
                )}
              </Bloco>
              <Bloco titulo="Acerto observado">
                {dados?.acerto.disponivel ? (
                  <>
                    <p className="text-2xl font-semibold tabular-nums">
                      {formatarPercentual(dados.acerto.taxaAcerto ?? 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sobre {formatarNumero(dados.acerto.revisadas)} saídas revisadas ·{" "}
                      {formatarPercentual(dados.acerto.cobertura)} de cobertura
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-semibold tabular-nums text-muted-foreground">—</p>
                    <p className="text-xs text-muted-foreground">
                      {dados?.acerto.motivo ?? "Sem revisão suficiente para calcular acerto."}
                    </p>
                  </>
                )}
              </Bloco>
              <Bloco titulo="Revisão humana">
                <p className="text-sm">Não revisadas: {dados?.revisao.NAO_REVISADA ?? 0}</p>
                <p className="text-sm">Erro confirmado: {dados?.revisao.ERRO_CONFIRMADO ?? 0}</p>
                <p className="text-sm">Em análise: {dados?.revisao.ERRO_REPORTADO ?? 0}</p>
                <p className="text-sm">Reporte descartado: {dados?.revisao.REPORTE_DESCARTADO ?? 0}</p>
                <p className="text-xs text-muted-foreground">
                  Reportes antigos sem vínculo exato: {dados?.revisao.LEGADO_SEM_VINCULO ?? 0}
                </p>
              </Bloco>
              <Bloco titulo="Resultados confirmados">
                <p className="text-sm">
                  Transferências: {dados?.resultados.transferenciasConfirmadas ?? 0} confirmadas de{" "}
                  {dados?.resultados.transferenciasRecomendadas ?? 0} recomendadas
                </p>
                <p className="text-sm">
                  Em observação: {dados?.resultados.transferenciasEmObservacao ?? 0}
                </p>
                <p className="text-sm">
                  Reservas com prova na agenda: {dados?.resultados.agendamentosConfirmados ?? 0}
                  {(dados?.resultados.agendamentosSemProva ?? 0) > 0
                    ? ` · ${dados?.resultados.agendamentosSemProva} sem prova`
                    : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  Falhas de ferramenta: {dados?.resultados.falhasOperacionais ?? 0}
                </p>
              </Bloco>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Bloco titulo="Confiança média">
                <p className="text-2xl font-semibold tabular-nums">{dados?.scoreMedio}%</p>
                <p className="text-xs text-muted-foreground">
                  {formatarNumero(dados?.denominadores.avaliacoesTotais ?? total)} avaliações ·{" "}
                  {formatarNumero(dados?.denominadores.rodadas ?? 0)} rodadas
                </p>
              </Bloco>
              <Bloco titulo="Distribuição">
                <p className="text-sm">Alta: {dados?.distribuicao.HIGH} ({pct(dados?.distribuicao.HIGH ?? 0)}%)</p>
                <p className="text-sm">Média: {dados?.distribuicao.MEDIUM} ({pct(dados?.distribuicao.MEDIUM ?? 0)}%)</p>
                <p className="text-sm">Baixa: {dados?.distribuicao.LOW} ({pct(dados?.distribuicao.LOW ?? 0)}%)</p>
              </Bloco>
              <Bloco titulo="Encaminhamentos">
                <p className="text-sm">
                  Transferências recomendadas por baixa confiança: {dados?.handoffsBaixaConfianca}
                </p>
                <p className="text-sm">Perguntas de esclarecimento: {dados?.esclarecimentos}</p>
                <p className="text-sm">Respostas liberadas: {dados?.respostasLiberadas}</p>
              </Bloco>
              <Bloco titulo="Bloqueios">
                <p className="text-2xl font-semibold tabular-nums">{dados?.bloqueadores}</p>
                <p className="text-xs text-muted-foreground">{dados?.acoesBloqueadas} ações bloqueadas</p>
              </Bloco>
            </div>

            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-xs font-medium text-destructive">
                Alta confiança + erro (HIGH_CONFIDENCE_ERROR)
              </p>
              <p className="text-2xl font-semibold tabular-nums text-destructive">
                {formatarNumero(dados?.altaConfiancaComErro.casos ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">
                {dados?.altaConfiancaComErro.mensagensAlta
                  ? `${formatarPercentual(dados.altaConfiancaComErro.taxa)} das ${formatarNumero(
                      dados.altaConfiancaComErro.mensagensAlta,
                    )} respostas de alta confiança · ${formatarPercentual(
                      dados.altaConfiancaComErro.participacaoNosErros,
                    )} de todos os erros vinculados`
                  : "Sem respostas de alta confiança no período."}
              </p>
              {(dados?.altaConfiancaComErro.casos ?? 0) > 0 && (
                <>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Confiança média nesses casos: {dados?.altaConfiancaComErro.scoreMedio}%. São os
                    casos mais graves: o sistema não sinalizou incerteza. Investigar fonte,
                    validador, regra, peso, identificação da entidade ou ferramenta.
                  </p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Bloco titulo="Tipos de atendimento">
                      <ListaContagem
                        itens={dados?.altaConfiancaComErro.fontesProvaveis.tiposAtendimento ?? []}
                        vazio="Sem dados."
                        rotulos={ROTULO_TIPO}
                      />
                    </Bloco>
                    <Bloco titulo="Validadores envolvidos">
                      <ListaContagem
                        itens={dados?.altaConfiancaComErro.fontesProvaveis.validadores ?? []}
                        vazio="Sem dados."
                      />
                    </Bloco>
                    <Bloco titulo="Ferramentas usadas">
                      <ListaContagem
                        itens={dados?.altaConfiancaComErro.fontesProvaveis.ferramentas ?? []}
                        vazio="Sem dados."
                      />
                    </Bloco>
                    <Bloco titulo="Motivos registrados">
                      <ListaContagem
                        itens={dados?.altaConfiancaComErro.fontesProvaveis.motivos ?? []}
                        vazio="Sem dados."
                      />
                    </Bloco>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-md border p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Calibração da confiança — confiança declarada × erro reportado
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {(dados?.calibracaoPorNivel ?? []).map((c) => (
                  <div key={c.nivel} className="rounded-md bg-muted/40 p-3">
                    <p className="text-xs font-medium uppercase text-muted-foreground">{c.rotulo}</p>
                    <p className="text-2xl font-semibold tabular-nums">{formatarNumero(c.mensagens)}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.mensagens === 1 ? "mensagem" : "mensagens"}
                    </p>
                    <p className="mt-1 text-sm tabular-nums">
                      {formatarNumero(c.erros)} {c.erros === 1 ? "erro" : "erros"}
                    </p>
                    <p className="text-sm tabular-nums text-muted-foreground">
                      {c.mensagens === 0 ? "sem base para cálculo" : `${formatarPercentual(c.taxaErro)} de erro`}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Erro reportado é vinculado à própria resposta avaliada; quando o reporte não guardou esse
                vínculo, considera-se o reporte da mesma conversa em até 48h.
              </p>
            </div>

            <div className="rounded-md border p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Calibração por faixa de confiança — a taxa de erro cai conforme a confiança sobe?
              </p>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {(dados?.calibracaoPorFaixaScore?.faixas ?? []).map((f) => (
                  <div key={f.id} className="rounded-md bg-muted/40 p-3">
                    <p className="text-xs font-medium text-muted-foreground">{f.rotulo}</p>
                    <p className="text-xl font-semibold tabular-nums">{formatarNumero(f.mensagens)}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.mensagens === 1 ? "mensagem" : "mensagens"}
                    </p>
                    <p className="mt-1 text-sm tabular-nums">
                      {formatarNumero(f.erros)} {f.erros === 1 ? "erro" : "erros"}
                    </p>
                    <p className="text-sm tabular-nums text-muted-foreground">
                      {f.mensagens === 0 ? "sem base" : `${formatarPercentual(f.taxaErro)} de erro`}
                    </p>
                  </div>
                ))}
              </div>
              {dados?.calibracaoPorFaixaScore?.monotonica === null ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Ainda não há faixas suficientes com dados para avaliar a calibração.
                </p>
              ) : dados?.calibracaoPorFaixaScore?.monotonica ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  No recorte atual, a taxa de erro não sobe conforme a confiança aumenta — comportamento
                  esperado de um motor calibrado.
                </p>
              ) : (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  Há faixas de confiança maior com taxa de erro maior — possível excesso de confiança em:{" "}
                  {(dados?.calibracaoPorFaixaScore?.inversoes ?? [])
                    .map((i) => `${i.para} (${formatarPercentual(i.taxaPara)}) acima de ${i.de} (${formatarPercentual(i.taxaDe)})`)
                    .join("; ")}
                  .
                </p>
              )}
            </div>


            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Bloco titulo="Principais motivos de baixa confiança">
                <ListaContagem itens={dados?.motivosBaixaConfianca ?? []} vazio="Nenhum motivo registrado." />
              </Bloco>
              <Bloco titulo="Validador que mais provoca transferência">
                <ListaContagem
                  itens={dados?.validadoresQueProvocamHandoff ?? []}
                  vazio="Nenhuma transferência por validação."
                />
              </Bloco>
              <Bloco titulo="Ferramentas que mais falham">
                <ListaContagem itens={dados?.ferramentasComFalha ?? []} vazio="Nenhuma falha de consulta." />
              </Bloco>
              <Bloco titulo="Informações que mais faltam">
                <ListaContagem itens={dados?.informacoesAusentes ?? []} vazio="Nenhuma ausência registrada." />
              </Bloco>
              <Bloco titulo="Confiança por tipo de atendimento">
                <ListaMedia itens={dados?.porTipoAtendimento ?? []} vazio="Sem dados." rotulos={ROTULO_TIPO} />
              </Bloco>
              <Bloco titulo="Confiança dentro e fora do horário">
                <ListaMedia
                  itens={dados?.porPeriodoOperacao ?? []}
                  vazio="Sem dados."
                  rotulos={ROTULO_PERIODO}
                />
              </Bloco>
              <Bloco titulo="Confiança por dia da semana">
                <ListaMedia itens={dados?.porDiaSemana ?? []} vazio="Sem dados." />
              </Bloco>
              <Bloco titulo="Confiança por dia">
                <ListaMedia itens={(dados?.porDia ?? []).slice(-8)} vazio="Sem dados." />
              </Bloco>
              <Bloco titulo="Erros reportados por faixa de confiança">
                <ul className="space-y-1 text-sm">
                  {(dados?.correlacaoErros ?? []).map((f) => (
                    <li key={f.faixa} className="flex items-center justify-between gap-2">
                      <span className="truncate">{f.rotulo}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {f.conversasComErro}/{f.decisoes} · {f.taxaErro}%
                      </span>
                    </li>
                  ))}
                </ul>
              </Bloco>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
