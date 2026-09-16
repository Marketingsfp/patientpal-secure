import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useCoachContexto } from "@/lib/coach/contexto";
import { PainelGestora } from "@/components/coach/PainelGestora";
import { TraineeHome } from "@/components/coach/TraineeHome";

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
    <TraineeHome
      atendente={ctx.atendente}
      clinicaId={ctx.clinicaId}
      clinicaNome={ctx.clinicaNome}
    />
  );
}
