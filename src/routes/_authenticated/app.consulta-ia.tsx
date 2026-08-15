import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ClipboardCheck, Eraser, Loader2, MessagesSquare, Send, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NinaMessage } from "@/components/nina/NinaMessage";
import { useClinica } from "@/hooks/use-clinica";
import { consultarIA } from "@/lib/consulta-ia.functions";
import { comTempoLimite } from "@/lib/tempo-limite";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/consulta-ia")({
  component: ApoioClinicoPage,
  head: () => ({
    meta: [
      { title: "Apoio Clínico — ClinicaOS" },
      {
        name: "description",
        content:
          "Apoio à decisão clínica: resumo, hipóteses diagnósticas e conduta a partir de uma anamnese livre.",
      },
      { property: "og:title", content: "Apoio Clínico — ClinicaOS" },
      {
        property: "og:description",
        content: "Resumo clínico, hipóteses e conduta sugeridos a partir da anamnese livre.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Msg = { role: "user" | "assistant"; content: string };

const SUGESTOES = [
  "Faça um resumo clínico desses sintomas",
  "Quais as possíveis hipóteses diagnósticas?",
  "Quais exames complementares você sugere?",
  "Sugira uma conduta inicial e orientações ao paciente",
  "Quais sinais de alarme devo investigar?",
];

function ApoioClinicoPage() {
  const [contexto, setContexto] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [pergunta, setPergunta] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const chamar = useServerFn(consultarIA);
  // A clínica vai junto na requisição porque o servidor agora confere vínculo
  // e permissão do módulo antes de mandar a anamnese para a IA.
  const { clinicaAtual } = useClinica();

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function enviar(texto: string) {
    const q = texto.trim();
    if (!q || loading) return;
    if (!contexto.trim()) {
      toast.error("Descreva primeiro a queixa/anamnese do paciente.");
      return;
    }
    if (!clinicaAtual?.clinica_id) {
      toast.error("Selecione uma clínica para usar o apoio clínico.");
      return;
    }
    const novas: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(novas);
    setPergunta("");
    setLoading(true);
    try {
      const r = await comTempoLimite(
        (signal) =>
          chamar({
            data: {
              clinicaId: clinicaAtual.clinica_id,
              contexto: contexto.trim(),
              especialidade: especialidade.trim() || undefined,
              messages: novas.slice(-20),
            },
            signal,
          }),
        "A análise do caso",
      );
      setMessages((m) => [...m, { role: "assistant", content: r.resposta }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao obter a análise do caso";
      toast.error(msg);
      setMessages((m) => m.slice(0, -1));
      setPergunta(q);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8">
        <header className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-600/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
              <ClipboardCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
                Apoio Clínico
              </h1>
              <p className="mt-0.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                Suporte à decisão sob julgamento médico — descreva o caso à esquerda e faça suas
                perguntas à direita.
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMessages([])}
              disabled={loading}
              className="shrink-0 gap-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            >
              <Eraser className="h-4 w-4" /> Limpar conversa
            </Button>
          )}
        </header>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          {/* Coluna esquerda — anamnese */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <Stethoscope className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Anamnese livre
              </h2>
            </div>
            <div className="space-y-4 p-5">
              <Input
                value={especialidade}
                onChange={(e) => setEspecialidade(e.target.value)}
                placeholder="Especialidade (opcional) — ex.: Cardiologia"
                className="h-11 rounded-xl border-slate-200 bg-slate-50/60 text-slate-800 transition focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-100"
              />
              <Textarea
                value={contexto}
                onChange={(e) => setContexto(e.target.value)}
                rows={14}
                placeholder={
                  "Ex.: Paciente feminina, 54 anos, hipertensa, refere cefaleia occipital há 3 dias...\nPA 160/95 mmHg, FC 88 bpm, Tax 36,4 °C, glicemia capilar 132 mg/dL.\nEm uso de losartana 50 mg 1x/dia."
                }
                className="min-h-[280px] resize-y rounded-xl border-slate-200 bg-slate-50/60 p-4 text-[0.95rem] leading-relaxed text-slate-700 transition focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-200"
              />
              <p className="text-xs leading-relaxed text-slate-400">
                Não inclua dados que não sejam necessários à análise clínica.
              </p>

              <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  Perguntas rápidas
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGESTOES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={loading}
                      onClick={() => void enviar(s)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Coluna direita — análise do caso */}
          <section className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-4">
            <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <MessagesSquare className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Análise do caso
              </h2>
            </div>

            <div className="min-h-[320px] max-h-[58vh] flex-1 space-y-4 overflow-y-auto p-5">
              {messages.length === 0 && !loading && (
                <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 text-center">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                    <Stethoscope className="h-5 w-5" />
                  </span>
                  <p className="max-w-xs text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    Descreva o caso ao lado e envie uma pergunta. As análises aparecem aqui,
                    formatadas para leitura clínica.
                  </p>
                </div>
              )}

              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[92%] rounded-2xl px-4 py-3 text-[0.95rem] leading-relaxed",
                      m.role === "user"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200",
                    )}
                  >
                    <NinaMessage
                      content={m.content}
                      variant={m.role}
                      className={
                        m.role === "assistant"
                          ? "prose-p:leading-relaxed prose-li:leading-relaxed prose-p:text-slate-700 prose-li:text-slate-700 prose-strong:text-slate-900 dark:prose-p:text-slate-200 dark:prose-li:text-slate-200 dark:prose-strong:text-slate-50"
                          : undefined
                      }
                    />
                  </div>
                </div>
              ))}

              {loading && (
                <div
                  className="space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40"
                  aria-live="polite"
                >
                  <div className="mb-3 flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Analisando o caso…
                  </div>
                  <div className="h-3 w-11/12 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-full animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-9/12 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-10/12 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-6/12 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
                </div>
              )}
              <div ref={fim} />
            </div>

            <form
              className="border-t border-slate-100 p-4 dark:border-slate-800"
              onSubmit={(e) => {
                e.preventDefault();
                void enviar(pergunta);
              }}
            >
              <div className="flex items-end gap-2">
                <Textarea
                  value={pergunta}
                  onChange={(e) => setPergunta(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void enviar(pergunta);
                    }
                  }}
                  rows={2}
                  placeholder="Escreva sua pergunta… (Enter envia, Shift+Enter quebra linha)"
                  className="min-h-[56px] resize-none rounded-xl border-slate-200 bg-slate-50/60 leading-relaxed text-slate-700 transition focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-200"
                  disabled={loading}
                />
                <Button
                  type="submit"
                  disabled={loading || !pergunta.trim()}
                  className="h-[56px] shrink-0 gap-1.5 rounded-xl bg-blue-600 px-5 text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">Enviar</span>
                </Button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
