import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { Activity, Building2, Users, LayoutDashboard, LogOut, Stethoscope, Bell, DollarSign, CalendarDays, ClipboardList, MessageCircle, Target, Clock, BookOpen, Workflow, FileText, CreditCard, Brain, FileHeart, FlaskConical, BellRing, ShieldCheck, BarChart3, Wallet, ChevronLeft, ChevronRight, ChevronDown, Search, HeartPulse, Contact, ConciergeBell, Briefcase, MapPin, Palmtree, GraduationCap, Sparkles, Filter, Send, Megaphone, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { supabase } from "@/integrations/supabase/client";
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
    { to: "/app/recepcao", label: "Recepção / Filas", icon: ConciergeBell },
    { to: "/app/chat", label: "Chat interno", icon: MessageCircle },
    { to: "/app/fluxo", label: "Fluxo do paciente", icon: Workflow },
    { to: "/app/agenda", label: "Agenda", icon: CalendarDays },
    { to: "/app/clientes", label: "Clientes", icon: Contact },
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
    { to: "/app/odontologia", label: "Odontologia", icon: HeartPulse },
    { to: "/app/consulta-rapida", label: "Informações rápidas", icon: BookOpen },
    ],
  },
  {
    label: "Marketing",
    items: [
    { to: "/app/campanhas", label: "Campanhas", icon: Megaphone },
    { to: "/app/mkt-landing", label: "Landing Pages", icon: Sparkles },
    { to: "/app/mkt-leads", label: "Leads", icon: Users },
    { to: "/app/mkt-segmentos", label: "Segmentos", icon: Filter },
    { to: "/app/mkt-envios", label: "Envios", icon: Send },
    ],
  },
  {
    label: "Gestão",
    items: [
    { to: "/app/financeiro", label: "Financeiro", icon: DollarSign },
    { to: "/app/clinicas", label: "Clínicas", icon: Building2 },
    { to: "/app/medicos", label: "Médicos", icon: Stethoscope },
    { to: "/app/especialidades", label: "Especialidades", icon: HeartPulse },
    { to: "/app/disponibilidades", label: "Horários médicos", icon: Clock },
    { to: "/app/equipe", label: "Equipe", icon: Users },
    { to: "/app/cargos", label: "Cargos", icon: Briefcase },
    { to: "/app/setores", label: "Setores", icon: Building2 },
    { to: "/app/unidades", label: "Unidades", icon: MapPin },
    { to: "/app/lgpd", label: "LGPD", icon: ShieldCheck },
    { to: "/app/auditoria", label: "Auditoria", icon: ShieldCheck },
    { to: "/app/relatorios", label: "Relatórios", icon: BarChart3 },
    { to: "/app/integration-secrets", label: "Integrações", icon: KeyRound },
    ],
  },
  {
    label: "RH",
    items: [
    { to: "/app/hr-ponto", label: "Bater ponto", icon: Clock },
    { to: "/app/hr-contratos", label: "Funcionários", icon: Users },
    { to: "/app/hr-holerites", label: "Holerites", icon: FileText },
    { to: "/app/hr-ferias", label: "Férias", icon: Palmtree },
    { to: "/app/treinamentos", label: "Treinamentos", icon: GraduationCap },
    { to: "/app/lms-admin", label: "Cursos (admin)", icon: BookOpen },
    ],
  },
];

export function AppShell() {
  const { user, signOut, loading } = useAuth();
  const { memberships, clinicaAtual, setClinicaAtual, modoTodas, setModoTodas, branding } = useClinica();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("appshell:collapsed") === "1";
  });
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(window.localStorage.getItem("appshell:openGroups") ?? "{}"); } catch { return {}; }
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("appshell:openGroups", JSON.stringify(openGroups));
    }
  }, [openGroups]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("appshell:collapsed", collapsed ? "1" : "0");
    }
  }, [collapsed]);

  const [profileName, setProfileName] = useState<string>("");
  useEffect(() => {
    if (!user?.id) { setProfileName(""); return; }
    let cancelled = false;
    supabase.from("profiles").select("nome").eq("id", user.id).maybeSingle()
      .then((res: { data: { nome: string | null } | null }) => {
        if (!cancelled && res.data?.nome) setProfileName(res.data.nome);
      });
    return () => { cancelled = true; };
  }, [user?.id]);
  const userName = profileName
    || (user?.user_metadata?.full_name as string | undefined)
    || (user?.user_metadata?.name as string | undefined)
    || (user?.email ? user.email.split("@")[0] : "");

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

  const clinicColor = modoTodas
    ? "#0f172a"
    : branding?.primary
      ? branding.primary
      : clinicaAtual
        ? corDaClinica(clinicaAtual.clinica.nome)
        : "#0f172a";
  const initial = (userName || user?.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen flex bg-background">
      <aside
        className={`${collapsed ? "w-16" : "w-64"} transition-all duration-200 shrink-0 text-white sticky top-0 h-screen overflow-y-auto flex flex-col`}
        style={{ backgroundColor: clinicColor }}
      >
        <div className="px-3 py-3 border-b border-white/10 flex items-center justify-between gap-2">
          <Link to="/app" className="flex items-center gap-2 min-w-0">
            <Activity className="h-5 w-5 shrink-0" />
            {!collapsed && <span className="font-semibold tracking-tight truncate">ClinicaOS</span>}
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/10 hover:text-white h-7 w-7 p-0 shrink-0"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
        {!collapsed && clinicaAtual && logoDaClinica(clinicaAtual.clinica.nome) && (
          <div className="px-3 py-3 border-b border-white/10">
            <div className="bg-white rounded-xl shadow-sm p-2 flex items-center justify-center">
              <img
                src={logoDaClinica(clinicaAtual.clinica.nome)!}
                alt={clinicaAtual.clinica.nome}
                className="h-12 w-auto object-contain"
              />
            </div>
          </div>
        )}
        {!collapsed && (
        <div className="px-3 py-2 space-y-2 border-b border-white/10">
          {memberships.length > 0 && (
            <Select
              value={modoTodas ? "__todas__" : clinicaAtual?.clinica_id}
              onValueChange={(v) => {
                if (v === "__todas__") setModoTodas(true);
                else setClinicaAtual(v);
              }}
            >
              <SelectTrigger className="w-full bg-white/10 border-white/20 text-white">
                <SelectValue placeholder="Selecione a clínica" />
              </SelectTrigger>
              <SelectContent>
                {memberships.length > 1 && (
                  <SelectItem value="__todas__">
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
                      Todas as clínicas
                    </span>
                  </SelectItem>
                )}
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
        )}
        <nav className="flex-1 px-2 py-3 space-y-5 overflow-y-auto">
          {navRows.map((row) => {
            const groupHasActive = row.items.some((it) => location.pathname === it.to || (it.to !== "/app" && location.pathname.startsWith(it.to)));
            const open = collapsed ? true : (openGroups[row.label] ?? groupHasActive);
            return (
              <div key={row.label} className="space-y-1">
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() => setOpenGroups((prev) => ({ ...prev, [row.label]: !(prev[row.label] ?? groupHasActive) }))}
                    className="w-full flex items-center justify-between px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70 hover:opacity-100 transition-opacity rounded-md"
                    aria-expanded={open}
                  >
                    <span>{row.label}</span>
                    <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-0" : "-rotate-90"}`} />
                  </button>
                )}
                {open && row.items.map((item) => {
                  const active = location.pathname === item.to ||
                    (item.to !== "/app" && location.pathname.startsWith(item.to));
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      title={collapsed ? item.label : undefined}
                      className={`relative flex items-center gap-2.5 rounded-full ${collapsed ? "px-2 justify-center" : "px-3"} py-2 text-sm font-medium transition-all ${
                        active
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-white/85 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className={`px-3 py-3 border-t border-white/10 flex items-center ${collapsed ? "justify-center" : "gap-2"}`}>
          <div className="h-8 w-8 rounded-full bg-white text-slate-900 flex items-center justify-center text-sm font-semibold shrink-0 shadow-sm">
            {initial}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" title={user?.email ?? undefined}>{userName}</p>
            </div>
          )}
          {!collapsed && (
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white h-8 w-8 p-0" onClick={handleSignOut} title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-14 bg-card/80 backdrop-blur border-b flex items-center gap-3 px-6">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              placeholder="Pesquisar pacientes, agendamentos, médicos…"
              className="w-full h-9 pl-9 pr-3 rounded-full bg-muted/60 border border-transparent focus:bg-card focus:border-input outline-none text-sm transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-full" title="Notificações">
              <Bell className="h-4 w-4" />
            </Button>
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold text-white shadow-sm"
              style={{ backgroundColor: clinicColor }}
              title={user?.email ?? undefined}
            >
              {initial}
            </div>
          </div>
        </header>
        <main className="flex-1 p-6 overflow-auto min-w-0" style={{ background: "var(--surface-cream)" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}