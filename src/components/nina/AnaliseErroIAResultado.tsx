/**
 * FASE 4 — apresentação da análise assistida de um erro reportado.
 * Somente leitura: não chama modelo nem altera a revisão.
 */
import { Badge } from "@/components/ui/badge";
import { ROTULO_VEREDITO, type ResultadoAnalise, type Verificacao } from "@/lib/nina/analise-erro";

const ROTULO_CHECK: Record<Verificacao["resultado"], string> = {
  ok: "OK",
  falha: "Falha objetiva",
  lacuna: "Sem evidência",
  nao_aplicavel: "Não se aplica",
};

export type AnaliseSalva = {
  id: string;
  versao: number;
  modelo: string;
  status: "processing" | "done" | "failed";
  criterios_versao: string;
  conclusao: string | null;
  resultado: ResultadoAnalise | null;
  input_tokens: number | null;
  output_tokens: number | null;
  duracao_ms: number | null;
  erro: string | null;
  solicitado_por: string;
  created_at: string;
  concluida_em: string | null;
};

export function AnaliseErroIAResultado({
  analise,
  solicitante,
}: {
  analise: AnaliseSalva;
  solicitante?: string | null;
}) {
  if (analise.status === "processing") {
    return (
      <p className="text-xs text-muted-foreground">
        Análise em andamento (versão {analise.versao}) com {analise.modelo}.
      </p>
    );
  }
  if (analise.status === "failed") {
    return (
      <p className="text-xs text-destructive">
        A análise falhou (versão {analise.versao}): {analise.erro ?? "motivo não registrado"}. Nenhum
        resultado foi gerado.
      </p>
    );
  }

  const r = analise.resultado;
  if (!r) {
    return <p className="text-xs text-muted-foreground">Análise concluída sem resultado legível.</p>;
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={r.veredito === "erro_comprovado" ? "destructive" : "outline"}>
          {ROTULO_VEREDITO[r.veredito]}
        </Badge>
        {r.gravidade && <Badge variant="secondary">Gravidade: {r.gravidade}</Badge>}
        {r.etapa && <Badge variant="outline">Etapa: {r.etapa}</Badge>}
        <span className="ml-auto text-[11px] text-muted-foreground">
          v{analise.versao} · {analise.modelo} · critérios {analise.criterios_versao}
          {solicitante ? ` · ${solicitante}` : ""}
          {analise.duracao_ms != null ? ` · ${Math.round(analise.duracao_ms / 100) / 10}s` : ""}
          {analise.input_tokens != null
            ? ` · ${analise.input_tokens}/${analise.output_tokens ?? 0} tokens`
            : ""}
        </span>
      </div>

      <div>
        <p className="text-xs font-medium">Conclusão</p>
        <p className="whitespace-pre-wrap text-xs text-muted-foreground">{r.conclusao}</p>
      </div>

      {r.problema && (
        <div>
          <p className="text-xs font-medium">Problema identificado</p>
          <p className="whitespace-pre-wrap text-xs text-muted-foreground">{r.problema}</p>
        </div>
      )}

      {r.causaProvavel && (
        <div>
          <p className="text-xs font-medium">
            Causa provável {r.causaEhHipotese ? "(hipótese)" : ""}
          </p>
          <p className="whitespace-pre-wrap text-xs text-muted-foreground">{r.causaProvavel}</p>
        </div>
      )}

      {r.evidencias.length > 0 && (
        <details className="rounded-md border border-border p-2">
          <summary className="cursor-pointer text-xs font-medium">
            Evidências citadas ({r.evidencias.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {r.evidencias.map((e, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                <span className="font-medium">{e.referencia}:</span> {e.observacao}
              </li>
            ))}
          </ul>
        </details>
      )}

      <details className="rounded-md border border-border p-2">
        <summary className="cursor-pointer text-xs font-medium">
          Verificações objetivas ({r.verificacoes.length})
        </summary>
        <ul className="mt-1 space-y-1">
          {r.verificacoes.map((v) => (
            <li key={v.id} className="text-xs text-muted-foreground">
              <span className="font-medium">{ROTULO_CHECK[v.resultado]}</span> — {v.rotulo}:{" "}
              {v.detalhe}
            </li>
          ))}
        </ul>
      </details>

      {r.proximaVerificacao && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Próxima verificação:</span> {r.proximaVerificacao}
        </p>
      )}

      {r.limitacoes.length > 0 && (
        <ul className="list-disc pl-4 text-[11px] text-muted-foreground">
          {r.limitacoes.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-muted-foreground">
        Análise assistida: complementa a investigação e não confirma sozinha o erro.
      </p>
    </div>
  );
}
