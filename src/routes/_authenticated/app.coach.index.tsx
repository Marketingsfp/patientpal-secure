import { createFileRoute } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { useAcessoModulo } from "@/hooks/use-permissoes";

export const Route = createFileRoute("/_authenticated/app/coach/")({
  component: CoachHome,
});

/**
 * Etapa 1 do portal Coach WhatsApp: porta de entrada.
 * O roteamento real (gestora → painel, atendente → trilha) entra nas
 * próximas etapas; aqui já valem o isolamento por clínica e o módulo
 * de permissão "coach" (ver = atendente, editar = gestora).
 */
function CoachHome() {
  const acesso = useAcessoModulo("coach");
  const gestor = acesso === "write";

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
              {gestor
                ? "Painel de treinamento e avaliação das atendentes desta clínica."
                : "Seu espaço de treinamento: roleplay, prova e evolução."}
            </p>
          </div>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Estrutura do portal criada. As telas de{" "}
          {gestor ? "análise de conversas, metas e evolução" : "treinamento, roleplay e prova"}{" "}
          entram nas próximas etapas.
        </p>
      </div>
    </div>
  );
}
