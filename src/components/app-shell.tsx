import { Link, Outlet, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Activity, Building2, Users, LayoutDashboard, LogOut, Stethoscope, Bell, DollarSign, CalendarDays, ClipboardList, MessageCircle, Target, Clock, BookOpen, Workflow, FileText, CreditCard, Brain, FileHeart, FlaskConical, BellRing, ShieldCheck, BarChart3, Wallet, ChevronLeft, ChevronRight, ChevronDown, Search, HeartPulse, Contact, ConciergeBell, Briefcase, MapPin, Palmtree, GraduationCap, Sparkles, Filter, Send, Megaphone, KeyRound, BadgeCheck, LayoutGrid, Gift, Zap, Coffee, Play, Eye, ArrowRightLeft, Inbox, FileBarChart2, Moon, Sun, Pin, PinOff, Menu as MenuIcon } from "lucide-react";
import { Tooth } from "@/components/icons/tooth";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { usePermissoes } from "@/hooks/use-permissoes";
import { ROUTE_TO_MODULE as SHARED_ROUTE_TO_MODULE, moduloDaRota, SUBMODULE_PARENT } from "@/lib/permissoes-rotas";
import { SemPermissao } from "@/components/sem-permissao";
import { supabase } from "@/integrations/supabase/client";
import { getSubsystem, setSubsystem, subscribeSubsystem, SUBSYSTEMS } from "@/lib/subsystem";
import logoSaoFrancisco from "@/assets/logo-sao-francisco.png";
import logoMeninoJesus from "@/assets/logo-menino-jesus.png";
import logoConsultaHoje from "@/assets/logo-consulta-hoje.png";
import { EstornosBell } from "@/components/EstornosBell";
import { UniversalSearchBar } from "@/components/universal-search-bar";
import { useClinicFeatureFlag } from "@/hooks/use-clinic-feature-flag";
import { useTheme } from "@/hooks/use-theme";
import { useMenuOrdem } from "@/hooks/use-menu-ordem";
import { HOVER_SCALE_CLASSES } from "@/lib/menu-hover";
import { garantirContrasteTextoBranco } from "@/lib/contrast";
import { cn } from "@/lib/utils";
import { useAtendimentoMultiploDisabled } from "@/hooks/use-atendimento-multiplo-disabled";

function corDaClinica(nome?: string): string {
  const n = (nome ?? "").toLowerCase();
  if (n.includes("são francisco") || n.includes("sao francisco")) return "#006634"; // verde São Francisco
  if (n.includes("menino jesus")) return "#2A4A9C"; // azul Menino Jesus
  if (n.includes("consulta hoje")) return "#6D28D9"; // roxo Consulta Hoje
  return "hsl(var(--muted-foreground))";
}

function corHoverDaClinica(nome?: string): string {
  const n = (nome ?? "").toLowerCase();
  if (n.includes("são francisco") || n.includes("sao francisco")) return "#004d27"; // verde escuro
  if (n.includes("menino jesus")) return "#1E3A7A"; // azul escuro Menino Jesus
  if (n.includes("consulta hoje")) return "#4C1D95"; // roxo escuro
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
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const VoiceInput = lazy(() => import("@/components/voice-input").then((m) => ({ default: m.VoiceInput })));
const ChangePasswordDialog = lazy(() =>
  import("@/components/change-password-dialog").then((m) => ({ default: m.ChangePasswordDialog }))
);

type NavLeaf = { to: string; label: string; icon: typeof LayoutDashboard; hash?: string; aliases?: ReadonlyArray<string> };
type NavParent = { label: string; icon: typeof LayoutDashboard; children: ReadonlyArray<NavLeaf> };
type NavItem = NavLeaf | NavParent;
const isParent = (it: NavItem): it is NavParent => "children" in it;

// Chave estável de um item de menu para a ordem personalizada por usuário
// (leaf = rota + hash; grupo expansível = prefixo com o rótulo).
const navItemKey = (it: NavItem): string =>
  isParent(it) ? `grupo:${it.label}` : `${it.to}${it.hash ? `#${it.hash}` : ""}`;

// Bottom nav mobile — piloto São Francisco de Paula (flag ux_melhorias).
// Os 4 atalhos mais usados; o resto do menu continua acessível via "Mais".
const BOTTOM_NAV_ITENS: ReadonlyArray<{ to: string; label: string; Icon: typeof CalendarDays }> = [
  { to: "/app/agenda", label: "Agenda", Icon: CalendarDays },
  { to: "/app/clientes", label: "Clientes", Icon: Users },
  { to: "/app/caixa", label: "Caixa", Icon: Wallet },
  { to: "/app/recepcao", label: "Recepção", Icon: ConciergeBell },
];

// Mapeia rota do menu → chave de módulo da tela de Perfis de Acesso.
// O mapa vive em src/lib/permissoes-rotas.ts (compartilhado com o guard
// de rota) — aqui apenas reexportamos para uso local.
const ROUTE_TO_MODULE = SHARED_ROUTE_TO_MODULE;

function leafAllowed(to: string, allowed: Set<string> | null): boolean {
  if (!allowed) return true;
  const mod = ROUTE_TO_MODULE[to];
  if (mod === null) return true;       // rota livre/sistema
  if (mod === undefined) return false; // rota não mapeada → ocultar
  if (allowed.has(mod)) return true;
  // Item de menu do módulo-pai (ex.: "Financeiro") permanece visível quando
  // o usuário tem acesso a pelo menos um submódulo (mov. caixa, estorno,
  // atendimentos), mesmo sem acesso ao pai. O submenu do Financeiro já
  // filtra as abas individuais e a rota-pai redireciona para a primeira
  // aba visível.
  const temSub = Object.entries(SUBMODULE_PARENT).some(
    ([sub, parent]) => parent === mod && allowed.has(sub),
  );
  return temSub;
}

const navRows: ReadonlyArray<{ label: string; items: ReadonlyArray<NavItem> }> = [
  {
    label: "Operação",
    items: [
    { to: "/app/agenda", label: "Agenda", icon: CalendarDays },
    { to: "/app/atendimento-multiplo", label: "Atendimento Múltiplo", icon: ClipboardList },
    { to: "/app/checkin", label: "Check-in", icon: BadgeCheck },
    { to: "/app/caixa", label: "Caixa", icon: Wallet },
    { to: "/app/chat", label: "Chat interno", icon: MessageCircle },
    { to: "/app/clientes", label: "Clientes", icon: Contact },
    { to: "/app/painel", label: "Dashboard", icon: LayoutDashboard },
    { to: "/app/painel-executivo", label: "Painel Executivo", icon: FileBarChart2 },
    { to: "/app/fluxo", label: "Fluxo do paciente", icon: Workflow },
    { to: "/app/orcamentos", label: "Orçamentos", icon: FileText },
    { to: "/app/recepcao", label: "Recepção / Filas", icon: ConciergeBell },
    { to: "/app/triagem-enfermagem", label: "Triagem - Enfermagem", icon: HeartPulse },
    { to: "/app/cartao-beneficios/contratos", label: "Cartão Benefícios", icon: CreditCard },
    { to: "/app/documentos", label: "Documentos do paciente", icon: FileText },
    ],
  },
  {
    label: "Inteligência",
    items: [
    { to: "/app/atendimento-ia", label: "Atendimento médico", icon: Brain },
    { to: "/app/crm", label: "CRM", icon: Target },
    { to: "/app/alertas-enfermagem", label: "Enfermeira IA — Alertas", icon: BellRing },
    { to: "/app/consulta-rapida", label: "Informações rápidas", icon: BookOpen },
    {
      label: "Nina — WhatsApp",
      icon: MessageCircle,
      children: [
        { to: "/app/nina", hash: "treinada", label: "Nina treinada", icon: Brain },
        { to: "/app/nina", hash: "automacoes", label: "Automações", icon: Sparkles },
        { to: "/app/nina", hash: "atend-inbox", label: "Conversas WhatsApp", icon: Inbox },
        { to: "/app/nina", hash: "atend-supervisor", label: "Atendimento — Supervisão (live)", icon: Eye },
        { to: "/app/nina", hash: "atend-relatorios", label: "Atendimento — Relatórios", icon: FileText },
        { to: "/app/nina", hash: "atend-roteamento", label: "Atendimento — Roteamento", icon: ArrowRightLeft },
        { to: "/app/nina", hash: "atend-dashboard", label: "Atendimento — Painel", icon: BarChart3 },
        { to: "/app/nina", hash: "atend-status", label: "Atendimento — Meu Status (filas + pausa)", icon: Play },
        { to: "/app/nina", hash: "atend-depto", label: "Atendimento — Departamentos", icon: Users },
        { to: "/app/nina", hash: "atend-macros", label: "Atendimento — Macros", icon: Zap },
        { to: "/app/nina", hash: "atend-kb", label: "Atendimento — Base de Conhecimento", icon: BookOpen },
        { to: "/app/nina", hash: "atend-pausas", label: "Atendimento — Pausas", icon: Coffee },
        { to: "/app/nina", hash: "templates", label: "Templates aprovados (Meta)", icon: FileText },
        { to: "/app/nina", hash: "config", label: "Configuração", icon: KeyRound },
      ],
    },
    { to: "/app/odontologia", label: "Odontologia", icon: Tooth },
    { to: "/app/exames-resultados", label: "Resultados de Exames", icon: FlaskConical },
    ],
  },
  {
    label: "Marketing",
    items: [
    { to: "/app/mkt-leads", label: "Marketing", icon: Megaphone },
    { to: "/app/campanhas", label: "Campanhas", icon: Send },
    { to: "/app/mkt-envios", label: "Envios", icon: Send },
    { to: "/app/mkt-landing", label: "Landing Pages", icon: Sparkles },
    { to: "/app/mkt-segmentos", label: "Segmentos", icon: Filter },
    ],
  },
  {
    label: "Cadastros",
    items: [
    { to: "/app/equipe", label: "Equipe", icon: Users },
    { to: "/app/perfis", label: "Perfis", icon: KeyRound },
    { to: "/app/especialidades", label: "Serviços", icon: Stethoscope, aliases: ["/app/tipos-servico", "/app/procedimentos"] },
    { to: "/app/disponibilidades", label: "Horários médicos", icon: Clock },
    { to: "/app/prontuario-modelos", label: "Modelos de Prontuário", icon: FileHeart },
    { to: "/app/unidades", label: "Unidades", icon: MapPin },
    { to: "/app/planos", label: "Planos / Convênios", icon: Gift },
    { to: "/app/modelos-documentos", label: "Modelos de Documentos", icon: FileText },
    { to: "/app/clinicas", label: "Clínicas", icon: Building2 },
    { to: "/app/medicos", label: "Médicos", icon: Stethoscope },
    { to: "/app/estoque", label: "Estoque", icon: LayoutGrid },
    { to: "/app/clientes/duplicados", label: "Duplicados / Merge", icon: Users },
    ],
  },
  {
    label: "Recursos Humanos",
    items: [
    { to: "/app/hr-ponto", label: "Marcação de ponto", icon: GraduationCap },
    { to: "/app/hr-contratos", label: "Contratos", icon: FileText },
    { to: "/app/hr-ferias", label: "Férias", icon: Palmtree },
    { to: "/app/hr-holerites", label: "Holerites", icon: FileText },
    { to: "/app/treinamentos", label: "Treinamentos", icon: GraduationCap },
    { to: "/app/lms-admin", label: "Cursos (admin)", icon: BookOpen },
    ],
  },
  {
    label: "Gestão",
    items: [
    { to: "/app/cargos", label: "Cargos", icon: Briefcase },
    { to: "/app/financeiro", label: "Financeiro", icon: DollarSign },
    { to: "/app/funcionarios", label: "Funcionários", icon: Contact },
    { to: "/app/configuracoes/nfse", label: "Configuração NFS-e", icon: FileText },
    { to: "/app/relatorios", label: "Relatórios", icon: BarChart3 },
    { to: "/app/auditoria", label: "Segurança & Compliance", icon: ShieldCheck },
    { to: "/app/setores", label: "Setores", icon: Building2 },
    { to: "/app/boletos", label: "Boletos", icon: FileText },
    { to: "/app/contratos", label: "Contratos de assinatura", icon: FileText },
    { to: "/app/nfse", label: "NFS-e", icon: FileText },
    { to: "/app/integration-secrets", label: "Integrações", icon: KeyRound },
    { to: "/app/lgpd", label: "LGPD", icon: ShieldCheck },
    ],
  },
  {
    label: "Configurações",
    items: [
    { to: "/app/configuracoes/painel-totem", label: "Painel & Totem", icon: KeyRound },
    ],
  },
];

export function AppShell() {
  const { user, signOut, loading } = useAuth();
  const { memberships, clinicaAtual, setClinicaAtual, modoTodas, setModoTodas, branding } = useClinica();
  const { allowed: allowedModules, configured: configuredModules, loading: permsLoading } = usePermissoes();
  // Efeito "expandir ao passar o mouse" nos itens do menu clássico — ligado
  // só nas clínicas com a flag `menu_hover_scale` (hoje apenas a São Francisco).
  const { enabled: menuHoverScale } = useClinicFeatureFlag("menu_hover_scale");
  const hoverScaleCls = menuHoverScale ? ` ${HOVER_SCALE_CLASSES}` : "";
  // Pacote de melhorias de UX (navegação SPA, transição de rota, dark mode) —
  // flag `ux_melhorias`, ligada só para a São Francisco de Paula.
  const { enabled: uxMelhorias } = useClinicFeatureFlag("ux_melhorias");
  const theme = useTheme(uxMelhorias);
  // Ordem personalizada dos itens do menu (arrastar e soltar) — por usuário.
  const { ordem: menuOrdem, salvar: salvarMenuOrdem } = useMenuOrdem(uxMelhorias);
  const [dragMenu, setDragMenu] = useState<{ row: string; key: string } | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const navScrollRef = useRef<HTMLElement | null>(null);
  // Navegação do menu: com `ux_melhorias` ligada, troca de tela via SPA (sem
  // recarregar a página). Nas demais clínicas mantém o reload completo atual.
  const irPara = (href: string) => {
    if (uxMelhorias) {
      router.history.push(href);
      return;
    }
    window.location.assign(href);
  };
  // Pré-carrega o código da rota ao passar o mouse no item do menu — quando o
  // clique acontece, o chunk JS já chegou. Só com a flag de UX ligada.
  const preCarregar = (href: string) => {
    if (!uxMelhorias) return;
    const to = href.split("#")[0];
    // Cast necessário: os paths do menu vêm de configuração em runtime
    // (string), não do union de rotas tipado do router.
    void router.preloadRoute({ to } as Parameters<typeof router.preloadRoute>[0]).catch(() => {});
  };
  const lastArrowNavAtRef = useRef(0);
  const [collapsedManual, setCollapsedManual] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (window.innerWidth < 1024) return true;
    return window.localStorage.getItem("appshell:collapsed") === "1";
  });
  // Menu que expande ao passar o mouse (só São Francisco de Paula).
  // `fixadoAberto` é um "alfinete" opcional: mantém aberto sem depender do
  // mouse. Chave própria no localStorage para não afetar o menu clássico.
  const [hoverSidebar, setHoverSidebar] = useState(false);
  const [fixadoAberto, setFixadoAberto] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("appshell:menu-fixado") === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("appshell:menu-fixado", fixadoAberto ? "1" : "0");
    }
  }, [fixadoAberto]);
  // Com a flag: recolhido por padrão, expande no hover (ou se estiver fixado).
  // Sem a flag: exatamente o comportamento anterior (só o botão controla).
  const collapsed = uxMelhorias ? (!fixadoAberto && !hoverSidebar) : collapsedManual;
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
      window.localStorage.setItem("appshell:collapsed", collapsedManual ? "1" : "0");
    }
  }, [collapsedManual]);
  // Auto-collapse on small screens
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      if (window.innerWidth < 1024) setCollapsedManual(true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [profileName, setProfileName] = useState<string>("");
  const [pwOpen, setPwOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Fecha o drawer mobile ao navegar
  useEffect(() => { setMobileNavOpen(false); }, [location.pathname, location.hash]);
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
      /servico|procediment|exame/.test(t) ? "/app/procedimentos" :
      /or[çc]amento/.test(t) ? "/app/orcamentos" :
      /plano|assinatura|cart[ãa]o|benef[ií]cio|contrato/.test(t) ? "/app/cartao-beneficios/contratos" :
      /modelo|template/.test(t) ? "/app/cartao-beneficios/modelos" :
      /relat[óo]rio.*cart[ãa]o|cart[ãa]o.*relat[óo]rio/.test(t) ? "/app/cartao-beneficios/relatorios" :
      /financ|caixa|conta|boleto/.test(t) ? "/app/financeiro" :
      /cl[ií]nica/.test(t) ? "/app/unidades" :
      /rateio|repasse/.test(t) ? "/app/medicos" :
      /equipe|usu[áa]rio|m[eé]dico|profissional|funcion[áa]rio/.test(t) ? "/app/equipe" :
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

  const clinicColor = useMemo(() => (
    modoTodas
      ? "#0f172a"
      : branding?.primary
        ? branding.primary
        : clinicaAtual
          ? corDaClinica(clinicaAtual.clinica.nome)
          : "#0f172a"
  ), [modoTodas, branding?.primary, clinicaAtual]);
  // Contraste automático da sidebar (texto branco) — só São Francisco de
  // Paula. Escurece a cor da clínica quando necessário para legibilidade
  // (WCAG AA); não altera --primary/--ring usados em botões no resto do app.
  const corSidebar = uxMelhorias ? garantirContrasteTextoBranco(clinicColor) : clinicColor;

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

  const subsystem = useSyncExternalStore(subscribeSubsystem, getSubsystem, () => null);
  const isChooser = location.pathname === "/app" || location.pathname === "/app/";
  const isEmbed = (() => {
    const s = (location as unknown as { search?: unknown }).search;
    if (s && typeof s === "object" && (s as Record<string, unknown>).embed != null) {
      return String((s as Record<string, unknown>).embed) === "1";
    }
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("embed") === "1";
    }
    return false;
  })();

  const initial = (userName || user?.email || "?").trim().charAt(0).toUpperCase();

  // Bypass exclusivo do Rodrigo: vê todas as telas criadas, sem filtro de
  // permissão nem de subsystem. Não afeta nenhum outro usuário.
  const isRodrigoFullAccess = (user?.email ?? "").toLowerCase() === "rodrigorss2301@gmail.com";

  const filteredByGroup = isRodrigoFullAccess
    ? navRows
    : subsystem
      ? navRows.filter((r) => SUBSYSTEMS[subsystem].groups.includes(r.label))
      : navRows;
  const scopedNavRows = filteredByGroup.map((row) => {
    if (row.label !== "Gestão") return row;
    const gestaoPessoasItems = new Set(["/app/funcionarios", "/app/cargos", "/app/setores"]);
    const items = !isRodrigoFullAccess && subsystem === "gestao-pessoas"
      ? row.items.filter((it) => !isParent(it) && gestaoPessoasItems.has(it.to))
      : row.items.filter((it) => isParent(it) || !gestaoPessoasItems.has(it.to));
    return { ...row, items };
  }).filter((row) => row.items.length > 0);
  const permissionFilteredRows = isRodrigoFullAccess
    ? scopedNavRows
    : scopedNavRows
    .map((row) => {
      const items = row.items
        .map((item) => {
          if (isParent(item)) {
            // Para itens pai (ex.: Nina), verifica a chave do próprio "to" base
            // dos filhos. Atualmente Nina compartilha o módulo "nina".
            const baseTo = item.children[0]?.to;
            if (baseTo && !leafAllowed(baseTo, allowedModules)) return null;
            return item;
          }
          return leafAllowed(item.to, allowedModules) ? item : null;
        })
        .filter((it): it is NavItem => it !== null);
      return { ...row, items };
    })
    .filter((row) => row.items.length > 0);
  // Feature flag por clínica: `atendimento_multiplo_disabled` remove o item
  // "Atendimento Múltiplo" do menu para a clínica atual.
  const { disabled: atendimentoMultiploDisabled } = useAtendimentoMultiploDisabled();
  const flagFilteredRows = atendimentoMultiploDisabled
    ? permissionFilteredRows
        .map((row) => ({
          ...row,
          items: row.items.filter(
            (it) => isParent(it) || it.to !== "/app/atendimento-multiplo",
          ),
        }))
        .filter((row) => row.items.length > 0)
    : permissionFilteredRows;
  // O perfil médico também deve respeitar a matriz configurada em Perfis de
  // Acesso. O escopo clínico do médico continua sendo aplicado pelos hooks e
  // consultas de cada módulo; não substitua as permissões por um menu fixo.
  // Ordem personalizada por usuário (arrastar e soltar) — só com a flag.
  // Itens sem posição salva (ex.: telas novas) vão para o fim do grupo,
  // mantendo a ordem padrão entre si.
  const visibleNavRows = useMemo(() => {
    if (!uxMelhorias) return flagFilteredRows;
    return flagFilteredRows.map((row) => {
      const salvos = menuOrdem[row.label];
      if (!salvos || salvos.length === 0) return row;
      const pos = new Map(salvos.map((k, i) => [k, i] as const));
      const items = [...row.items].sort((a, b) => {
        const ia = pos.get(navItemKey(a));
        const ib = pos.get(navItemKey(b));
        if (ia === undefined && ib === undefined) return 0;
        if (ia === undefined) return 1;
        if (ib === undefined) return -1;
        return ia - ib;
      });
      return { ...row, items };
    });
  }, [flagFilteredRows, menuOrdem, uxMelhorias]);

  // Solta um item do menu sobre outro do MESMO grupo: insere na posição do
  // alvo e salva a lista completa de chaves do grupo no perfil do usuário.
  const soltarItemMenu = (rowLabel: string, targetKey: string) => {
    const drag = dragMenu;
    setDragMenu(null);
    setDragOverKey(null);
    if (!drag || drag.row !== rowLabel || drag.key === targetKey) return;
    const row = visibleNavRows.find((r) => r.label === rowLabel);
    if (!row) return;
    const keys = row.items.map(navItemKey);
    const from = keys.indexOf(drag.key);
    const to = keys.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    keys.splice(to, 0, keys.splice(from, 1)[0]);
    void salvarMenuOrdem({ ...menuOrdem, [rowLabel]: keys });
  };

  // Props de arrastar/soltar de um item do menu desktop (só com a flag).
  const dragProps = (rowLabel: string, key: string) =>
    uxMelhorias
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            e.dataTransfer.effectAllowed = "move";
            setDragMenu({ row: rowLabel, key });
          },
          onDragOver: (e: React.DragEvent) => {
            if (!dragMenu || dragMenu.row !== rowLabel) return;
            e.preventDefault();
            if (dragOverKey !== key) setDragOverKey(key);
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            soltarItemMenu(rowLabel, key);
          },
          onDragEnd: () => {
            setDragMenu(null);
            setDragOverKey(null);
          },
        }
      : {};

  // Realce visual durante o arraste: item arrastado fica translúcido e o
  // alvo atual ganha um anel.
  const dragCls = (key: string) =>
    uxMelhorias && dragMenu
      ? cn(dragMenu.key === key && "opacity-50", dragOverKey === key && dragMenu.key !== key && "ring-1 ring-white/70")
      : "";
  const subsystemLabel = subsystem ? SUBSYSTEMS[subsystem].label : null;

  // Lista plana de rotas visíveis no menu (respeitando grupos abertos) para navegação por seta
  const flatNavLeaves = useMemo(() => {
    const leaves: string[] = [];
    for (const row of visibleNavRows) {
      const hideLabel = subsystem === "gestao-pessoas" && row.label === "RH";
      const open = collapsed || hideLabel ? true : (openGroups[row.label] ?? true);
      if (!open) continue;
      for (const item of row.items) {
        if (isParent(item)) {
          const subKey = `${row.label}::${item.label}`;
          const subOpen = collapsed ? true : (openGroups[subKey] ?? false);
          if (!subOpen) continue;
          for (const c of item.children) leaves.push(c.to);
        } else {
          leaves.push(item.to);
        }
      }
    }
    return leaves;
  }, [visibleNavRows, openGroups, collapsed, subsystem]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const navRoot = navScrollRef.current;
      const tgt = e.target as HTMLElement | null;
      if (tgt) {
        const tag = tgt.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tgt.isContentEditable) return;
        if (tgt.closest('[role="dialog"], [role="listbox"], [role="menu"], [role="combobox"]')) return;
      }
      const activeElement = typeof document !== "undefined" ? document.activeElement : null;
      const isUsingSidebar = !!(
        navRoot &&
        ((tgt && navRoot.contains(tgt)) || (activeElement instanceof HTMLElement && navRoot.contains(activeElement)))
      );
      if (!isUsingSidebar) return;
      if (flatNavLeaves.length === 0) return;
      const path = location.pathname;
      let idx = flatNavLeaves.reduce((best, to, i) => {
        const matches = path === to || (to !== "/app" && path.startsWith(`${to}/`));
        if (!matches) return best;
        return best < 0 || to.length > flatNavLeaves[best].length ? i : best;
      }, -1);
      if (idx < 0) return;
      const next = e.key === "ArrowDown"
        ? Math.min(flatNavLeaves.length - 1, idx + 1)
        : Math.max(0, idx - 1);
      if (next === idx) return;
      const now = Date.now();
      if (now - lastArrowNavAtRef.current < 120) return;
      lastArrowNavAtRef.current = now;
      e.preventDefault();
      navigate({ to: flatNavLeaves[next] });
      window.setTimeout(() => {
        const nextLink = Array.from(navRoot?.querySelectorAll<HTMLElement>("[data-nav-to]") ?? [])
          .find((el) => el.dataset.navTo === flatNavLeaves[next]);
        nextLink?.focus({ preventScroll: true });
      }, 0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flatNavLeaves, location.pathname, navigate]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const navRoot = navScrollRef.current;
      const el = navRoot?.querySelector<HTMLElement>('[data-nav-active="true"]');
      if (!navRoot || !el) return;
      const rootRect = navRoot.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const gap = 12;
      if (elRect.top < rootRect.top + gap) {
        navRoot.scrollTop -= rootRect.top + gap - elRect.top;
      } else if (elRect.bottom > rootRect.bottom - gap) {
        navRoot.scrollTop += elRect.bottom - (rootRect.bottom - gap);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname, collapsed, openGroups]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Entrando…
      </div>
    );
  }

  // Guarda de rota: bloqueia acesso quando o módulo da rota atual não é
  // permitido pelo perfil do usuário. Admin (allowedModules === null) passa
  // por padrão. Enquanto as permissões carregam, mostramos o próprio outlet
  // para evitar flash de "Acesso negado".
  const currentModulo = moduloDaRota(location.pathname);
  const rotaPermitida = (() => {
    if (allowedModules === null) return true;
    if (currentModulo === null) return true;
    if (typeof currentModulo !== "string") return false;
    if (allowedModules.has(currentModulo)) return true;
    // Submódulos (ex.: financeiro-estorno) herdam do pai quando não têm
    // configuração explícita salva no perfil. Se a linha existir no banco
    // (configuredModules contém a chave), respeitamos o valor — mesmo que
    // seja "none" — para permitir bloqueio granular.
    const pai = SUBMODULE_PARENT[currentModulo];
    if (pai && !configuredModules?.has(currentModulo) && allowedModules.has(pai)) {
      return true;
    }
    // Caminho inverso: usuário está na rota-pai (ex.: /app/financeiro) e
    // não tem acesso ao módulo pai, mas TEM acesso a pelo menos um
    // submódulo dele. Liberamos a entrada no layout pai — o submenu já
    // esconde as abas às quais ele não tem acesso.
    const temSubPermitido = Object.entries(SUBMODULE_PARENT).some(
      ([sub, parent]) => parent === currentModulo && allowedModules.has(sub),
    );
    if (temSubPermitido) return true;
    return false;
  })();
  const guardedOutlet = permsLoading
    ? <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">Carregando permissões…</div>
    : rotaPermitida
      ? <Outlet />
      : <SemPermissao modulo={currentModulo ?? undefined} />;

  if (isEmbed) {
    return (
      <div className="h-screen w-full overflow-auto bg-background" style={{ background: "var(--surface-cream)" }}>
        {guardedOutlet}
      </div>
    );
  }

  return (
    <div className={cn("flex bg-background overflow-hidden", uxMelhorias ? "h-[100dvh]" : "h-screen")}>
      {!isChooser && (
      <aside
        onMouseEnter={uxMelhorias ? () => setHoverSidebar(true) : undefined}
        onMouseLeave={uxMelhorias ? () => setHoverSidebar(false) : undefined}
        className={cn(
          "transition-all duration-200 shrink-0 text-white overflow-hidden hidden md:flex flex-col",
          uxMelhorias ? "h-[100dvh]" : "h-screen",
          collapsed ? "w-16" : "w-56 2xl:w-64",
        )}
        style={{ backgroundColor: corSidebar }}
      >
        <div className="px-3 py-3 border-b border-white/10 flex items-center justify-between gap-2">
          <Link to="/app" className="flex items-center gap-2 min-w-0">
            <Activity className="h-5 w-5 shrink-0" />
            {!collapsed && <span className="font-semibold tracking-tight truncate">ClinicaOS</span>}
          </Link>
          {/* No modo hover o botão vira "fixar aberto" e só aparece com o
              menu expandido — recolhido, basta passar o mouse. */}
          {uxMelhorias ? (
            !collapsed && (
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/10 hover:text-white h-7 w-7 p-0 shrink-0"
                onClick={() => setFixadoAberto((v) => !v)}
                title={fixadoAberto ? "Desafixar (expandir só ao passar o mouse)" : "Fixar menu aberto"}
                aria-pressed={fixadoAberto}
              >
                {fixadoAberto ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              </Button>
            )
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10 hover:text-white h-7 w-7 p-0 shrink-0"
              onClick={() => setCollapsedManual((v) => !v)}
              title={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          )}
        </div>
        <nav ref={navScrollRef} className="flex-1 px-2 py-3 space-y-5 overflow-y-auto sidebar-scroll">
          {visibleNavRows.map((row) => {
            const leafIsActive = (to: string, hash?: string) => {
              const pathOk = location.pathname === to || (to !== "/app" && location.pathname.startsWith(to));
              if (!pathOk) return false;
              if (!hash) return true;
              return (location.hash ?? "").replace(/^#/, "") === hash;
            };
            const itemHasActive = (it: NavItem): boolean => isParent(it) ? it.children.some((c) => leafIsActive(c.to, c.hash)) : leafIsActive(it.to);
            const groupHasActive = row.items.some(itemHasActive);
            const hideLabel = subsystem === "gestao-pessoas" && row.label === "RH";
            const open = collapsed || hideLabel ? true : (openGroups[row.label] ?? true);
            return (
              <div key={row.label} className="space-y-1">
                {!collapsed && !hideLabel && (
                  <button
                    type="button"
                    onClick={() => setOpenGroups((prev) => ({ ...prev, [row.label]: !(prev[row.label] ?? true) }))}
                    className="w-full flex items-center justify-between px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70 hover:opacity-100 transition-opacity rounded-md"
                    aria-expanded={open}
                  >
                    <span>{row.label}</span>
                    <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-0" : "-rotate-90"}`} />
                  </button>
                )}
                {open && row.items.map((item) => {
                  if (isParent(item)) {
                    const subActive = item.children.some((c) => leafIsActive(c.to, c.hash));
                    const subKey = `${row.label}::${item.label}`;
                    const subOpen = collapsed ? true : (openGroups[subKey] ?? false);
                    return (
                      <div key={subKey} className={cn("space-y-1 rounded-md", dragCls(navItemKey(item)))} {...dragProps(row.label, navItemKey(item))}>
                        {collapsed ? (
                          <div className="flex justify-center py-2" title={item.label}>
                            <item.icon className="h-4 w-4 shrink-0 opacity-80" />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setOpenGroups((prev) => ({ ...prev, [subKey]: !(prev[subKey] ?? false) }))}
                            className={`w-full flex items-center gap-2.5 rounded-full px-3 py-2 text-sm font-medium transition-all ${subActive ? "bg-white/10 text-white" : "text-white/85 hover:bg-white/10 hover:text-white"}${hoverScaleCls}`}
                            aria-expanded={subOpen}
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span className="truncate flex-1 text-left">{item.label}</span>
                            <ChevronDown className={`h-3 w-3 transition-transform ${subOpen ? "rotate-0" : "-rotate-90"}`} />
                          </button>
                        )}
                        {subOpen && item.children.map((child) => {
                          const active = leafIsActive(child.to, child.hash);
                          const linkKey = `${child.to}#${child.hash ?? ""}`;
                          const openInNewTab = false;
                          const href = `${child.to}${child.hash ? `#${child.hash}` : ""}`;
                          if (openInNewTab) {
                            return (
                              <a
                                key={linkKey}
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={collapsed ? child.label : undefined}
                                data-nav-to={child.to}
                                className={`relative flex items-center gap-2.5 rounded-full ${collapsed ? "px-2 justify-center" : "pl-8 pr-3"} py-2 text-sm font-medium transition-all text-white/85 hover:bg-white/10 hover:text-white${hoverScaleCls}`}
                              >
                                <child.icon className="h-4 w-4 shrink-0" />
                                {!collapsed && <span className="truncate">{child.label}</span>}
                              </a>
                            );
                          }
                          return (
                            <a
                              key={linkKey}
                              href={href}
                              title={collapsed ? child.label : undefined}
                              data-nav-to={child.to}
                              data-nav-active={active ? "true" : undefined}
                              aria-current={uxMelhorias && active ? "page" : undefined}
                              onMouseEnter={() => preCarregar(child.to)}
                              onClick={(event) => {
                                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                                event.preventDefault();
                                irPara(href);
                              }}
                              className={`relative flex items-center gap-2.5 rounded-full ${collapsed ? "px-2 justify-center" : "pl-8 pr-3"} py-2 text-sm font-medium transition-all ${
                                active
                                  ? "bg-white text-slate-900 shadow-sm"
                                  : "text-white/85 hover:bg-white/10 hover:text-white"
                              }${hoverScaleCls}`}
                            >
                              <child.icon className="h-4 w-4 shrink-0" />
                              {!collapsed && <span className="truncate">{child.label}</span>}
                            </a>
                          );
                        })}
                      </div>
                    );
                  }
                  const aliases: string[] = (item as { aliases?: string[] }).aliases ?? [];
                  const active = location.pathname === item.to ||
                    (item.to !== "/app" && location.pathname.startsWith(item.to)) ||
                    aliases.some((a) => location.pathname === a || location.pathname.startsWith(`${a}/`));
                  const href = item.to;
                  return (
                    <a
                      key={item.to}
                      href={href}
                      title={collapsed ? item.label : undefined}
                      data-nav-to={item.to}
                      data-nav-active={active ? "true" : undefined}
                      aria-current={uxMelhorias && active ? "page" : undefined}
                      onMouseEnter={() => preCarregar(item.to)}
                      onClick={(event) => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                        event.preventDefault();
                        irPara(href);
                      }}
                      {...dragProps(row.label, navItemKey(item))}
                      className={cn(
                        `relative flex items-center gap-2.5 rounded-full ${collapsed ? "px-2 justify-center" : "px-3"} py-2 text-sm font-medium transition-all ${
                          active
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-white/85 hover:bg-white/10 hover:text-white"
                        }${hoverScaleCls}`,
                        dragCls(navItemKey(item)),
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </a>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </aside>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-[50px] bg-card/80 backdrop-blur border-b flex items-center gap-2 px-3 sm:px-5">
          {!isChooser && (
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden h-9 w-9 -ml-1 rounded-md flex items-center justify-center hover:bg-muted shrink-0"
              aria-label="Abrir menu"
              title="Menu"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
          )}
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
            <p className="hidden md:block text-sm font-medium truncate max-w-[160px]" title={user?.email ?? undefined}>{userName}</p>
          </div>
          {clinicaAtual && logoDaClinica(clinicaAtual.clinica.nome) && (
            <div className="bg-white rounded-lg shadow-sm border px-2 py-1 hidden sm:flex items-center justify-center shrink-0">
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
              <SelectTrigger className="w-[120px] sm:w-[180px] md:w-[240px] max-w-full min-w-0 h-8 text-xs shrink">
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
          <div className="flex-1 flex justify-center px-2 min-w-0">
            <UniversalSearchBar />
          </div>
          <div className="flex items-center gap-2">
            {uxMelhorias && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 rounded-full"
                title={theme.isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
                aria-label={theme.isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
                onClick={() => theme.set(theme.isDark ? "light" : "dark")}
              >
                {theme.isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex h-9 w-9 p-0 rounded-full"
              title="Atalhos de teclado (?)"
              onClick={() => {
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
              }}
            >
              <span className="text-base font-semibold">?</span>
            </Button>
            <EstornosBell />
          </div>
        </header>
        <main
          key={uxMelhorias ? location.pathname : "static"}
          className={cn(
            "flex-1 px-3 pt-1 sm:px-4 sm:pt-1.5 lg:px-6 lg:pt-2 overflow-auto min-w-0",
            // Espaço extra embaixo no mobile para não ficar atrás da bottom nav.
            uxMelhorias ? "pb-20 sm:pb-20 md:pb-4 lg:pb-6" : "pb-3 sm:pb-4 lg:pb-6",
            uxMelhorias && "animate-in fade-in duration-200 motion-reduce:animate-none",
          )}
          style={{ background: "var(--surface-cream)" }}
        >
          {guardedOutlet}
        </main>
      </div>
      {pwOpen && (
        <Suspense fallback={null}>
          <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
        </Suspense>
      )}
      <KeyboardShortcuts />
      {!isChooser && (
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent
            side="left"
            className="w-[280px] p-0 border-0 text-white overflow-y-auto md:hidden sidebar-scroll"
            style={{ backgroundColor: corSidebar }}
          >
            <SheetHeader className="px-4 py-3 border-b border-white/10 text-left">
              <SheetTitle className="text-white flex items-center gap-2 text-base">
                <Activity className="h-5 w-5" />
                ClinicaOS
              </SheetTitle>
            </SheetHeader>
            <nav className="px-2 py-3 space-y-4">
              {visibleNavRows.map((row) => (
                <div key={row.label} className="space-y-1">
                  <div className="px-3 text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70">
                    {row.label}
                  </div>
                  {row.items.map((item) => {
                    if (isParent(item)) {
                      return (
                        <div key={item.label} className="space-y-0.5">
                          <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white/70">
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </div>
                          {item.children.map((child) => {
                            const href = `${child.to}${child.hash ? `#${child.hash}` : ""}`;
                            return (
                              <a
                                key={`${child.to}#${child.hash ?? ""}`}
                                href={href}
                                onClick={(e) => {
                                  if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                                  e.preventDefault();
                                  setMobileNavOpen(false);
                                  irPara(href);
                                }}
                                className="flex items-center gap-2.5 pl-9 pr-3 py-2 rounded-full text-sm text-white/85 hover:bg-white/10 hover:text-white"
                              >
                                <child.icon className="h-4 w-4 shrink-0" />
                                <span className="truncate">{child.label}</span>
                              </a>
                            );
                          })}
                        </div>
                      );
                    }
                    const active =
                      location.pathname === item.to ||
                      (item.to !== "/app" && location.pathname.startsWith(item.to));
                    return (
                      <a
                        key={item.to}
                        href={item.to}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                          e.preventDefault();
                          setMobileNavOpen(false);
                          irPara(item.to);
                        }}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-full text-sm font-medium ${
                          active
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-white/85 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </a>
                    );
                  })}
                </div>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      )}
      {!isChooser && uxMelhorias && (
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 pb-[env(safe-area-inset-bottom)] bg-card border-t flex items-stretch"
          aria-label="Navegação principal"
        >
          {BOTTOM_NAV_ITENS.map(({ to, label, Icon }) => {
            const active = location.pathname === to || location.pathname.startsWith(`${to}/`);
            return (
              <a
                key={to}
                href={to}
                aria-current={active ? "page" : undefined}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                  e.preventDefault();
                  irPara(to);
                }}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </a>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground"
          >
            <MenuIcon className="h-5 w-5" />
            Mais
          </button>
        </nav>
      )}
    </div>
  );
}
