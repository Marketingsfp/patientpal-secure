/**
 * FASE 7 — Diagnóstico de uma execução: linha do tempo, entrada/saída e erros.
 *
 * Componente somente leitura. Ele apenas apresenta os eventos já gravados no
 * tracing; não consulta, não recalcula e não altera nada do atendimento.
 */
import { AlertTriangle, ArrowDown, CheckCircle2, Circle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { diagnosticarExecucao } from "@/lib/nina/arquitetura/timeline";
import type { EventoTrace } from "@/lib/nina/arquitetura/tracing";
import { RegistroTurnoResumo } from "./RegistroTurnoResumo";

const ROTULO_EVENTO: Record<string, string> = {
  started: "iniciado",
  completed: "concluído",
  failed: "falhou",
  skipped: "não utilizado",
  retry: "nova tentativa",
  cancelled: "cancelado",
};

export function ExecucaoDiagnostico({ eventos }: { eventos: EventoTrace[] }) {
  if (eventos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma execução carregada. Selecione uma mensagem para ver a linha do tempo, o caminho
        percorrido e as falhas.
      </p>
    );
  }

  const d = diagnosticarExecucao(eventos);

  return (
    <div className="space-y-6">
      {/* FASE 1/3 — registro do turno gravado junto com a execução. */}
      <RegistroTurnoResumo eventos={eventos} />
      {/* Resultado final */}
      <div className="flex flex-wrap items-center gap-2">
        {d.resultadoFinal === "entregue" ? (
          <Badge className="gap-1" variant="default">
            <CheckCircle2 className="h-3.5 w-3.5" /> Resposta entregue ao paciente
          </Badge>
        ) : d.resultadoFinal === "cancelado" ? (
          <Badge className="gap-1" variant="secondary">
            <Circle className="h-3.5 w-3.5" /> Execução cancelada
          </Badge>
        ) : (
          <Badge className="gap-1" variant="destructive">
            <XCircle className="h-3.5 w-3.5" /> Sem resposta enviada
          </Badge>
        )}
        {d.sucessoComFalhaIntermediaria && (
          <Badge variant="outline" className="gap-1">
            <AlertTriangle className="h-3.5 w-3.5" /> Concluído apesar de falha no meio do caminho
          </Badge>
        )}
        {d.duracaoTotalMs !== null && (
          <span className="text-xs text-muted-foreground">Duração total: {d.duracaoTotalMs} ms</span>
        )}
      </div>

      {/* Entrada e saída */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Entrada e saída</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs uppercase text-muted-foreground">Mensagem original</p>
            <p className="text-sm">
              {d.entradaSaida.mensagemOriginal ?? "Conteúdo não registrado nesta execução."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {d.entradaSaida.jornada.map((etapa, i) => (
              <div key={`${etapa.rotulo}-${i}`} className="flex items-center gap-2">
                <span
                  className={`rounded-md border px-2 py-1 text-xs ${
                    etapa.ocorreu ? "bg-muted text-foreground" : "text-muted-foreground opacity-50"
                  }`}
                  title={etapa.descricao}
                >
                  {etapa.rotulo}
                </span>
                {i < d.entradaSaida.jornada.length - 1 && (
                  <span aria-hidden className="text-muted-foreground">
                    →
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase text-muted-foreground">Resposta final</p>
            <p className="text-sm">
              {d.entradaSaida.respostaFinal ?? "Conteúdo não registrado nesta execução."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Linha do tempo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Linha do tempo</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {d.timeline.map((marco, i) => (
              <li key={`${marco.nodeId}-${marco.instante}-${i}`} className="flex gap-3 text-sm">
                <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">
                  {marco.horaExibida}
                </span>
                <span
                  aria-hidden
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    marco.status === "error"
                      ? "bg-destructive"
                      : marco.status === "cancelled" || marco.status === "skipped"
                        ? "bg-muted-foreground"
                        : "bg-primary"
                  }`}
                />
                <span className="min-w-0">
                  <span className="font-medium">{marco.nome}</span>{" "}
                  <span className="text-muted-foreground">
                    ({ROTULO_EVENTO[marco.evento] ?? marco.evento}
                    {marco.duracaoMs !== null ? ` · ${marco.duracaoMs} ms` : ""})
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* Erros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Falhas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {d.falhas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma falha registrada nesta execução.</p>
          ) : (
            d.falhas.map((falha) => (
              <div key={falha.nodeId} className="space-y-2 rounded-md border border-destructive/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">{falha.nome}</span>
                  <Badge variant="destructive">{falha.rotulo}</Badge>
                  {falha.recuperado && (
                    <Badge variant="outline" className="gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Recuperado
                    </Badge>
                  )}
                </div>
                {falha.mensagem && (
                  <p className="text-sm text-muted-foreground">{falha.mensagem}</p>
                )}
                <Separator />
                <ul className="space-y-1 text-sm">
                  {falha.tentativas.map((t) => (
                    <li key={t.ordem} className="flex items-center gap-2">
                      <XCircle className="h-3.5 w-3.5 text-destructive" aria-hidden />
                      <span>
                        Tentativa #{t.ordem} — {t.mensagem ?? "falha sem detalhe registrado"}
                      </span>
                    </li>
                  ))}
                  {falha.recuperado && (
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden />
                      <span>Tentativa seguinte concluída com sucesso</span>
                    </li>
                  )}
                </ul>
                {falha.fallback && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden /> Alternativa acionada:{" "}
                    {falha.fallback}
                  </p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
