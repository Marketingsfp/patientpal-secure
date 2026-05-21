import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { Activity, Building2, Users, LayoutDashboard, LogOut, Stethoscope, Bell, DollarSign, CalendarDays, ClipboardList, MessageCircle, Target, Clock, BookOpen, Workflow, FileText, CreditCard, Brain, FileHeart, FlaskConical, BellRing, ShieldCheck, BarChart3, Wallet, ChevronLeft, ChevronRight, ChevronDown, Search, HeartPulse, Contact, ConciergeBell, Briefcase, MapPin, Palmtree, GraduationCap, Sparkles, Filter, Send, Megaphone, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { useMedicoContext } from "@/hooks/use-medico-context";
import { supabase } from "@/integrations/supabase/client";
import logoSaoFrancisco from "@/assets/logo-sao-francisco.png";
import logoMeninoJesus from "@/assets/logo-menino-jesus.png";
import logoConsultaHoje from "@/assets/logo-consulta-hoje.png";

function corDaClinica(nome?: string): string {
  const n = (nome ?? "").toLowerCase();
  if (n.includes("são francisco") || n.includes("sao francisco")) return "#006634"; // verde São Francisco
  if (n.includes("menino jesus")) return "#15274f"; // azul marinho Menino Jesus
  if (n.includes("consulta hoje")) return "#141395"; // azul Consulta Hoje
  return "hsl(var(--muted-foreground))";
}

function corHoverDaClinica(nome?: string): string {
  const n = (nome ?? "").toLowerCase();
  if (n.includes("são francisco") || n.includes("sao francisco")) return "#004d27"; // verde escuro
  if (n.includes("menino jesus")) return "#0d1a36"; // marinho escuro
  if (n.includes("consulta hoje")) return "#0d0c6b"; // azul escuro
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const VoiceInput = lazy(() => import("@/components/voice-input").then((m) => ({ default: m.VoiceInput })));

const navRows: ReadonlyArray<{ label: string; items: ReadonlyArray<{ to: string; label: string; icon: typeof LayoutDashboard }> }> = [
  {
    label: "Operação",
    items: [
    { to: "/app/agenda", label: "Agenda", icon: CalendarDays },
    { to: "/app/caixa", label: "Caixa", icon: Wallet },
    { to: "/app/cartao-beneficios", label: "Cartão Benefícios", icon: CreditCard },
    { to: "/app/chat", label: "Chat interno", icon: MessageCircle },
    { to: "/app/clientes", label: "Clientes", icon: Contact },
    { to: "/app", label: "Dashboard", icon: LayoutDashboard },
    { to: "/app/fluxo", label: "Fluxo do paciente", icon: Workflow },
    { to: "/app/orcamentos", label: "Orçamentos", icon: FileText },
    { to: "/app/procedimentos", label: "Procedimentos", icon: ClipboardList },
    { to: "/app/recepcao", label: "Recepção / Filas", icon: ConciergeBell },
    { to: "/app/triagem-enfermagem", label: "Triagem - Enfermagem", icon: HeartPulse },
    ],
  },
  {
    label: "Inteligência",
    items: [
    { to: "/app/atendimento-ia", label: "Atendimento médico", icon: Brain },
    { to: "/app/crm", label: "CRM", icon: Target },
    { to: "/app/alertas-enfermagem", label: "Enfermeira IA — Alertas", icon: BellRing },
    { to: "/app/consulta-rapida", label: "Informações rápidas", icon: BookOpen },
    { to: "/app/prontuario-modelos", label: "Modelos de Prontuário", icon: FileHeart },
    { to: "/app/nina", label: "Nina — WhatsApp", icon: MessageCircle },
    { to: "/app/odontologia", label: "Odontologia", icon: HeartPulse },
    { to: "/app/exames-resultados", label: "Resultados de Exames", icon: FlaskConical },
    ],
  },
  {
    label: "Marketing",
    items: [
    { to: "/app/campanhas", label: "Campanhas", icon: Megaphone },
    { to: "/app/mkt-envios", label: "Envios", icon: Send },
    { to: "/app/mkt-landing", label: "Landing Pages", icon: Sparkles },
    { to: "/app/mkt-leads", label: "Leads", icon: Users },
    { to: "/app/mkt-segmentos", label: "Segmentos", icon: Filter },
    ],
  },
  {
    label: "Gestão",
    items: [
    { to: "/app/auditoria", label: "Auditoria", icon: ShieldCheck },
    { to: "/app/cargos", label: "Cargos", icon: Briefcase },
    { to: "/app/clinicas", label: "Clínicas", icon: Building2 },
    { to: "/app/equipe", label: "Equipe", icon: Users },
    { to: "/app/especialidades", label: "Especialidades", icon: HeartPulse },
    { to: "/app/financeiro", label: "Financeiro", icon: DollarSign },
    { to: "/app/disponibilidades", label: "Horários médicos", icon: Clock },
    { to: "/app/integration-secrets", label: "Integrações", icon: KeyRound },
    { to: "/app/lgpd", label: "LGPD", icon: ShieldCheck },
    { to: "/app/medicos", label: "Médicos", icon: Stethoscope },
    { to: "/app/relatorios", label: "Relatórios", icon: BarChart3 },
    { to: "/app/setores", label: "Setores", icon: Building2 },
    { to: "/app/unidades", label: "Unidades", icon: MapPin },
    ],
  },
  {
    label: "RH",
    items: [
    { to: "/app/hr-ponto", label: "Bater ponto", icon: Clock },
    { to: "/app/lms-admin", label: "Cursos (admin)", icon: BookOpen },
    { to: "/app/hr-ferias", label: "Férias", icon: Palmtree },
    { to: "/app/hr-contratos", label: "Funcionários", icon: Users },
    { to: "/app/hr-holerites", label: "Holerites", icon: FileText },
    { to: "/app/treinamentos", label: "Treinamentos", icon: GraduationCap },
    ],
  },
];

export function AppShell() {
  const { user, signOut, loading } = useAuth();
  const { memberships, clinicaAtual, setClinicaAtual, modoTodas, setModoTodas, branding } = useClinica();
  const { isMedicoOnly } = useMedicoContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (window.innerWidth < 1024) return true;
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
  // Auto-collapse on small screens
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      if (window.innerWidth < 1024) setCollapsed(true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [profileName, setProfileName] = useState<string>("");
  const [pwOpen, setPwOpen] = useState(false);
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  const handleChangePassword = async () => {
    if (pwNew.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (pwNew !== pwConfirm) {
      toast.error("As senhas não conferem.");
      return;
    }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pwNew });
    setPwSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Senha alterada com sucesso.");
    setPwOpen(false);
    setPwNew("");
    setPwConfirm("");
  };
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

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--primary", clinicColor);
    root.style.setProperty("--ring", clinicColor);
    root.style.setProperty("--sidebar-primary", clinicColor);
    root.style.setProperty("--primary-foreground", "#ffffff");
    return () => {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--ring");
      root.style.removeProperty("--sidebar-primary");
      root.style.removeProperty("--primary-foreground");
    };
  }, [clinicColor]);

  const medicoNavRows: typeof navRows = [
    {
      label: "Médico",
      items: [
        { to: "/app/agenda", label: "Agenda", icon: CalendarDays },
        { to: "/app/atendimento-ia", label: "Atendimento médico", icon: Brain },
        { to: "/app/financeiro/atendimentos", label: "Repasse", icon: DollarSign },
      ],
    },
  ];
  const visibleNavRows = isMedicoOnly ? medicoNavRows : navRows;

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <aside
        className={`${collapsed ? "w-16" : "w-64"} transition-all duration-200 shrink-0 text-white h-screen overflow-y-auto flex flex-col`}
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
        {!collapsed && (
        <div className="px-3 py-2 space-y-2 border-b border-white/10">
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
          {visibleNavRows.map((row) => {
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
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-14 bg-card/80 backdrop-blur border-b flex items-center gap-3 px-3 sm:px-6">
          <div className="flex items-center gap-2 min-w-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold text-white shadow-sm shrink-0 cursor-pointer hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                  style={{ backgroundColor: clinicColor }}
                  title="Conta"
                >
                  {initial}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="truncate">{userName || user?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setPwOpen(true)}>
                  <KeyRound className="h-4 w-4 mr-2" />
                  Alterar senha
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleSignOut()}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <p className="text-sm font-medium truncate max-w-[160px]" title={user?.email ?? undefined}>{userName}</p>
          </div>
          {clinicaAtual && logoDaClinica(clinicaAtual.clinica.nome) && (
            <div className="bg-white rounded-lg shadow-sm border px-2 py-1 flex items-center justify-center shrink-0">
              <img
                src={logoDaClinica(clinicaAtual.clinica.nome)!}
                alt={clinicaAtual.clinica.nome}
                className="h-7 w-auto object-contain"
              />
            </div>
          )}
          {memberships.length > 0 && (
            <Select
              value={modoTodas ? "__todas__" : clinicaAtual?.clinica_id}
              onValueChange={(v) => {
                if (v === "__todas__") setModoTodas(true);
                else setClinicaAtual(v);
              }}
            >
              <SelectTrigger className="w-[220px] h-9">
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
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-full" title="Notificações">
              <Bell className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-auto min-w-0" style={{ background: "var(--surface-cream)" }}>
          <Outlet />
        </main>
      </div>
      <Dialog open={pwOpen} onOpenChange={(o) => { setPwOpen(o); if (!o) { setPwNew(""); setPwConfirm(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="pw-new">Nova senha</Label>
              <Input id="pw-new" type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pw-confirm">Confirmar nova senha</Label>
              <Input id="pw-confirm" type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwOpen(false)} disabled={pwSaving}>Cancelar</Button>
            <Button onClick={() => void handleChangePassword()} disabled={pwSaving}>{pwSaving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}