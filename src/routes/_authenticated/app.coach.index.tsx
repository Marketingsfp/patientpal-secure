import { createFileRoute } from "@tanstack/react-router";
import { GraduationCap, Loader2 } from "lucide-react";
import { useCoachContexto } from "@/lib/coach/contexto";
import { PainelGestora } from "@/components/coach/PainelGestora";

export const Route = createFileRoute("/_authenticated/app/coach/")({
  component: CoachHome,
});

/**
 * Porta de entrada do portal Coach WhatsApp.
 * Gestora → painel completo. Atendente → trilha própria (Etapa 3).
 */
function CoachHome() {
  const ctx = useCoachContexto();

  if (ctx.loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  if (ctx.gestor) return <PainelGestora ctx={ctx} />;

  return (
    <div className="p-6">
      <div className="mx-auto max-w-3xl rounded-2xl border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <GraduationCap className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Coach WhatsApp</h1>
            <p className="text-sm text-muted-foreground">
              Seu espaço de treinamento: simulações, prova e evolução.
            </p>
          </div>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Sua trilha de treinamento entra na próxima etapa da migração.
        </p>
      </div>
    </div>
  );
}
