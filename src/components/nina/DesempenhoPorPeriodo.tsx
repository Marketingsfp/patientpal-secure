/**
 * FASE 5 — Desempenho da Nina dentro e fora do horário oficial.
 *
 * Seção somente leitura dentro da própria tela de Métricas de Aprendizado.
 * Não é um painel paralelo e não permite editar horário aqui: o cadastro
 * oficial continua sendo o único lugar de edição.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { CalendarClock, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { desempenhoPeriodoNina } from "@/lib/nina/desempenho-periodo.functions";
import {
  EXPLICACOES,
  FILTROS_PERIODO,
  contagem,
  formatarDuracao,
  formatarTaxa,
  rotuloMotivo,
  taxa,
  type DesempenhoPeriodo,
  type FiltroPeriodo,
} from "@/lib/nina/desempenho-periodo";

type Props = {
  clinicaId: string | null;
  de: string;
  ate: string;
  diaInteiro: boolean;
  horaInicio: string | null;
  horaFim: string | null;
  fuso: string;
  ambiente: "producao" | "todos";
  /** Quem não pode configurar o horário não vê o link de configuração. */
  podeConfigurar: boolean;
};

type Dados = DesempenhoPeriodo & { recorte?: string };

function Bloco({
  titulo,
  valor,
  detalhe,
  explicacao,
}: {
  titulo: string;
  valor: string;
  detalhe?: string;
  explicacao: string;
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
      {detalhe ? <p className="text-xs text-muted-foreground">{detalhe}</p> : null}
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{explicacao}</p>
    </div>
  );
}

export function DesempenhoPorPeriodo(props: Props) {
  const { clinicaId, de, ate, diaInteiro, horaInicio, horaFim, fuso, ambiente } = props;
  const buscar = useServerFn(desempenhoPeriodoNina);
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroPeriodo>("todos");
  const consultaRef = useRef(0);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    const meu = ++consultaRef.current;
    setCarregando(true);
    try {
      const res = await buscar({
        data: { clinicaId, de, ate, diaInteiro, horaInicio, horaFim, fuso, ambiente },
      });
      if (meu === consultaRef.current) {
        setDados(res as Dados);
        setErro(null);
      }
    } catch (e) {
      if (meu === consultaRef.current) {
        setDados(null);
        setErro(e instanceof Error ? e.message : "Não foi possível carregar este recorte.");
      }
    } finally {
      if (meu === consultaRef.current) setCarregando(false);
    }
  }, [buscar, clinicaId, de, ate, diaInteiro, horaInicio, horaFim, fuso, ambiente]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const n = useCallback(
    (tipo: string, campo: "eventos" | "distintos" = "eventos") => contagem(dados, filtro, tipo, campo),
    [dados, filtro],
  );

  const taxas = useMemo(() => {
    const avaliadas = n("resposta_avaliada");
    const confirmados = n("erro_confirmado", "distintos");
    const reportados = n("erro_reportado", "distintos");
    return {
      confirmadosSobreAvaliadas: taxa(confirmados, avaliadas),
      reportadosSobreRespostas: taxa(reportados, n("resposta_nina")),
    };
  }, [n]);

  const tr = filtro === "todos" ? null : dados?.tempoResposta?.[filtro];
  const trTodos = useMemo(() => {
    const t = dados?.tempoResposta ?? {};
    const amostras = Object.values(t).reduce((a, b) => a + (b?.amostras ?? 0), 0);
    return { amostras, medianaSegundos: null as number | null, mediaSegundos: null as number | null };
  }, [dados]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-primary" aria-hidden />
            Desempenho dentro e fora do horário
          </CardTitle>
          {props.podeConfigurar ? (
            <Link
              to="/app/nina"
              hash="base-conhecimento"
              className="inline-flex items-center gap-1 text-sm text-primary underline underline-offset-4"
            >
              Configurar horário de funcionamento
              <ExternalLink className="h-3 w-3" aria-hidden />
            </Link>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Mesmo intervalo de datas e mesmos critérios dos cartões acima. A classificação usa o
          horário oficial publicado na Base de Conhecimentos{dados?.fuso ? ` (fuso ${dados.fuso})` : ""}.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-xs space-y-1">
          <Label htmlFor="filtro-periodo">Período do dia</Label>
          <Select value={filtro} onValueChange={(v) => setFiltro(v as FiltroPeriodo)}>
            <SelectTrigger id="filtro-periodo"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FILTROS_PERIODO.map((f) => (
                <SelectItem key={f.valor} value={f.valor}>{f.rotulo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {erro ? (
          <p className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
            Não foi possível carregar este recorte. Os números ficam ocultos de propósito: falha de
            consulta não é “nenhuma ocorrência”. Detalhe: {erro}
          </p>
        ) : null}

        {carregando && !dados ? (
          <p className="text-sm text-muted-foreground" aria-busy="true">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />
            Carregando o recorte…
          </p>
        ) : null}

        {dados ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Atividade da Nina">
              <Bloco titulo="Mensagens do atendimento" valor={String(n("mensagem"))} explicacao={EXPLICACOES.mensagem} />
              <Bloco titulo="Respostas da Nina" valor={String(n("resposta_nina"))} explicacao={EXPLICACOES.resposta_nina} />
              <Bloco
                titulo="Tempo de resposta"
                valor={
                  filtro === "todos"
                    ? trTodos.amostras
                      ? "Escolha um período"
                      : "Sem dados"
                    : tr && tr.amostras
                      ? formatarDuracao(tr.medianaSegundos)
                      : "Sem dados"
                }
                detalhe={
                  filtro === "todos"
                    ? `${trTodos.amostras} espera(s) medida(s) no total`
                    : tr && tr.amostras
                      ? `mediana · média ${formatarDuracao(tr.mediaSegundos)} · ${tr.amostras} espera(s)`
                      : "Nenhuma espera medida neste recorte"
                }
                explicacao="Contado do horário da mensagem do paciente que iniciou a espera até a primeira resposta. Tempo corrido real, sem descontar períodos fechados."
              />
              <Bloco titulo="Agendamentos registrados" valor={String(n("agendamento"))} explicacao={EXPLICACOES.agendamento} />
              <Bloco titulo="Encaminhamentos para atendente" valor={String(n("encaminhamento"))} explicacao={EXPLICACOES.encaminhamento} />
              <Bloco titulo="Respostas avaliadas" valor={String(n("resposta_avaliada"))} explicacao={EXPLICACOES.resposta_avaliada} />
            </section>

            <section className="space-y-2" aria-label="Qualidade das respostas">
              <h3 className="text-sm font-semibold">Qualidade — três contagens distintas</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Bloco
                  titulo="Erros reportados por usuários"
                  valor={String(n("erro_reportado", "distintos"))}
                  detalhe={`${n("erro_reportado")} reporte(s) sobre ${n("erro_reportado", "distintos")} resposta(s)`}
                  explicacao={EXPLICACOES.erro_reportado}
                />
                <Bloco
                  titulo="Suspeitas apontadas pela IA"
                  valor={String(n("suspeita_ia"))}
                  explicacao={EXPLICACOES.suspeita_ia}
                />
                <Bloco
                  titulo="Erros confirmados na revisão"
                  valor={String(n("erro_confirmado", "distintos"))}
                  explicacao={EXPLICACOES.erro_confirmado}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Estes três números medem coisas diferentes e não devem ser somados.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Bloco
                  titulo="Erros confirmados entre respostas avaliadas"
                  valor={formatarTaxa(taxas.confirmadosSobreAvaliadas)}
                  explicacao="Numerador: respostas com erro confirmado na revisão. Denominador: respostas avaliadas no mesmo recorte. Sem avaliações, não existe taxa."
                />
                <Bloco
                  titulo="Respostas com reporte, entre respostas da Nina"
                  valor={formatarTaxa(taxas.reportadosSobreRespostas)}
                  explicacao="Indicador de referência, baseado em reportes ainda não confirmados. Não é taxa de erro comprovado."
                />
              </div>
            </section>

            <section className="space-y-2" aria-label="Produtividade da revisão">
              <h3 className="text-sm font-semibold">Produtividade da revisão humana</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Bloco
                  titulo="Correções aplicadas"
                  valor={String(n("correcao_aplicada"))}
                  explicacao={EXPLICACOES.correcao_aplicada}
                />
              </div>
            </section>

            <section className="space-y-2" aria-label="Conversas únicas">
              <h3 className="text-sm font-semibold">Conversas</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <Bloco
                  titulo="Conversas únicas no período"
                  valor={String(dados.conversas?.unicasTotal ?? 0)}
                  explicacao="Cada conversa conta uma única vez, mesmo quando atravessa o fechamento."
                />
                <Bloco
                  titulo="Iniciadas neste recorte"
                  valor={String(
                    filtro === "todos"
                      ? Object.values(dados.conversas?.iniciadas ?? {}).reduce((a, b) => a + (b ?? 0), 0)
                      : (dados.conversas?.iniciadas?.[filtro] ?? 0),
                  )}
                  explicacao="Classificadas pela primeira mensagem da conversa."
                />
                <Bloco
                  titulo="Com alguma interação neste recorte"
                  valor={String(
                    filtro === "todos"
                      ? (dados.conversas?.unicasTotal ?? 0)
                      : (dados.conversas?.comInteracao?.[filtro] ?? 0),
                  )}
                  explicacao="Basta uma mensagem no recorte. Uma conversa pode aparecer em mais de um período."
                />
              </div>
              <p className="text-xs text-muted-foreground">{dados.conversas?.observacao}</p>
            </section>

            <section className="space-y-2" aria-label="Limitações">
              <h3 className="text-sm font-semibold">Eventos não classificáveis e limitações</h3>
              <p className="text-sm">
                {dados.naoClassificavel?.eventos ?? 0} evento(s) sem classificação possível.
              </p>
              {(dados.naoClassificavel?.motivos ?? []).length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {dados.naoClassificavel.motivos.map((m) => (
                    <li key={m.motivo}>
                      <Badge variant="outline">
                        {rotuloMotivo(m.motivo)} · {m.eventos}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {(dados.limitacoes ?? []).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              {(dados.versoesUtilizadas ?? []).length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Versões do horário usadas: {dados.versoesUtilizadas.map((v) => `v${v.versao}`).join(", ")}
                </p>
              ) : null}
            </section>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
