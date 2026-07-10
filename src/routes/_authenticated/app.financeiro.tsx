import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import {
<<<<<<< HEAD
  LayoutDashboard,
  ArrowLeftRight,
  BarChart3,
  LineChart,
  Stethoscope,
  Building,
  FileText,
  FileBarChart,
  PieChart,
  Bell,
  Tag,
  Wallet,
  Sparkles,
  AlertTriangle,
=======
  LayoutDashboard, ArrowLeftRight, BarChart3, LineChart, Stethoscope,
  Building, FileText, FileBarChart, PieChart, Bell, Tag, Wallet,
  Sparkles, AlertTriangle, Undo2, ScrollText,
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
} from "lucide-react";
import { useMedicoContext } from "@/hooks/use-medico-context";

export const Route = createFileRoute("/_authenticated/app/financeiro")({
  component: FinLayout,
  head: () => ({ meta: [{ title: "Financeiro — ClinicaOS" }] }),
});

const subnav = [
  { to: "/app/financeiro", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/financeiro/movimento", label: "Mov. Caixa", icon: ArrowLeftRight },
  { to: "/app/financeiro/bi", label: "BI", icon: BarChart3 },
  { to: "/app/financeiro/analitico", label: "Analítico", icon: LineChart },
  { to: "/app/financeiro/atendimentos", label: "Atendimentos", icon: Stethoscope },
  { to: "/app/financeiro/laudos-ecg", label: "Laudos ECG", icon: ScrollText },
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
  const { isMedicoOnly } = useMedicoContext();
  const visibleSubnav = isMedicoOnly
    ? subnav
        .filter((i) => i.to === "/app/financeiro/atendimentos")
        .map((i) => ({ ...i, label: "Repasse" }))
    : subnav;
  return (
    <div className="flex gap-3 -m-4 h-[calc(100vh-4rem)]">
      <aside className="w-48 bg-card border-r border-border p-3 shrink-0 overflow-y-auto h-full">
        <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Financeiro
        </p>
        <nav className="space-y-0.5">
          {visibleSubnav.map((item) => {
            const active =
              "exact" in item && item.exact
                ? location.pathname === item.to
                : location.pathname === item.to || location.pathname.startsWith(item.to + "/");
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
  );
}
