/**
 * FASE 3 — REGISTRO DO TURNO (o que produziu ESTA resposta), somente leitura.
 *
 * Lê o que a FASE 1 gravou junto da execução (`turn.summary` e
 * `turn.delivery`) e mostra em linguagem simples:
 *   - qual versão das instruções foi usada e se houve queda para o texto do
 *     código por falha;
 *   - o estado do turno (ambiente, lote, revisão da conversa, confiança);
 *   - de onde nasceu o texto e quem mexeu nele depois do modelo;
 *   - qual mensagem foi realmente entregue;
 *   - o que NÃO ficou comprovado.
 *
 * Nada aqui é recalculado nem preenchido pela prévia atual: sem registro,
 * dizemos que não há registro.
 */
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  alteracaoDaTransformacao,
  avaliacaoEmObservacao,
  avaliarTransformacoes,
  descreverAvaliacaoConfianca,
  TEXTO_AVALIACAO_EM_OBSERVACAO,
  origemComSituacao,
  ROTULO_LACUNA_TURNO,
  ROTULO_ORIGEM,
  ROTULO_SITUACAO_TRANSFORMACAO,
  type OrigemResposta,
  type SituacaoTransformacoes,
} from "@/lib/nina/rastreio/turno";

type EventoComMetadata = { node_id?: string | null; metadata?: unknown };

export function resumoDoTurno(
  eventos: readonly EventoComMetadata[],
): Record<string, unknown> | null {
  const ev = eventos.find((e) => e?.node_id === "turn.summary");
  const meta = ev?.metadata;
  return meta && typeof meta === "object" ? (meta as Record<string, unknown>) : null;
}

function texto(v: unknown, vazio = "—") {
  return v === null || v === undefined || v === "" ? vazio : String(v);
}

/**
 * Situação real das etapas pós-modelo. Prefere o que ficou gravado; registros
 * antigos (sem o campo) são reclassificados pelos próprios hashes gravados —
 * nunca por suposição.
 */
export function situacaoDasTransformacoes(
  resumo: Record<string, unknown>,
): SituacaoTransformacoes {
  const gravada = resumo["situacao_transformacoes"];
  if (typeof gravada === "string" && gravada in ROTULO_SITUACAO_TRANSFORMACAO) {
    return gravada as SituacaoTransformacoes;
  }
  const lista = Array.isArray(resumo["transformacoes"])
    ? (resumo["transformacoes"] as Array<Record<string, unknown>>)
    : [];
  return avaliarTransformacoes(
    lista.map((t) => ({
      antesHash: (t["antes_hash"] ?? t["antesHash"] ?? null) as string | null,
      depoisHash: (t["depois_hash"] ?? t["depoisHash"] ?? null) as string | null,
    })),
  );
}

export function RegistroTurnoResumo({
  eventos,
  compacto = false,
}: {
  eventos: readonly EventoComMetadata[];
  /** Versão enxuta, para caber dentro de uma janela de detalhes. */
  compacto?: boolean;
}) {
  const resumo = resumoDoTurno(eventos);

  if (!resumo) {
    return (
      <Corpo compacto={compacto}>
        <p className="text-muted-foreground">
          Sem registro do turno para esta execução. Isso não é preenchido pela prévia atual — o que
          está em edição ou publicado agora pode ser diferente do que gerou esta resposta.
        </p>
      </Corpo>
    );
  }

  const versao = (resumo["versao_prompt"] ?? null) as Record<string, unknown> | null;
  const transformacoes = (resumo["transformacoes"] ?? []) as Array<Record<string, unknown>>;
  const lacunas = (resumo["lacunas"] ?? []) as string[];
  const confianca = (resumo["confianca"] ?? null) as Record<string, unknown> | null;
  const entrega = (resumo["entrega"] ?? null) as Record<string, unknown> | null;
  const situacao = situacaoDasTransformacoes(resumo);
  const origem = origemComSituacao(
    (resumo["origem_resposta"] ?? null) as OrigemResposta | null,
    situacao,
  );

  return (
    <Corpo compacto={compacto}>
      <div className="grid gap-2 sm:grid-cols-2">
        <p>
          <span className="text-muted-foreground">Instruções usadas: </span>
          {versao
            ? `versão ${texto(versao["versao"])} (${texto(versao["selecao"])})`
            : "não registrada"}
        </p>
        <p>
          <span className="text-muted-foreground">Modelo: </span>
          {resumo["modelo_chamado"]
            ? `chamado em ${texto(resumo["rodadas"], "0")} rodada(s)`
            : "não foi chamado neste turno"}
        </p>
        <p>
          <span className="text-muted-foreground">Origem do texto: </span>
          {origem ? (ROTULO_ORIGEM[origem as keyof typeof ROTULO_ORIGEM] ?? origem) : "não registrada"}
          {resumo["motivo_origem"] ? ` — ${texto(resumo["motivo_origem"])}` : ""}
        </p>
        <p>
          <span className="text-muted-foreground">Ambiente: </span>
          {texto(resumo["ambiente"])}
          {resumo["teste"] ? " · teste" : ""}
        </p>
        <p>
          <span className="text-muted-foreground">Mensagens do turno: </span>
          {texto(resumo["mensagens_entrada"], "0")}
          {resumo["batch_id"] ? " (agrupadas)" : ""}
          {resumo["revisao_conversa"] != null
            ? ` · revisão ${texto(resumo["revisao_conversa"])}`
            : ""}
        </p>
        <p>
          <span className="text-muted-foreground">Ação aplicada ao atendimento: </span>
          {operacional
            ? `${texto(operacional["decisao"], "não registrada")}${
                operacional["etapa"] ? ` · etapa ${texto(operacional["etapa"])}` : ""
              }`
            : "nenhuma intervenção de confiança registrada neste turno"}
        </p>
      </div>

      {/* FASE 2 — cada avaliação com tipo, nota, decisão registrada e modo. */}
      <div className="mt-2 space-y-1">
        <p className="text-muted-foreground">Avaliações de confiança</p>
        {avaliacoes.length === 0 ? (
          <p>não registrada</p>
        ) : (
          avaliacoes.map((a, i) => {
            const observacao = avaliacaoEmObservacao({
              modo: (a["modo"] ?? null) as string | null,
              aplicada: (a["aplicada"] ?? null) as boolean | null,
            });
            return (
              <p key={`${texto(a["avaliacao"])}-${i}`}>
                {descreverAvaliacaoConfianca({
                  avaliacao: String(a["avaliacao"] ?? ""),
                  decisao: (a["decisao"] ?? null) as string | null,
                  etapa: (a["etapa"] ?? null) as string | null,
                  modo: (a["modo"] ?? null) as string | null,
                  score: (a["score"] ?? null) as number | null,
                  nivel: (a["nivel"] ?? null) as string | null,
                })}
                {observacao ? ` — ${TEXTO_AVALIACAO_EM_OBSERVACAO}` : ""}
              </p>
            );
          })
        )}
      </div>

      {/* Fallback do prompt: sempre visível, nunca escondido em rodapé. */}
      {versao?.["fallback_por_erro"] ? (
        <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
          <span>
            Esta resposta NÃO usou a versão publicada.{" "}
            {texto(versao["motivo"], "A leitura da versão publicada falhou.")}
          </span>
        </p>
      ) : null}

      <div>
        <p className="text-xs uppercase text-muted-foreground">
          Intervenções depois da resposta do modelo
        </p>
        <p className={situacao === "alterado" ? "" : "text-muted-foreground"}>
          {ROTULO_SITUACAO_TRANSFORMACAO[situacao]}
        </p>
        {transformacoes.length > 0 && (
          <ul className="list-disc pl-5">
            {transformacoes.map((t, i) => {
              const mudou = alteracaoDaTransformacao({
                antesHash: (t["antes_hash"] ?? t["antesHash"] ?? null) as string | null,
                depoisHash: (t["depois_hash"] ?? t["depoisHash"] ?? null) as string | null,
              });
              const efeito =
                mudou === true
                  ? "alterou o texto"
                  : mudou === false
                    ? "sem alteração do texto"
                    : "efeito não comprovado";
              return (
                <li key={`${String(t["etapa"])}-${i}`}>
                  {String(t["etapa"])} — {String(t["motivo"])} · {efeito}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p>
        <span className="text-muted-foreground">Mensagem entregue: </span>
        {entrega?.["mensagemId"]
          ? `${texto(entrega["mensagemId"])}${
              entrega["tamanho"] != null ? ` · ${texto(entrega["tamanho"])} caracteres` : ""
            }`
          : "não vinculada a este turno"}
      </p>

      {lacunas.length > 0 && (
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            Sem evidência registrada
          </p>
          <ul className="flex flex-wrap gap-1">
            {lacunas.map((l) => (
              <li key={l}>
                <Badge variant="outline">{ROTULO_LACUNA_TURNO[l] ?? l}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Corpo>
  );
}

function Corpo({ compacto, children }: { compacto: boolean; children: React.ReactNode }) {
  if (compacto) {
    return (
      <section className="space-y-3 rounded-md border bg-muted/20 p-3 text-xs">
        <p className="font-medium">O que produziu esta resposta</p>
        {children}
      </section>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">O que produziu esta resposta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">{children}</CardContent>
    </Card>
  );
}
