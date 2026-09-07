/**
 * FASE 8 — Relatório da homologação.
 *
 * Tela SOMENTE LEITURA: escolhe uma execução de teste (manual, Terra, cenários
 * ou carga Luna) e mostra o que realmente ficou registrado — mensagens, tools,
 * conhecimento, agendamentos, transferências, erros classificados, tokens,
 * versão do prompt e a avaliação do Sol —, com atalhos para investigar da
 * conversa até o node do backend.
 *
 * O único botão que escreve algo é "Reportar para Revisão", que usa a fila de
 * revisão já existente. Nada aqui altera a Nina.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw, MessageSquare, Network, Route as RouteIcon, FileText, Flag, RotateCcw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { mostrarErro } from "@/lib/traduzir-erro";
import {
  listarRelatoriosTeste,
  detalheRelatorioTeste,
  type ResumoRelatorio,
} from "@/lib/nina/relatorio-teste.functions";
import { registrarFeedbackErroNina } from "@/lib/nina/feedback-erros.functions";
import {
  enviarAchadoParaRevisao,
  listarAchadosEnviados,
  criarTesteRegressaoDeAchado,
} from "@/lib/nina/revisao-teste.functions";
import {
  formatarDuracao,
  rotuloCategoriaErroRelatorio,
  rotuloTipoRelatorio,
  type ItemRelatorio,
} from "@/lib/nina/relatorio-teste";

type Detalhe = {
  tipo: string;
  execucaoId: string;
  cabecalho: Record<string, string | number | boolean | null>;
  itens: ItemRelatorio[];
  totais: {
    itens: number;
    mensagens: number;
    tools: number;
    rag: number;
    agendamentos: number;
    transferencias: number;
    erros: number;
    inputTokens: number;
    outputTokens: number;
    custoEstimado: number | null;
  };
  errosPorCategoria: Array<{ categoria: string; rotulo: string; total: number }>;
  avaliacoes: Array<{
    id: string;
    conversaId: string | null;
    criadoEm: string;
    modelo: string | null;
    status: string;
    resultado: string | null;
    score: number | null;
    resumo: string | null;
    dimensoes: any[];
    achados: any[];
    evidencias: any;
    promptVersao: number | null;
    erro: string | null;
  }>;
};

const ROTULO_RESULTADO: Record<string, string> = {
  aprovado: "Aprovado",
  aprovado_observacao: "Aprovado com observação",
  reprovado: "Reprovado",
  erro_critico: "Erro crítico",
};

function dataHora(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-BR");
}

export function RelatorioHomologacao() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const podeEscrever = usePodeEscrever("nina");
  const navigate = useNavigate();

  const listar = useServerFn(listarRelatoriosTeste);
  const detalhar = useServerFn(detalheRelatorioTeste);
  const reportar = useServerFn(registrarFeedbackErroNina);
  const enviarAchadoFn = useServerFn(enviarAchadoParaRevisao);
  const listarEnviadosFn = useServerFn(listarAchadosEnviados);
  const criarRegressaoFn = useServerFn(criarTesteRegressaoDeAchado);

  const [execucoes, setExecucoes] = useState<ResumoRelatorio[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [selecionada, setSelecionada] = useState<ResumoRelatorio | null>(null);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [reporteItem, setReporteItem] = useState<ItemRelatorio | null>(null);
  const [reporteTexto, setReporteTexto] = useState("");
  const [enviandoReporte, setEnviandoReporte] = useState(false);
  /** Achados já enviados para a Revisão, indexados por "avaliacaoId:indice". */
  const [enviados, setEnviados] = useState<
    Record<string, { id: string; cenarioRegressaoId: string | null }>
  >({});
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregarLista = async () => {
    if (!clinicaId) return;
    setCarregandoLista(true);
    try {
      const r = (await listar({ data: { clinicaId } })) as { execucoes: ResumoRelatorio[] };
      setExecucoes(r.execucoes ?? []);
    } catch (e) {
      mostrarErro(e);
    } finally {
      setCarregandoLista(false);
    }
  };

  useEffect(() => {
    void carregarLista();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaId]);

  const abrir = async (item: ResumoRelatorio) => {
    if (!clinicaId) return;
    setSelecionada(item);
    setDetalhe(null);
    setCarregandoDetalhe(true);
    try {
      const r = (await detalhar({
        data: { clinicaId, tipo: item.tipo, execucaoId: item.id },
      })) as Detalhe;
      setDetalhe(r);
    } catch (e) {
      mostrarErro(e);
    } finally {
      setCarregandoDetalhe(false);
    }
  };

  const verConversa = (item: ItemRelatorio) => {
    window.dispatchEvent(
      new CustomEvent("nina:abrir-lead-teste", {
        detail: { leadIndice: item.leadIndice, conversaId: item.conversaId },
      }),
    );
    document.getElementById("homologacao-inbox")?.scrollIntoView({ behavior: "smooth" });
  };

  const irParaRastreio = (termo: string | null) => {
    if (!termo) {
      toast.info("Esta linha ainda não tem código de rastreio registrado.");
      return;
    }
    window.sessionStorage.setItem("nina:rastrear:termo", termo);
    void navigate({ to: "/app/nina-arquitetura", hash: "execucao" });
  };

  const verPrompt = () => {
    void navigate({ to: "/app/nina-arquitetura", hash: "instrucoes-nina" });
  };

  const enviarReporte = async () => {
    if (!clinicaId || !reporteItem) return;
    if (reporteTexto.trim().length < 3) {
      toast.error("Descreva o que deveria ter acontecido.");
      return;
    }
    setEnviandoReporte(true);
    try {
      await reportar({
        data: {
          clinicaId,
          conversaId: reporteItem.conversaId,
          categoria: "outro",
          correcao: reporteTexto.trim(),
          observacao: `Relatório de homologação — ${rotuloTipoRelatorio(reporteItem.tipo)}${
            reporteItem.cenario ? ` · ${reporteItem.cenario}` : ""
          }`,
        },
      });
      toast.success("Enviado para a fila de Revisão.");
      setReporteItem(null);
      setReporteTexto("");
    } catch (e) {
      mostrarErro(e);
    } finally {
      setEnviandoReporte(false);
    }
  };


  const carregarEnviados = async (avaliacaoIds: string[]) => {
    if (!clinicaId || avaliacaoIds.length === 0) return;
    const mapa: Record<string, { id: string; cenarioRegressaoId: string | null }> = {};
    for (const avaliacaoId of avaliacaoIds) {
      try {
        const r = (await listarEnviadosFn({ data: { clinicaId, avaliacaoId } })) as {
          itens: Array<{ id: string; achadoIndice: number | null; cenarioRegressaoId: string | null }>;
        };
        for (const it of r.itens ?? []) {
          if (it.achadoIndice === null) continue;
          mapa[`${avaliacaoId}:${it.achadoIndice}`] = {
            id: it.id,
            cenarioRegressaoId: it.cenarioRegressaoId,
          };
        }
      } catch {
        /* leitura de apoio: não bloqueia o relatório */
      }
    }
    setEnviados((atual) => ({ ...atual, ...mapa }));
  };

  const enviarAchado = async (avaliacaoId: string, indice: number, item: ItemRelatorio) => {
    if (!clinicaId) return;
    const chave = `${avaliacaoId}:${indice}`;
    setOcupado(chave);
    try {
      const r = (await enviarAchadoFn({
        data: {
          clinicaId,
          avaliacaoId,
          achadoIndice: indice,
          testeTipo:
            item.tipo === "terra" || item.tipo === "cenarios" || item.tipo === "carga"
              ? item.tipo
              : "manual",
        },
      })) as { item: { id: string }; duplicado: boolean };
      setEnviados((atual) => ({
        ...atual,
        [chave]: { id: r.item.id, cenarioRegressaoId: null },
      }));
      toast.success(
        r.duplicado
          ? "Este achado já estava na Revisão de aprendizados."
          : "Achado enviado para a Revisão de aprendizados.",
      );
    } catch (e) {
      mostrarErro(e);
    } finally {
      setOcupado(null);
    }
  };

  const criarRegressao = async (feedbackId: string) => {
    if (!clinicaId) return;
    setOcupado(`reg:${feedbackId}`);
    try {
      const r = (await criarRegressaoFn({ data: { clinicaId, feedbackId } })) as {
        cenarioId: string;
        jaExistia: boolean;
      };
      setEnviados((atual) => {
        const copia = { ...atual };
        for (const [k, v] of Object.entries(copia)) {
          if (v.id === feedbackId) copia[k] = { ...v, cenarioRegressaoId: r.cenarioId };
        }
        return copia;
      });
      toast.success(
        r.jaExistia
          ? "Este erro já tinha um teste de regressão."
          : "Teste de regressão criado na biblioteca de cenários.",
      );
    } catch (e) {
      mostrarErro(e);
    } finally {
      setOcupado(null);
    }
  };

  const avaliacoesPorConversa = useMemo(() => {
    const mapa = new Map<string, Detalhe["avaliacoes"]>();
    for (const a of detalhe?.avaliacoes ?? []) {
      if (!a.conversaId) continue;
      mapa.set(a.conversaId, [...(mapa.get(a.conversaId) ?? []), a]);
    }
    return mapa;
  }, [detalhe]);

  return (
    <Card className="mt-6" id="relatorio-homologacao">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Relatório da homologação</CardTitle>
          <CardDescription>
            Resultado de cada teste executado (manual, Terra, cenários e carga), com o que a Nina
            realmente fez e atalhos para investigar até o componente responsável.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void carregarLista()} disabled={carregandoLista}>
          {carregandoLista ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Atualizar
        </Button>
      </CardHeader>

      <CardContent className="space-y-5">
        {execucoes.length === 0 && !carregandoLista ? (
          <p className="text-sm text-muted-foreground">
            Nenhum teste registrado nesta clínica ainda.
          </p>
        ) : null}

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {execucoes.map((e) => (
            <button
              key={`${e.tipo}:${e.id}`}
              type="button"
              onClick={() => void abrir(e)}
              className={`rounded-md border p-3 text-left transition-colors hover:bg-muted/50 ${
                selecionada?.id === e.id ? "border-primary" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline">{rotuloTipoRelatorio(e.tipo)}</Badge>
                <Badge variant="secondary">{e.status}</Badge>
              </div>
              <p className="mt-2 line-clamp-2 text-sm font-medium">{e.nome}</p>
              <p className="text-xs text-muted-foreground">{dataHora(e.inicio)}</p>
            </button>
          ))}
        </div>

        {carregandoDetalhe ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando resultado…
          </p>
        ) : null}

        {detalhe ? (
          <div className="space-y-5 rounded-md border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{rotuloTipoRelatorio(detalhe.tipo)}</Badge>
              <span className="text-sm font-medium">{String(detalhe.cabecalho["nome"] ?? "")}</span>
              <span className="text-xs text-muted-foreground">
                {dataHora(detalhe.cabecalho["inicio"] as string)} →{" "}
                {dataHora(detalhe.cabecalho["fim"] as string)}
              </span>
              <Button variant="ghost" size="sm" onClick={verPrompt}>
                <FileText className="mr-2 h-4 w-4" /> Ver versão do prompt
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
              {[
                ["Conversas", detalhe.totais.itens],
                ["Mensagens", detalhe.totais.mensagens],
                ["Tools", detalhe.totais.tools],
                ["Conhecimento", detalhe.totais.rag],
                ["Agendamentos", detalhe.totais.agendamentos],
                ["Transferências", detalhe.totais.transferencias],
                ["Erros", detalhe.totais.erros],
                [
                  "Tokens",
                  `${detalhe.totais.inputTokens.toLocaleString("pt-BR")} / ${detalhe.totais.outputTokens.toLocaleString("pt-BR")}`,
                ],
              ].map(([rotulo, valor]) => (
                <div key={String(rotulo)} className="rounded-md bg-muted/40 p-2">
                  <p className="text-xs text-muted-foreground">{rotulo}</p>
                  <p className="text-sm font-semibold">{valor}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Custo:{" "}
              {detalhe.totais.custoEstimado === null
                ? "não informado pelo provedor nesta execução"
                : detalhe.totais.custoEstimado.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
            </p>

            {detalhe.errosPorCategoria.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {detalhe.errosPorCategoria.map((c) => (
                  <Badge key={c.categoria} variant="destructive">
                    {c.rotulo}: {c.total}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhum erro registrado nesta execução.</p>
            )}

            <div className="space-y-3">
              {detalhe.itens.map((item) => {
                const avaliacoes = item.conversaId
                  ? (avaliacoesPorConversa.get(item.conversaId) ?? [])
                  : [];
                return (
                  <div key={item.chave} className="space-y-3 rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="outline">{rotuloTipoRelatorio(item.tipo)}</Badge>
                      <span className="font-medium">
                        {item.leadIndice !== null
                          ? `Paciente Teste ${String(item.leadIndice).padStart(2, "0")}`
                          : "Lead não identificado"}
                      </span>
                      {item.cenario ? (
                        <span className="text-muted-foreground">· {item.cenario}</span>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
                      <div>
                        <span className="text-muted-foreground">Modelo da Nina: </span>
                        {item.modeloNina ?? "—"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Prompt: </span>
                        {item.promptVersao ? `v${item.promptVersao}` : "—"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Início: </span>
                        {dataHora(item.inicio)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Fim: </span>
                        {dataHora(item.fim)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Duração: </span>
                        {formatarDuracao(item.duracaoMs)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Mensagens: </span>
                        {item.mensagens}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tools: </span>
                        {item.tools}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Conhecimento: </span>
                        {item.rag}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Agendamentos: </span>
                        {item.agendamentos}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Transferências: </span>
                        {item.transferencias}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tokens: </span>
                        {item.inputTokens.toLocaleString("pt-BR")} /{" "}
                        {item.outputTokens.toLocaleString("pt-BR")}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Custo: </span>
                        {item.custoEstimado === null
                          ? "não informado"
                          : item.custoEstimado.toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })}
                      </div>
                    </div>

                    {item.erros.length > 0 ? (
                      <ul className="space-y-1 text-xs">
                        {item.erros.slice(0, 20).map((erro, i) => (
                          <li key={i} className="rounded bg-destructive/10 p-2">
                            <Badge variant="destructive" className="mr-2">
                              {rotuloCategoriaErroRelatorio(erro.categoria)}
                            </Badge>
                            {erro.descricao}
                            <span className="ml-1 text-muted-foreground">
                              ({erro.origem === "avaliacao" ? "avaliação Sol" : erro.origem})
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {avaliacoes.map((a) => (
                      <div key={a.id} className="space-y-2 rounded-md bg-muted/40 p-3 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge>{ROTULO_RESULTADO[a.resultado ?? ""] ?? a.resultado ?? "—"}</Badge>
                          {a.score !== null ? <span className="font-semibold">{a.score}/100</span> : null}
                          <span className="text-muted-foreground">
                            Avaliação {a.modelo} · {dataHora(a.criadoEm)}
                          </span>
                        </div>
                        {a.resumo ? <p>{a.resumo}</p> : null}
                        {a.dimensoes.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {a.dimensoes.map((d: any, i: number) => (
                              <Badge key={i} variant="outline">
                                {d.rotulo ?? d.dimensao}:{" "}
                                {d.status && d.status !== "avaliada"
                                  ? d.status === "nao_aplicavel"
                                    ? "não se aplica"
                                    : "não verificável"
                                  : `${d.nota}/10`}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                        {a.achados.length > 0 ? (
                          <ul className="space-y-1">
                            {a.achados.map((f: any, i: number) => {
                              const enviado = enviados[`${a.id}:${i}`] ?? null;
                              return (
                                <li key={i} className="space-y-1 rounded bg-background p-2">
                                  <p className="font-medium">{f.observado}</p>
                                  <p className="text-muted-foreground">Esperado: {f.esperado}</p>
                                  <p className="text-muted-foreground">Evidência: {f.fonte}</p>
                                  {f.componente ? (
                                    <p className="text-muted-foreground">
                                      Componente: {f.componente} · confiança {f.confianca ?? "—"}
                                    </p>
                                  ) : null}
                                  <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={!podeEscrever || ocupado === `${a.id}:${i}`}
                                      onClick={() => void enviarAchado(a.id, i, item)}
                                    >
                                      {ocupado === `${a.id}:${i}` ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      ) : (
                                        <Flag className="mr-2 h-4 w-4" />
                                      )}
                                      {enviado ? "Já enviado para Revisão" : "Enviar para Revisão de Aprendizados"}
                                    </Button>
                                    {enviado ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={!podeEscrever || ocupado === `reg:${enviado.id}`}
                                        onClick={() => void criarRegressao(enviado.id)}
                                      >
                                        {ocupado === `reg:${enviado.id}` ? (
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                          <RotateCcw className="mr-2 h-4 w-4" />
                                        )}
                                        {enviado.cenarioRegressaoId
                                          ? "Teste de regressão criado"
                                          : "Transformar em teste de regressão"}
                                      </Button>
                                    ) : null}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}

                        {a.erro ? <p className="text-destructive">{a.erro}</p> : null}
                      </div>
                    ))}

                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => verConversa(item)}>
                        <MessageSquare className="mr-2 h-4 w-4" /> Ver conversa
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => irParaRastreio(item.conversaId)}
                      >
                        <Network className="mr-2 h-4 w-4" /> Ver execução na Arquitetura
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => irParaRastreio(item.traceIds[0] ?? null)}
                      >
                        <RouteIcon className="mr-2 h-4 w-4" /> Ver trace
                      </Button>
                      <Button variant="outline" size="sm" onClick={verPrompt}>
                        <FileText className="mr-2 h-4 w-4" /> Ver versão do prompt
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!podeEscrever || !item.conversaId}
                        onClick={() => {
                          setReporteItem(item);
                          setReporteTexto("");
                        }}
                      >
                        <Flag className="mr-2 h-4 w-4" /> Reportar para Revisão
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </CardContent>

      <Dialog open={!!reporteItem} onOpenChange={(v) => !v && setReporteItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reportar para Revisão</DialogTitle>
            <DialogDescription>
              O reporte entra na fila de Revisão de aprendizados. Nada muda no comportamento da Nina
              até alguém aprovar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reporte-relatorio">O que deveria ter acontecido?</Label>
            <Textarea
              id="reporte-relatorio"
              rows={4}
              value={reporteTexto}
              onChange={(e) => setReporteTexto(e.target.value)}
              placeholder="Descreva o comportamento esperado nesta conversa de teste."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReporteItem(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void enviarReporte()} disabled={enviandoReporte}>
              {enviandoReporte ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>

      </Dialog>
    </Card>
  );
}
