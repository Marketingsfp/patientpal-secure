import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Loader2,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Sparkles,
  Lightbulb,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  gerarProva,
  gerarFeedbackProva,
  type FeedbackProva,
  type ProvaGerada,
} from "@/lib/coach/prova.functions";
import { useCoachConfig } from "@/lib/coach/config-clinica";
import type { CoachContexto } from "@/lib/coach/contexto";

import { supabase } from "@/integrations/supabase/client";
import { useStudyTimer } from "@/lib/coach/study-time";
import { AtendenteGuard, type AlvoAtendente } from "@/components/coach/AtendenteGuard";
import { filtroDoAtendente, escopoLocalCoach } from "@/lib/coach/identidade";
import { ProtecaoTela } from "@/components/coach/ProtecaoTela";

import {
  COTA_ATIVIDADE_MS,
  TRAVA_TEMPO_ATIVA,
  formatDuracaoMs,
} from "@/lib/coach/treinamento-plano";
import {
  clearEstadoProva,
  loadEstadoProva,
  saveEstadoProva,
} from "@/lib/coach/prova-persist";



export const Route = createFileRoute("/_authenticated/app/coach/prova/$nome")({
  head: ({ params }) => ({
    meta: [
      { title: `Prova · ${decodeURIComponent(params.nome)} · Coach WhatsApp` },
      {
        name: "description",
        content:
          "Prova de múltipla escolha gerada pela IA a partir das avaliações reais dos atendimentos.",
      },
      { property: "og:title", content: "Prova de treinamento · Coach WhatsApp" },
      {
        property: "og:description",
        content: "Avalie o conhecimento do atendente com questões baseadas nas ligações analisadas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProvaRoute,
});

function ProvaRoute() {
  const { nome } = Route.useParams();
  const atendente = decodeURIComponent(nome);
  return (
    <AtendenteGuard nome={atendente}>
      {(ctx, alvo) => (
        <ProtecaoTela atendente={atendente} clinicaId={ctx.clinicaId} tela="prova">
          <ProvaPage ctx={ctx} alvo={alvo} />
        </ProtecaoTela>
      )}
    </AtendenteGuard>
  );
}


type AnaliseRow = {
  titulo: string;
  resultado: {
    resumo?: string;
    pontos_positivos?: string[];
    pontos_negativos?: string[];
    frases_destaque?: { tipo: string; trecho: string; motivo: string }[];
    checklist_resultado?: { item: string; status: string }[];
    transcricao?: string;
  };
};

function ProvaPage({ ctx, alvo }: { ctx: CoachContexto; alvo: AlvoAtendente }) {
  const { nome } = Route.useParams();
  const atendente = decodeURIComponent(nome);
  const clinicaId = ctx.clinicaId;
  // Gestor abrindo a prova de outra pessoa: é simulação, não conta para ela.
  const simulacaoGestor = alvo.simulacaoGestor;
  useStudyTimer(simulacaoGestor ? "" : atendente, "prova", simulacaoGestor ? null : clinicaId);
  const escopoLocal = escopoLocalCoach(clinicaId, ctx.userId, atendente);
  const generate = useServerFn(gerarProva);
  const gerarFeedback = useServerFn(gerarFeedbackProva);
  const { config, loading: clinicaLoading } = useCoachConfig(
    clinicaId,
    ctx.clinicaNome,
    ctx.gestor,
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prova, setProva] = useState<ProvaGerada | null>(null);
  const [respostas, setRespostas] = useState<number[]>([]);
  const [reveladas, setReveladas] = useState<boolean[]>([]);
  const [feedback, setFeedback] = useState<FeedbackProva | null>(null);
  const feedbackRef = useRef<FeedbackProva | null>(null);
  /** Id da prova gravada: usado para anexar o feedback à mesma linha. */
  const provaIdRef = useRef<string | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Cota automática de tempo da prova (parte dos 20 minutos totais)
  const [restanteMs, setRestanteMs] = useState(COTA_ATIVIDADE_MS);
  const [restaurado, setRestaurado] = useState(false);


  const acertos = useMemo(
    () =>
      prova
        ? prova.questoes.reduce((n, q, i) => (respostas[i] === q.correta ? n + 1 : n), 0)
        : 0,
    [prova, respostas],
  );

  async function carregar() {
    setLoading(true);
    setError(null);
    setProva(null);
    setEnviado(false);
    setRespostas([]);
    setReveladas([]);
    setFeedback(null);
    setFeedbackError(null);
    clearEstadoProva(escopoLocal);
    try {

      const { data, error: dbError } = await supabase
        .from("coach_analises")
        .select("titulo,resultado")
        .eq("clinica_id", clinicaId ?? "")
        .or(filtroDoAtendente(alvo.userId, atendente))
        .order("created_at", { ascending: false })
        .limit(6);
      if (dbError) throw dbError;
      const rows = (data ?? []) as unknown as AnaliseRow[];
      let exemplos = rows.map((r) => ({
        titulo: r.titulo?.slice(0, 300),
        resumo: r.resultado?.resumo?.slice(0, 2000),
        pontos_positivos: (r.resultado?.pontos_positivos ?? []).slice(0, 12),
        pontos_negativos: (r.resultado?.pontos_negativos ?? []).slice(0, 12),
        frases: (r.resultado?.frases_destaque ?? []).slice(0, 12).map((f) => ({
          tipo: String(f.tipo).slice(0, 30),
          trecho: String(f.trecho).slice(0, 800),
          motivo: String(f.motivo).slice(0, 800),
        })),
        checklist: (r.resultado?.checklist_resultado ?? []).slice(0, 30).map((c) => ({
          item: String(c.item).slice(0, 300),
          status: String(c.status).slice(0, 30),
        })),
        transcricao: r.resultado?.transcricao?.slice(0, 8000),
      }));

      // Fallback 1: usa os treinamentos (roleplays) já feitos pela atendente
      if (exemplos.length === 0) {
        const { data: rp } = await supabase
          .from("coach_roleplay_sessions")
          .select("cenario,resumo,acertos,melhorias,pontos_fracos,mensagens,modo")
          .eq("clinica_id", clinicaId ?? "")
          .eq("simulacao_gestor", false)
          .or(filtroDoAtendente(alvo.userId, atendente))
          .order("created_at", { ascending: false })
          .limit(6);
        exemplos = (rp ?? []).map((r) => {
          const msgs = Array.isArray(r.mensagens) ? (r.mensagens as { role?: string; content?: string }[]) : [];
          return {
            titulo: `Treinamento ${r.modo === "texto" ? "WhatsApp" : "ligação"}${r.cenario ? ` — ${String(r.cenario).slice(0, 200)}` : ""}`.slice(0, 300),
            resumo: String(r.resumo ?? "").slice(0, 2000),
            pontos_positivos: (Array.isArray(r.acertos) ? (r.acertos as string[]) : []).slice(0, 12).map((s) => String(s).slice(0, 500)),
            pontos_negativos: [
              ...(Array.isArray(r.melhorias) ? (r.melhorias as string[]) : []),
              ...(Array.isArray(r.pontos_fracos) ? (r.pontos_fracos as string[]) : []),
            ]
              .slice(0, 12)
              .map((s) => String(s).slice(0, 500)),
            frases: [],
            checklist: [],
            transcricao: msgs
              .map((m) => `${m.role === "user" ? "Atendente" : "Paciente"}: ${String(m.content ?? "")}`)
              .join("\n")
              .slice(0, 8000),
          };
        });
      }

      // Fallback 2: prova padrão baseada nos scripts e nos serviços da clínica
      if (exemplos.length === 0) {
        exemplos = [
          {
            titulo: "Prova padrão de conversão de agendamento",
            resumo:
              "Sem atendimentos analisados ainda. Gere questões sobre condução da conversa, oferta de horários, tratamento de objeções, confirmação de dados e domínio dos serviços, valores e horários da clínica.",
            pontos_positivos: [],
            pontos_negativos: [
              "não ofereceu horário específico",
              "não confirmou dados do paciente",
              "não tratou objeção de preço",
              "não informou preparo do exame",
            ],
            frases: [],
            checklist: [],
            transcricao: undefined,
          },
        ];
      }

      const result = await generate({
        data: { clinicaId: clinicaId ?? "", atendente, quantidade: 8, exemplos },
      });
      setProva(result);
      setRespostas(new Array(result.questoes.length).fill(-1));
      setReveladas(new Array(result.questoes.length).fill(false));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível gerar a prova.");
    } finally {
      setLoading(false);
    }
  }

  // Retomada automática: se houver prova em andamento hoje, continua de onde parou.
  useEffect(() => {
    if (clinicaLoading) return;
    const salvo = loadEstadoProva(escopoLocal);
    if (salvo) {
      const p = salvo.prova as ProvaGerada;
      const n = p.questoes.length;
      setProva(p);
      setRespostas(
        Array.from({ length: n }, (_, i) => salvo.respostas?.[i] ?? -1),
      );
      setReveladas(
        Array.from({ length: n }, (_, i) => salvo.reveladas?.[i] ?? false),
      );
      setEnviado(Boolean(salvo.enviado));
      setLoading(false);
      setRestaurado(true);
      if (salvo.enviado) void carregarFeedback(p, salvo.respostas ?? []);
      return;
    }
    setRestaurado(true);
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atendente, clinicaLoading, clinicaId]);

  // Salva o andamento a cada resposta, para não perder nada ao trocar de aba.
  useEffect(() => {
    if (!restaurado || !prova) return;
    saveEstadoProva(escopoLocal, { prova, respostas, reveladas, enviado });
  }, [restaurado, escopoLocal, prova, respostas, reveladas, enviado]);


  // Cronômetro da prova: ao zerar, finaliza sozinha (sem perder tempo)
  useEffect(() => {
    if (!prova || enviado || !TRAVA_TEMPO_ATIVA) return;
    setRestanteMs(COTA_ATIVIDADE_MS);
    const inicio = Date.now();
    const id = setInterval(() => {
      setRestanteMs(Math.max(0, COTA_ATIVIDADE_MS - (Date.now() - inicio)));
    }, 500);
    return () => clearInterval(id);
  }, [prova, enviado]);

  useEffect(() => {
    if (!TRAVA_TEMPO_ATIVA || !prova || enviado || restanteMs > 0) return;
    void finalizar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restanteMs, prova, enviado]);

  async function finalizar() {
    if (!prova) return;
    setEnviado(true);
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    void carregarFeedback(prova, respostas);
    const total = prova.questoes.length;
    const certos = prova.questoes.reduce((n, q, i) => (respostas[i] === q.correta ? n + 1 : n), 0);
    try {
      const { data: inserida, error: insertError } = await supabase
        .from("coach_provas")
        .insert({
          clinica_id: clinicaId ?? "",
          // Sempre o usuário de quem fez a prova.
          user_id: alvo.userId,
          atendente,
          simulacao_gestor: simulacaoGestor,
          nota: Number(((certos / total) * 10).toFixed(1)),
          acertos: certos,
          total,
          questoes: prova.questoes as unknown as never,
          respostas: respostas as unknown as never,
        })
        .select("id")
        .maybeSingle();
      if (insertError) throw insertError;
      provaIdRef.current = inserida?.id ?? null;
      // Se o feedback já chegou, grava junto.
      if (feedbackRef.current) void guardarFeedback(feedbackRef.current);
      setSaved(true);
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : "Não foi possível salvar o resultado da prova.",
      );
    } finally {
      setSaving(false);
    }
  }

  /**
   * Guarda o feedback junto com a prova, para não pedir de novo à IA toda vez
   * que a atendente reabrir o resultado.
   */
  async function guardarFeedback(fb: unknown) {
    const id = provaIdRef.current;
    if (!id) return;
    await supabase
      .from("coach_provas")
      .update({ feedback: fb as never })
      .eq("id", id);
  }

  async function carregarFeedback(p: ProvaGerada, resp: number[]) {
    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      const fb = await gerarFeedback({
        data: {
          clinicaId: clinicaId ?? "",
          atendente,
          questoes: p.questoes.map((q) => ({
            pergunta: q.pergunta,
            alternativas: q.alternativas,
            correta: q.correta,
            explicacao: q.explicacao,
            origem: q.origem,
          })),
          respostas: resp.map((r) => (typeof r === "number" ? r : -1)),
        },
      });
      setFeedback(fb);
      feedbackRef.current = fb;
      void guardarFeedback(fb);
    } catch (e) {
      setFeedbackError(
        e instanceof Error ? e.message : "Não foi possível gerar o feedback da IA.",
      );
    } finally {
      setFeedbackLoading(false);
    }
  }

  const total = prova?.questoes.length ?? 0;
  const respondidas = respostas.filter((r) => r >= 0).length;
  const nota = total ? (acertos / total) * 10 : 0;

  return (
    <div className="bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <Link
            to="/app/coach"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1 hidden sm:inline-flex">
              <ClipboardCheck className="h-3 w-3" /> Prova de treinamento
            </Badge>
          </div>
        </div>

        <div className="rounded-3xl border bg-card p-6 md:p-8 shadow-[var(--shadow-card)]">
          <div className="flex items-start gap-4">
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white shrink-0"
              style={{ background: "var(--gradient-hero)" }}
            >
              {atendente.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                {prova?.titulo ?? "Prova de qualidade no atendimento"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Questões geradas a partir das avaliações reais de {atendente}.
              </p>
            </div>
          </div>

          {/* Aviso claro: a prova registra saída de aba e cópia. */}
          <p className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            Esta prova registra quando você sai da aba e quando tenta copiar ou imprimir o
            conteúdo. Faça sozinha, sem consultar outra janela.
          </p>

          {!loading && prova && !enviado && (
            <div className="mt-6 flex items-center gap-3 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              {respondidas}/{total} respondidas
              {TRAVA_TEMPO_ATIVA && (
              <span
                className={`ml-auto font-semibold tabular-nums ${
                  restanteMs <= 30_000 ? "text-destructive" : "text-primary"
                }`}
              >
                {formatDuracaoMs(restanteMs)} restantes
              </span>
              )}
            </div>
          )}
        </div>

        {loading && (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm">Gerando a prova com base nas ligações analisadas…</p>
          </div>
        )}

        {error && !loading && (
          <div className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" className="mt-4" onClick={() => void carregar()}>
              <RotateCcw className="h-4 w-4 mr-2" /> Tentar novamente
            </Button>
          </div>
        )}

        {prova && !loading && (
          <div className="mt-6 space-y-4">
            {enviado && (
              <div className="rounded-3xl border bg-card p-6 shadow-[var(--shadow-card)]">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Resultado</p>
                <div className="flex items-end gap-4 mt-2">
                  <span
                    className="text-4xl font-bold"
                    style={{
                      color:
                        nota >= 8
                          ? "var(--success)"
                          : nota >= 5
                            ? "oklch(0.78 0.16 85)"
                            : "var(--destructive)",
                    }}
                  >
                    {nota.toFixed(1)}
                  </span>
                  <span className="text-sm text-muted-foreground pb-1">
                    {acertos} de {total} corretas
                  </span>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mb-2" />}
                </div>
                {!saving && saved && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Resultado salvo no histórico de provas de {atendente}.
                  </p>
                )}
                {!saving && saveError && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <p className="text-xs text-destructive">
                      Não foi possível salvar no histórico: {saveError}
                    </p>
                    <Button size="sm" variant="outline" onClick={() => void finalizar()}>
                      <RotateCcw className="h-4 w-4 mr-2" /> Salvar novamente
                    </Button>
                  </div>
                )}
                {(() => {
                  const erradas = prova.questoes
                    .map((q, i) => ({ q, i }))
                    .filter(({ q, i }) => respostas[i] !== q.correta);
                  return (
                    <div className="mt-5 rounded-2xl border bg-secondary/40 p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        Feedback do treinador
                      </p>
                      {feedbackLoading && (
                        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" /> A IA está
                          analisando suas respostas…
                        </p>
                      )}
                      {feedbackError && !feedbackLoading && (
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <p className="text-xs text-destructive">{feedbackError}</p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void carregarFeedback(prova, respostas)}
                          >
                            <RotateCcw className="h-4 w-4 mr-2" /> Gerar feedback novamente
                          </Button>
                        </div>
                      )}
                      {feedback && !feedbackLoading && (
                        <div className="mt-2 space-y-3 text-sm">
                          {feedback.resumo && <p>{feedback.resumo}</p>}
                          {feedback.pontos_fortes.length > 0 && (
                            <div>
                              <p className="font-semibold text-[color:var(--success)]">
                                Pontos fortes
                              </p>
                              <ul className="mt-1 list-disc pl-5 space-y-1">
                                {feedback.pontos_fortes.map((s, i) => (
                                  <li key={i}>{s}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {feedback.pontos_melhorar.length > 0 && (
                            <div>
                              <p className="font-semibold text-destructive">A melhorar</p>
                              <ul className="mt-1 list-disc pl-5 space-y-1">
                                {feedback.pontos_melhorar.map((s, i) => (
                                  <li key={i}>{s}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {feedback.plano_de_acao.length > 0 && (
                            <div>
                              <p className="font-semibold text-primary">
                                Plano para os próximos atendimentos
                              </p>
                              <ul className="mt-1 list-disc pl-5 space-y-1">
                                {feedback.plano_de_acao.map((s, i) => (
                                  <li key={i}>{s}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                      {!feedback && !feedbackLoading && erradas.length === 0 ? (
                        <p className="mt-2 text-sm">
                          Excelente: nenhuma questão errada. Mantenha esse padrão de condução e
                          fechamento do agendamento.
                        </p>
                      ) : !feedback && !feedbackLoading ? (
                        <>
                          <p className="mt-2 text-sm">
                            Pontos para estudar ({erradas.length} de {total}):
                          </p>
                          <ul className="mt-2 space-y-2 text-sm">
                            {erradas.map(({ q, i }) => (
                              <li key={i} className="flex gap-2">
                                <span className="font-semibold text-destructive shrink-0">
                                  Q{i + 1}
                                </span>
                                <span>
                                  <span className="font-medium">{q.pergunta}</span>
                                  <br />
                                  <span className="text-muted-foreground">
                                    Certo: {q.alternativas[q.correta]}
                                    {q.explicacao ? ` — ${q.explicacao}` : ""}
                                  </span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            )}

            {prova.questoes.map((q, qi) => {
              const escolhida = respostas[qi];
              const revelado = enviado || reveladas[qi] === true;
              return (
                <div
                  key={qi}
                  className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-card)]"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-7 w-7 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold shrink-0">
                      {qi + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{q.pergunta}</p>
                      {q.origem && (
                        <Badge variant="outline" className="mt-2 text-[10px]">
                          origem: {q.origem}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {q.alternativas.map((alt, ai) => {
                      const selected = escolhida === ai;
                      const correta = q.correta === ai;
                      let cls = "border bg-background hover:bg-secondary/50";
                      if (revelado && correta)
                        cls = "border-[color:var(--success)] bg-success/10";
                      else if (revelado && selected && !correta)
                        cls = "border-destructive bg-destructive/10";
                      else if (!revelado && selected)
                        cls = "border-primary bg-primary/10";
                      return (
                        <button
                          key={ai}
                          type="button"
                          disabled={revelado}
                          onClick={() => {
                            setRespostas((prev) => {
                              const next = [...prev];
                              next[qi] = ai;
                              return next;
                            });
                            setReveladas((prev) => {
                              const next = [...prev];
                              next[qi] = true;
                              return next;
                            });
                          }}
                          className={`w-full text-left rounded-xl px-4 py-3 text-sm transition-colors flex items-start gap-3 ${cls}`}
                        >
                          <span className="font-semibold shrink-0">
                            {String.fromCharCode(65 + ai)}
                          </span>
                          <span className="flex-1">{alt}</span>
                          {revelado && correta && (
                            <CheckCircle2 className="h-4 w-4 text-[color:var(--success)] shrink-0" />
                          )}
                          {revelado && selected && !correta && (
                            <XCircle className="h-4 w-4 text-destructive shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {revelado && (
                    <div
                      className={`mt-4 rounded-xl p-4 text-sm space-y-2 border ${
                        escolhida === q.correta
                          ? "border-[color:var(--success)]/40 bg-success/10"
                          : "border-destructive/40 bg-destructive/5"
                      }`}
                    >
                      <p className="font-semibold flex items-center gap-2">
                        {escolhida === q.correta ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-[color:var(--success)]" /> Resposta
                            correta
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 text-destructive" /> Resposta incorreta — a
                            correta é {String.fromCharCode(65 + q.correta)}
                          </>
                        )}
                      </p>
                      {q.explicacao && (
                        <p className="flex gap-2 text-foreground/90">
                          <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <span>{q.explicacao}</span>
                        </p>
                      )}
                      {(() => {
                        const fb = feedback?.itens.find((it) => it.indice === qi + 1);
                        if (feedbackLoading && enviado)
                          return (
                            <p className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" /> Feedback da IA em
                              preparação…
                            </p>
                          );
                        if (!fb) return null;
                        return (
                          <div className="rounded-lg bg-background/70 border p-3 space-y-1">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Feedback da IA
                            </p>
                            <p>{fb.comentario}</p>
                            {fb.sugestao && (
                              <p className="text-foreground/80">
                                <span className="font-semibold">Use assim: </span>
                                {fb.sugestao}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="flex flex-wrap gap-3 pb-10">
              {!enviado ? (
                <Button
                  onClick={() => void finalizar()}
                  disabled={respondidas < total}
                  className="rounded-full"
                >
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  {respondidas < total
                    ? `Responda todas (${respondidas}/${total})`
                    : "Finalizar prova"}
                </Button>
              ) : (
                <Button variant="outline" className="rounded-full" onClick={() => void carregar()}>
                  <RotateCcw className="h-4 w-4 mr-2" /> Gerar nova prova
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}