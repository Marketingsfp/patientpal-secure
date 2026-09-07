/**
 * FASE 11 — Dashboard da homologação.
 *
 * Tela SOMENTE LEITURA com o desempenho dos testes da Nina no período.
 * Nada aqui mistura homologação com atendimento real: a origem dos números é
 * exclusivamente as conversas de teste.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useClinica } from "@/hooks/use-clinica";
import { mostrarErro } from "@/lib/traduzir-erro";
import { dashboardHomologacao } from "@/lib/nina/dashboard-homologacao.functions";
import { TIPOS_RELATORIO, formatarDuracao } from "@/lib/nina/relatorio-teste";
import {
  RESULTADOS_DASHBOARD,
  type ResumoDashboard,
  type ResumoVersaoPrompt,
} from "@/lib/nina/dashboard-homologacao";

type Retorno = {
  periodo: { de: string; ate: string };
  resumo: ResumoDashboard;
  porVersaoPrompt: ResumoVersaoPrompt[];
  modelos: string[];
  versoes: number[];
};

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function Metrica({ rotulo, valor, dica }: { rotulo: string; valor: string; dica?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className="text-xl font-semibold tabular-nums">{valor}</div>
      {dica ? <div className="text-[11px] text-muted-foreground">{dica}</div> : null}
    </div>
  );
}

export function DashboardHomologacao() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const carregar = useServerFn(dashboardHomologacao);

  const hoje = useMemo(() => new Date(), []);
  const [de, setDe] = useState(() => iso(new Date(hoje.getTime() - 30 * 86400000)));
  const [ate, setAte] = useState(() => iso(hoje));
  const [tipos, setTipos] = useState<string[]>([]);
  const [promptVersao, setPromptVersao] = useState<string>("");
  const [modelo, setModelo] = useState<string>("");
  const [resultado, setResultado] = useState<string>("");
  const [dados, setDados] = useState<Retorno | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [compA, setCompA] = useState<string>("");
  const [compB, setCompB] = useState<string>("");

  const buscar = useCallback(async () => {
    if (!clinicaId) return;
    setCarregando(true);
    try {
      const r = (await carregar({
        data: {
          clinicaId,
          de,
          ate,
          tipos: tipos.length ? (tipos as any) : undefined,
          promptVersao: promptVersao ? Number(promptVersao) : null,
          modelo: modelo || null,
          resultado: resultado || null,
        },
      })) as Retorno;
      setDados(r);
    } catch (e) {
      mostrarErro(e);
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, carregar, de, ate, tipos, promptVersao, modelo, resultado]);

  useEffect(() => {
    void buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaId]);

  const resumo = dados?.resumo;
  const versaoA = dados?.porVersaoPrompt.find((v) => String(v.versao) === compA);
  const versaoB = dados?.porVersaoPrompt.find((v) => String(v.versao) === compB);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Desempenho dos testes
          </CardTitle>
          <CardDescription>
            Resumo dos testes de homologação no período. Não inclui atendimento real.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void buscar()} disabled={carregando}>
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Atualizar</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Versão do prompt</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={promptVersao}
              onChange={(e) => setPromptVersao(e.target.value)}
            >
              <option value="">Todas</option>
              {(dados?.versoes ?? []).map((v) => (
                <option key={v} value={String(v)}>{`v${v}`}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Modelo da Nina</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
            >
              <option value="">Todos</option>
              {(dados?.modelos ?? []).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Resultado</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={resultado}
              onChange={(e) => setResultado(e.target.value)}
            >
              <option value="">Todos</option>
              {RESULTADOS_DASHBOARD.map((r) => (
                <option key={r.valor} value={r.valor}>
                  {r.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={() => void buscar()} disabled={carregando || !clinicaId}>
              Aplicar filtros
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground self-center">Tipo de teste:</span>
          {TIPOS_RELATORIO.map((t) => {
            const ativo = tipos.includes(t.valor);
            return (
              <Button
                key={t.valor}
                size="sm"
                variant={ativo ? "default" : "outline"}
                onClick={() =>
                  setTipos((atual) =>
                    atual.includes(t.valor) ? atual.filter((x) => x !== t.valor) : [...atual, t.valor],
                  )
                }
              >
                {t.rotulo}
              </Button>
            );
          })}
        </div>

        {!resumo ? (
          <p className="text-sm text-muted-foreground">
            {carregando ? "Carregando…" : "Sem dados para o período."}
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metrica rotulo="Testes executados" valor={String(resumo.testes)} dica={`${resumo.avaliados} avaliados pelo Sol`} />
              <Metrica rotulo="Aprovados" valor={String(resumo.aprovados + resumo.aprovadosObservacao)} dica={`${resumo.aprovadosObservacao} com observação`} />
              <Metrica rotulo="Reprovados" valor={String(resumo.reprovados)} />
              <Metrica rotulo="Erros críticos" valor={String(resumo.errosCriticos)} />
              <Metrica rotulo="Score médio" valor={resumo.scoreMedio === null ? "—" : `${resumo.scoreMedio}/100`} />
              <Metrica rotulo="Taxa de aprovação" valor={resumo.taxaAprovacao === null ? "—" : `${resumo.taxaAprovacao}%`} />
              <Metrica rotulo="Agendamentos testados" valor={String(resumo.agendamentos)} />
              <Metrica rotulo="Transferências testadas" valor={String(resumo.transferencias)} />
              <Metrica rotulo="Latência média" valor={formatarDuracao(resumo.latenciaMediaMs)} dica={`p95 ${formatarDuracao(resumo.latenciaP95Ms)}`} />
              <Metrica rotulo="Mensagens processadas" valor={String(resumo.mensagens)} dica={`${resumo.tools} ferramentas · ${resumo.rag} com conhecimento`} />
              <Metrica
                rotulo="Tokens"
                valor={(resumo.inputTokens + resumo.outputTokens).toLocaleString("pt-BR")}
                dica={`${resumo.inputTokens.toLocaleString("pt-BR")} entrada · ${resumo.outputTokens.toLocaleString("pt-BR")} saída`}
              />
              <Metrica
                rotulo="Custo registrado"
                valor={resumo.custo === null ? "—" : resumo.custo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                dica={resumo.custo === null ? "Não informado pelo provedor" : undefined}
              />
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2">Erros por categoria</h4>
              {resumo.errosPorCategoria.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum erro registrado no período.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {resumo.errosPorCategoria.map((c) => (
                    <Badge key={c.categoria} variant="secondary">
                      {c.rotulo}: {c.total}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <div>
                <h4 className="text-sm font-medium">Comparar versões do Prompt Principal</h4>
                <p className="text-xs text-muted-foreground">
                  Compare o desempenho antes e depois de uma alteração nas Instruções da Nina.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Versão A</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={compA}
                    onChange={(e) => setCompA(e.target.value)}
                  >
                    <option value="">Selecionar</option>
                    {(dados?.porVersaoPrompt ?? []).map((v) => (
                      <option key={String(v.versao)} value={String(v.versao)}>
                        {v.versao === null ? "Sem versão registrada" : `v${v.versao}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Versão B</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={compB}
                    onChange={(e) => setCompB(e.target.value)}
                  >
                    <option value="">Selecionar</option>
                    {(dados?.porVersaoPrompt ?? []).map((v) => (
                      <option key={String(v.versao)} value={String(v.versao)}>
                        {v.versao === null ? "Sem versão registrada" : `v${v.versao}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {versaoA && versaoB ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[versaoA, versaoB].map((v, i) => (
                    <div key={i} className="rounded-md border p-3 space-y-1 text-sm">
                      <div className="font-medium">
                        {v.versao === null ? "Sem versão registrada" : `Prompt v${v.versao}`}
                      </div>
                      <div>
                        Aprovação:{" "}
                        <strong>{v.resumo.taxaAprovacao === null ? "—" : `${v.resumo.taxaAprovacao}%`}</strong>
                      </div>
                      <div>Testes: {v.resumo.testes} · Reprovados: {v.resumo.reprovados}</div>
                      <div>Score médio: {v.resumo.scoreMedio === null ? "—" : `${v.resumo.scoreMedio}/100`}</div>
                      <div>Erros críticos: {v.resumo.errosCriticos}</div>
                      <div>Latência média: {formatarDuracao(v.resumo.latenciaMediaMs)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Escolha duas versões para ver a comparação.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
