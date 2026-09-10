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
import { rotuloConfianca, scoreExibido } from "@/lib/nina/confianca-badge";
import {
  snapshotDoPrompt,
  type SnapshotPromptView,
} from "@/lib/nina/prompt-snapshot.functions";

import {
  gravarLote,
  idsParaBuscar,
  mapaDoCache,
  type CacheConfianca,
} from "@/lib/nina/confianca-cache";

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
  }, [buscar, chave, clinicaId]);

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
}: {
  clinicaId: string;
  confianca: ConfiancaDaMensagem;
  mensagemId?: string | null;
}) {
  const detalhar = useServerFn(confiabilidadeDaExecucao);
  const [detalhe, setDetalhe] = useState<ConfiabilidadeDecisaoView | null>(null);
  const [aberto, setAberto] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setDetalhe(
        await detalhar({
          data: {
            clinicaId,
            execucaoId: confianca.execucao_id,
            ...(mensagemId ? { outgoingMessageId: mensagemId } : {}),
          },
        }),
      );
    } catch {
      setDetalhe(null);
    }
  }, [clinicaId, confianca.execucao_id, detalhar, mensagemId]);

  useEffect(() => {
    if (aberto && !detalhe) void carregar();
  }, [aberto, carregar, detalhe]);

  const estilo = ESTILO[confianca.nivel] ?? ESTILO["LOW"]!;
  const rotulo = rotuloConfianca(confianca);
  const { Icone } = estilo;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${estilo.rotulo}: ${confianca.score}%.${
            confianca.erro_reportado ? " Erro reportado por atendente." : ""
          } Ver detalhes.`}
          title={`${estilo.rotulo} — ${scoreExibido(confianca.score)}% (visível apenas para a equipe)`}
          className={`inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full border px-1.5 text-[10px] font-medium leading-none ${estilo.classe}`}
        >
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${estilo.ponto}`} />
          {rotulo.texto}
          {confianca.erro_reportado && (
            <span className="font-semibold text-destructive" aria-hidden>
              !
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-96 w-80 space-y-2 overflow-y-auto text-xs">
        <div>
          <p className="text-sm font-medium">
            <Icone className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            Confiança da resposta: {scoreExibido(confianca.score)}%
          </p>
          <p className="text-muted-foreground">Nível: {estilo.rotulo}</p>
          {detalhe?.coberturaEvidencias != null && (
            <p className="text-muted-foreground">
              Cobertura de evidências: {detalhe.coberturaEvidencias}%
            </p>
          )}
          <p className="text-muted-foreground">
            Registrado quando a resposta foi produzida. Não é recalculado.
          </p>
        </div>
        {/* FASE 2 — segurança da AÇÃO é outra coisa: o indicador da bolha é a
            confiança da RESPOSTA. Uma ação bloqueada não reprova o texto. */}
        <div className="rounded border bg-muted/40 p-2">
          <p className="font-medium">
            Segurança da ação:{" "}
            {detalhe?.seguranca?.status === "BLOCKED"
              ? "Bloqueada"
              : detalhe?.seguranca?.status === "ALLOWED"
                ? "Liberada"
                : "Não aplicável"}
          </p>
          {detalhe?.seguranca?.acao && detalhe.seguranca.status !== "NOT_APPLICABLE" && (
            <p className="text-muted-foreground">Ação: {detalhe.seguranca.acao}</p>
          )}
          {detalhe?.seguranca?.status === "BLOCKED" &&
            detalhe.seguranca.bloqueadores.length > 0 && (
              <ul className="list-disc pl-4 text-muted-foreground">
                {detalhe.seguranca.bloqueadores.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
          {!detalhe?.seguranca && (
            <p className="text-muted-foreground">
              Nenhuma ação executável foi avaliada neste turno.
            </p>
          )}
        </div>
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
            <Secao titulo="Decisão">
              <p>{detalhe.resultado}</p>
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
              Motor: {detalhe.engineVersion ?? "—"} · Avaliação: {detalhe.avaliacao ?? "—"} ·
              Ambiente: {detalhe.ambiente}
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
