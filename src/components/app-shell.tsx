import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect } from "react";
import { Activity, Building2, Users, LayoutDashboard, LogOut, Stethoscope, Bell, DollarSign, CalendarDays, ClipboardList, MessageCircle, Target, Clock, BookOpen, Workflow, FileText, CreditCard, Brain, FileHeart, FlaskConical, BellRing, ShieldCheck, BarChart3, Wallet } from "lucide-react";
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

const navRows: ReadonlyArray<{ label: string; items: ReadonlyArray<{ to: string; label: string; icon: typeof LayoutDashboard }> }> = [
  {
    label: "Operação",
    items: [
    { to: "/app", label: "Dashboard", icon: LayoutDashboard },
    { to: "/app/recepcao", label: "Recepção / Filas", icon: Bell },
    { to: "/app/fluxo", label: "Fluxo do paciente", icon: Workflow },
    { to: "/app/agenda", label: "Agenda", icon: CalendarDays },
    { to: "/app/clientes", label: "Clientes", icon: Users },
    { to: "/app/procedimentos", label: "Procedimentos", icon: ClipboardList },
    { to: "/app/orcamentos", label: "Orçamentos", icon: FileText },
    { to: "/app/cartao-beneficios", label: "Cartão Benefícios", icon: CreditCard },
    { to: "/app/caixa", label: "Caixa", icon: Wallet },
    ],
  },
  {
    label: "Inteligência",
    items: [
    { to: "/app/crm", label: "CRM", icon: Target },
    { to: "/app/nina", label: "Nina — WhatsApp", icon: MessageCircle },
    { to: "/app/atendimento-ia", label: "Atendimento médico", icon: Brain },
    { to: "/app/exames-resultados", label: "Resultados de Exames", icon: FlaskConical },
    { to: "/app/alertas-enfermagem", label: "Enfermeira IA — Alertas", icon: BellRing },
    { to: "/app/prontuario-modelos", label: "Modelos de Prontuário", icon: FileHeart },
    { to: "/app/consulta-rapida", label: "Informações rápidas", icon: BookOpen },
    ],
  },
  {
    label: "Gestão",
    items: [
    { to: "/app/financeiro", label: "Financeiro", icon: DollarSign },
    { to: "/app/clinicas", label: "Clínicas", icon: Building2 },
    { to: "/app/medicos", label: "Médicos", icon: Stethoscope },
    { to: "/app/especialidades", label: "Especialidades", icon: Stethoscope },
    { to: "/app/disponibilidades", label: "Horários médicos", icon: Clock },
    { to: "/app/equipe", label: "Equipe", icon: Users },
    { to: "/app/auditoria", label: "Auditoria", icon: ShieldCheck },
    { to: "/app/relatorios", label: "Relatórios", icon: BarChart3 },
    ],
  },
];

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
    <div className="min-h-screen flex bg-muted/30">
      <aside
        className="w-64 shrink-0 text-white sticky top-0 h-screen overflow-y-auto shadow-sm bg-slate-800 flex flex-col"
        style={{ backgroundColor: clinicaAtual ? corDaClinica(clinicaAtual.clinica.nome) : undefined }}
      >
        <div className="px-4 py-3 border-b border-white/10">
          <Link to="/app" className="flex items-center gap-2">
            <Activity className="h-5 w-5 shrink-0" />
            <span className="font-semibold tracking-tight">ClinicaOS</span>
          </Link>
          {clinicaAtual && logoDaClinica(clinicaAtual.clinica.nome) && (
            <img
              src={logoDaClinica(clinicaAtual.clinica.nome)!}
              alt={clinicaAtual.clinica.nome}
              className="h-12 w-auto object-contain mt-2 bg-white rounded p-1"
            />
          )}
        </div>
        <div className="px-3 py-2 space-y-2 border-b border-white/10">
          {memberships.length > 0 && (
            <Select value={clinicaAtual?.clinica_id} onValueChange={setClinicaAtual}>
              <SelectTrigger className="w-full bg-white/10 border-white/20 text-white">
                <SelectValue placeholder="Selecione a clínica" />
              </SelectTrigger>
              <SelectContent>
                {memberships.map((m) => (
                  <SelectItem key={m.clinica_id} value={m.clinica_id}>
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: corDaClinica(m.clinica.nome) }} />
                      {m.clinica.nome} {m.clinica.cidade ? `— ${m.clinica.cidade}` : ""}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Suspense fallback={null}>
            <VoiceInput
              append={false}
              onTranscript={handleVoiceCommand}
              title="Busca por voz (diga: agenda, clientes, financeiro…)"
              prompt="Transcreva o comando de voz curto em português do Brasil. Retorne apenas as palavras ditas."
              className="w-full bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white"
            />
          </Suspense>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto">
          {navRows.map((row, idx) => (
            <div key={idx} className="space-y-0.5">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider opacity-60">{row.label}</p>
              {row.items.map((item) => {
                const active = location.pathname === item.to ||
                  (item.to !== "/app" && location.pathname.startsWith(item.to));
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      active ? "bg-white/25 text-white" : "text-white/90 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="px-3 py-2 border-t border-white/10 flex items-center justify-between gap-2">
          <span className="text-xs opacity-80 truncate flex-1">{user?.email}</span>
          <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white" onClick={handleSignOut} title="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </aside>

      <main className="flex-1 p-6 overflow-auto min-w-0">
        <Outlet />
      </main>
    </div>
  );
}