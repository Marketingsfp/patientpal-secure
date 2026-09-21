import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { GraduationCap, Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCoachContexto } from "@/lib/coach/contexto";
import { PainelGestora } from "@/components/coach/PainelGestora";
import { TraineeHome } from "@/components/coach/TraineeHome";

export const Route = createFileRoute("/_authenticated/app/coach/")({
  component: CoachHome,
});

/**
 * Porta de entrada do portal Coach WhatsApp.
 * Gestora/admin → painel completo, com opção de entrar no treino como aluno.
 * Atendente → trilha própria.
 */
function CoachHome() {
  const ctx = useCoachContexto();
  const [modoTreino, setModoTreino] = useState(false);

  if (ctx.loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  if (ctx.gestor) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setModoTreino((v) => !v)}
          >
            {modoTreino ? (
              <>
                <Settings2 className="mr-2 h-4 w-4" /> Voltar para a gestão
              </>
            ) : (
              <>
                <GraduationCap className="mr-2 h-4 w-4" /> Treinar / testar eu mesmo
              </>
            )}
          </Button>
        </div>
        {modoTreino ? (
          <TraineeHome
            atendente={ctx.atendente}
            clinicaId={ctx.clinicaId}
            clinicaNome={ctx.clinicaNome}
            userId={ctx.userId}
          />
        ) : (
          <PainelGestora ctx={ctx} />
        )}
      </div>
    );
  }

  return (
    <TraineeHome
      atendente={ctx.atendente}
      clinicaId={ctx.clinicaId}
      clinicaNome={ctx.clinicaNome}
      userId={ctx.userId}
    />
  );
}

