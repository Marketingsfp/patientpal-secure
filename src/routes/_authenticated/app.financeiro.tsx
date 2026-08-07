import { createFileRoute, Outlet, useLocation, Navigate } from "@tanstack/react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePermissoes } from "@/hooks/use-permissoes";
import { moduloDaRota, SUBMODULE_PARENT } from "@/lib/permissoes-rotas";

export const Route = createFileRoute("/_authenticated/app/financeiro")({
  component: FinLayout,
  head: () => ({ meta: [{ title: "Financeiro — ClinicaOS" }] }),
});

// As abas do Financeiro agora vivem no menu lateral principal
// (grupo "Gestão" → "Financeiro"), evitando duas barras laterais.
// Aqui mantemos apenas a regra de redirecionamento da rota-pai.
const SUBROTAS = [
  "/app/financeiro/movimento",
  "/app/financeiro/atendimentos",
  "/app/financeiro/bi",
  "/app/financeiro/analitico",
  "/app/financeiro/estorno",
  "/app/financeiro/empresas",
  "/app/financeiro/notas",
  "/app/financeiro/relatorios",
  "/app/financeiro/estatisticas",
  "/app/financeiro/lembretes",
  "/app/financeiro/categorias",
  "/app/financeiro/contas",
  "/app/financeiro/regras-ia",
  "/app/financeiro/alertas",
] as const;

function FinLayout() {
  const location = useLocation();
  const { allowed, configured } = usePermissoes();

  // Se o usuário não tem acesso ao módulo "financeiro" em si (apenas a
  // submódulos), redireciona a entrada raiz /app/financeiro para a
  // primeira aba permitida — evita mostrar o Dashboard do Financeiro.
  const modoAtual = moduloDaRota(location.pathname);
  const semFinanceiroPai =
    allowed !== null && modoAtual === "financeiro" && !allowed.has("financeiro");
  const primeiraAbaSub = SUBROTAS.find((rota) => {
    const mod = moduloDaRota(rota);
    if (!mod || mod === "financeiro") return false;
    if (allowed?.has(mod)) return true;
    const pai = SUBMODULE_PARENT[mod];
    return Boolean(pai && !configured?.has(mod) && allowed?.has(pai));
  });
  if (semFinanceiroPai && primeiraAbaSub) {
    return <Navigate to={primeiraAbaSub} replace />;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-w-0">
        <Outlet />
      </div>
    </TooltipProvider>
  );
}
