import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Brain, Eraser, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NinaMessage, TypingDots } from "@/components/nina/NinaMessage";
import { consultarIA } from "@/lib/consulta-ia.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/consulta-ia")({
  component: ConsultarComIA,
  head: () => ({
    meta: [
      { title: "Consultar com IA — ClinicaOS" },
      {
        name: "description",
        content:
          "Assistente clínico de IA para resumo, hipóteses diagnósticas e conduta a partir de uma anamnese livre.",
      },
      { property: "og:title", content: "Consultar com IA — ClinicaOS" },
      {
        property: "og:description",
        content: "Resumo clínico, hipóteses e conduta sugeridos por IA a partir da anamnese livre.",
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

function ConsultarComIA() {
  const [contexto, setContexto] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [pergunta, setPergunta] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const chamar = useServerFn(consultarIA);

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
    const novas: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(novas);
    setPergunta("");
    setLoading(true);
    try {
      const r = await chamar({
        data: {
          contexto: contexto.trim(),
          especialidade: especialidade.trim() || undefined,
          messages: novas.slice(-20),
        },
      });
      setMessages((m) => [...m, { role: "assistant", content: r.resposta }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao consultar a IA";
      toast.error(msg);
      setMessages((m) => m.slice(0, -1));
      setPergunta(q);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <header className="flex items-start gap-3">
        <span className="rounded-lg bg-primary/10 p-2 text-primary">
          <Brain className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Consultar com IA</h1>
          <p className="text-sm text-muted-foreground">
            Descreva a queixa, sintomas, histórico e sinais vitais. Depois pergunte à IA — as
            respostas são sugestões de apoio, sempre sujeitas ao julgamento clínico.
          </p>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Anamnese livre</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={especialidade}
            onChange={(e) => setEspecialidade(e.target.value)}
            placeholder="Especialidade (opcional) — ex.: Cardiologia"
            className="max-w-sm"
          />
          <Textarea
            value={contexto}
            onChange={(e) => setContexto(e.target.value)}
            rows={10}
            placeholder={
              "Ex.: Paciente feminina, 54 anos, hipertensa, refere cefaleia occipital há 3 dias...\nPA 160/95 mmHg, FC 88 bpm, Tax 36,4 °C, glicemia capilar 132 mg/dL.\nEm uso de losartana 50 mg 1x/dia."
            }
            className="min-h-[200px] resize-y font-normal"
          />
          <p className="text-xs text-muted-foreground">
            Não inclua dados que não sejam necessários à análise clínica.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-base">Perguntar à IA</CardTitle>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMessages([])}
              disabled={loading}
              className="gap-1"
            >
              <Eraser className="h-4 w-4" /> Limpar conversa
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {SUGESTOES.map((s) => (
              <Button
                key={s}
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => enviar(s)}
              >
                {s}
              </Button>
            ))}
          </div>

          {(messages.length > 0 || loading) && (
            <div className="max-h-[520px] space-y-3 overflow-y-auto rounded-lg border bg-muted/30 p-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-card-foreground border",
                    )}
                  >
                    <NinaMessage content={m.content} variant={m.role} />
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
                    <TypingDots />
                    <span className="ml-2">A IA está analisando…</span>
                  </div>
                </div>
              )}
              <div ref={fim} />
            </div>
          )}

          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void enviar(pergunta);
            }}
          >
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
              className="min-h-[52px] resize-none"
              disabled={loading}
            />
            <Button type="submit" disabled={loading || !pergunta.trim()} className="gap-1">
              <Send className="h-4 w-4" /> Enviar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}