import { createFileRoute, Link, Outlet, useLocation, Navigate } from "@tanstack/react-router";
import {
  LayoutDashboard, ArrowLeftRight, BarChart3, LineChart,
  Building, FileText, FileBarChart, PieChart, Bell, Tag, Wallet,
  Sparkles, AlertTriangle, Undo2, Stethoscope,
} from "lucide-react";
import { usePermissoes } from "@/hooks/use-permissoes";
import { moduloDaRota, SUBMODULE_PARENT } from "@/lib/permissoes-rotas";
import { cn } from "@/lib/utils";

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
    <div className="-m-4 flex h-[calc(100dvh-4rem)] flex-col">
      <div className="shrink-0 border-b border-border/70 bg-card/80 backdrop-blur-sm">
        <nav className="flex flex-wrap items-center gap-1.5 px-3 py-2.5">
          {visibleSubnav.map((item) => {
            const active = "exact" in item && item.exact
              ? location.pathname === item.to
              : location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-medium",
                  "transition-all duration-200",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border/60 bg-muted/40 text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground",
                )}
              >
                <item.icon className={cn("h-4 w-4 shrink-0 transition-colors", active ? "" : "text-muted-foreground/70 group-hover:text-primary")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="min-w-0 flex-1 overflow-auto p-3">
        <Outlet />
      </div>
    </div>
  );
}