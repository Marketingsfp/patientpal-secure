/**
 * FASE 10 — Pipeline de uma mensagem de homologação (somente leitura).
 *
 * Só apresenta o que o trace registrou. A avaliação do GPT Sol aparece
 * separada, como etapa posterior à conversa.
 */
import { ArrowRight, CheckCircle2, Circle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { montarPipelineHomologacao } from "@/lib/nina/arquitetura/homologacao";
import type { EventoTrace } from "@/lib/nina/arquitetura/tracing";

export function PipelineHomologacao({
  eventos,
  avaliacaoSol,
}: {
  eventos: EventoTrace[];
  avaliacaoSol?: boolean;
}) {
  if (eventos.length === 0) return null;
  const p = montarPipelineHomologacao(eventos, { avaliacaoSol });
  const geracao = p.fases.filter((f) => f.momento === "geracao");
  const posterior = p.fases.filter((f) => f.momento === "posterior");

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Mensagem de homologação</Badge>
        <span className="text-xs text-muted-foreground">
          Mesmo núcleo do atendimento real, com os efeitos externos isolados.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {geracao.map((f, i) => (
          <div key={f.id} className="flex items-center gap-1.5">
            <div
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                f.status === "error"
                  ? "border-destructive text-destructive"
                  : f.ocorreu
                    ? ""
                    : "text-muted-foreground opacity-60"
              }`}
              title={f.descricao}
            >
              {f.status === "error" ? (
                <XCircle className="h-3.5 w-3.5" />
              ) : f.ocorreu ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <Circle className="h-3.5 w-3.5" />
              )}
              {f.rotulo}
            </div>
            {i < geracao.length - 1 && (
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>

      {p.ferramentas.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Ferramentas usadas: {p.ferramentas.join(", ")}
        </p>
      )}

      <Separator />

      {posterior.map((f) => (
        <div key={f.id} className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline">Depois da conversa</Badge>
          <span className={f.ocorreu ? "" : "text-muted-foreground"}>
            {f.rotulo} — {f.ocorreu ? "avaliação registrada" : "ainda não avaliada"}
          </span>
          <span className="text-muted-foreground">{f.descricao}</span>
        </div>
      ))}
    </div>
  );
}
