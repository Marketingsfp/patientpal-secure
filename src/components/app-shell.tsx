import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { Activity, Building2, Users, Wallet, LayoutDashboard, LogOut, Stethoscope, Bell, DollarSign, CalendarDays, ClipboardList } from "lucide-react";
import { VoiceInput } from "@/components/voice-input";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/recepcao", label: "Recepção / Filas", icon: Bell },
  { to: "/app/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/app/clientes", label: "Clientes", icon: Users },
  { to: "/app/procedimentos", label: "Procedimentos", icon: ClipboardList },
  { to: "/app/financeiro", label: "Financeiro", icon: DollarSign },
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

  const handleVoiceCommand = (text: string) => {
    const t = text.toLowerCase();
    const route =
      /agenda|agendamento/.test(t) ? "/app/agenda" :
      /recep|fila/.test(t) ? "/app/recepcao" :
      /cliente|paciente/.test(t) ? "/app/clientes" :
      /procediment|exame/.test(t) ? "/app/procedimentos" :
      /financ|caixa|conta|boleto/.test(t) ? "/app/financeiro" :
      /cl[ií]nica/.test(t) ? "/app/clinicas" :
      /m[eé]dico|profissional/.test(t) ? "/app/medicos" :
      /rateio|repasse/.test(t) ? "/app/rateio" :
      /equipe|usu[áa]rio/.test(t) ? "/app/equipe" :
      /prontu[áa]rio/.test(t) ? "/app/prontuarios" :
      /dashboard|in[íi]cio|home/.test(t) ? "/app" : null;
    if (route) {
      toast.success(`Abrindo: ${text}`);
      navigate({ to: route });
    } else {
      toast.info(`Não entendi: "${text}"`);
    }
  };

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
          <div className="flex items-center gap-2">
            <VoiceInput
              append={false}
              onTranscript={handleVoiceCommand}
              title="Busca por voz (diga: agenda, clientes, financeiro…)"
              prompt="Transcreva o comando de voz curto em português do Brasil. Retorne apenas as palavras ditas."
            />
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
          </div>
        </header>
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}