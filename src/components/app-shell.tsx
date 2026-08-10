import { Link, Outlet, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import {
  Activity,
  Building2,
  Users,
  LayoutDashboard,
  LogOut,
  Stethoscope,
  Bell,
  DollarSign,
  CalendarDays,
  ClipboardList,
  MessageCircle,
  Target,
  Clock,
  BookOpen,
  Workflow,
  FileText,
  CreditCard,
  Brain,
  FileHeart,
  FlaskConical,
  BellRing,
  ShieldCheck,
  BarChart3,
  Wallet,
  ChevronDown,
  Search,
  X,
  HeartPulse,
  Contact,
  ConciergeBell,
  Briefcase,
  MapPin,
  Palmtree,
  GraduationCap,
  Sparkles,
  Filter,
  Send,
  Megaphone,
  KeyRound,
  BadgeCheck,
  LayoutGrid,
  Zap,
  Coffee,
  Play,
  Eye,
  ArrowRightLeft,
  Inbox,
  FileBarChart2,
  Menu as MenuIcon,
  Columns3,
} from "lucide-react";
import { Tooth } from "@/components/icons/tooth";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { usePermissoes } from "@/hooks/use-permissoes";
import { ROUTE_TO_MODULE as SHARED_ROUTE_TO_MODULE, moduloDaRota, SUBMODULE_PARENT } from "@/lib/permissoes-rotas";
import { SemPermissao } from "@/components/sem-permissao";
import { supabase } from "@/integrations/supabase/client";
import { getSubsystem, setSubsystem, subscribeSubsystem, SUBSYSTEMS, type SubsystemId } from "@/lib/subsystem";
import {
  PortalLauncher,
  abrirSeletorPortais,
  fecharSeletorPortais,
  useSeletorPortaisAberto,
} from "@/components/portal-launcher";
import logoSaoFrancisco from "@/assets/logo-sao-francisco.png";
import logoMeninoJesus from "@/assets/logo-menino-jesus.png";
import logoConsultaHoje from "@/assets/logo-consulta-hoje.png";
import { EstornosBell } from "@/components/EstornosBell";
import { UniversalSearchBar } from "@/components/universal-search-bar";
import { TTSToggle } from "@/components/tts/tts-toggle";
import { useClinicFeatureFlag } from "@/hooks/use-clinic-feature-flag";
import { useMenuOrdem } from "@/hooks/use-menu-ordem";
import { HOVER_SCALE_CLASSES } from "@/lib/menu-hover";
import { garantirContrasteTextoBranco } from "@/lib/contrast";
import { cn } from "@/lib/utils";
import { useAtendimentoMultiploDisabled } from "@/hooks/use-atendimento-multiplo-disabled";

function corDaClinica(nome?: string): string {
  const n = (nome ?? "").toLowerCase();
  if (n.includes("são francisco") || n.includes("sao francisco")) return "#006634"; // verde São Francisco
  if (n.includes("menino jesus")) return "#00008B"; // azul Menino Jesus
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { SidebarUserMenu } from "@/components/sidebar-user-menu";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const VoiceInput = lazy(() => import("@/components/voice-input").then((m) => ({ default: m.VoiceInput })));
const ChangePasswordDialog = lazy(() =>
  import("@/components/change-password-dialog").then((m) => ({ default: m.ChangePasswordDialog })),
);

type NavLeaf = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  hash?: string;
  aliases?: ReadonlyArray<string>;
};
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
  { to: "/app/painel", label: "Início", Icon: LayoutDashboard },
  { to: "/app/agenda", label: "Agenda", Icon: CalendarDays },
  { to: "/app/checkin", label: "Fila", Icon: ConciergeBell },
  { to: "/app/caixa", label: "Caixa", Icon: Wallet },
];

function LiquidBottomNav({
  pathname,
  onNavigate,
  onMais,
  cor,
}: {
  pathname: string;
  onNavigate: (to: string) => void;
  onMais: () => void;
  cor: string;
}) {
  const navRef = useRef<HTMLElement | null>(null);
  const [navW, setNavW] = useState(0);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const medir = () => setNavW(el.getBoundingClientRect().width);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rotaIdx = BOTTOM_NAV_ITENS.findIndex(
    (i) => pathname === i.to || pathname.startsWith(`${i.to}/`),
  );
  // Índice "otimista": move o indicador no toque, sem esperar a rota montar.
  const [idxOtimista, setIdxOtimista] = useState<number | null>(null);
  const [, startNav] = useTransition();
  useEffect(() => {
    setIdxOtimista(null);
  }, [rotaIdx]);
  const activeIdx = idxOtimista ?? rotaIdx;
  const slots = BOTTOM_NAV_ITENS.length + 1;
  const cell = navW / slots;
  const cx = activeIdx >= 0 ? (activeIdx + 0.5) * cell : -999;
  const R = 30;
  const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
  const DUR = "0.35s";
  const mask = `radial-gradient(circle ${R}px at ${R}px 2px, #000 0 ${R - 1}px, transparent ${R}px), linear-gradient(#000, #000)`;
  const maskPos = `${cx - R}px 0px, 0px 0px`;

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 w-full z-50">
      <nav
        ref={navRef}
        className="relative w-full rounded-t-2xl text-white shadow-2xl px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] flex items-stretch transform-gpu will-change-transform"
        aria-label="Navegação principal"
        style={
          navW > 0 && activeIdx >= 0
            ? ({
                backgroundColor: cor,
                WebkitMaskImage: mask,
                maskImage: mask,
                WebkitMaskRepeat: "no-repeat, no-repeat",
                maskRepeat: "no-repeat, no-repeat",
                WebkitMaskSize: `${R * 2}px ${R * 2}px, 100% 100%`,
                maskSize: `${R * 2}px ${R * 2}px, 100% 100%`,
                WebkitMaskPosition: maskPos,
                maskPosition: maskPos,
                WebkitMaskComposite: "xor",
                maskComposite: "exclude",
                willChange: "mask-position",
                transition: `-webkit-mask-position ${DUR} ${EASE}, mask-position ${DUR} ${EASE}`,
              } as React.CSSProperties)
            : ({ backgroundColor: cor } as React.CSSProperties)
        }
      >
        {BOTTOM_NAV_ITENS.map(({ to, label, Icon }, idx) => {
          const active = idx === activeIdx;
          return (
            <a
              key={to}
              href={to}
              aria-current={active ? "page" : undefined}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                setIdxOtimista(idx);
                // Navegação em transição: a renderização da nova página não
                // bloqueia o deslize da barra.
                startNav(() => onNavigate(to));
              }}
              className={cn(
                "flex-1 flex flex-col items-center justify-end gap-0.5 rounded-full px-2 pb-2 pt-3 text-[11px] font-medium transition-colors duration-300",
                active ? "text-white" : "text-blue-200/70 hover:text-white",
              )}
            >
              <Icon className={cn("h-5 w-5 shrink-0", active && "opacity-0")} />
              <span className="leading-none">{label}</span>
            </a>
          );
        })}
        <button
          type="button"
          onClick={onMais}
          className="flex-1 flex flex-col items-center justify-end gap-0.5 rounded-full px-2 pb-2 pt-3 text-[11px] font-medium text-blue-200/70 transition-colors duration-300 hover:text-white"
        >
          <MenuIcon className="h-5 w-5 shrink-0" />
          <span className="leading-none">Mais</span>
        </button>
      </nav>
      {navW > 0 && activeIdx >= 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 h-12 w-12 -mt-5 flex items-center justify-center rounded-full bg-white shadow-lg transform-gpu will-change-transform"
          style={{
            color: cor,
            transform: `translate3d(${cx - 24}px, 0, 0)`,
            transition: `transform ${DUR} ${EASE}`,
          }}
        >
          {(() => {
            const Ativo = BOTTOM_NAV_ITENS[activeIdx].Icon;
            return <Ativo className="h-5 w-5" />;
          })()}
        </div>
      )}
    </div>
  );
}

// Mapeia rota do menu → chave de módulo da tela de Perfis de Acesso.
// O mapa vive em src/lib/permissoes-rotas.ts (compartilhado com o guard
// de rota) — aqui apenas reexportamos para uso local.
const ROUTE_TO_MODULE = SHARED_ROUTE_TO_MODULE;

function leafAllowed(to: string, allowed: Set<string> | null): boolean {
  if (!allowed) return true;
  const mod = ROUTE_TO_MODULE[to];
  if (mod === null) return true; // rota livre/sistema
  if (mod === undefined) return false; // rota não mapeada → ocultar
  if (allowed.has(mod)) return true;
  // Item de menu do módulo-pai (ex.: "Financeiro") permanece visível quando
  // o usuário tem acesso a pelo menos um submódulo (mov. caixa, estorno,
  // atendimentos), mesmo sem acesso ao pai. O submenu do Financeiro já
  // filtra as abas individuais e a rota-pai redireciona para a primeira
  // aba visível.
  const temSub = Object.entries(SUBMODULE_PARENT).some(([sub, parent]) => parent === mod && allowed.has(sub));
  return temSub;
}

const navRows: ReadonlyArray<{ label: string; items: ReadonlyArray<NavItem> }> = [
  {
    label: "Operação",
    items: [
      { to: "/app/painel", label: "Dashboard", icon: LayoutDashboard },
      { to: "/app/agenda", label: "Agenda", icon: CalendarDays },
      { to: "/app/agenda-medicos", label: "Agenda Multimédico", icon: Columns3 },
      { to: "/app/atendimento-multiplo", label: "Atendimento Múltiplo", icon: ClipboardList },
      { to: "/app/checkin", label: "Check-in", icon: BadgeCheck },
      { to: "/app/caixa", label: "Caixa", icon: Wallet },
      { to: "/app/chat", label: "Chat interno", icon: MessageCircle },
      { to: "/app/clientes", label: "Clientes", icon: Contact },
      { to: "/app/painel-executivo", label: "Painel Executivo", icon: FileBarChart2 },
      { to: "/app/fluxo", label: "Fluxo do paciente", icon: Workflow },
      { to: "/app/orcamentos", label: "Orçamentos", icon: FileText },
      { to: "/app/recepcao", label: "Recepção / Filas", icon: ConciergeBell },
      { to: "/app/triagem-enfermagem", label: "Triagem - Enfermagem", icon: HeartPulse },
      { to: "/app/cartao-beneficios/contratos", label: "Cartão Benefícios", icon: CreditCard },
      { to: "/app/documentos", label: "Documentos do paciente", icon: FileText },
      { to: "/app/anamneses", label: "Anamneses", icon: FileHeart },
    ],
  },
  {
    label: "Gestão",
    items: [
      { to: "/app/cargos", label: "Cargos", icon: Briefcase },
      { to: "/app/financeiro", label: "Financeiro", icon: DollarSign },
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
    label: "Cadastros",
    items: [
      { to: "/app/equipe", label: "Médicos", icon: Users },
      { to: "/app/perfis", label: "Perfis", icon: KeyRound },
      {
        to: "/app/especialidades",
        label: "Serviços",
        icon: Stethoscope,
        aliases: ["/app/tipos-servico", "/app/procedimentos"],
      },
      { to: "/app/disponibilidades", label: "Horários médicos", icon: Clock },
      { to: "/app/prontuario-modelos", label: "Modelos de Prontuário", icon: FileHeart },
      { to: "/app/unidades", label: "Unidades", icon: MapPin },
      { to: "/app/modelos-documentos", label: "Modelos de Documentos", icon: FileText },
      { to: "/app/estoque", label: "Estoque", icon: LayoutGrid },
      { to: "/app/clientes/duplicados", label: "Duplicados / Merge", icon: Users },
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
    label: "Configurações",
    items: [
      { to: "/app/configuracoes/painel-totem", label: "Painel & Totem", icon: KeyRound },
      { to: "/app/configuracoes/voz", label: "Voz & Áudio (TTS)", icon: KeyRound },
      { to: "/app/clinicas", label: "Clínicas", icon: Building2 },
      { to: "/app/backups", label: "Backups", icon: ShieldCheck },
    ],
  },
];

export function AppShell() {
  return <AppShellInner />;
}

function MobileNavParent({
  item,
  onNavigate,
}: {
  item: NavParent;
  onNavigate: (href: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium tracking-tight text-white rounded-lg hover:bg-white/10"
      >
        <item.icon className="h-[18px] w-[18px] shrink-0" />
        <span className="flex-1 text-left leading-snug break-words">{item.label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-0" : "-rotate-90"}`} />
      </button>
      <div
        className={`grid transition-all duration-200 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden space-y-0.5">
          {item.children.map((child) => {
            const href = `${child.to}${child.hash ? `#${child.hash}` : ""}`;
            return (
              <a
                key={`${child.to}#${child.hash ?? ""}`}
                href={href}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                  e.preventDefault();
                  onNavigate(href);
                }}
                className="flex items-center gap-2.5 pl-9 pr-3 py-2 rounded-full text-sm text-white hover:bg-white/10 hover:text-white"
              >
                <child.icon className="h-[18px] w-[18px] shrink-0" />
                <span className="leading-snug break-words">{child.label}</span>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AppShellInner() {
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
  const queryClient = useQueryClient();
  // Pré-carrega o código da rota ao passar o mouse no item do menu — quando o
  // clique acontece, o chunk JS já chegou. Só com a flag de UX ligada.
  const preCarregar = (href: string) => {
    if (!uxMelhorias) return;
    const to = href.split("#")[0];
    // Cast necessário: os paths do menu vêm de configuração em runtime
    // (string), não do union de rotas tipado do router.
    void router.preloadRoute({ to } as Parameters<typeof router.preloadRoute>[0]).catch(() => {});
    // Além do código, pré-busca os DADOS da tela de Clientes (estado padrão:
    // sem busca, primeira página) — mesmas chaves/consulta de
    // app.clientes.index.tsx (`clientes-total`, `clientes-lista`). Assim, ao
    // clicar, a tabela já renderiza com o cache quente, sem skeleton. Mantenha
    // esta lógica em sincronia com aquele arquivo se a consulta mudar lá.
    if (to === "/app/clientes" && clinicaAtual?.clinica_id) {
      const clinicaId = clinicaAtual.clinica_id;
      void queryClient
        .prefetchQuery({
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
        })
        .catch(() => {});
      void queryClient
        .prefetchQuery({
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
        })
        .catch(() => {});
    }
  };
  // Desktop: sidebar sempre aberta e fixa. Em telas menores ela some e é
  // aberta pelo botão hamburguer do cabeçalho (drawer).
  const collapsed = false;
  // Busca dentro do menu lateral: input que abre/fecha pela lupa e filtra
  // os itens (e sub-itens) conforme o usuário digita.
  const [buscaMenuAberta, setBuscaMenuAberta] = useState(false);
  const [buscaMenu, setBuscaMenu] = useState("");
  const buscaMenuInputRef = useRef<HTMLInputElement | null>(null);

  // Foca (e seleciona) o campo assim que a busca do menu fica visível.
  useEffect(() => {
    if (!buscaMenuAberta) return;
    const id = requestAnimationFrame(() => {
      const el = buscaMenuInputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    });
    return () => cancelAnimationFrame(id);
  }, [buscaMenuAberta]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(window.localStorage.getItem("appshell:openGroups") ?? "{}");
    } catch {
      return {};
    }
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("appshell:openGroups", JSON.stringify(openGroups));
    }
  }, [openGroups]);

  const [profileName, setProfileName] = useState<string>("");
  const [pwOpen, setPwOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Fecha o drawer mobile ao navegar
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname, location.hash]);
  useEffect(() => {
    if (!user?.id) {
      setProfileName("");
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("nome")
      .eq("id", user.id)
      .maybeSingle()
      .then((res: { data: { nome: string | null } | null }) => {
        if (!cancelled && res.data?.nome) setProfileName(res.data.nome);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);
  const userName =
    profileName ||
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    (user?.email ? user.email.split("@")[0] : "");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [loading, navigate, user]);

  const handleVoiceCommand = (text: string) => {
    const t = text.toLowerCase();
    const route = /agenda|agendamento/.test(t)
      ? "/app/agenda"
      : /fluxo|kanban|triagem/.test(t)
        ? "/app/fluxo"
        : /recep|fila/.test(t)
          ? "/app/recepcao"
          : /cliente|paciente/.test(t)
            ? "/app/clientes"
            : /servico|procediment|exame/.test(t)
              ? "/app/procedimentos"
              : /or[çc]amento/.test(t)
                ? "/app/orcamentos"
                : /plano|assinatura|cart[ãa]o|benef[ií]cio|contrato/.test(t)
                  ? "/app/cartao-beneficios/contratos"
                  : /modelo|template/.test(t)
                    ? "/app/cartao-beneficios/convenios"
                    : /relat[óo]rio.*cart[ãa]o|cart[ãa]o.*relat[óo]rio/.test(t)
                      ? "/app/cartao-beneficios/relatorios"
                      : /financ|caixa|conta|boleto/.test(t)
                        ? "/app/financeiro"
                        : /cl[ií]nica/.test(t)
                          ? "/app/unidades"
                          : /rateio|repasse/.test(t)
                            ? "/app/equipe"
                            : /equipe|usu[áa]rio|m[eé]dico|profissional|funcion[áa]rio/.test(t)
                              ? "/app/equipe"
                              : /prontu[áa]rio/.test(t)
                                ? "/app/prontuarios"
                                : /crm|lead|oportunidade/.test(t)
                                  ? "/app/crm"
                                  : /nina|whats|whatsapp|conversa/.test(t)
                                    ? "/app/nina"
                                    : /consulta r[áa]pida|lembrete|valor|tabela|hor[áa]rio/.test(t)
                                      ? "/app/consulta-rapida"
                                      : /dashboard|in[íi]cio|home/.test(t)
                                        ? "/app"
                                        : null;
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

  const clinicColor = useMemo(
    () =>
      modoTodas
        ? "#0f172a"
        : branding?.primary
          ? branding.primary
          : clinicaAtual
            ? corDaClinica(clinicaAtual.clinica.nome)
            : "#0f172a",
    [modoTodas, branding?.primary, clinicaAtual],
  );
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
  const seletorPortaisAberto = useSeletorPortaisAberto();
  // Trocar de portal não desmonta a tela atual: o seletor entra como camada
  // por cima. Ao voltar para o mesmo portal, apenas escondemos a camada — a
  // Agenda reaparece instantaneamente, sem spinner nem skeleton.
  const escolherPortal = (id: SubsystemId) => {
    const mudou = id !== subsystem;
    setSubsystem(id);
    fecharSeletorPortais();
    if (mudou) navigate({ to: SUBSYSTEMS[id].home });
  };
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
  // Admin também ignora o filtro de subsystem: um admin já tem allowed=null em
  // usePermissoes, então não faz sentido esconder grupos inteiros porque ele
  // clicou uma vez em "Gestor Clínico" / "Gestão de Pessoas" no seletor /app.
  // (O filtro de subsystem segue valendo para papéis operacionais.)
  // O portal escolhido no hub (/app) define o contexto do menu para todos os
  // perfis — inclusive admin. Sem portal escolhido, mostra tudo.
  const bypassSubsystem = !subsystem;

  const filteredByGroup = bypassSubsystem
    ? navRows
    : subsystem
      ? navRows.filter((r) => SUBSYSTEMS[subsystem].groups.includes(r.label))
      : navRows;
  const scopedNavRows = filteredByGroup
    .map((row) => {
      if (row.label !== "Gestão") return row;
      const gestaoPessoasItems = new Set(["/app/cargos", "/app/setores"]);
      const items =
        !bypassSubsystem && subsystem === "gestao-pessoas"
          ? row.items.filter((it) => !isParent(it) && gestaoPessoasItems.has(it.to))
          : row.items.filter((it) => isParent(it) || !gestaoPessoasItems.has(it.to));
      return { ...row, items };
    })
    .filter((row) => row.items.length > 0);
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
          items: row.items.filter((it) => isParent(it) || it.to !== "/app/atendimento-multiplo"),
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

  // Resultado da busca do menu lateral (sem acento, case-insensitive).
  const termoMenu = buscaMenu.trim();
  const buscandoMenu = termoMenu.length > 0;
  const searchedNavRows = useMemo(() => {
    if (!buscandoMenu) return visibleNavRows;
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const alvo = norm(termoMenu);
    return visibleNavRows
      .map((row) => {
        const items = row.items
          .map((it) => {
            if (!isParent(it)) return norm(it.label).includes(alvo) ? it : null;
            if (norm(it.label).includes(alvo)) return it;
            const children = it.children.filter((c) => norm(c.label).includes(alvo));
            return children.length > 0 ? { ...it, children } : null;
          })
          .filter((it): it is NavItem => it !== null);
        return { ...row, items };
      })
      .filter((row) => row.items.length > 0);
  }, [visibleNavRows, buscandoMenu, termoMenu]);

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

  // Sidebar sob o mouse: habilita as setas mesmo sem foco dentro do menu.
  const navHoverRef = useRef(false);

  // Navegação do menu lateral por setas ↑/↓ (Home/End vão ao primeiro/último).
  // Só move o foco; o Enter do próprio link é quem abre a página.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isArrow = e.key === "ArrowDown" || e.key === "ArrowUp";
      const isEdge = e.key === "Home" || e.key === "End";
      if (!isArrow && !isEdge) return;
      const tgt = e.target as HTMLElement | null;
      if (tgt) {
        const tag = tgt.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tgt.isContentEditable) return;
        if (tgt.closest('[role="dialog"], [role="listbox"], [role="menu"], [role="combobox"]')) return;
      }
      // Só age quando o foco (ou o clique atual) está dentro de um menu lateral,
      // ou quando o mouse está sobre a sidebar (hover).
      const activeElement = typeof document !== "undefined" ? document.activeElement : null;
      const focused = activeElement instanceof HTMLElement ? activeElement : null;
      const navRoot =
        (focused?.closest("nav") as HTMLElement | null) ??
        (tgt?.closest("nav") as HTMLElement | null) ??
        (navHoverRef.current ? navScrollRef.current : null) ??
        null;
      if (!navRoot) return;
      const items = Array.from(navRoot.querySelectorAll<HTMLElement>("[data-nav-to]")).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;

      // Índice atual: item focado; senão parte do item ativo (rota atual).
      let idx = focused ? items.findIndex((el) => el === focused || el.contains(focused)) : -1;
      if (idx < 0) idx = items.findIndex((el) => el.dataset.navActive === "true");

      let next: number;
      if (e.key === "Home") next = 0;
      else if (e.key === "End") next = items.length - 1;
      else if (idx < 0) next = e.key === "ArrowDown" ? 0 : items.length - 1;
      else next = e.key === "ArrowDown" ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;

      e.preventDefault();
      // Apenas move o foco — o Enter (padrão do link) é que abre a página.
      const alvo = items[next];
      alvo?.focus({ preventScroll: true });
      alvo?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    // Não incluir `openGroups`: abrir/fechar um submenu não deve rolar a
    // sidebar de volta para o item ativo.
  }, [location.pathname, collapsed]);

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
  const guardedOutlet = permsLoading ? (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      Carregando permissões…
    </div>
  ) : rotaPermitida ? (
    <Outlet />
  ) : (
    <SemPermissao modulo={currentModulo ?? undefined} />
  );

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
          className={cn(
            "shrink-0 text-white overflow-hidden hidden lg:flex flex-col border-r border-white/10",
            "relative z-40",
            uxMelhorias ? "h-[100dvh]" : "h-screen",
            collapsed ? "w-16" : "w-60 2xl:w-64",
          )}
          style={{ backgroundColor: corSidebar }}
        >
          <div className="shrink-0 w-full h-14 border-b border-white/10">
            <div className="flex h-full w-full items-center gap-1.5 px-4 min-w-0">
              <div className="flex min-w-0 items-center gap-1.5 cursor-default select-none" title="ClinicaOS">
                <Activity className="h-4 w-4 shrink-0 text-white" />
                <span className="truncate text-sm font-bold tracking-tight text-white">ClinicaOS</span>
              </div>
              {!isChooser && (
                <button
                  type="button"
                  onClick={() => abrirSeletorPortais()}
                  title="Trocar de portal"
                  className="inline-flex items-center gap-1 shrink-0 bg-white/10 hover:bg-white/15 px-2.5 py-1 rounded-lg text-xs font-medium text-white transition-colors cursor-pointer"
                >
                  <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                  <span className="whitespace-nowrap">Portal</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setBuscaMenuAberta((v) => {
                    if (v) setBuscaMenu("");
                    return !v;
                  });
                }}
                className="ml-auto shrink-0 p-1 rounded-lg flex items-center justify-center text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                aria-label={buscaMenuAberta ? "Fechar busca do menu" : "Buscar no menu"}
                aria-expanded={buscaMenuAberta}
                title="Buscar no menu"
              >
                {buscaMenuAberta ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="px-3">
            <div
              className={cn(
                "grid transition-all duration-200 ease-out motion-reduce:transition-none",
                buscaMenuAberta ? "grid-rows-[1fr] opacity-100 pt-2" : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/60" />
                  <input
                    ref={buscaMenuInputRef}
                    value={buscaMenu}
                    onChange={(e) => setBuscaMenu(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setBuscaMenu("");
                        setBuscaMenuAberta(false);
                      }
                    }}
                    tabIndex={buscaMenuAberta ? 0 : -1}
                    placeholder="Buscar no menu..."
                    aria-label="Buscar no menu"
                    className="w-full rounded-md bg-white/10 border border-white/15 pl-7 pr-2 py-1.5 text-xs text-white placeholder:text-white/50 outline-none focus:border-white/40 focus:bg-white/15"
                  />
                </div>
              </div>
            </div>
          </div>
          <nav
            ref={navScrollRef}
            onMouseEnter={() => {
              navHoverRef.current = true;
            }}
            onMouseLeave={() => {
              navHoverRef.current = false;
            }}
            className="flex-1 px-2 py-3 space-y-5 overflow-y-auto sidebar-scroll sidebar-mono"
          >
            {buscandoMenu && searchedNavRows.length === 0 && (
              <p className="px-3 py-2 text-xs text-white/60">Nenhum item encontrado.</p>
            )}
            {searchedNavRows.map((row) => {
              const leafIsActive = (to: string, hash?: string) => {
                const pathOk = location.pathname === to || (to !== "/app" && location.pathname.startsWith(`${to}/`));
                if (!pathOk) return false;
                if (!hash) return true;
                return (location.hash ?? "").replace(/^#/, "") === hash;
              };
              const itemHasActive = (it: NavItem): boolean =>
                isParent(it) ? it.children.some((c) => leafIsActive(c.to, c.hash)) : leafIsActive(it.to);
              const groupHasActive = row.items.some(itemHasActive);
              const hideLabel = subsystem === "gestao-pessoas" && row.label === "Recursos Humanos";
              const open = collapsed || hideLabel || buscandoMenu ? true : (openGroups[row.label] ?? true);
              return (
                <div
                  key={row.label}
                  className={cn("space-y-1")}
                >
                  {!collapsed && !hideLabel && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenGroups((prev) => ({ ...prev, [row.label]: !(prev[row.label] ?? true) }));
                      }}
                      className="w-full flex items-center justify-between px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-indigo-200 hover:text-white transition-colors rounded-md"
                      aria-expanded={open}
                    >
                      <span>{row.label}</span>
                      <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-0" : "-rotate-90"}`} />
                    </button>
                  )}
                  {open &&
                    row.items.map((item) => {
                      if (isParent(item)) {
                        const subActive = item.children.some((c) => leafIsActive(c.to, c.hash));
                        const subKey = `${row.label}::${item.label}`;
                        const subOpen = collapsed || buscandoMenu ? true : (openGroups[subKey] ?? false);
                        return (
                          <div
                            key={subKey}
                            className={cn("space-y-1 rounded-md", dragCls(navItemKey(item)))}
                            {...dragProps(row.label, navItemKey(item))}
                          >
                            {collapsed ? (
                              <div className="flex justify-center py-2" title={item.label}>
                                <item.icon className="h-[18px] w-[18px] shrink-0 opacity-80" />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setOpenGroups((prev) => ({ ...prev, [subKey]: !(prev[subKey] ?? false) }));
                                }}
                                className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium tracking-tight transition-all ${subActive ? "bg-white/10 text-white" : "text-white hover:bg-white/10 hover:text-white"}${hoverScaleCls}`}
                                aria-expanded={subOpen}
                              >
                                <item.icon className="h-[18px] w-[18px] shrink-0" />
                                <span className="flex-1 text-left leading-snug break-words">{item.label}</span>
                                <ChevronDown
                                  className={`h-3 w-3 transition-transform ${subOpen ? "rotate-0" : "-rotate-90"}`}
                                />
                              </button>
                            )}
                            {subOpen &&
                              item.children.map((child) => {
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
                                      className={`relative flex items-center gap-2.5 rounded-lg ${collapsed ? "px-2 justify-center" : "pl-8 pr-3"} py-2 text-[13px] font-medium tracking-tight transition-all text-white hover:bg-white/10 hover:text-white${hoverScaleCls}`}
                                    >
                                      <child.icon className="h-[18px] w-[18px] shrink-0" />
                                      {!collapsed && <span className="leading-snug break-words">{child.label}</span>}
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
                                      if (
                                        event.metaKey ||
                                        event.ctrlKey ||
                                        event.shiftKey ||
                                        event.altKey ||
                                        event.button !== 0
                                      )
                                        return;
                                      event.preventDefault();
                                      irPara(href);
                                    }}
                                    className={`relative flex items-center gap-2.5 rounded-lg ${collapsed ? "px-2 justify-center" : "pl-8 pr-3"} py-2 text-[13px] font-medium tracking-tight transition-all ${
                                      active
                                        ? "bg-white text-slate-900 shadow-sm"
                                        : "text-white hover:bg-white/10 hover:text-white"
                                    }${hoverScaleCls}`}
                                  >
                                    <child.icon className="h-[18px] w-[18px] shrink-0" />
                                    {!collapsed && <span className="leading-snug break-words">{child.label}</span>}
                                  </a>
                                );
                              })}
                          </div>
                        );
                      }
                      const aliases: string[] = (item as { aliases?: string[] }).aliases ?? [];
                      const active =
                        location.pathname === item.to ||
                        (item.to !== "/app" && location.pathname.startsWith(`${item.to}/`)) ||
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
                            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
                              return;
                            event.preventDefault();
                            irPara(href);
                          }}
                          {...dragProps(row.label, navItemKey(item))}
                          className={cn(
                            `relative flex items-center gap-2.5 rounded-lg ${collapsed ? "px-2 justify-center" : "px-3"} py-2 text-[13px] font-medium tracking-tight transition-all ${
                              active
                                ? "bg-white text-slate-900 shadow-sm"
                                : "text-white hover:bg-white/10 hover:text-white"
                            }${hoverScaleCls}`,
                            dragCls(navItemKey(item)),
                          )}
                        >
                          <item.icon className="h-[18px] w-[18px] shrink-0" />
                          {!collapsed && <span className="leading-snug break-words">{item.label}</span>}
                        </a>
                      );
                    })}
                </div>
              );
            })}
          </nav>
          <div className="shrink-0 px-2 py-2 border-t border-white/15 border-r border-r-white/20">
            <SidebarUserMenu
              userId={user?.id}
              userName={userName}
              email={user?.email}
              initial={initial}
              color={clinicColor}
              showName
              onChangePassword={() => setPwOpen(true)}
              onSignOut={() => void handleSignOut()}
              onSwitchPortal={() => abrirSeletorPortais()}
            />
          </div>
        </aside>
      )}

      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full">
        {!isChooser && (
        <header className="sticky top-0 z-30 h-14 bg-white text-slate-700 border-b border-slate-200 flex items-center justify-between gap-2 px-4 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-3 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 shrink-0">
          {!isChooser && (
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden h-9 w-9 -ml-1 rounded-md flex items-center justify-center text-slate-700 hover:text-slate-900 hover:bg-slate-100 shrink-0"
              aria-label="Abrir menu"
              title="Menu"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
          )}
          <Link to="/app" className="lg:hidden flex items-center gap-2 min-w-0 shrink-0" title="ClinicaOS">
            <Activity className="h-5 w-5 shrink-0 text-slate-800" />
          </Link>
          {!isChooser && (
            <button
              type="button"
              onClick={() => abrirSeletorPortais()}
              className="lg:hidden inline-flex items-center justify-center gap-1.5 h-9 w-9 sm:w-auto sm:px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-800 shrink-0"
              title="Trocar de portal"
            >
              <LayoutGrid className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline truncate max-w-[140px]">{subsystemLabel ?? "Portais"}</span>
            </button>
          )}
          </div>

          <div className="flex flex-1 items-center justify-end gap-3 min-w-0 sm:flex-none sm:justify-center">
          {clinicaAtual && (
            <img
              src="https://s3-sa-east-1.amazonaws.com/doctoralia.com.br/doctor/13fc26/13fc266c1e82a5993f2e7d1f0c1d67e0_220_square.jpg"
              alt={clinicaAtual.clinica.nome}
              className="hidden sm:block h-9 w-9 shrink-0 rounded-full object-cover border border-slate-200 shadow-sm"
            />
          )}
          {memberships.length > 0 && (
            <Select
              value={modoTodas ? "__todas__" : clinicaAtual?.clinica_id}
              onValueChange={(v) => {
                if (v === "__todas__") setModoTodas(true);
                else setClinicaAtual(v);
              }}
            >
              <SelectTrigger className="max-w-[180px] sm:max-w-sm w-auto min-w-0 h-9 px-2.5 text-xs font-semibold truncate shrink rounded-lg border-0 bg-slate-100 text-slate-800 shadow-none focus:ring-0 focus-visible:ring-0 hover:bg-slate-200 [&>svg]:w-4 [&>svg]:h-4 [&>svg]:shrink-0 [&>svg]:ml-1.5 [&>span]:truncate [&>span]:min-w-0">
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
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: corDaClinica(m.clinica.nome) }}
                      />
                      {m.clinica.nome} {m.clinica.cidade ? `— ${m.clinica.cidade}` : ""}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          </div>

          <div className="flex items-center justify-end gap-1.5 min-w-0">
            <div className="hidden md:flex min-w-0 max-w-[280px] mr-1">
              <UniversalSearchBar />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex h-9 w-9 p-0 rounded-full text-slate-700 hover:bg-slate-100 hover:text-slate-900"
              title="Atalhos de teclado (?)"
              onClick={() => {
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
              }}
            >
              <span className="text-base font-semibold">?</span>
            </Button>
            <div className="flex items-center gap-1.5 [&_button]:text-slate-700 [&_button:hover]:bg-slate-100 [&_button:hover]:text-slate-900">
              <EstornosBell />
              <TTSToggle />
            </div>
          </div>
        </header>
        )}
        <main
          key={uxMelhorias ? location.pathname : "static"}
          className={cn(
            "flex-1 min-h-0 overflow-y-auto overflow-x-hidden min-w-0",
            isChooser
              ? "p-0 w-full"
              : cn(
                  "px-3 pt-1 sm:px-4 sm:pt-1.5 lg:px-6 lg:pt-2",
                  // Espaço extra embaixo no mobile para não ficar atrás da bottom nav.
                  uxMelhorias ? "pb-28 sm:pb-28 md:pb-4 lg:pb-6" : "pb-3 sm:pb-4 lg:pb-6",
                ),
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
            className="w-[300px] p-0 border-0 text-white lg:hidden flex flex-col h-full max-h-[100dvh] overflow-hidden"
            style={{ backgroundColor: corSidebar }}
            onPointerDownOutside={() => setMobileNavOpen(false)}
            onInteractOutside={() => setMobileNavOpen(false)}
            onEscapeKeyDown={() => setMobileNavOpen(false)}
          >
            <SheetHeader className="shrink-0 px-4 py-3 border-b border-white/10 text-left">
              <SheetTitle className="text-white flex items-center gap-2 text-base">
                <Activity className="h-5 w-5 shrink-0 text-white" />
                ClinicaOS
                <span className="sr-only">Menu</span>
              </SheetTitle>
            </SheetHeader>
            <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-3 space-y-4 sidebar-mono sidebar-scroll">
              {visibleNavRows.map((row) => (
                <div key={row.label} className="space-y-1">
                  <div className="px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-indigo-200">
                    {row.label}
                  </div>
                  {row.items.map((item) => {
                    if (isParent(item)) {
                      return (
                        <MobileNavParent
                          key={item.label}
                          item={item}
                          onNavigate={(href) => {
                            setMobileNavOpen(false);
                            irPara(href);
                          }}
                        />
                      );
                    }
                    const active =
                      location.pathname === item.to || (item.to !== "/app" && location.pathname.startsWith(`${item.to}/`));
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
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-full text-sm font-semibold tracking-tight ${
                          active
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-white hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="leading-snug break-words">{item.label}</span>
                      </a>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="shrink-0 px-2 py-3 border-t border-white/15 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <SidebarUserMenu
                userId={user?.id}
                userName={userName}
                email={user?.email}
                initial={initial}
                color={clinicColor}
                showName
                onChangePassword={() => setPwOpen(true)}
                onSignOut={() => void handleSignOut()}
                onSwitchPortal={() => abrirSeletorPortais()}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}
      {!isChooser && uxMelhorias && (
        <LiquidBottomNav
          pathname={location.pathname}
          onNavigate={irPara}
          cor={corSidebar}
          onMais={() => setMobileNavOpen(true)}
        />
      )}
      {seletorPortaisAberto && !isChooser && (
        <div
          className="fixed inset-0 z-[60] overflow-y-auto bg-background"
          role="dialog"
          aria-modal="true"
          aria-label="Escolha o seu portal"
        >
          <button
            type="button"
            onClick={() => fecharSeletorPortais()}
            className="absolute top-4 right-4 z-10 h-9 w-9 rounded-full bg-white/80 text-slate-600 shadow-md ring-1 ring-slate-200 flex items-center justify-center hover:bg-white"
            aria-label="Fechar seleção de portais"
            title="Voltar"
          >
            <X className="h-4 w-4" />
          </button>
          <PortalLauncher onPick={escolherPortal} className="min-h-[100dvh]" />
        </div>
      )}
    </div>
  );
}
