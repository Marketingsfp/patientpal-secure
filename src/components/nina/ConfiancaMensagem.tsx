/**
 * Indicador de confiança nas mensagens da Nina (Inbox interna).
 *
 * REGRA DURA: o percentual NÃO é calculado aqui. Ele é lido do que o
 * Confidence Decision Engine gravou no instante em que aquela resposta foi
 * produzida, casado pela execução que gerou a mensagem. Sem registro, o
 * indicador simplesmente não aparece — nunca estimamos um valor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  confiabilidadeDaExecucao,
  confiancaDasExecucoes,
  type ConfiancaDaMensagem,
  type ConfiabilidadeDecisaoView,
} from "@/lib/nina/confianca.functions";
import {
  ROTULO_INDICE_EVIDENCIA,
  rotuloConfianca,
  scoreExibido,
  textoIndiceEvidencia,
} from "@/lib/nina/confianca-badge";
import {
  snapshotDoPrompt,
  type SnapshotPromptView,
} from "@/lib/nina/prompt-snapshot.functions";

import {
  assinarInvalidacaoConfianca,
  gravarLote,
  idsParaBuscar,
  mapaDoCache,
  type CacheConfianca,
} from "@/lib/nina/confianca-cache";
import {
  confiancaAplicavelAMensagem,
  representacaoDaMensagem,
  TEXTO_MOTIVO_VINCULO,
} from "@/lib/nina/confidence/identidade-saida";

export type MapaConfianca = Record<string, ConfiancaDaMensagem>;

/**
 * Busca em UM ÚNICO lote a confiança das execuções da conversa aberta.
 *
 * Desempenho (FASE 11): nunca há consulta por mensagem. O que já foi lido
 * fica em cache no navegador, então trocar de conversa e voltar não refaz
 * trabalho, e o que já está em cache continua na tela enquanto o restante
 * chega — sem piscar e sem atrasar a renderização das mensagens.
 */
export function useConfiancaMensagens(
  clinicaId: string | null | undefined,
  execucaoIds: string[],
): MapaConfianca {
  const buscar = useServerFn(confiancaDasExecucoes);
  const cache = useRef<CacheConfianca>(new Map());
  const [, forcar] = useState(0);
  const chave = execucaoIds.slice().sort().join(",");

  // FASE 6 — um reporte de erro recém-gravado invalida a execução na hora.
  useEffect(() => assinarInvalidacaoConfianca(() => forcar((n) => n + 1)), []);

  useEffect(() => {
    const ids = chave ? chave.split(",") : [];
    if (!clinicaId || ids.length === 0) return;
    const pendentes = idsParaBuscar(cache.current, clinicaId, ids, Date.now());
    if (pendentes.length === 0) return;
    let ativo = true;
    void (async () => {
      try {
        const linhas = await buscar({ data: { clinicaId, execucaoIds: pendentes } });
        if (!ativo) return;
        gravarLote(cache.current, clinicaId, pendentes, linhas, Date.now());
        forcar((n) => n + 1);
      } catch {
        // Indicador auxiliar: falha aqui não pode atrapalhar o atendimento.
        // Nada é gravado no cache, então a próxima rodada tenta de novo.
      }
    })();
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscar, chave, clinicaId, forcarVersao(cache.current)]);

  return useMemo(
    () => (clinicaId ? mapaDoCache(cache.current, clinicaId, chave ? chave.split(",") : []) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chave, clinicaId, cache.current.size, forcarVersao(cache.current)],
  );
}

/** Assinatura barata para reagir a atualizações do cache no mesmo tamanho. */
function forcarVersao(cache: CacheConfianca): number {
  let v = 0;
  for (const e of cache.values()) v += e.em % 1000;
  return v;
}

const ESTILO: Record<
  string,
  { classe: string; ponto: string; curto: string; rotulo: string; Icone: typeof ShieldCheck }
> = {
  HIGH: {
    classe: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    ponto: "bg-emerald-500",
    curto: "Alta",
    rotulo: "Confiança alta",
    Icone: ShieldCheck,
  },
  MEDIUM: {
    classe: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    ponto: "bg-amber-500",
    curto: "Média",
    rotulo: "Confiança intermediária",
    Icone: ShieldQuestion,
  },
  LOW: {
    classe: "border-destructive/30 bg-destructive/10 text-destructive",
    ponto: "bg-destructive",
    curto: "Baixa",
    rotulo: "Confiança baixa",
    Icone: ShieldAlert,
  },
};

/** Sem avaliação da resposta: selo neutro, nunca verde/amarelo/vermelho. */
const ESTILO_NEUTRO = {
  classe: "border-border/60 text-muted-foreground",
  ponto: "bg-muted-foreground/50",
  curto: "—",
  rotulo: "Resposta não avaliada",
  Icone: ShieldQuestion,
};

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      {children}
    </div>
  );
}

function Grupo({
  titulo,
  linhas,
}: {
  titulo: string;
  linhas: {
    ok: boolean;
    rotulo: string;
    detalhe: string | null;
    estado?: "ok" | "pendente" | "nao_aplicavel" | "falha";
  }[];
}) {
  if (linhas.length === 0) return null;
  return (
    <Secao titulo={titulo}>
      <ul className="space-y-0.5">
        {linhas.map((l, i) => {
          // FASE 2/3 — "em coleta" e "não aplicável" são estados normais do
          // atendimento. Só inconsistência real aparece como erro.
          const estado = l.estado ?? (l.ok ? "ok" : "falha");
          const simbolo =
            estado === "ok" ? "✓" : estado === "falha" ? "✕" : estado === "pendente" ? "…" : "—";
          const cor = estado === "falha" ? "text-destructive" : estado === "ok" ? "" : "text-muted-foreground";
          const sufixo =
            estado === "pendente"
              ? " (em coleta)"
              : estado === "nao_aplicavel"
                ? ": não aplicável"
                : "";
          return (
            <li key={`${l.rotulo}-${i}`} className="flex items-start gap-1">
              <span aria-hidden>{simbolo}</span>
              <span className={cor}>
                {l.rotulo}
                {sufixo}
                {l.detalhe ? ` — ${l.detalhe}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </Secao>
  );
}


export function ConfiancaMensagemBadge({
  clinicaId,
  confianca,
  /** FASE 6 — id da mensagem enviada; vínculo principal do snapshot. */
  mensagemId,
  /** FASE 6 — conversa da mensagem (isolamento explícito). */
  conversaId,
  /**
   * FASE 6 — a bolha em que o selo aparece. Serve para conferir se a avaliação
   * é DESTA saída: um áudio com resumo falado tem outro conteúdo e não pode
   * herdar a nota do texto completo.
   */
  mensagem,
}: {
  clinicaId: string;
  confianca: ConfiancaDaMensagem;
  mensagemId?: string | null;
  conversaId?: string | null;
  mensagem?: { tipo?: string | null; texto?: string | null; transcricao?: string | null } | null;
}) {
  const detalhar = useServerFn(confiabilidadeDaExecucao);
  const [detalhe, setDetalhe] = useState<ConfiabilidadeDecisaoView | null>(null);
  const [aberto, setAberto] = useState(false);

  const identidade = useMemo(
    () => (mensagem ? representacaoDaMensagem(mensagem) : null),
    [mensagem],
  );

  const carregar = useCallback(async () => {
    try {
      setDetalhe(
        await detalhar({
          data: {
            clinicaId,
            execucaoId: confianca.execucao_id,
            ...(mensagemId ? { outgoingMessageId: mensagemId } : {}),
            ...(conversaId ? { conversaId } : {}),
            ...(identidade
              ? {
                  representacao: identidade.representacao,
                  ...(identidade.conteudo ? { conteudo: identidade.conteudo.slice(0, 20000) } : {}),
                }
              : {}),
          },
        }),
      );
    } catch {
      setDetalhe(null);
    }
  }, [clinicaId, confianca.execucao_id, conversaId, detalhar, identidade, mensagemId]);

  useEffect(() => {
    if (aberto && !detalhe) void carregar();
  }, [aberto, carregar, detalhe]);

  const rotulo = rotuloConfianca(confianca);
  // FASE 6 — o selo do lote é da execução; se ele descreve OUTRA forma de
  // entrega ou outro conteúdo, a bolha fica "não avaliada" com o motivo.
  const vinculo = useMemo(
    () =>
      mensagem
        ? confiancaAplicavelAMensagem(
            {
              representacao: confianca.representacao ?? null,
              texto_final_hash: confianca.texto_final_hash ?? null,
            },
            mensagem,
          )
        : null,
    [confianca.representacao, confianca.texto_final_hash, mensagem],
  );
  const aplicavel = vinculo ? vinculo.aplicavel : true;
  // FASE 6 — sem avaliação da RESPOSTA, o selo é neutro: nota de ação nunca
  // é apresentada como confiança do texto.
  const estilo =
    rotulo.avaliada && aplicavel ? (ESTILO[confianca.nivel] ?? ESTILO["LOW"]!) : ESTILO_NEUTRO;
  const { Icone } = estilo;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${estilo.rotulo}${
            rotulo.avaliada && aplicavel
              ? `: índice de evidência ${scoreExibido(confianca.score)} de 100.`
              : "."
          }${confianca.erro_reportado ? " Erro reportado por atendente." : ""} Ver detalhes.`}
          title={
            rotulo.avaliada && aplicavel
              ? `${estilo.rotulo} — ${ROTULO_INDICE_EVIDENCIA}: ${textoIndiceEvidencia(confianca.score)} (visível apenas para a equipe)`
              : "A resposta não foi avaliada; existe apenas avaliação de segurança da ação (visível apenas para a equipe)."
          }
          className={`inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full border px-1.5 text-[10px] font-medium leading-none ${estilo.classe}`}
        >
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${estilo.ponto}`} />
          {aplicavel ? rotulo.texto : ESTILO_NEUTRO.curto}
          {confianca.erro_reportado && (
            <span className="font-semibold text-destructive" aria-hidden>
              !
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-96 w-80 space-y-2 overflow-y-auto text-xs">
        {/* FASE 5 — cada coisa no seu lugar: tipo do turno, nota da resposta,
            ação, segurança da ação, decisão e motivo. "Não aplicável" é
            estado normal e nunca aparece em vermelho. */}
        <Secao titulo="Tipo do turno">
          <p>{detalhe?.tipoTurno ?? "—"}</p>
        </Secao>
        {(vinculo && !vinculo.aplicavel) || (detalhe && !detalhe.avaliacaoDisponivel) ? (
          <Secao titulo="Vínculo com esta saída">
            <p className="text-muted-foreground">
              {detalhe && !detalhe.avaliacaoDisponivel
                ? detalhe.vinculoMotivo
                : TEXTO_MOTIVO_VINCULO[vinculo!.motivo]}
            </p>
          </Secao>
        ) : null}
        <Secao titulo={ROTULO_INDICE_EVIDENCIA}>
          {rotulo.avaliada && aplicavel && detalhe?.avaliacaoDisponivel !== false ? (
            <>
              <p className="text-sm font-medium">
                <Icone className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                {textoIndiceEvidencia(confianca.score)} · {estilo.curto}
              </p>
              {detalhe?.coberturaEvidencias != null && (
                <p className="text-muted-foreground">
                  Cobertura das evidências: {detalhe.coberturaEvidencias}% do que era relevante.
                </p>
              )}
              {detalhe?.validadores.some((v) => v.status === "UNKNOWN") && (
                <p className="text-muted-foreground">
                  Lacunas:{" "}
                  {detalhe.validadores
                    .filter((v) => v.status === "UNKNOWN")
                    .map((v) => v.validator)
                    .join(", ")}
                </p>
              )}
              <p className="text-muted-foreground">
                Índice de evidência verificada — não é probabilidade de acerto. Registrado quando a
                resposta foi produzida e não é recalculado.
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">
              Resposta não avaliada. Existe apenas avaliação da segurança da ação, que não é a nota
              do texto.
            </p>
          )}
        </Secao>
        <Secao titulo="Ação">
          <p className={detalhe?.seguranca?.acao ? "" : "text-muted-foreground"}>
            {detalhe?.seguranca?.acao ?? "Nenhuma"}
          </p>
        </Secao>
        {/* Segurança da AÇÃO é outra coisa: o indicador da bolha é a confiança
            da RESPOSTA. Uma ação bloqueada não reprova o texto. */}
        <Secao titulo="Segurança da ação">
          <p
            className={
              detalhe?.seguranca?.status === "BLOCKED" ? "text-destructive" : "text-muted-foreground"
            }
          >
            {detalhe?.seguranca?.status === "BLOCKED"
              ? "Bloqueada"
              : detalhe?.seguranca?.status === "ALLOWED"
                ? "Liberada"
                : "Não aplicável"}
          </p>
          {detalhe?.seguranca?.status === "BLOCKED" &&
            detalhe.seguranca.bloqueadores.length > 0 && (
              <ul className="list-disc pl-4 text-muted-foreground">
                {detalhe.seguranca.bloqueadores.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
        </Secao>
        {/* FASE 6 — três coisas distintas: o que o motor recomendou, o que a
            etapa de ativação deixou valer e o que de fato aconteceu. */}
        <Secao titulo="Decisão recomendada pelo motor">
          <p>{detalhe?.decisaoRecomendada ?? "—"}</p>
        </Secao>
        <Secao titulo="Aplicação (etapa de ativação)">
          <p className="text-muted-foreground">
            Etapa {detalhe?.etapaAtivacao ?? "—"} ·{" "}
            {detalhe?.modo === "enforce" ? "decide" : "apenas observa"}
            {detalhe?.teriaPermitido === false ? " · o motor não teria liberado" : ""}
          </p>
        </Secao>
        <Secao titulo="Efeito realizado">
          <p>{detalhe?.decisaoTurno ?? detalhe?.efeitoRealizado ?? detalhe?.resultado ?? "—"}</p>
        </Secao>
        {detalhe?.motivoDecisao && (
          <Secao titulo="Motivo">
            <p className="text-muted-foreground">{detalhe.motivoDecisao}</p>
          </Secao>
        )}

        {confianca.bloqueadores.length > 0 && (
          <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-destructive">
            <p className="font-medium">Bloqueio objetivo</p>
            <ul className="list-disc pl-4">
              {confianca.bloqueadores.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        )}
        {confianca.alta_confianca_com_erro && (
          <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-destructive">
            <p className="font-medium">Alta confiança + erro (HIGH_CONFIDENCE_ERROR)</p>
            <p>
              A resposta foi dada com alta confiança e mesmo assim foi reportada como erro.
              Caso prioritário de investigação de fonte, validador, regra, peso, identificação da
              entidade ou ferramenta.
            </p>
          </div>
        )}
        <Secao titulo="Erro posteriormente reportado">
          {confianca.erro_reportado ? (
            <p className="text-destructive">
              SIM — registrado em{" "}
              {new Date(confianca.erro_reportado.created_at).toLocaleString("pt-BR")} (situação:{" "}
              {confianca.erro_reportado.status}
              {confianca.erro_reportado.categoria
                ? `, ${confianca.erro_reportado.categoria}`
                : ""}
              )
            </p>
          ) : (
            <p className="text-muted-foreground">NÃO</p>
          )}
        </Secao>
        {detalhe ? (
          <>
            <Secao titulo="Resultado registrado">
              <p className="text-muted-foreground">{detalhe.resultado}</p>
              {detalhe.acaoSolicitada && (
                <p className="text-muted-foreground">Ação avaliada: {detalhe.acaoSolicitada}</p>
              )}
              {detalhe.intencao && (
                <p className="text-muted-foreground">Intenção: {detalhe.intencao}</p>
              )}
            </Secao>

            <Grupo titulo="Validações" linhas={detalhe.linhas.filter((l) => l.grupo === "validador")} />
            {detalhe.validadores.length > 0 && (
              <Secao titulo="Dimensões">
                <ul className="text-muted-foreground">
                  {detalhe.validadores.map((v) => (
                    <li key={v.validator}>
                      {v.validator}: {v.status}
                      {v.reasonCode ? ` (${v.reasonCode})` : ""}
                    </li>
                  ))}
                </ul>
              </Secao>
            )}
            <Grupo titulo="Ferramentas" linhas={detalhe.linhas.filter((l) => l.grupo === "ferramenta")} />
            <Grupo titulo="Fontes" linhas={detalhe.linhas.filter((l) => l.grupo === "fonte")} />
            <Grupo titulo="Conflitos" linhas={detalhe.linhas.filter((l) => l.grupo === "conflito")} />
            {detalhe.reasonCodes.length > 0 && (
              <Secao titulo="Motivos registrados">
                <p className="text-muted-foreground">{detalhe.reasonCodes.join(", ")}</p>
              </Secao>
            )}
            <p className="text-[10px] text-muted-foreground">
              Política: {detalhe.policyVersion ?? confianca.policy_version ?? "desconhecida"} ·
              Motor: {detalhe.engineVersion ?? "—"} · Configuração:{" "}
              {detalhe.configId ?? confianca.config_id ?? "não registrada"}
              {detalhe.configOrigem ? ` (${detalhe.configOrigem})` : ""} · Avaliação:{" "}
              {detalhe.avaliacao ?? "—"} · Ambiente: {detalhe.ambiente}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">Carregando detalhes…</p>
        )}
        <InstrucoesUtilizadas clinicaId={clinicaId} execucaoId={confianca.execucao_id} />

      </PopoverContent>
    </Popover>
  );
}

/**
 * FASE 5 — instruções EXATAS que geraram esta resposta. O conteúdo vem do
 * snapshot gravado naquele momento; sem snapshot, dizemos que não existe —
 * nunca mostramos o prompt atual no lugar de uma mensagem antiga.
 */
function InstrucoesUtilizadas({
  clinicaId,
  execucaoId,
}: {
  clinicaId: string;
  execucaoId: string;
}) {
  const buscar = useServerFn(snapshotDoPrompt);
  const [snap, setSnap] = useState<SnapshotPromptView | null>(null);
  const [buscou, setBuscou] = useState(false);
  const [ver, setVer] = useState<"prompt" | "enviado" | null>(null);

  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const r = await buscar({ data: { clinicaId, execucaoId } });
        if (ativo) setSnap(r);
      } catch {
        if (ativo) setSnap(null);
      } finally {
        if (ativo) setBuscou(true);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [buscar, clinicaId, execucaoId]);

  if (!buscou) return null;
  if (!snap) {
    return (
      <Secao titulo="Instruções utilizadas">
        <p className="text-muted-foreground">
          Snapshot do prompt não disponível para esta execução.
        </p>
      </Secao>
    );
  }
  return (
    <Secao titulo="Instruções utilizadas">
      <p className="text-muted-foreground">
        Prompt: {snap.versao ? `v${snap.versao}` : "—"} · Hash: {snap.hash ?? "—"} · Origem:{" "}
        {snap.origem === "publicada" ? "Arquitetura" : (snap.origem ?? "—")}
      </p>
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          className="rounded border px-1.5 py-0.5 text-[10px]"
          onClick={() => setVer(ver === "prompt" ? null : "prompt")}
        >
          Ver prompt utilizado
        </button>
        <button
          type="button"
          className="rounded border px-1.5 py-0.5 text-[10px]"
          onClick={() => setVer(ver === "enviado" ? null : "enviado")}
        >
          Ver conteúdo efetivamente enviado
        </button>
      </div>
      {ver && (
        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded border bg-muted/40 p-2 text-[10px]">
          {(ver === "prompt" ? snap.promptUtilizado : snap.conteudoEnviado) ?? "—"}
        </pre>
      )}
    </Secao>
  );
}


/**
 * Mensagem da Nina anterior ao registro de confiança (ou sem avaliação
 * gravada). Nunca inventamos pontuação: dizemos que não foi avaliada.
 */
export function ConfiancaNaoAvaliadaBadge() {
  return (
    <span
      title="Esta resposta é anterior ao registro de confiança ou não teve avaliação gravada (visível apenas para a equipe)."
      className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full border border-border/60 px-1.5 text-[10px] font-medium leading-none text-muted-foreground"
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full border border-muted-foreground/60" />
      Não avaliada
    </span>
  );
}
