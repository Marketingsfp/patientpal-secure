import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/coach/roleplay/$nome")({
  component: RoleplayEmBreve,
});

/**
 * Trilha da atendente (roleplay por texto e voz) entra na Etapa 3.
 * A rota já existe para que o painel da gestora consiga direcionar cada
 * atendente ao seu treinamento.
 */
function RoleplayEmBreve() {
  const { nome } = Route.useParams();
  return (
    <div className="p-6">
      <div className="mx-auto max-w-2xl rounded-2xl border bg-card p-8 text-center shadow-sm">
        <GraduationCap className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-3 text-xl font-semibold tracking-tight">
          Treinamento de {decodeURIComponent(nome)}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A simulação de atendimento (WhatsApp e ligação) entra na próxima etapa da
          migração do Coach.
        </p>
        <Link
          to="/app/coach"
          className="mt-6 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Voltar ao Coach
        </Link>
      </div>
    </div>
  );
}
