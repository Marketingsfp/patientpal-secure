/**
 * FASE 5 — "Resultado da correção".
 *
 * Mostra, em linguagem simples, o que mudou de verdade: resultado, explicação,
 * itens alterados com antes/depois, diff expansível, evidências, testes,
 * autoria/tempo, versões e reversão. Somente leitura — não dispara nada.
 */
import { Badge } from "@/components/ui/badge";
import {
  ROTULO_RESULTADO_RELATORIO,
  type RelatorioCorrecao,
} from "@/lib/nina/correcao-relatorio";

const VARIANTE: Record<
  RelatorioCorrecao["resultado"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  corrigido_verificado: "default",
  aplicado_aguardando_publicacao: "secondary",
  falhou: "destructive",
  nenhuma_mudanca_necessaria: "outline",
  pendente_integracao: "secondary",
};

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{rotulo}:</span> {valor}
    </p>
  );
}

function duracaoTexto(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

export function CorrecaoRelatorioCard({ relatorio }: { relatorio: RelatorioCorrecao | null }) {
  if (!relatorio) return null;
  const r = relatorio;

  return (
    <section className="space-y-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold">Resultado da correção</h4>
        <Badge variant={VARIANTE[r.resultado]}>{ROTULO_RESULTADO_RELATORIO[r.resultado]}</Badge>
        {r.versao.publicado && (
          <Badge variant="outline">
            {r.versao.publicacaoConfirmada ? "Publicação confirmada" : "Publicado (não conferido)"}
          </Badge>
        )}
      </div>

      <div className="space-y-1">
        <Linha rotulo="Problema" valor={r.explicacao.problema} />
        <Linha rotulo="Mudança" valor={r.explicacao.mudanca} />
        <Linha rotulo="Comportamento esperado" valor={r.explicacao.comportamentoEsperado} />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium">O que foi alterado</p>
        {r.alteracoes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum item foi alterado.</p>
        ) : (
          r.alteracoes.map((a, i) => (
            <div key={`${a.alvo}-${i}`} className="rounded-md border border-border p-2">
              <p className="text-xs font-medium">
                {a.alvo}{" "}
                <span className="font-normal text-muted-foreground">
                  ({a.tipo}) — {a.efetivada ? "alteração efetivada" : "registrada, ainda não aplicada"}
                </span>
              </p>
              <div className="mt-1 grid gap-2 md:grid-cols-2">
                <div>
                  <p className="text-[11px] text-muted-foreground">Antes</p>
                  <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-1.5 text-xs">
                    {a.antes ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Depois</p>
                  <p className="whitespace-pre-wrap rounded-md border border-primary/40 p-1.5 text-xs">
                    {a.depois ?? "—"}
                  </p>
                </div>
              </div>
              {a.diff && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs font-medium">Ver diff detalhado</summary>
                  <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-[11px]">
                    {a.diff}
                  </pre>
                </details>
              )}
            </div>
          ))
        )}
      </div>

      <details className="rounded-md border border-border p-2">
        <summary className="cursor-pointer text-xs font-medium">Provas técnicas</summary>
        <div className="mt-2 space-y-2">
          <div className="space-y-1">
            <p className="text-xs font-medium">Evidências da análise</p>
            <Linha rotulo="Análise" valor={r.evidencias.analiseId ?? "—"} />
            <Linha
              rotulo="Pacote"
              valor={`${r.evidencias.pacoteHash ?? "—"} · revisão ${
                r.evidencias.pacoteRevisao ?? "—"
              } · origem ${r.evidencias.origem ?? "—"}`}
            />
            <Linha
              rotulo="Mensagens vinculadas"
              valor={`${r.evidencias.entradas} · ambiente ${r.evidencias.ambiente ?? "—"}`}
            />
            {r.evidencias.lacunas.length > 0 && (
              <ul className="ml-4 list-disc text-[11px] text-muted-foreground">
                {r.evidencias.lacunas.map((l) => (
                  <li key={l.rotulo}>
                    Lacuna — {l.rotulo}: {l.motivo}
                  </li>
                ))}
              </ul>
            )}
            {r.evidencias.cortes.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Cortes: {r.evidencias.cortes.join("; ")}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium">Testes</p>
            <Linha
              rotulo="Execução"
              valor={
                r.testes.executado
                  ? r.testes.aprovado
                    ? "executado e aprovado"
                    : "executado e reprovado"
                  : "não executado"
              }
            />
            <Linha rotulo="Ambiente" valor={r.testes.ambiente} />
            <Linha rotulo="Motivo" valor={r.testes.motivo} />
            {r.testes.resposta && (
              <p className="whitespace-pre-wrap rounded-md border border-border p-1.5 text-[11px] text-muted-foreground">
                {r.testes.resposta}
              </p>
            )}
            <p className="text-[11px] font-medium">Verificações não realizadas</p>
            <ul className="ml-4 list-disc text-[11px] text-muted-foreground">
              {r.testes.naoRealizadas.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium">Trabalho</p>
            <Linha rotulo="Solicitado por" valor={r.trabalho.solicitadoPor ?? "—"} />
            <Linha
              rotulo="Modelo/provedor"
              valor={`${r.trabalho.modelo} · ${r.trabalho.provedor}`}
            />
            <Linha
              rotulo="Horário"
              valor={`${r.trabalho.inicio ?? "—"} → ${r.trabalho.fim ?? "—"} (${duracaoTexto(
                r.trabalho.duracaoMs,
              )})`}
            />
            <Linha
              rotulo="Identificação"
              valor={`execução ${r.trabalho.execucaoId ?? "—"} · chave ${
                r.trabalho.idempotenciaChave ?? "—"
              } · tentativa ${r.trabalho.tentativa ?? "—"}`}
            />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium">Versões</p>
            <Linha
              rotulo="Anterior → nova"
              valor={`${r.versao.anterior ?? "—"} → ${r.versao.nova ?? "—"}`}
            />
            <Linha
              rotulo="Publicação"
              valor={
                r.versao.publicado
                  ? r.versao.publicacaoConfirmada
                    ? "concluída e conferida"
                    : "concluída, sem conferência do valor efetivo"
                  : "não houve publicação"
              }
            />
            <Linha rotulo="Revisão em vigor" valor={r.versao.revisaoAtual ?? "—"} />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium">Histórico do executor</p>
            <ol className="ml-4 list-decimal text-[11px] text-muted-foreground">
              {r.passos.map((p) => (
                <li key={p.ordem}>
                  {p.ok ? "✓" : "✗"} {p.titulo} — {p.detalhe}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </details>

      <p className="text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">Reversão:</span> {r.reversao.instrucao}
      </p>
      <p className="text-[11px] text-muted-foreground">
        A mensagem que originou o reporte não foi alterada nem apagada: a correção vale para o
        comportamento futuro e o incidente segue disponível para auditoria.
      </p>
    </section>
  );
}
