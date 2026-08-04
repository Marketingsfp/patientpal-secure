import { Link, Outlet, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Activity, Building2, Users, LayoutDashboard, LogOut, Stethoscope, Bell, DollarSign, CalendarDays, ClipboardList, MessageCircle, Target, Clock, BookOpen, Workflow, FileText, CreditCard, Brain, FileHeart, FlaskConical, BellRing, ShieldCheck, BarChart3, Wallet, ChevronLeft, ChevronRight, ChevronDown, Search, HeartPulse, Contact, ConciergeBell, Briefcase, MapPin, Palmtree, GraduationCap, Sparkles, Filter, Send, Megaphone, KeyRound, BadgeCheck, LayoutGrid, Gift, Zap, Coffee, Play, Eye, ArrowRightLeft, Inbox, HandCoins, Menu as MenuIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { useMedicoContext } from "@/hooks/use-medico-context";
import { usePermissoes } from "@/hooks/use-permissoes";
import { supabase } from "@/integrations/supabase/client";
import { getSubsystem, setSubsystem, subscribeSubsystem, SUBSYSTEMS } from "@/lib/subsystem";
import logoSaoFrancisco from "@/assets/logo-sao-francisco.png";
import logoMeninoJesus from "@/assets/logo-menino-jesus.png";
import logoConsultaHoje from "@/assets/logo-consulta-hoje.png";
import { EstornosBell } from "@/components/EstornosBell";
import { UniversalSearchBar } from "@/components/universal-search-bar";
import { MenuV2 } from "@/components/menu-v2/menu-v2";
import { useMenuV2Flag } from "@/hooks/use-menu-prefs";
import type { PerfilKey } from "@/components/menu-v2/menu-catalog";
import { Input } from "@/components/ui/input"; 
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const VoiceInput = lazy(() => import("@/components/voice-input").then((m) => ({ default: m.VoiceInput })));
const ChangePasswordDialog = lazy(() =>
  import("@/components/change-password-dialog").then((m) => ({ default: m.ChangePasswordDialog }))
);

// ========== FUNÇÕES AUXILIARES ==========
function corDaClinica(nome?: string): string {
  const n = (nome ?? "").toLowerCase();
  if (n.includes("são francisco") || n.includes("sao francisco")) return "#006634";
  if (n.includes("menino jesus")) return "#00008B"; // Azul melhorado e mais suave
  if (n.includes("consulta hoje")) return "#6D28D9";
  return "hsl(var(--muted-foreground))";
}

function corHoverDaClinica(nome?: string): string {
  const n = (nome ?? "").toLowerCase();
  if (n.includes("são francisco") || n.includes("sao francisco")) return "#004d27";
  if (n.includes("menino jesus")) return "#1E3A7A";
  if (n.includes("consulta hoje")) return "#4C1D95";
  return "rgba(0,0,0,0.25)";
}

function logoDaClinica(nome?: string): string | null {
  const n = (nome ?? "").toLowerCase();
  if (n.includes("são francisco") || n.includes("sao francisco")) return logoSaoFrancisco;
  if (n.includes("menino jesus")) return logoMeninoJesus;
  if (n.includes("consulta hoje")) return logoConsultaHoje;
  return null;
}

type NavLeaf = { to: string; label: string; icon: typeof LayoutDashboard; hash?: string; aliases?: ReadonlyArray<string> };
type NavParent = { label: string; icon: typeof LayoutDashboard; children: ReadonlyArray<NavLeaf> };
type NavItem = NavLeaf | NavParent;
const isParent = (it: NavItem): it is NavParent => "children" in it;

const ROUTE_TO_MODULE: Record<string, string> = {
  "/app/agenda": "agenda",
  "/app/checkin": "checkin",
  "/app/caixa": "caixa",
  "/app/financeiro/atendimentos": "financeiro",
  "/app/chat": "chat",
  "/app/clientes": "clientes",
  "/app/painel": "painel",
  "/app/fluxo": "fluxo",
  "/app/orcamentos": "orcamentos",
  "/app/recepcao": "recepcao",
  "/app/triagem-enfermagem": "triagem-enfermagem",
  "/app/cartao-beneficios/contratos": "cartao-beneficios",
  "/app/atendimento-ia": "atendimento-ia",
  "/app/crm": "crm",
  "/app/alertas-enfermagem": "alertas-enfermagem",
  "/app/consulta-rapida": "consulta-rapida",
  "/app/nina": "nina",
  "/app/odontologia": "odontologia",
  "/app/exames-resultados": "exames-resultados",
  "/app/mkt-leads": "mkt-leads",
  "/app/equipe": "equipe",
  "/app/especialidades": "especialidades",
  "/app/disponibilidades": "disponibilidades",
  "/app/prontuario-modelos": "prontuario-modelos",
  "/app/perfis": "perfis",
  "/app/unidades": "unidades",
  "/app/hr-ponto": "hr-ponto",
  "/app/cargos": "cargos",
  "/app/financeiro": "financeiro",
  "/app/funcionarios": "funcionarios",
  "/app/relatorios": "relatorios",
  "/app/auditoria": "auditoria",
  "/app/setores": "setores",
};

function leafAllowed(to: string, allowed: Set<string> | null): boolean {
  if (!allowed) return true;
  const mod = ROUTE_TO_MODULE[to];
  if (!mod) return true;
  return allowed.has(mod);
}

// 🔥 MENU RESTAURADO EXATAMENTE COMO VOCÊ TINHA (sem divisões inventadas)
const navRows: ReadonlyArray<{ label: string; items: ReadonlyArray<NavItem> }> = [
  {
    label: "Operação",
    items: [
      { to: "/app/agenda", label: "Agenda", icon: CalendarDays },
      { to: "/app/agenda/express", label: "Agenda Express", icon: Zap },
      { to: "/app/atendimento-multiplo", label: "Agendamento Múltiplo", icon: ClipboardList },
      { to: "/app/checkin", label: "Check-in", icon: BadgeCheck },
      { to: "/app/caixa", label: "Caixa", icon: Wallet },
      { to: "/app/financeiro/atendimentos", label: "Repasse médico", icon: HandCoins },
      { to: "/app/chat", label: "Chat", icon: MessageCircle },
      { to: "/app/clientes", label: "Pacientes", icon: Contact },
      { to: "/app/painel", label: "Visão Geral", icon: LayoutDashboard },
      { to: "/app/painel-executivo", label: "Indicadores", icon: LayoutDashboard },
      { to: "/app/fluxo", label: "Fluxo do paciente", icon: Workflow },
      { to: "/app/orcamentos", label: "Orçamentos", icon: FileText },
      { to: "/app/recepcao", label: "Recepção", icon: ConciergeBell },
      { to: "/app/triagem-enfermagem", label: "Triagem", icon: HeartPulse },
      { to: "/app/cartao-beneficios/contratos", label: "Cartão Benefícios", icon: CreditCard },
    ],
  },
  {
    label: "Inteligência",
    items: [
      { to: "/app/atendimento-ia", label: "Atendimento médico", icon: Brain },
      { to: "/app/crm", label: "CRM", icon: Target },
      { to: "/app/alertas-enfermagem", label: "Alertas de Enfermagem", icon: BellRing },
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
      { to: "/app/odontologia", label: "Odontologia", icon: HeartPulse },
      { to: "/app/exames-resultados", label: "Exames e Laudos", icon: FlaskConical },
    ],
  },
  {
    label: "Marketing",
    items: [
      { to: "/app/mkt-leads", label: "Leads", icon: Megaphone },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { to: "/app/equipe", label: "Equipe", icon: Users },
      { to: "/app/especialidades", label: "Procedimentos", icon: Stethoscope, aliases: ["/app/tipos-servico", "/app/procedimentos", "/app/enfermagem-recursos"] },
      { to: "/app/disponibilidades", label: "Horários de Atendimento", icon: Clock },
      { to: "/app/prontuario-modelos", label: "Modelos de Prontuário", icon: FileHeart },
      { to: "/app/perfis", label: "Permissões", icon: KeyRound },
      { to: "/app/unidades", label: "Unidades", icon: MapPin },
    ],
  },
  {
    label: "Pessoas",
    items: [
      { to: "/app/hr-ponto", label: "Ponto", icon: GraduationCap },
    ],
  },
  {
    label: "Gestão",
    items: [
      { to: "/app/cargos", label: "Cargos", icon: Briefcase },
      { to: "/app/financeiro", label: "Financeiro", icon: DollarSign },
      { to: "/app/funcionarios", label: "Funcionários", icon: Contact },
      { to: "/app/configuracoes/nfse", label: "Notas Fiscais", icon: FileText },
      { to: "/app/relatorios", label: "Relatórios", icon: BarChart3 },
      { to: "/app/auditoria", label: "Segurança", icon: ShieldCheck },
      { to: "/app/setores", label: "Setores", icon: Building2 },
    ],
  },
];

type Crumb = { label: string; to?: string };

function titleizeSegment(seg: string) {
  const clean = decodeURIComponent(seg).replace(/[-_]/g, " ");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function buildBreadcrumbs(pathname: string, hash: string): Crumb[] {
  const cleanHash = (hash ?? "").replace(/^#/, "");
  const matchLeaf = (leaf: NavLeaf) => {
    const aliases = leaf.aliases ?? [];
    const pathOk =
      pathname === leaf.to ||
      (leaf.to !== "/app" && pathname.startsWith(`${leaf.to}/`)) ||
      aliases.some((a) => pathname === a || pathname.startsWith(`${a}/`));
    if (!pathOk) return false;
    return leaf.hash ? cleanHash === leaf.hash : true;
  };

  let best: { crumbs: Crumb[]; score: number } | null = null;
  for (const row of navRows) {
    for (const item of row.items) {
      if (isParent(item)) {
        for (const child of item.children) {
          if (!matchLeaf(child)) continue;
          const score = child.to.length + (child.hash ? 100 : 0);
          if (!best || score > best.score) {
            best = { crumbs: [{ label: row.label }, { label: item.label }, { label: child.label, to: child.to }], score };
          }
        }
      } else if (matchLeaf(item)) {
        const score = item.to.length;
        if (!best || score > best.score) {
          best = { crumbs: [{ label: row.label }, { label: item.label, to: item.to }], score };
        }
      }
    }
  }

  const crumbs = best?.crumbs ?? [];
  const matchedTo = crumbs.length ? crumbs[crumbs.length - 1]?.to : undefined;

  // Sub-páginas não catalogadas (ex.: /app/agenda/express/detalhe) viram segmentos extras.
  if (matchedTo && pathname.startsWith(matchedTo) && pathname !== matchedTo) {
    const rest = pathname.slice(matchedTo.length).split("/").filter(Boolean);
    for (const seg of rest) crumbs.push({ label: titleizeSegment(seg) });
  }

  if (!crumbs.length) {
    const segs = pathname.split("/").filter((s) => s && s !== "app");
    return segs.map((s) => ({ label: titleizeSegment(s) }));
  }
  return crumbs;
}

function NavTip({ show, label, children }: { show: boolean; label: string; children: React.ReactNode }) {
  if (!show) return <>{children}</>;
  return (
    <Tooltip delayDuration={120}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="font-medium">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function AppShell() {
  const { user, signOut, loading } = useAuth();
  const { memberships, clinicaAtual, setClinicaAtual, modoTodas, setModoTodas, branding } = useClinica();
  const { isMedicoOnly } = useMedicoContext();
  const { allowed: allowedModules } = usePermissoes();
  const { enabled: menuV2Enabled } = useMenuV2Flag();
  const location = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const navScrollRef = useRef<HTMLElement | null>(null);
  const lastArrowNavAtRef = useRef(0);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (window.innerWidth < 1024) return true;
    return window.localStorage.getItem("appshell:collapsed") === "1";
  });
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(window.localStorage.getItem("appshell:openGroups") ?? "{}"); } catch { return {}; }
  });
  const [menuSearch, setMenuSearch] = useState(""); 

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

  const crumbs = useMemo(
    () => buildBreadcrumbs(location.pathname, location.hash ?? ""),
    [location.pathname, location.hash],
  );

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
  const filteredByGroup = subsystem
    ? navRows.filter((r) => SUBSYSTEMS[subsystem].groups.includes(r.label))
    : navRows;
  const scopedNavRows = filteredByGroup.map((row) => {
    if (row.label !== "Gestão") return row;
    const gestaoPessoasItems = new Set(["/app/funcionarios", "/app/cargos", "/app/setores"]);
    const items = subsystem === "gestao-pessoas"
      ? row.items.filter((it) => !isParent(it) && gestaoPessoasItems.has(it.to))
      : row.items.filter((it) => isParent(it) || !gestaoPessoasItems.has(it.to));
    return { ...row, items };
  }).filter((row) => row.items.length > 0);
  const permissionFilteredRows = scopedNavRows
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
  const visibleNavRows = isMedicoOnly ? medicoNavRows : permissionFilteredRows;
  const subsystemLabel = subsystem ? SUBSYSTEMS[subsystem].label : null;

  const roleAtual = clinicaAtual?.role ?? null;
  const menuV2Allowed = roleAtual === "admin" || roleAtual === "gestor";
  const useMenuV2 = menuV2Enabled && menuV2Allowed && !isMedicoOnly;
  const perfilV2: PerfilKey = roleAtual === "admin" ? "admin" : "gestor";

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

  const flatNavLeaves = useMemo(() => {
    const leaves: string[] = [];
    for (const row of filteredNavRows) {
      const hideLabel = subsystem === "gestao-pessoas" && row.label === "RH";
      const open = collapsed || hideLabel || row.label === "Operação" ? true : (openGroups[row.label] ?? false);
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

  // Navegação por teclado dentro da sidebar (roving focus).
  // ↑/↓ move o foco, Home/End vão ao primeiro/último, →/← abrem/fecham grupos,
  // Enter/Espaço ativam o item focado (comportamento nativo de <a>/<button>).
  const onNavKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const navRoot = navScrollRef.current;
    if (!navRoot) return;
    const tgt = e.target as HTMLElement | null;
    if (!tgt) return;
    const tag = tgt.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tgt.isContentEditable) return;

    const items = Array.from(
      navRoot.querySelectorAll<HTMLElement>("[data-nav-focusable]"),
    ).filter((el) => el.offsetParent !== null || el === tgt);
    if (items.length === 0) return;
    const current = tgt.closest<HTMLElement>("[data-nav-focusable]");
    const idx = current ? items.indexOf(current) : -1;

    const focusAt = (i: number) => {
      const el = items[Math.max(0, Math.min(items.length - 1, i))];
      el?.focus({ preventScroll: false });
    };

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusAt(idx < 0 ? 0 : (idx + 1) % items.length);
        return;
      case "ArrowUp":
        e.preventDefault();
        focusAt(idx < 0 ? items.length - 1 : (idx - 1 + items.length) % items.length);
        return;
      case "Home":
        e.preventDefault();
        focusAt(0);
        return;
      case "End":
        e.preventDefault();
        focusAt(items.length - 1);
        return;
      case "ArrowRight":
      case "ArrowLeft": {
        const groupKey = current?.dataset.navGroupKey;
        if (!groupKey) return;
        e.preventDefault();
        const shouldOpen = e.key === "ArrowRight";
        setOpenGroups((prev) =>
          (prev[groupKey] ?? false) === shouldOpen ? prev : { ...prev, [groupKey]: shouldOpen },
        );
        return;
      }
      default:
        return;
    }
  };

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

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const collapsedUi = collapsed && !mobileNavOpen;
  useEffect(() => {
    const open = () => setMobileNavOpen(true);
    window.addEventListener("menu-v2:open", open);
    return () => window.removeEventListener("menu-v2:open", open);
  }, []);
  useEffect(() => {
    const toggle = () => {
      if (window.innerWidth < 1024) setMobileNavOpen((v) => !v);
      else setCollapsed((v) => !v);
    };
    window.addEventListener("appshell:toggle-sidebar", toggle);
    return () => window.removeEventListener("appshell:toggle-sidebar", toggle);
  }, []);
  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  if (isEmbed) {
    return (
      <div className="h-screen w-full overflow-auto bg-background" style={{ background: "var(--surface-cream)" }}>
        <Outlet />
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {!isChooser && useMenuV2 && (
        <MenuV2 perfil={perfilV2} clinicColor={clinicColor} />
      )}
      {!isChooser && !useMenuV2 && (
      <>
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <aside
        className={`${collapsed ? "lg:w-16" : "lg:w-64"} w-64 fixed inset-y-0 left-0 z-50 lg:static lg:z-auto transition-transform lg:transition-all duration-200 shrink-0 text-white h-screen overflow-hidden flex flex-col ${mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        style={{ backgroundColor: clinicColor }}
      >
        <div className="px-3 py-3 border-b border-white/10 flex items-center justify-between gap-2">
          <Link to="/app" className="flex items-center gap-2 min-w-0">
            <Activity className="h-5 w-5 shrink-0" />
            {!collapsedUi && <span className="font-semibold tracking-tight truncate">ClinicaOS</span>}
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/10 hover:text-white h-7 w-7 p-0 shrink-0"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsedUi ? "Expandir menu" : "Recolher menu"}
          >
            {collapsedUi ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
        
        {!isMedicoOnly && (
          <div className={`${collapsedUi ? "px-1 py-2" : "px-3 py-2"} border-b border-white/10`}>
            <button
              type="button"
              onClick={() => { setSubsystem(null); navigate({ to: "/app" }); }}
              title="Menu principal"
              className={`w-full flex items-center gap-2 rounded-md bg-white/10 hover:bg-white/20 transition-colors text-white text-xs font-medium ${collapsedUi ? "justify-center px-2 py-2" : "px-3 py-2"}`}
            >
              <LayoutGrid className="h-4 w-4 shrink-0" />
              {!collapsedUi && <span className="flex-1 truncate text-left">Menu</span>}
            </button>
          </div>
        )}

        {/* 🔥 NAVEGAÇÃO COM DIVISORES SUTIS E ITENS MAIS ESPAÇOSOS */}
        <TooltipProvider delayDuration={120}>
        <nav
          ref={navScrollRef}
          aria-label="Menu principal"
          onKeyDown={onNavKeyDown}
          className="flex-1 px-2 py-3 overflow-y-auto [&::-webkit-scrollbar]:hidden"
        >
          {filteredNavRows.map((row) => {
            const leafIsActive = (to: string, hash?: string) => {
              const pathOk = location.pathname === to || (to !== "/app" && location.pathname.startsWith(to));
              if (!pathOk) return false;
              if (!hash) return true;
              return (location.hash ?? "").replace(/^#/, "") === hash;
            };
            const itemHasActive = (it: NavItem): boolean => isParent(it) ? it.children.some((c) => leafIsActive(c.to, c.hash)) : leafIsActive(it.to);
            const groupHasActive = row.items.some(itemHasActive);
            const hideLabel = subsystem === "gestao-pessoas" && row.label === "RH";
            const open = collapsedUi || hideLabel || row.label === "Operação" ? true : (openGroups[row.label] ?? false);
            return (
              <div key={row.label} className={`space-y-1 border-b border-white/10 pb-3 mb-3 last:border-0 last:pb-0 last:mb-0`}>
                {!collapsedUi && !hideLabel && (
                  <button
                    type="button"
                    data-nav-focusable
                    data-nav-group-key={row.label}
                    onClick={() => setOpenGroups((prev) => ({ ...prev, [row.label]: !(prev[row.label] ?? false) }))}
                    className={`w-full flex items-center justify-between px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-opacity rounded-md hover:opacity-100 outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-transparent ${groupHasActive ? "opacity-100 text-white" : "opacity-70"}`}
                    aria-expanded={open}
                  >
                    <span className="flex items-center gap-1.5">
                      {row.label}
                      {groupHasActive && !open && <span className="h-1.5 w-1.5 rounded-full bg-white/90" aria-hidden />}
                    </span>
                    <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-0" : "-rotate-90"}`} />
                  </button>
                )}
                {open && row.items.map((item) => {
                  if (isParent(item)) {
                    const subActive = item.children.some((c) => leafIsActive(c.to, c.hash));
                    const subKey = `${row.label}::${item.label}`;
                    const subOpen = collapsedUi ? true : (openGroups[subKey] ?? false);
                    return (
                      <div key={subKey} className="space-y-1">
                        {collapsedUi ? (
                          <NavTip show label={item.label}>
                          <div
                            className={`relative flex justify-center rounded-full py-2.5 transition-all ${subActive ? "bg-white/20 ring-1 ring-inset ring-white/25" : ""}`}
                          >
                            {subActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-white" aria-hidden />}
                            <item.icon className={`h-4 w-4 shrink-0 ${subActive ? "opacity-100" : "opacity-80"}`} />
                          </div>
                          </NavTip>
                        ) : (
                          <button
                            type="button"
                            data-nav-focusable
                            data-nav-group-key={subKey}
                            onClick={() => setOpenGroups((prev) => ({ ...prev, [subKey]: !(prev[subKey] ?? false) }))}
                            className={`relative w-full flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${subActive ? "bg-white/20 text-white shadow-sm ring-1 ring-inset ring-white/25" : "text-white/85 hover:bg-white/10 hover:text-white"}`}
                            aria-expanded={subOpen}
                          >
                            {subActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-white" aria-hidden />}
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span className={`truncate flex-1 text-left ${subActive ? "font-semibold" : ""}`}>{item.label}</span>
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
                              <NavTip key={linkKey} show={collapsedUi} label={child.label}>
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-nav-to={child.to}
                                data-nav-focusable
                                className={`relative flex items-center gap-2.5 rounded-full ${collapsedUi ? "px-2 justify-center" : "pl-8 pr-4"} py-2.5 text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent text-white/85 hover:bg-white/10 hover:text-white`}
                              >
                                <child.icon className="h-4 w-4 shrink-0" />
                                {!collapsedUi && <span className="truncate">{child.label}</span>}
                              </a>
                              </NavTip>
                            );
                          }
                          return (
                            <NavTip key={linkKey} show={collapsedUi} label={child.label}>
                            <a
                              href={href}
                              data-nav-to={child.to}
                              data-nav-focusable
                              data-nav-active={active ? "true" : undefined}
                              aria-current={active ? "page" : undefined}
                              onClick={(event) => {
                                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                                event.preventDefault();
                                window.location.assign(href);
                              }}
                              className={`relative flex items-center gap-2.5 rounded-full ${collapsedUi ? "px-2 justify-center" : "pl-8 pr-4"} py-2.5 text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
                                active
                                  ? "bg-white/20 text-white shadow-sm ring-1 ring-inset ring-white/25"
                                  : "text-white/85 hover:bg-white/10 hover:text-white"
                              }`}
                            >
                              {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-white" aria-hidden />}
                              <child.icon className="h-4 w-4 shrink-0" />
                              {!collapsedUi && <span className={`truncate ${active ? "font-semibold" : ""}`}>{child.label}</span>}
                            </a>
                            </NavTip>
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
                    <NavTip key={item.to} show={collapsedUi} label={item.label}>
                    <a
                      href={href}
                      data-nav-to={item.to}
                      data-nav-focusable
                      data-nav-active={active ? "true" : undefined}
                      aria-current={active ? "page" : undefined}
                      onClick={(event) => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                        event.preventDefault();
                        window.location.assign(href);
                      }}
                      className={`relative flex items-center gap-2.5 rounded-full ${collapsedUi ? "px-2 justify-center" : "px-4"} py-2.5 text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
                        active
                          ? "bg-white/20 text-white shadow-sm ring-1 ring-inset ring-white/25"
                          : "text-white/85 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-white" aria-hidden />}
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsedUi && <span className={`truncate ${active ? "font-semibold" : ""}`}>{item.label}</span>}
                    </a>
                    </NavTip>
                  );
                })}
              </div>
            );
          })}
        </nav>
        </TooltipProvider>

                {/* 🔥 BOTÃO DE PESQUISAR COM GRADIENTE (SEM CAIXA ALTA) */}
                  <div className="px-3 py-2 border-t border-white/10 mt-auto shrink-0">
            <Input
              type="text"
              placeholder="Buscar no menu…"
              value={menuSearch}
              onChange={(e) => setMenuSearch(e.target.value)}
              className="w-full block text-center text-white bg-gradient-to-r from-[#005C97] via-[#363795] to-[#005C97] bg-[length:200%_auto] transition-all duration-500 hover:bg-[position:right_center] shadow-[0_0_20px_rgba(0,0,0,0.2)] rounded-xl outline-none border-none px-10 py-3 placeholder:text-white/70 focus:placeholder:opacity-0"
            />
          </div>
      </aside>
      </>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-[50px] bg-card/80 backdrop-blur border-b flex items-center gap-2 px-3 sm:px-5">
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden h-8 w-8 p-0 shrink-0"
            title="Abrir menu"
            aria-label="Abrir menu"
            onClick={() => window.dispatchEvent(new Event("menu-v2:open"))}
          >
            <MenuIcon className="h-5 w-5" />
          </Button>
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
            <p className="hidden lg:block text-sm font-medium truncate max-w-[160px]" title={user?.email ?? undefined}>{userName}</p>
          </div>
          
          {/* LOGO SEM QUADRINHO BRANCO */}
          {clinicaAtual && logoDaClinica(clinicaAtual.clinica.nome) && (
            <div className="flex items-center justify-center shrink-0">
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
              <SelectTrigger className="w-[150px] sm:w-[220px] lg:w-[260px] h-8 text-xs">
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
          <div className="hidden sm:flex flex-1 justify-center px-2 min-w-0">
            <UniversalSearchBar />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 rounded-full"
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
        {crumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="sticky top-[50px] z-20 bg-card/70 backdrop-blur border-b px-3 sm:px-5 py-1.5 overflow-x-auto hhp-no-scrollbar-mobile"
          >
            <div className="flex items-center gap-2 whitespace-nowrap">
              <button
                type="button"
                onClick={() => window.history.back()}
                aria-label="Voltar para a página anterior"
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] sm:text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Voltar</span>
              </button>
              <span className="h-3 w-px bg-border" aria-hidden />
            <ol className="flex items-center gap-1 text-[11px] sm:text-xs text-muted-foreground whitespace-nowrap">
              <li className="flex items-center gap-1">
                <Link to="/app" className="hover:text-foreground transition-colors">Início</Link>
              </li>
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                    <ChevronRight className="h-3 w-3 opacity-50 shrink-0" />
                    {last || !c.to ? (
                      <span className={last ? "font-medium text-foreground" : ""} aria-current={last ? "page" : undefined}>
                        {c.label}
                      </span>
                    ) : (
                      <Link to={c.to} className="hover:text-foreground transition-colors">{c.label}</Link>
                    )}
                  </li>
                );
              })}
            </ol>
            </div>
          </nav>
        )}
        <main className="hhp-no-scrollbar-mobile flex-1 px-3 pt-1 pb-3 sm:px-4 sm:pt-1.5 sm:pb-4 lg:px-6 lg:pt-2 lg:pb-6 overflow-auto min-w-0" style={{ background: "var(--surface-cream)" }}>
          <Outlet />
        </main>
      </div>
      {pwOpen && (
        <Suspense fallback={null}>
          <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
        </Suspense>
      )}
      <KeyboardShortcuts />
    </div>
  );
}