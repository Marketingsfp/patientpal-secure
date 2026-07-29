import { Link, Outlet, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Activity, Building2, Users, LayoutDashboard, LogOut, Stethoscope, Bell, DollarSign, CalendarDays, ClipboardList, MessageCircle, Target, Clock, BookOpen, Workflow, FileText, CreditCard, Brain, FileHeart, FlaskConical, BellRing, ShieldCheck, BarChart3, Wallet, ChevronLeft, ChevronRight, ChevronDown, Search, HeartPulse, Contact, ConciergeBell, Briefcase, MapPin, Palmtree, GraduationCap, Sparkles, Filter, Send, Megaphone, KeyRound, BadgeCheck, LayoutGrid, Zap, Coffee, Play, Eye, ArrowRightLeft, Inbox, FileBarChart2, Moon, Sun, Pin, PinOff, Menu as MenuIcon } from "lucide-react";
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
import { TTSToggle } from "@/components/tts/tts-toggle";
import { useClinicFeatureFlag } from "@/hooks/use-clinic-feature-flag";
import { useTheme } from "@/hooks/use-theme";
import { useMenuOrdem } from "@/hooks/use-menu-ordem";
import { HOVER_SCALE_CLASSES } from "@/lib/menu-hover";
import { garantirContrasteTextoBranco } from "@/lib/contrast";
import { cn } from "@/lib/utils";
import { useAtendimentoMultiploDisabled } from "@/hooks/use-atendimento-multiplo-disabled";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// ========== COMPONENTES LAZY ==========
const VoiceInput = lazy(() => import("@/components/voice-input").then((m) => ({ default: m.VoiceInput })));
const ChangePasswordDialog = lazy(() =>
  import("@/components/change-password-dialog").then((m) => ({ default: m.ChangePasswordDialog }))
);

// ========== TIPOS E CONSTANTES ==========
type NavLeaf = { to: string; label: string; icon: typeof LayoutDashboard; hash?: string; aliases?: ReadonlyArray<string> };
type NavParent = { label: string; icon: typeof LayoutDashboard; children: ReadonlyArray<NavLeaf> };
type NavItem = NavLeaf | NavParent;
const isParent = (it: NavItem): it is NavParent => "children" in it;

const navItemKey = (it: NavItem): string =>
  isParent(it) ? `grupo:${it.label}` : `${it.to}${it.hash ? `#${it.hash}` : ""}`;

// Bottom nav mobile
const BOTTOM_NAV_ITENS: ReadonlyArray<{ to: string; label: string; Icon: typeof CalendarDays }> = [
  { to: "/app/agenda", label: "Agenda", Icon: CalendarDays },
  { to: "/app/clientes", label: "Clientes", Icon: Users },
  { to: "/app/caixa", label: "Caixa", Icon: Wallet },
  { to: "/app/recepcao", label: "Recepção", Icon: ConciergeBell },
];

const ROUTE_TO_MODULE = SHARED_ROUTE_TO_MODULE;

function leafAllowed(to: string, allowed: Set<string> | null): boolean {
  if (!allowed) return true;
  const mod = ROUTE_TO_MODULE[to];
  if (mod === null) return true;
  if (mod === undefined) return false;
  if (allowed.has(mod)) return true;
  const temSub = Object.entries(SUBMODULE_PARENT).some(
    ([sub, parent]) => parent === mod && allowed.has(sub),
  );
  return temSub;
}

// ========== MENU ==========
const navRows: ReadonlyArray<{ label: string; items: ReadonlyArray<NavItem> }> = [
  {
    label: "Atendimento",
    items: [
      { to: "/app/agenda", label: "Agenda", icon: CalendarDays },
      { to: "/app/checkin", label: "Check-in", icon: BadgeCheck },
      { to: "/app/caixa", label: "Caixa", icon: Wallet },
      { to: "/app/triagem-enfermagem", label: "Triagem - Enfermagem", icon: HeartPulse },
    ],
  },
  {
    label: "Pacientes",
    items: [
      { to: "/app/clientes", label: "Clientes", icon: Contact },
      { to: "/app/fluxo", label: "Fluxo do paciente", icon: Workflow },
      { to: "/app/orcamentos", label: "Orçamentos", icon: FileText },
      { to: "/app/cartao-beneficios/contratos", label: "Cartão Benefícios", icon: CreditCard },
      { to: "/app/documentos", label: "Documentos do paciente", icon: FileText },
      { to: "/app/anamneses", label: "Anamneses", icon: FileHeart },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { to: "/app/financeiro", label: "Financeiro", icon: DollarSign },
      { to: "/app/nfse", label: "NFS-e", icon: FileText },
      { to: "/app/boletos", label: "Boletos", icon: FileText },
      { to: "/app/contratos", label: "Contratos de assinatura", icon: FileText },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { to: "/app/equipe", label: "Médicos", icon: Users },
      { to: "/app/perfis", label: "Perfis", icon: KeyRound },
      { to: "/app/especialidades", label: "Serviços", icon: Stethoscope, aliases: ["/app/tipos-servico", "/app/procedimentos"] },
      { to: "/app/disponibilidades", label: "Horários médicos", icon: Clock },
      { to: "/app/prontuario-modelos", label: "Modelos de Prontuário", icon: FileHeart },
      { to: "/app/unidades", label: "Unidades", icon: MapPin },
      { to: "/app/modelos-documentos", label: "Modelos de Documentos", icon: FileText },
      { to: "/app/estoque", label: "Estoque", icon: LayoutGrid },
      { to: "/app/clientes/duplicados", label: "Duplicados / Merge", icon: Users },
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
    label: "Recursos Humanos",
    items: [
      { to: "/app/hr-ponto", label: "Marcação de ponto", icon: GraduationCap },
      { to: "/app/hr-contratos", label: "Funcionários", icon: FileText },
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
      { to: "/app/configuracoes/nfse", label: "Configuração NFS-e", icon: FileText },
      { to: "/app/relatorios", label: "Relatórios", icon: BarChart3 },
      { to: "/app/relatorio-diario", label: "Relatório diário", icon: BarChart3 },
      { to: "/app/auditoria", label: "Segurança & Compliance", icon: ShieldCheck },
      { to: "/app/setores", label: "Setores", icon: Building2 },
      { to: "/app/integration-secrets", label: "Integrações", icon: KeyRound },
      { to: "/app/lgpd", label: "LGPD", icon: ShieldCheck },
    ],
  },
  {
    label: "Configurações",
    items: [
      { to: "/app/configuracoes/painel-totem", label: "Painel & Totem", icon: KeyRound },
      { to: "/app/configuracoes/voz", label: "Voz & Áudio (TTS)", icon: KeyRound },
      { to: "/app/clinicas", label: "Clínicas", icon: Building2 },
      { to: "/app/backups", label: "Backups", icon: ShieldCheck },
    ],
  },
];

// ========== FUNÇÕES AUXILIARES ==========
function corDaClinica(nome?: string): string {
  const n = (nome ?? "").toLowerCase();
  if (n.includes("são francisco") || n.includes("sao francisco")) return "#006634";
  if (n.includes("menino jesus")) return "#00008B";
  if (n.includes("consulta hoje")) return "#6D28D9";
  return "hsl(var(--muted-foreground))";
}

function logoDaClinica(nome?: string): string | null {
  const n = (nome ?? "").toLowerCase();
  if (n.includes("são francisco") || n.includes("sao francisco")) return logoSaoFrancisco;
  if (n.includes("menino jesus")) return logoMeninoJesus;
  if (n.includes("consulta hoje")) return logoConsultaHoje;
  return null;
}

// ========== COMPONENTE PRINCIPAL ==========
export function AppShell() {
  const { user, signOut, loading } = useAuth();
  const { memberships, clinicaAtual, setClinicaAtual, modoTodas, setModoTodas, branding } = useClinica();
  const { allowed: allowedModules, configured: configuredModules, loading: permsLoading } = usePermissoes();
  const { enabled: menuHoverScale } = useClinicFeatureFlag("menu_hover_scale");
  const { enabled: uxMelhorias } = useClinicFeatureFlag("ux_melhorias");
  const theme = useTheme(uxMelhorias);
  const { ordem: menuOrdem, salvar: salvarMenuOrdem } = useMenuOrdem(uxMelhorias);
  const { disabled: atendimentoMultiploDisabled } = useAtendimentoMultiploDisabled();

  const location = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const navScrollRef = useRef<HTMLElement | null>(null);
  const queryClient = useQueryClient();

  // ========== ESTADOS ==========
  const [collapsedManual, setCollapsedManual] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (window.innerWidth < 1024) return true;
    return window.localStorage.getItem("appshell:collapsed") === "1";
  });
  const [hoverSidebar, setHoverSidebar] = useState(false);
  const [fixadoAberto, setFixadoAberto] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("appshell:menu-fixado") === "1";
  });
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(window.localStorage.getItem("appshell:openGroups") ?? "{}"); } catch { return {}; }
  });
  const [menuSearch, setMenuSearch] = useState("");
  const [dragMenu, setDragMenu] = useState<{ row: string; key: string } | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileName, setProfileName] = useState<string>("");
  const [pwOpen, setPwOpen] = useState(false);
  const lastArrowNavAtRef = useRef(0);

  // ========== EFEITOS ==========
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("appshell:menu-fixado", fixadoAberto ? "1" : "0");
    }
  }, [fixadoAberto]);
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
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      if (window.innerWidth < 1024) setCollapsedManual(true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
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
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [loading, navigate, user]);

  // ========== DADOS DO MENU ==========
  const collapsed = uxMelhorias ? (!fixadoAberto && !hoverSidebar) : collapsedManual;

  const subsystem = useSyncExternalStore(subscribeSubsystem, getSubsystem, () => null);
  const isRodrigoFullAccess = (user?.email ?? "").toLowerCase() === "rodrigorss2301@gmail.com";
  const isAdminFullMenu = clinicaAtual?.role === "admin";
  const bypassSubsystem = isRodrigoFullAccess || isAdminFullMenu;

  const filteredByGroup = bypassSubsystem
    ? navRows
    : subsystem
      ? navRows.filter((r) => SUBSYSTEMS[subsystem].groups.includes(r.label))
      : navRows;
  const scopedNavRows = filteredByGroup.map((row) => {
    if (row.label !== "Gestão") return row;
    const gestaoPessoasItems = new Set(["/app/cargos", "/app/setores"]);
    const items = !bypassSubsystem && subsystem === "gestao-pessoas"
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

  // 🔥 FILTRO DE BUSCA NO MENU
  const filteredNavRows = useMemo(() => {
    const term = menuSearch.trim().toLowerCase();
    if (!term) return visibleNavRows;
    return visibleNavRows
      .map((row) => {
        const items = row.items
          .map((item) => {
            if (isParent(item)) {
              const matchParent = item.label.toLowerCase().includes(term);
              const children = item.children.filter((c) =>
                c.label.toLowerCase().includes(term) ||
                (c.aliases?.some((a) => a.toLowerCase().includes(term)) ?? false)
              );
              if (matchParent) {
                return { ...item, children: item.children };
              }
              if (children.length > 0) {
                return { ...item, children };
              }
              return null;
            }
            const matchLabel = item.label.toLowerCase().includes(term);
            const matchAlias = (item.aliases ?? []).some((a) => a.toLowerCase().includes(term));
            return (matchLabel || matchAlias) ? item : null;
          })
          .filter((it): it is NavItem => it !== null);
        return { ...row, items };
      })
      .filter((row) => row.items.length > 0);
  }, [visibleNavRows, menuSearch]);

  // ========== FUNÇÕES ==========
  const irPara = (href: string) => {
    if (uxMelhorias) {
      router.history.push(href);
      return;
    }
    window.location.assign(href);
  };

  const preCarregar = (href: string) => {
    if (!uxMelhorias) return;
    const to = href.split("#")[0];
    void router.preloadRoute({ to } as Parameters<typeof router.preloadRoute>[0]).catch(() => {});
    if (to === "/app/clientes" && clinicaAtual?.clinica_id) {
      const clinicaId = clinicaAtual.clinica_id;
      void queryClient.prefetchQuery({
        queryKey: ["clientes-total", clinicaId],
        staleTime: 60_000,
        queryFn: async () => {
          const { count, error } = await supabase
            .from("pacientes")
            .select("id", { count: "estimated", head: true })
            .eq("clinica_id", clinicaId);
          if (error) throw error;
          return count ?? 0;
        },
      }).catch(() => {});
      void queryClient.prefetchQuery({
        queryKey: ["clientes-lista", clinicaId, "", 0],
        staleTime: 60_000,
        queryFn: async () => {
          const { data, error } = await supabase.rpc("buscar_pacientes", {
            _clinica_id: clinicaId,
            _termo: "",
            _limit: 500,
            _offset: 0,
          } as never);
          if (error) throw error;
          const rows = (data ?? []) as unknown[];
          return { items: rows, atingiuTeto: rows.length >= 500 };
        },
      }).catch(() => {});
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login", replace: true });
  };

  const userName = profileName
    || (user?.user_metadata?.full_name as string | undefined)
    || (user?.user_metadata?.name as string | undefined)
    || (user?.email ? user.email.split("@")[0] : "");

  const initial = (userName || user?.email || "?").trim().charAt(0).toUpperCase();

  const clinicColor = useMemo(() => (
    modoTodas
      ? "#0f172a"
      : branding?.primary
        ? branding.primary
        : clinicaAtual
          ? corDaClinica(clinicaAtual.clinica.nome)
          : "#0f172a"
  ), [modoTodas, branding?.primary, clinicaAtual]);
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

  const flatNavLeaves = useMemo(() => {
    const leaves: string[] = [];
    for (const row of filteredNavRows) {
      const hideLabel = subsystem === "gestao-pessoas" && row.label === "Recursos Humanos";
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
  }, [filteredNavRows, openGroups, collapsed, subsystem]);

  // ========== DRAG & DROP ==========
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

  const dragCls = (key: string) =>
    uxMelhorias && dragMenu
      ? cn(dragMenu.key === key && "opacity-50", dragOverKey === key && dragMenu.key !== key && "ring-1 ring-white/70")
      : "";

  const hoverScaleCls = menuHoverScale ? ` ${HOVER_SCALE_CLASSES}` : "";
  const leafIsActive = (to: string, hash?: string) => {
    const pathOk = location.pathname === to || (to !== "/app" && location.pathname.startsWith(to));
    if (!pathOk) return false;
    if (!hash) return true;
    return (location.hash ?? "").replace(/^#/, "") === hash;
  };

  const currentModulo = moduloDaRota(location.pathname);
  const rotaPermitida = (() => {
    if (allowedModules === null) return true;
    if (currentModulo === null) return true;
    if (typeof currentModulo !== "string") return false;
    if (allowedModules.has(currentModulo)) return true;
    const pai = SUBMODULE_PARENT[currentModulo];
    if (pai && !configuredModules?.has(currentModulo) && allowedModules.has(pai)) {
      return true;
    }
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

  // ========== RENDERIZAÇÃO ==========
  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Entrando…
      </div>
    );
  }

  if (isEmbed) {
    return (
      <div className="h-screen w-full overflow-auto bg-background" style={{ background: "var(--surface-cream)" }}>
        {guardedOutlet}
      </div>
    );
  }

  return (
    <div className={cn("flex bg-background overflow-hidden", uxMelhorias ? "h-[100dvh]" : "h-screen")}>
      {/* ========== SIDEBAR ========== */}
      {!isChooser && (
  <aside
    className={cn(
      "transition-all duration-200 shrink-0 text-white overflow-hidden hidden md:flex flex-col h-[100dvh]",
      collapsedManual ? "w-16" : "w-56 2xl:w-64",
    )}
    style={{ backgroundColor: corSidebar }}
  >
    {/* CABEÇALHO */}
    <div className="px-3 py-3 border-b border-white/10 flex items-center justify-between gap-2 shrink-0">
      <Link to="/app" className="flex items-center gap-2 min-w-0">
        <Activity className="h-5 w-5 shrink-0" />
        {!collapsedManual && <span className="font-semibold tracking-tight truncate">ClínicaOS</span>}
      </Link>
      <Button
        variant="ghost"
        size="sm"
        className="text-white hover:bg-white/10 hover:text-white h-7 w-7 p-0 shrink-0"
        onClick={() => setCollapsedManual((v) => !v)}
        title={collapsedManual ? "Expandir menu" : "Recolher menu"}
      >
        {collapsedManual ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </Button>
    </div>

    {/* NAVEGAÇÃO */}
    <nav ref={navScrollRef} className="flex-1 px-2 py-3 space-y-5 overflow-y-auto sidebar-scroll">
      {filteredNavRows.map((row) => {
        const hideLabel = subsystem === "gestao-pessoas" && row.label === "Recursos Humanos";
        const open = collapsedManual || hideLabel ? true : (openGroups[row.label] ?? true);
        return (
          <div key={row.label} className="space-y-1">
            {!collapsedManual && !hideLabel && (
              <button
                type="button"
                onClick={() => setOpenGroups((prev) => ({ ...prev, [row.label]: !(prev[row.label] ?? true) }))}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white/50 hover:text-white/90 transition-colors rounded-md"
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
                const subOpen = collapsedManual ? true : (openGroups[subKey] ?? false);
                return (
                  <div key={subKey} className={cn("space-y-1 rounded-md", dragCls(navItemKey(item)))} {...dragProps(row.label, navItemKey(item))}>
                    {collapsedManual ? (
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
                      const href = `${child.to}${child.hash ? `#${child.hash}` : ""}`;
                      return (
                        <a
                          key={linkKey}
                          href={href}
                          title={collapsedManual ? child.label : undefined}
                          data-nav-to={child.to}
                          data-nav-active={active ? "true" : undefined}
                          aria-current={uxMelhorias && active ? "page" : undefined}
                          onMouseEnter={() => preCarregar(child.to)}
                          onClick={(event) => {
                            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                            event.preventDefault();
                            irPara(href);
                          }}
                          className={`relative flex items-center gap-2.5 rounded-full ${collapsedManual ? "px-2 justify-center" : "pl-8 pr-3"} py-2 text-sm font-medium transition-all ${
                            active
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-white/85 hover:bg-white/10 hover:text-white"
                          }${hoverScaleCls}`}
                        >
                          <child.icon className="h-4 w-4 shrink-0" />
                          {!collapsedManual && <span className="truncate">{child.label}</span>}
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
                  title={collapsedManual ? item.label : undefined}
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
                    `relative flex items-center gap-2.5 rounded-full ${collapsedManual ? "px-2 justify-center" : "px-3"} py-2 text-sm font-medium transition-all ${
                      active
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-white/85 hover:bg-white/10 hover:text-white"
                    }${hoverScaleCls}`,
                    dragCls(navItemKey(item)),
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsedManual && <span className="truncate">{item.label}</span>}
                </a>
              );
            })}
          </div>
        );
      })}
    </nav>

    {/* CAMPO DE BUSCA (rodapé) */}
    <div className="px-3 py-2 border-t border-white/10 mt-auto shrink-0">
      <Input
        type="text"
        placeholder="Buscar no menu…"
        value={menuSearch}
        onChange={(e) => setMenuSearch(e.target.value)}
        className="h-8 text-xs bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-white/30 focus-visible:ring-offset-0"
      />
    </div>
  </aside>
)}

      {/* ========== CONTEÚDO PRINCIPAL ========== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* HEADER */}
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
            <TTSToggle />
          </div>
        </header>

        {/* MAIN */}
        <main
          key={uxMelhorias ? location.pathname : "static"}
          className={cn(
            "flex-1 px-3 pt-1 sm:px-4 sm:pt-1.5 lg:px-6 lg:pt-2 overflow-auto min-w-0",
            uxMelhorias ? "pb-20 sm:pb-20 md:pb-4 lg:pb-6" : "pb-3 sm:pb-4 lg:pb-6",
            uxMelhorias && "animate-in fade-in duration-200 motion-reduce:animate-none",
          )}
          style={{ background: "var(--surface-cream)" }}
        >
          {guardedOutlet}
        </main>
      </div>

      {/* ========== DIALOGS ========== */}
      {pwOpen && (
        <Suspense fallback={null}>
          <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
        </Suspense>
      )}
      <KeyboardShortcuts />

      {/* ========== MOBILE DRAWER ========== */}
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
                ClínicaOS
              </SheetTitle>
            </SheetHeader>
            <nav className="px-2 py-3 space-y-4">
              {filteredNavRows.map((row) => (
                <div key={row.label} className="space-y-1">
                  <div className="px-3 text-[10px] font-bold uppercase tracking-widest text-white/50">
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
            {/* 🔥 Busca no drawer mobile também */}
            <div className="px-3 py-2 border-t border-white/10 mt-auto">
              <Input
                type="text"
                placeholder="Buscar no menu…"
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                className="h-8 text-xs bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-white/30 focus-visible:ring-offset-0"
              />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* ========== BOTTOM NAV MOBILE ========== */}
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