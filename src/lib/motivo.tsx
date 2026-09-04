import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CalendarX2, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Modal de justificativa obrigatória, no mesmo padrão imperativo do
 * `confirmDialog`: `const motivo = await pedirMotivo({...}); if (!motivo) return;`
 *
 * Existe porque cancelar e reagendar um atendimento não gravavam justificativa
 * nenhuma — o histórico mostrava quem desmarcou, mas nunca o porquê, e a
 * coordenação não tinha como cobrar. O campo é obrigatório por decisão do
 * dono: o rastro vale o clique a mais no balcão.
 *
 * Os atalhos cobrem os motivos que a recepção mais usa; qualquer outro caso é
 * digitado à mão no mesmo campo.
 */
export const MOTIVOS_CANCELAMENTO = [
  "Paciente desmarcou",
  "Paciente não vai comparecer",
  "Médico ausente",
  "Imprevisto pessoal",
  "Agendamento duplicado",
  "Erro de digitação da recepção",
] as const;

export const MOTIVOS_REAGENDAMENTO = [
  "Paciente pediu outro horário",
  "Médico ausente",
  "Mudança na agenda do médico",
  "Imprevisto pessoal",
  "Atraso do paciente",
  "Erro de digitação da recepção",
] as const;

export type MotivoOptions = {
  titulo?: string;
  descricao?: React.ReactNode;
  sugestoes?: readonly string[];
  confirmText?: string;
  tone?: "cancelar" | "reagendar";
};

/** Mínimo de caracteres. "ok" e "x" não são justificativa. */
const MIN_MOTIVO = 4;
const MAX_MOTIVO = 300;

type Pending = MotivoOptions & { resolve: (v: string | null) => void };

let emit: ((p: Pending) => void) | null = null;

/**
 * Abre o modal e devolve o motivo digitado, ou `null` se o usuário desistiu.
 * O caller deve tratar `null` como "não faça nada".
 */
export function pedirMotivo(opts: MotivoOptions = {}): Promise<string | null> {
  if (!emit) {
    // Sem host montado (SSR ou fora da árvore React). Devolve null para que a
    // ação seja abortada — nunca segue adiante sem justificativa.
    return Promise.resolve(null);
  }
  return new Promise<string | null>((resolve) => emit!({ ...opts, resolve }));
}

export function MotivoDialogHost() {
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [texto, setTexto] = React.useState("");

  React.useEffect(() => {
    emit = (p) => {
      setTexto("");
      setPending(p);
    };
    return () => {
      emit = null;
    };
  }, []);

  const fechar = React.useCallback((valor: string | null) => {
    setPending((cur) => {
      cur?.resolve(valor);
      return null;
    });
    setTexto("");
  }, []);

  const limpo = texto.trim();
  const podeConfirmar = limpo.length >= MIN_MOTIVO;
  const ehReagendar = pending?.tone === "reagendar";
  const Icon = ehReagendar ? CalendarClock : CalendarX2;
  const sugestoes =
    pending?.sugestoes ?? (ehReagendar ? MOTIVOS_REAGENDAMENTO : MOTIVOS_CANCELAMENTO);

  return (
    <Dialog
      open={!!pending}
      onOpenChange={(o) => {
        if (!o) fechar(null);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                ehReagendar ? "bg-amber-500/10 text-amber-600" : "bg-rose-500/10 text-rose-600",
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-1.5 text-left">
              <DialogTitle className="text-base">
                {pending?.titulo ?? "Informe o motivo"}
              </DialogTitle>
              <DialogDescription className="text-sm">
                {pending?.descricao ??
                  "A justificativa fica registrada no histórico do agendamento."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {sugestoes.map((s) => (
              <Button
                key={s}
                type="button"
                variant={limpo === s ? "default" : "outline"}
                size="sm"
                className="h-7 rounded-full px-3 text-xs"
                onClick={() => setTexto(s)}
              >
                {s}
              </Button>
            ))}
          </div>
          <Textarea
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, MAX_MOTIVO))}
            placeholder="Escolha um motivo acima ou escreva o que aconteceu…"
            rows={3}
            className="resize-none"
            onKeyDown={(e) => {
              // Ctrl+Enter confirma — o balcão trabalha rápido e não deve
              // precisar tirar a mão do teclado.
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && podeConfirmar) {
                e.preventDefault();
                fechar(limpo);
              }
            }}
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{podeConfirmar ? " " : `Escreva ao menos ${MIN_MOTIVO} caracteres.`}</span>
            <span>
              {texto.length}/{MAX_MOTIVO}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => fechar(null)}>
            Voltar
          </Button>
          <Button
            type="button"
            disabled={!podeConfirmar}
            onClick={() => fechar(limpo)}
            className={cn(
              !ehReagendar && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
          >
            {pending?.confirmText ?? (ehReagendar ? "Reagendar" : "Cancelar atendimento")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
