import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect } from "react";
import { Activity, Building2, Users, Wallet, LayoutDashboard, LogOut, Stethoscope, Bell, DollarSign, CalendarDays, ClipboardList, MessageCircle, Target, Clock, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import logoSaoFrancisco from "@/assets/logo-sao-francisco.png";
import logoMeninoJesus from "@/assets/logo-menino-jesus.png";
import logoConsultaHoje from "@/assets/logo-consulta-hoje.png";

function corDaClinica(nome?: string): string {
  const n = (nome ?? "").toLowerCase();
  if (n.includes("são francisco") || n.includes("sao francisco")) return "#16a34a"; // verde
  if (n.includes("menino jesus")) return "#1d4ed8"; // azul royal
  if (n.includes("consulta hoje")) return "#8b5cf6"; // roxinho
  return "hsl(var(--muted-foreground))";
}

function logoDaClinica(nome?: string): string | null {
  const n = (nome ?? "").toLowerCase();
  if (n.includes("são francisco") || n.includes("sao francisco")) return logoSaoFrancisco;
  if (n.includes("menino jesus")) return logoMeninoJesus;
  if (n.includes("consulta hoje")) return logoConsultaHoje;
  return null;
}
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const VoiceInput = lazy(() => import("@/components/voice-input").then((m) => ({ default: m.VoiceInput })));

const nav = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/recepcao", label: "Recepção / Filas", icon: Bell },
  { to: "/app/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/app/clientes", label: "Clientes", icon: Users },
  { to: "/app/procedimentos", label: "Procedimentos", icon: ClipboardList },
  { to: "/app/crm", label: "CRM", icon: Target },
  { to: "/app/nina", label: "Nina — WhatsApp", icon: MessageCircle },
  { to: "/app/financeiro", label: "Financeiro", icon: DollarSign },
  { to: "/app/clinicas", label: "Clínicas", icon: Building2 },
  { to: "/app/medicos", label: "Médicos", icon: Stethoscope },
  { to: "/app/disponibilidades", label: "Horários médicos", icon: Clock },
  { to: "/app/consulta-rapida", label: "Consulta rápida", icon: BookOpen },
  { to: "/app/rateio", label: "Regras de rateio", icon: Wallet },
  { to: "/app/equipe", label: "Equipe", icon: Users },
] as const;

export function AppShell() {
  const { user, signOut, loading } = useAuth();
  const { memberships, clinicaAtual, setClinicaAtual } = useClinica();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [loading, navigate, user]);

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
      /crm|lead|oportunidade/.test(t) ? "/app/crm" :
      /nina|whats|whatsapp|conversa/.test(t) ? "/app/nina" :
      /consulta r[áa]pida|lembrete|valor|tabela|hor[áa]rio/.test(t) ? "/app/consulta-rapida" :
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
    navigate({ to: "/login", replace: true });
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Entrando…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside
        className="w-64 text-white flex flex-col shrink-0"
        style={{ backgroundColor: clinicaAtual ? corDaClinica(clinicaAtual.clinica.nome) : undefined }}
      >
        <div className="px-4 py-4 flex items-center justify-center border-b border-white/20 bg-white/95 min-h-[88px]">
          {logoDaClinica(clinicaAtual?.clinica.nome) ? (
            <img
              src={logoDaClinica(clinicaAtual?.clinica.nome)!}
              alt={clinicaAtual?.clinica.nome ?? "Clínica"}
              className="max-h-16 w-auto object-contain"
            />
          ) : (
            <div className="flex items-center gap-2 text-foreground">
              <Activity className="h-5 w-5" />
              <span className="font-semibold tracking-tight">ClinicaOS</span>
            </div>
          )}
        </div>
        <nav className="flex-1 p-3 space-y-1 font-sans">
          {nav.map((item) => {
            const active = location.pathname === item.to ||
              (item.to !== "/app" && location.pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold tracking-wide transition-colors ${
                  active
                    ? "bg-[#14532d] text-white"
                    : "text-white hover:bg-[#14532d] hover:text-white"
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
          <div className="text-sm font-semibold flex items-center gap-3" style={{ color: corDaClinica(clinicaAtual?.clinica.nome) }}>
            {clinicaAtual && logoDaClinica(clinicaAtual.clinica.nome) && (
              <img src={logoDaClinica(clinicaAtual.clinica.nome)!} alt="" className="h-8 w-auto object-contain" />
            )}
            {clinicaAtual && !logoDaClinica(clinicaAtual.clinica.nome) && (
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: corDaClinica(clinicaAtual.clinica.nome) }} />
            )}
            {clinicaAtual ? clinicaAtual.clinica.nome : "Nenhuma clínica selecionada"}
          </div>
          <div className="flex items-center gap-2">
            <Suspense fallback={null}>
              <VoiceInput
                append={false}
                onTranscript={handleVoiceCommand}
                title="Busca por voz (diga: agenda, clientes, financeiro…)"
                prompt="Transcreva o comando de voz curto em português do Brasil. Retorne apenas as palavras ditas."
              />
            </Suspense>
            {memberships.length > 0 && (
              <Select value={clinicaAtual?.clinica_id} onValueChange={setClinicaAtual}>
                <SelectTrigger className="w-64 font-semibold" style={{ color: corDaClinica(clinicaAtual?.clinica.nome) }}>
                  <SelectValue placeholder="Selecione a clínica" />
                </SelectTrigger>
                <SelectContent>
                  {memberships.map((m) => (
                    <SelectItem key={m.clinica_id} value={m.clinica_id}>
                      <span className="flex items-center gap-2 font-semibold" style={{ color: corDaClinica(m.clinica.nome) }}>
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: corDaClinica(m.clinica.nome) }} />
                        {m.clinica.nome} {m.clinica.cidade ? `— ${m.clinica.cidade}` : ""}
                      </span>
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