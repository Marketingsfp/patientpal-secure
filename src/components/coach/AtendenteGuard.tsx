import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCoachContexto, type CoachContexto } from "@/lib/coach/contexto";

/**
 * Garante que uma atendente só acesse treino e prova do próprio nome.
 * A gestora do Coach (e o administrador) abrem o de qualquer atendente da clínica.
 */
export function AtendenteGuard({
  nome,
  children,
}: {
  nome: string;
  children: (ctx: CoachContexto) => ReactNode;
}) {
  const ctx = useCoachContexto();

  if (ctx.loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const liberado =
    ctx.gestor || ctx.atendente.trim().toLowerCase() === nome.trim().toLowerCase();

  if (!liberado) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-md rounded-3xl border bg-card p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Acesso restrito</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Você só pode treinar e fazer provas no seu próprio perfil.
          </p>
          <Link to="/app/coach">
            <Button variant="outline" className="mt-5 rounded-full">
              Voltar para o meu curso
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return <>{children(ctx)}</>;
}
