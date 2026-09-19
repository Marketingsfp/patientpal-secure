import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAtendentesCoach, useCoachContexto, type CoachContexto } from "@/lib/coach/contexto";

/** Quem está sendo treinado/avaliado nesta tela. */
export type AlvoAtendente = {
  /** Nome que veio da URL (pode ser histórico antigo, sem usuário). */
  nome: string;
  /** Usuário da pessoa treinada, quando ela existe no cadastro da clínica. */
  userId: string | null;
  /** Gestor abrindo a tela de outra pessoa: nada disso conta para a atendente. */
  simulacaoGestor: boolean;
};

/**
 * Garante que uma atendente só acesse treino e prova do próprio nome.
 * A gestora do Coach (e o administrador) abrem o de qualquer atendente da clínica.
 *
 * A comparação é feita por USUÁRIO quando a pessoa da URL existe no cadastro da
 * clínica; o nome continua valendo só como reserva para o histórico antigo,
 * migrado sem `user_id`.
 */
export function AtendenteGuard({
  nome,
  children,
}: {
  nome: string;
  children: (ctx: CoachContexto, alvo: AlvoAtendente) => ReactNode;
}) {
  const ctx = useCoachContexto();
  const { atendentes, loading: carregandoAtendentes } = useAtendentesCoach(ctx.clinicaId);

  if (ctx.loading || carregandoAtendentes) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const alvoCadastrado =
    atendentes.find((a) => a.nome.trim().toLowerCase() === nome.trim().toLowerCase()) ?? null;
  const mesmoUsuario = Boolean(
    alvoCadastrado && ctx.userId && alvoCadastrado.userId === ctx.userId,
  );
  const mesmoNome = ctx.atendente.trim().toLowerCase() === nome.trim().toLowerCase();
  const souEu = alvoCadastrado ? mesmoUsuario : mesmoNome;
  const liberado = ctx.gestor || souEu;

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

  const alvo: AlvoAtendente = {
    nome,
    userId: alvoCadastrado?.userId ?? (souEu ? ctx.userId : null),
    simulacaoGestor: !souEu,
  };

  return <>{children(ctx, alvo)}</>;
}
