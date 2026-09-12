/**
 * FASE 4 — apresentação da análise assistida de um erro reportado.
 * Somente leitura: não chama modelo nem altera a revisão.
 */
import { Badge } from "@/components/ui/badge";
import {
  ROTULO_CAMADA_PROPOSTA,
  ROTULO_VEREDITO,
  type ResultadoAnalise,
  type Verificacao,
} from "@/lib/nina/analise-erro";

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

      {r.proposta && (
        <div className="space-y-1 rounded-md border border-primary/40 bg-primary/5 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium">Proposta de correção</p>
            <Badge variant="outline">{ROTULO_CAMADA_PROPOSTA[r.proposta.camada]}</Badge>
            {!r.proposta.aplicavelAutomaticamente && (
              <Badge variant="secondary">Depende de mudança no código</Badge>
            )}
          </div>
          <p className="text-xs">
            <span className="font-medium">Alvo:</span> {r.proposta.alvo}
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <p className="text-[11px] text-muted-foreground">Como está hoje</p>
              <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-1.5 text-xs">
                {r.proposta.valorAtual ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Como deve ficar</p>
              <p className="whitespace-pre-wrap rounded-md border border-primary/40 p-1.5 text-xs">
                {r.proposta.valorNovo}
              </p>
            </div>
          </div>
          {r.proposta.justificativa && (
            <p className="text-xs text-muted-foreground">{r.proposta.justificativa}</p>
          )}
          {r.proposta.arquivos.length > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Arquivos e configurações atingidos:</span>{" "}
              {r.proposta.arquivos.join(", ")}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Ambiente:</span> {r.proposta.ambiente ?? "não informado"} ·{" "}
            <span className="font-medium">Alcance:</span>{" "}
            {r.proposta.escopo === "global"
              ? "todas as clínicas"
              : r.proposta.escopo === "local"
                ? "somente esta clínica"
                : "não informado"}
            {r.proposta.alcance ? ` — ${r.proposta.alcance}` : ""}
          </p>
          {r.proposta.patch && (
            <details className="rounded-md border border-border p-2">
              <summary className="cursor-pointer text-xs font-medium">
                Mudança no código proposta
                {r.proposta.revisaoBase ? ` (base ${r.proposta.revisaoBase})` : ""}
              </summary>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap text-[11px]">
                {r.proposta.patch}
              </pre>
            </details>
          )}
          {!r.proposta.aplicavelAutomaticamente && !r.proposta.patch && (
            <p className="text-xs text-muted-foreground">
              Falta a mudança escrita no código: sem ela não há o que aplicar.
            </p>
          )}
        </div>
      )}

      {!r.proposta && r.veredito === "sem_erro" && (
        <p className="rounded-md border border-border p-2 text-xs font-medium">
          Nenhuma alteração necessária.
        </p>
      )}

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
