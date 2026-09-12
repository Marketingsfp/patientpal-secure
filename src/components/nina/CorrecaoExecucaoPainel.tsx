/**
 * Mostra o que o executor técnico fez: cada passo, o teste em homologação e o
 * resultado. Somente leitura — não dispara nada.
 */
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { ResumoExecucao } from "@/lib/nina/correcao-executor";
import { ETAPAS_EXECUCAO, ROTULO_ETAPA, type EtapaExecucao } from "@/lib/nina/correcao-prontidao";
import {
  ROTULO_RESULTADO_FINAL,
  type ResultadoFinalExecucao,
} from "@/lib/nina/correcao-limites";

const ROTULO_STATUS: Record<ResumoExecucao["status"], string> = {
  aplicado: "Correção aplicada e comprovada",
  pendente_tecnico: "Registrado para mudança no código",
  falhou: "Correção não concluída",
};

/** Andamento salvo: reabrir a página volta a mostrar o mesmo trabalho. */
function Etapas({ etapa }: { etapa: EtapaExecucao }) {
  const atual = ETAPAS_EXECUCAO.indexOf(etapa);
  return (
    <ol className="flex flex-wrap gap-2 text-[11px]">
      {ETAPAS_EXECUCAO.filter((e) => e !== "concluido").map((e, i) => (
        <li
          key={e}
          className={
            i < atual
              ? "text-muted-foreground"
              : i === atual
                ? "font-medium text-primary"
                : "text-muted-foreground/60"
          }
        >
          {i < atual ? "✓ " : i === atual ? "▶ " : "• "}
          {ROTULO_ETAPA[e]}
        </li>
      ))}
    </ol>
  );
}

export function CorrecaoExecucaoPainel({
  execucao,
  emAndamento,
  etapa,
  resultadoFinal,
  verificacao,
}: {
  execucao: ResumoExecucao | null;
  emAndamento?: boolean;
  etapa?: EtapaExecucao | null;
  /** Estado técnico real: preparado, aplicado, aguardando publicação, verificado. */
  resultadoFinal?: ResultadoFinalExecucao | null;
  verificacao?: { conferido: boolean; alvo: string; motivo: string } | null;
}) {
  if (emAndamento) {
    return (
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Aplicando a correção autorizada…
        </p>
        <Etapas etapa={etapa ?? "verificando"} />
      </div>
    );
  }
  if (!execucao) return null;

  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={execucao.status === "aplicado" ? "default" : "secondary"}>
          {ROTULO_STATUS[execucao.status]}
        </Badge>
        {execucao.publicado && <Badge variant="outline">Publicado</Badge>}
        {execucao.teste.executado && (
          <Badge variant={execucao.teste.aprovado ? "outline" : "destructive"}>
            Teste em homologação: {execucao.teste.aprovado ? "aprovado" : "reprovado"}
          </Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{execucao.motivo}</p>

      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <p className="text-[11px] text-muted-foreground">Antes</p>
          <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-1.5 text-xs">
            {execucao.valorAnterior ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Depois</p>
          <p className="whitespace-pre-wrap rounded-md border border-primary/40 p-1.5 text-xs">
            {execucao.valorNovo}
          </p>
        </div>
      </div>

      <ul className="space-y-1">
        {execucao.passos.map((p) => (
          <li key={p.ordem} className="flex gap-2 text-xs">
            {p.ok ? (
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" aria-hidden="true" />
            )}
            <span>
              <span className="font-medium">{p.titulo}</span> — {p.detalhe}
            </span>
          </li>
        ))}
      </ul>

      {execucao.teste.executado && (
        <details className="rounded-md border border-border p-2">
          <summary className="cursor-pointer text-xs font-medium">Resposta do teste</summary>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-medium">Pergunta:</span> {execucao.teste.pergunta ?? "—"}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
            {execucao.teste.resposta ?? "—"}
          </p>
        </details>
      )}
    </div>
  );
}
