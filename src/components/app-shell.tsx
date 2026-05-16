import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { Activity, Building2, Users, Wallet, LayoutDashboard, LogOut, Stethoscope } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/clinicas", label: "Clínicas", icon: Building2 },
  { to: "/app/medicos", label: "Médicos", icon: Stethoscope },
  { to: "/app/rateio", label: "Regras de rateio", icon: Wallet },
  { to: "/app/equipe", label: "Equipe", icon: Users },
] as const;

export function AppShell() {
  const { user, signOut } = useAuth();
  const { memberships, clinicaAtual, setClinicaAtual } = useClinica();
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col shrink-0">
        <div className="px-6 py-5 flex items-center gap-2 border-b border-sidebar-border">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Activity className="h-5 w-5" />
          </div>
          <span className="font-semibold tracking-tight">ClinicaOS</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((item) => {
            const active = location.pathname === item.to ||
              (item.to !== "/app" && location.pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="px-3 py-2 text-xs text-sidebar-foreground/60 truncate">{user?.email}</div>
          <Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6">
          <div className="text-sm text-muted-foreground">
            {clinicaAtual ? clinicaAtual.clinica.nome : "Nenhuma clínica selecionada"}
          </div>
          {memberships.length > 0 && (
            <Select value={clinicaAtual?.clinica_id} onValueChange={setClinicaAtual}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Selecione a clínica" />
              </SelectTrigger>
              <SelectContent>
                {memberships.map((m) => (
                  <SelectItem key={m.clinica_id} value={m.clinica_id}>
                    {m.clinica.nome} {m.clinica.cidade ? `— ${m.clinica.cidade}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </header>
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}