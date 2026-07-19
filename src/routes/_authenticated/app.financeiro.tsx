import { createFileRoute, Link, Outlet, useLocation, Navigate } from "@tanstack/react-router";
import {
  LayoutDashboard, ArrowLeftRight, BarChart3, LineChart,
  Building, FileText, FileBarChart, PieChart, Bell, Tag, Wallet,
  Sparkles, AlertTriangle, Undo2, ChevronLeft, ChevronRight, Stethoscope,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePermissoes } from "@/hooks/use-permissoes";
import { moduloDaRota, SUBMODULE_PARENT } from "@/lib/permissoes-rotas";

export const Route = createFileRoute("/_authenticated/app/financeiro")({
  component: FinLayout,
  head: () => ({ meta: [{ title: "Financeiro — ClinicaOS" }] }),
});

const subnav = [
  { to: "/app/financeiro", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/financeiro/movimento", label: "Mov. Caixa", icon: ArrowLeftRight },
  { to: "/app/financeiro/atendimentos", label: "Atendimentos", icon: Stethoscope },
  { to: "/app/financeiro/bi", label: "BI", icon: BarChart3 },
  { to: "/app/financeiro/analitico", label: "Analítico", icon: LineChart },
  { to: "/app/financeiro/estorno", label: "Estorno", icon: Undo2 },
  { to: "/app/financeiro/empresas", label: "Empresas", icon: Building },
  { to: "/app/financeiro/notas", label: "Notas Pacientes", icon: FileText },
  { to: "/app/financeiro/relatorios", label: "Relatórios", icon: FileBarChart },
  { to: "/app/financeiro/estatisticas", label: "Estatísticas", icon: PieChart },
  { to: "/app/financeiro/lembretes", label: "Lembretes", icon: Bell },
  { to: "/app/financeiro/categorias", label: "Categorias", icon: Tag },
  { to: "/app/financeiro/contas", label: "Contas", icon: Wallet },
  { to: "/app/financeiro/regras-ia", label: "Regras IA", icon: Sparkles },
  { to: "/app/financeiro/alertas", label: "Alertas", icon: AlertTriangle },
] as const;

function FinLayout() {
  const location = useLocation();
  const { allowed, configured } = usePermissoes();
  // ATENÇÃO: todos os hooks (useState/useEffect) precisam ficar ACIMA de
  // qualquer `return` condicional. O redirecionamento de rota-pai abaixo é um
  // early-return que, se colocado antes destes hooks, muda a quantidade de
  // hooks entre renders quando as permissões carregam (Set vazio → Set final),
  // violando as Rules of Hooks e derrubando a tela com o error boundary.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("fin-subnav:collapsed") === "1";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("fin-subnav:collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  // Filtra as abas do submenu com base nas permissões do perfil.
  // - Admin (allowed === null) vê tudo.
  // - Cada aba mapeia para um módulo via ROUTE_TO_MODULE (moduloDaRota).
  // - Sub-abas (movimento / atendimentos / estorno) têm módulo próprio;
  //   se não houver linha explícita, herdam de "financeiro".
  // - Demais abas caem em "financeiro" e só aparecem se o perfil tiver
  //   acesso a esse módulo.
  const visibleSubnav = subnav.filter((item) => {
    if (allowed === null) return true;
    const mod = moduloDaRota(item.to);
    if (!mod) return true;
    if (allowed.has(mod)) return true;
    const pai = SUBMODULE_PARENT[mod];
    if (pai && !configured?.has(mod) && allowed.has(pai)) return true;
    return false;
  });

  // Se o usuário não tem acesso ao módulo "financeiro" em si (apenas a
  // submódulos), redireciona a entrada raiz /app/financeiro para a
  // primeira aba visível — evita mostrar o Dashboard do Financeiro.
  const modoAtual = moduloDaRota(location.pathname);
  const semFinanceiroPai =
    allowed !== null && modoAtual === "financeiro" && !allowed.has("financeiro");
  const primeiraAbaSub = visibleSubnav.find((i) => moduloDaRota(i.to) !== "financeiro");
  if (semFinanceiroPai && primeiraAbaSub) {
    return <Navigate to={primeiraAbaSub.to} replace />;
  }
  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex gap-3 -m-4 h-[calc(100vh-4rem)]">
      <aside className={`${collapsed ? "w-12" : "w-48"} bg-card border-r border-border p-2 shrink-0 overflow-y-auto h-full transition-all duration-200`}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between"} mb-1`}>
          {!collapsed && (
            <p className="px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Financeiro
            </p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
        <nav className="space-y-0.5">
          {visibleSubnav.map((item) => {
            const active = "exact" in item && item.exact
              ? location.pathname === item.to
              : location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            if (collapsed) {
              return (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>
                    <Link
                      to={item.to}
                      className={`flex items-center justify-center rounded-md h-9 w-9 mx-auto transition-colors ${
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-foreground/70 hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <item.icon className="h-4 w-4" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            }
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors ${
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground/70 hover:bg-muted hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex-1 p-3 overflow-auto min-w-0 h-full">
        <Outlet />
      </div>
    </div>
    </TooltipProvider>
  );
}