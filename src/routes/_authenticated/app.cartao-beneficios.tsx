import { createFileRoute, Link, Outlet, useLocation, redirect } from "@tanstack/react-router";
import { CreditCard, FileSignature, BarChart3, ShieldCheck, Users, Gift } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/cartao-beneficios")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/app/cartao-beneficios" || location.pathname === "/app/cartao-beneficios/") {
      throw redirect({ to: "/app/cartao-beneficios/contratos" });
    }
  },
  component: CartaoBeneficiosLayout,
  head: () => ({ meta: [{ title: "Cartão Benefícios — ClinicaOS" }] }),
});

const tabs = [
  { to: "/app/cartao-beneficios/contratos", label: "Vendas", icon: FileSignature },
  { to: "/app/cartao-beneficios/convenios", label: "Convênios", icon: ShieldCheck },
  { to: "/app/cartao-beneficios/beneficios", label: "Benefícios (regras)", icon: Gift },
  { to: "/app/cartao-beneficios/dependentes", label: "Dependentes", icon: Users },
  { to: "/app/cartao-beneficios/relatorios", label: "Relatórios (BI)", icon: BarChart3 },
];

function CartaoBeneficiosLayout() {
  const loc = useLocation();
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CreditCard className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Cartão Benefícios</h1>
      </div>
      <nav className="flex gap-1 border-b">
        {tabs.map((t) => {
          const active = loc.pathname === t.to || loc.pathname.startsWith(t.to + "/");
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
