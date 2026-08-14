import { useRef, useState } from "react";
import { Bot, Send, Sparkle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { perguntarHiperdiaIA } from "@/lib/hiperdia-ia.functions";
import { NinaMessage, TypingDots } from "@/components/nina/NinaMessage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { mostrarErro } from "@/lib/traduzir-erro";

type Msg = { role: "user" | "assistant"; content: string };

const SUGESTOES = [
  "Qual a tendência da glicemia deste paciente?",
  "Resuma o quadro clínico.",
  "A pressão arterial está controlada?",
  "Quais orientações de acompanhamento sugerir?",
];

export function HiperdiaIAChat({ pacienteId }: { pacienteId: string }) {
  const perguntar = useServerFn(perguntarHiperdiaIA);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  const enviar = async (texto: string) => {
    const pergunta = texto.trim();
    if (!pergunta || loading) return;
    const novas: Msg[] = [...messages, { role: "user", content: pergunta }];
    setMessages(novas);
    setInput("");
    setLoading(true);
    try {
      const r = await perguntar({ data: { pacienteId, messages: novas } });
      setMessages([...novas, { role: "assistant", content: r.resposta }]);
    } catch (e) {
      mostrarErro(e);
      setMessages(novas);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => fimRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-semibold">Assistente de IA clínico</h2>
          <p className="text-xs text-muted-foreground">
            Analisa as aferições do Hiperdia deste paciente. Sugestões a confirmar pelo médico.
          </p>
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto flex flex-col gap-3 pr-1">
        {messages.length === 0 && !loading && (
          <div className="flex flex-wrap gap-2">
            {SUGESTOES.map((s) => (
              <Button
                key={s}
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => void enviar(s)}
              >
                <Sparkle className="h-3.5 w-3.5 mr-1.5" /> {s}
              </Button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "self-end max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                : "self-start max-w-[95%] rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground"
            }
          >
            <NinaMessage content={m.content} variant={m.role} />
          </div>
        ))}
        {loading && (
          <div className="self-start rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <TypingDots />
          </div>
        )}
        <div ref={fimRef} />
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pergunte sobre a evolução clínica deste paciente…"
          rows={2}
          className="resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar(input);
            }
          }}
        />
        <Button type="submit" disabled={loading || !input.trim()} size="icon" className="h-10 w-10">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}