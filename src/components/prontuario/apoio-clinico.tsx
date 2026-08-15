import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Eraser, Loader2, RefreshCw, Send, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NinaMessage } from "@/components/nina/NinaMessage";
import { consultarIA } from "@/lib/consulta-ia.functions";
import { cn } from "@/lib/utils";

export type MensagemApoio = { role: "user" | "assistant"; content: string };

const PERGUNTAS_RAPIDAS = [
  "Resuma o caso clinicamente",
  "Quais as hipóteses diagnósticas mais prováveis?",
  "Quais exames complementares são indicados?",
  "Sugira conduta inicial e orientações ao paciente",
  "Quais sinais de alarme devo investigar?",
];

interface ApoioClinicoProps {
  clinicaId: string | null;
  /** Especialidade do atendimento — afina o raciocínio do apoio à decisão. */
  especialidade?: string;
  /**
   * Monta o texto do caso a partir do que já está preenchido na tela (triagem,
   * transcrição, campos do prontuário). Existe para o médico não ter que
   * redigitar a anamnese que ele acabou de escrever no prontuário: ao abrir, o
   * campo já vem preenchido, e o botão "Atualizar com o prontuário" recompõe
   * depois de novas alterações.
   */
  montarContexto?: () => string;
  /**
   * Falso quando o perfil não tem edição no módulo de apoio à decisão. A função
   * de servidor recusa de qualquer forma; aqui evitamos oferecer um recurso que
   * só devolveria erro.
   */
  habilitado?: boolean;
  className?: string;
}

/**
 * Apoio à decisão clínica sobre uma anamnese livre.
 *
 * Mesmo motor da tela "Apoio Clínico" avulsa, empacotado para viver dentro do
 * atendimento: o médico descreve (ou aproveita o que já digitou), pergunta, e
 * lê a análise sem sair da tela do paciente.
 */
export function ApoioClinico({
  clinicaId,
  especialidade,
  montarContexto,
  habilitado = true,
  className,
}: ApoioClinicoProps) {
  // `null` = o médico ainda não mexeu no campo, então ele espelha o prontuário
  // em tempo real. Assim que ele digita, o texto passa a ser dele e paramos de
  // sobrescrever. "Atualizar com o prontuário" volta ao espelho.
  //
  // Isso substitui um preenchimento único no carregamento, que capturaria o
  // prontuário ainda vazio e deixaria o campo desatualizado pelo resto da
  // consulta.
  const [contextoEditado, setContextoEditado] = useState<string | null>(montarContexto ? null : "");
  const [pergunta, setPergunta] = useState("");
  const [mensagens, setMensagens] = useState<MensagemApoio[]>([]);
  const [carregando, setCarregando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const chamar = useServerFn(consultarIA);

  const contextoDoProntuario = montarContexto ? montarContexto() : "";
  const contexto = contextoEditado ?? contextoDoProntuario;
  const espelhandoProntuario = contextoEditado === null;

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens, carregando]);

  function sincronizarComProntuario() {
    if (!contextoDoProntuario.trim()) {
      toast.info("Ainda não há dados preenchidos no prontuário para usar.");
      return;
    }
    setContextoEditado(null);
    toast.success("Caso atualizado com o conteúdo do prontuário.");
  }

  async function enviar(texto: string) {
    const q = texto.trim();
    if (!q || carregando) return;
    if (!contexto.trim()) {
      toast.error("Descreva o caso do paciente antes de pedir a análise.");
      return;
    }
    if (!clinicaId) {
      toast.error("Selecione uma clínica para usar o apoio clínico.");
      return;
    }
    const novas: MensagemApoio[] = [...mensagens, { role: "user", content: q }];
    setMensagens(novas);
    setPergunta("");
    setCarregando(true);
    try {
      const r = await chamar({
        data: {
          clinicaId,
          contexto: contexto.trim(),
          especialidade: especialidade?.trim() || undefined,
          messages: novas.slice(-20),
        },
      });
      setMensagens((m) => [...m, { role: "assistant", content: r.resposta }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao obter a análise do caso";
      toast.error(msg);
      // Devolve a pergunta ao campo para o médico não perder o que digitou.
      setMensagens((m) => m.slice(0, -1));
      setPergunta(q);
    } finally {
      setCarregando(false);
    }
  }

  if (!habilitado) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        Seu perfil não tem acesso de edição ao apoio à decisão clínica. Fale com o administrador da
        clínica para liberar.
      </p>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label>Descrição do caso</Label>
        <div className="flex items-center gap-1.5">
          {montarContexto && !espelhandoProntuario && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={sincronizarComProntuario}
              disabled={carregando}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar com o prontuário
            </Button>
          )}
          {mensagens.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMensagens([])}
              disabled={carregando}
              className="gap-1.5 text-muted-foreground"
            >
              <Eraser className="h-3.5 w-3.5" />
              Limpar análise
            </Button>
          )}
        </div>
      </div>

      <Textarea
        value={contexto}
        onChange={(e) => setContextoEditado(e.target.value)}
        rows={6}
        placeholder={
          "Anamnese livre. Ex.: Paciente feminina, 54 anos, hipertensa, cefaleia occipital há 3 dias.\nPA 160/95 mmHg, FC 88 bpm, Tax 36,4 °C.\nEm uso de losartana 50 mg 1x/dia."
        }
        className="resize-y leading-relaxed"
      />
      <p className="text-[11px] text-muted-foreground">
        {espelhandoProntuario && montarContexto
          ? "Preenchido automaticamente com o prontuário. Edite à vontade — a partir daí o texto é seu."
          : "Inclua apenas o que for necessário à análise clínica."}{" "}
        As sugestões não substituem o julgamento do profissional.
      </p>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Perguntas rápidas
        </p>
        <div className="flex flex-wrap gap-2">
          {PERGUNTAS_RAPIDAS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={carregando}
              onClick={() => void enviar(p)}
              className="rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {(mensagens.length > 0 || carregando) && (
        <div className="max-h-[46vh] space-y-3 overflow-y-auto rounded-md border bg-muted/20 p-3">
          {mensagens.map((m, i) => (
            <div
              key={i}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[92%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border bg-card text-card-foreground",
                )}
              >
                <NinaMessage content={m.content} variant={m.role} />
              </div>
            </div>
          ))}

          {carregando && (
            <div className="space-y-2 rounded-xl border bg-card p-3" aria-live="polite">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analisando o caso…
              </div>
              <div className="h-3 w-11/12 animate-pulse rounded-full bg-muted" />
              <div className="h-3 w-full animate-pulse rounded-full bg-muted" />
              <div className="h-3 w-8/12 animate-pulse rounded-full bg-muted" />
            </div>
          )}
          <div ref={fim} />
        </div>
      )}

      {mensagens.length === 0 && !carregando && (
        <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          <Stethoscope className="h-4 w-4 shrink-0" />
          Escolha uma pergunta rápida ou escreva a sua — a análise aparece aqui.
        </div>
      )}

      <form
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
            className="min-h-[52px] resize-none leading-relaxed"
            disabled={carregando}
          />
          <Button
            type="submit"
            disabled={carregando || !pergunta.trim()}
            className="h-[52px] shrink-0 gap-1.5"
          >
            {carregando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Analisar</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
