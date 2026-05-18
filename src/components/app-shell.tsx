import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { Activity, Building2, Users, LayoutDashboard, LogOut, Stethoscope, Bell, DollarSign, CalendarDays, ClipboardList, MessageCircle, Target, Clock, BookOpen, Workflow, FileText, CreditCard, Brain, FileHeart, FlaskConical, BellRing, ShieldCheck, BarChart3, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import logoSaoFrancisco from "@/assets/logo-sao-francisco.png";
import logoMeninoJesus from "@/assets/logo-menino-jesus.png";
import logoConsultaHoje from "@/assets/logo-consulta-hoje.png";

function corDaClinica(nome?: string): string {
  const n = (nome ?? "").toLowerCase();
  if (n.includes("são francisco") || n.includes("sao francisco")) return "#16a34a"; // verde
  if (n.includes("menino jesus")) return "#1e3a8a"; // azul royal mais escuro
  if (n.includes("consulta hoje")) return "#8b5cf6"; // roxinho
  return "hsl(var(--muted-foreground))";
}

function corHoverDaClinica(nome?: string): string {
  const n = (nome ?? "").toLowerCase();
  if (n.includes("são francisco") || n.includes("sao francisco")) return "#14532d"; // verde escuro
  if (n.includes("menino jesus")) return "#172554"; // azul ainda mais escuro
  if (n.includes("consulta hoje")) return "#5b21b6"; // roxo escuro
  return "rgba(0,0,0,0.25)";
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
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, iconColor: "#fbbf24" },
  { to: "/app/recepcao", label: "Recepção / Filas", icon: Bell, iconColor: "#f87171" },
  { to: "/app/fluxo", label: "Fluxo do paciente", icon: Workflow, iconColor: "#fb7185" },
  { to: "/app/agenda", label: "Agenda", icon: CalendarDays, iconColor: "#60a5fa" },
  { to: "/app/clientes", label: "Clientes", icon: Users, iconColor: "#c084fc" },
  { to: "/app/procedimentos", label: "Procedimentos", icon: ClipboardList, iconColor: "#fb923c" },
  { to: "/app/orcamentos", label: "Orçamentos", icon: FileText, iconColor: "#34d399" },
  { to: "/app/cartao-beneficios", label: "Cartão Benefícios", icon: CreditCard, iconColor: "#22d3ee" },
  { to: "/app/crm", label: "CRM", icon: Target, iconColor: "#f472b6" },
  { to: "/app/nina", label: "Nina — WhatsApp", icon: MessageCircle, iconColor: "#4ade80" },
  { to: "/app/financeiro", label: "Financeiro", icon: DollarSign, iconColor: "#facc15" },
  { to: "/app/clinicas", label: "Clínicas", icon: Building2, iconColor: "#22d3ee" },
  { to: "/app/medicos", label: "Médicos", icon: Stethoscope, iconColor: "#fda4af" },
  { to: "/app/especialidades", label: "Especialidades", icon: Stethoscope, iconColor: "#f0abfc" },
  { to: "/app/disponibilidades", label: "Horários médicos", icon: Clock, iconColor: "#a78bfa" },
  { to: "/app/consulta-rapida", label: "Informações rápidas", icon: BookOpen, iconColor: "#fcd34d" },
  { to: "/app/atendimento-ia", label: "Atendimento IA", icon: Brain, iconColor: "#a78bfa" },
  { to: "/app/exames-resultados", label: "Resultados de Exames", icon: FlaskConical, iconColor: "#fde047" },
  { to: "/app/alertas-enfermagem", label: "Enfermeira IA — Alertas", icon: BellRing, iconColor: "#ef4444" },
  { to: "/app/prontuario-modelos", label: "Modelos de Prontuário", icon: FileHeart, iconColor: "#f9a8d4" },
  { to: "/app/equipe", label: "Equipe", icon: Users, iconColor: "#93c5fd" },
  { to: "/app/auditoria", label: "Auditoria", icon: ShieldCheck, iconColor: "#f87171" },
  { to: "/app/relatorios", label: "Relatórios", icon: BarChart3, iconColor: "#10b981" },
] as const;

export function AppShell() {
  const { user, signOut, loading } = useAuth();
  const { memberships, clinicaAtual, setClinicaAtual } = useClinica();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sidebar:collapsed") === "1";
  });
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      try { window.localStorage.setItem("sidebar:collapsed", next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  };

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [loading, navigate, user]);

  const handleVoiceCommand = (text: string) => {
    const t = text.toLowerCase();
    const route =
      /agenda|agendamento/.test(t) ? "/app/agenda" :
      /fluxo|kanban|triagem/.test(t) ? "/app/fluxo" :
      /recep|fila/.test(t) ? "/app/recepcao" :
      /cliente|paciente/.test(t) ? "/app/clientes" :
      /procediment|exame/.test(t) ? "/app/procedimentos" :
      /or[çc]amento/.test(t) ? "/app/orcamentos" :
      /plano|assinatura|cart[ãa]o|benef[ií]cio|contrato/.test(t) ? "/app/cartao-beneficios/contratos" :
      /modelo|template/.test(t) ? "/app/cartao-beneficios/modelos" :
      /relat[óo]rio.*cart[ãa]o|cart[ãa]o.*relat[óo]rio/.test(t) ? "/app/cartao-beneficios/relatorios" :
      /financ|caixa|conta|boleto/.test(t) ? "/app/financeiro" :
      /cl[ií]nica/.test(t) ? "/app/clinicas" :
      /m[eé]dico|profissional|rateio|repasse/.test(t) ? "/app/medicos" :
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
    <div className="min-h-screen flex bg-muted/30 items-start">
      <aside
        className={`${collapsed ? "w-14" : "w-64"} text-white flex flex-col shrink-0 self-start sticky top-0 max-h-screen transition-[width] duration-200`}
        style={{
          backgroundColor: clinicaAtual ? corDaClinica(clinicaAtual.clinica.nome) : undefined,
          ["--nav-hover" as never]: clinicaAtual ? corHoverDaClinica(clinicaAtual.clinica.nome) : "rgba(0,0,0,0.25)",
        }}
      >
        <div className={`${collapsed ? "px-2" : "px-4"} py-4 flex items-center justify-center gap-2 border-b border-white/20 min-h-[64px] text-white`}>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 backdrop-blur">
            <Activity className="h-5 w-5" />
          </span>
          {!collapsed && <span className="text-lg font-semibold tracking-tight">ClinicaOS</span>}
        </div>
        <nav className="p-3 space-y-1 font-sans overflow-y-auto min-h-0">
          {nav.map((item) => {
            const active = location.pathname === item.to ||
              (item.to !== "/app" && location.pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 rounded-md ${collapsed ? "px-2 justify-center" : "px-3"} py-2 text-sm font-semibold tracking-wide transition-colors ${
                  active
                    ? "bg-[var(--nav-hover)] text-white"
                    : "text-white hover:bg-[var(--nav-hover)] hover:text-white"
                }`}
              >
                <item.icon className="h-4 w-4 text-white" />
                {!collapsed && item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-2 py-1 border-t border-white/20 mt-auto">
          <Button
            variant="ghost"
            size="sm"
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            className={`w-full h-8 ${collapsed ? "justify-center px-0" : "justify-start"} text-white hover:bg-[var(--nav-hover)] hover:text-white`}
            onClick={toggleCollapsed}
          >
            {collapsed ? <PanelLeftOpen className={`h-4 w-4`} /> : <><PanelLeftClose className="h-4 w-4 mr-2" /> Recolher</>}
          </Button>
          {!collapsed && (
            <div className="px-2 py-1 text-[11px] text-white/70 truncate">{user?.email}</div>
          )}
          <Button
            variant="ghost"
            size="sm"
            title={collapsed ? "Sair" : undefined}
            className={`w-full h-8 ${collapsed ? "justify-center px-0" : "justify-start"} text-white hover:bg-[var(--nav-hover)] hover:text-white`}
            onClick={handleSignOut}
          >
            <LogOut className={`h-4 w-4 ${collapsed ? "" : "mr-2"}`} /> {!collapsed && "Sair"}
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCollapsed}
              title={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </Button>
            <Link to="/app" className="flex items-center gap-3">
              {clinicaAtual && logoDaClinica(clinicaAtual.clinica.nome) ? (
                <img src={logoDaClinica(clinicaAtual.clinica.nome)!} alt={clinicaAtual.clinica.nome} className="h-12 w-auto object-contain" />
              ) : (
                <span className="text-sm font-semibold" style={{ color: corDaClinica(clinicaAtual?.clinica.nome) }}>
                  {clinicaAtual ? clinicaAtual.clinica.nome : "Nenhuma clínica selecionada"}
                </span>
              )}
            </Link>
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