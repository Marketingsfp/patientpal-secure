import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect } from "react";
import { Activity, Building2, Users, LayoutDashboard, LogOut, Stethoscope, Bell, DollarSign, CalendarDays, ClipboardList, MessageCircle, Target, Clock, BookOpen, Workflow, FileText, CreditCard, Brain, FileHeart, FlaskConical, BellRing, ShieldCheck, BarChart3 } from "lucide-react";
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

const navRows = [
  [
    { to: "/app", label: "Dashboard", icon: LayoutDashboard },
    { to: "/app/recepcao", label: "Recepção / Filas", icon: Bell },
    { to: "/app/fluxo", label: "Fluxo do paciente", icon: Workflow },
    { to: "/app/agenda", label: "Agenda", icon: CalendarDays },
    { to: "/app/clientes", label: "Clientes", icon: Users },
    { to: "/app/procedimentos", label: "Procedimentos", icon: ClipboardList },
    { to: "/app/orcamentos", label: "Orçamentos", icon: FileText },
    { to: "/app/cartao-beneficios", label: "Cartão Benefícios", icon: CreditCard },
  ],
  [
    { to: "/app/crm", label: "CRM", icon: Target },
    { to: "/app/nina", label: "Nina — WhatsApp", icon: MessageCircle },
    { to: "/app/atendimento-ia", label: "Atendimento IA", icon: Brain },
    { to: "/app/exames-resultados", label: "Resultados de Exames", icon: FlaskConical },
    { to: "/app/alertas-enfermagem", label: "Enfermeira IA — Alertas", icon: BellRing },
    { to: "/app/prontuario-modelos", label: "Modelos de Prontuário", icon: FileHeart },
    { to: "/app/consulta-rapida", label: "Informações rápidas", icon: BookOpen },
  ],
  [
    { to: "/app/financeiro", label: "Financeiro", icon: DollarSign },
    { to: "/app/clinicas", label: "Clínicas", icon: Building2 },
    { to: "/app/medicos", label: "Médicos", icon: Stethoscope },
    { to: "/app/especialidades", label: "Especialidades", icon: Stethoscope },
    { to: "/app/disponibilidades", label: "Horários médicos", icon: Clock },
    { to: "/app/equipe", label: "Equipe", icon: Users },
    { to: "/app/auditoria", label: "Auditoria", icon: ShieldCheck },
    { to: "/app/relatorios", label: "Relatórios", icon: BarChart3 },
  ],
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
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header
        className="text-white sticky top-0 z-30 shadow-sm"
        style={{
          backgroundColor: clinicaAtual ? corDaClinica(clinicaAtual.clinica.nome) : undefined,
          ["--nav-hover" as never]: clinicaAtual ? corHoverDaClinica(clinicaAtual.clinica.nome) : "rgba(0,0,0,0.25)",
        }}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-white/15">
          <Link to="/app" className="flex items-center gap-2 min-w-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 backdrop-blur shrink-0">
              <Activity className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight hidden sm:inline">ClinicaOS</span>
            {clinicaAtual && logoDaClinica(clinicaAtual.clinica.nome) && (
              <img
                src={logoDaClinica(clinicaAtual.clinica.nome)!}
                alt={clinicaAtual.clinica.nome}
                className="h-9 w-auto object-contain bg-white/95 rounded-md px-1 ml-2 hidden md:block"
              />
            )}
          </Link>
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
                <SelectTrigger className="w-56 font-semibold bg-white/95 text-foreground border-0" style={{ color: corDaClinica(clinicaAtual?.clinica.nome) }}>
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
            <span className="text-[11px] text-white/80 hidden lg:inline max-w-[180px] truncate">{user?.email}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-white hover:bg-[var(--nav-hover)] hover:text-white"
              onClick={handleSignOut}
              title="Sair"
            >
              <LogOut className="h-4 w-4 mr-1" /> Sair
            </Button>
          </div>
        </div>

        <nav className="px-3 py-2 space-y-1.5 font-sans">
          {navRows.map((row, rowIdx) => (
            <div key={rowIdx} className="flex flex-wrap gap-1.5">
              {row.map((item) => {
                const active = location.pathname === item.to ||
                  (item.to !== "/app" && location.pathname.startsWith(item.to));
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors whitespace-nowrap ${
                      active
                        ? "bg-[var(--nav-hover)] text-white"
                        : "text-white/90 hover:bg-[var(--nav-hover)] hover:text-white"
                    }`}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </header>

      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}