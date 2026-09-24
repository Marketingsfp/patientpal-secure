import { AppSidebarLayout } from "@/components/app-sidebar-layout";
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
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
  ClipboardCheck,
  MessageCircle,
  Mic,
  Network,
  Target,
  Clock,
  BookOpen,
  Workflow,
  FileText,
  CreditCard,
  HeartHandshake,
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
  Tag,
  Briefcase,
  MapPin,
  Palmtree,
  GraduationCap,
  Sparkles,
  Filter,
  Send,
  Megaphone,
  KeyRound,
  FolderOpen,
  BadgeCheck,
  LayoutGrid,
  Zap,
  Coffee,
  Play,
  Eye,
  ArrowRightLeft,
  Inbox,
  FileBarChart2,
  Receipt,
  Menu as MenuIcon,
  Columns3,
  ChevronUp,
  Home,
} from "lucide-react";
import { Tooth } from "@/components/icons/tooth";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { useCatalogoAtualizado } from "@/hooks/use-catalogo-atualizado";
import { usePermissoes } from "@/hooks/use-permissoes";
import {
  ROUTE_TO_MODULE as SHARED_ROUTE_TO_MODULE,
  moduloDaRota,
  moduloPermitido,
  rotaSomenteAdmin,
} from "@/lib/permissoes-rotas";
import { SemPermissao } from "@/components/sem-permissao";
import { supabase } from "@/integrations/supabase/client";
import {
  getSubsystem,
  setSubsystem,
  subscribeSubsystem,
  SUBSYSTEMS,
  type SubsystemId,
} from "@/lib/subsystem";
import { hrefDoNavLeaf, navLeafAtivo } from "@/lib/nav-hash";
import {
  PortalLauncher,
  abrirSeletorPortais,
  fecharSeletorPortais,
  useSeletorPortaisAberto,
} from "@/components/portal-launcher";
import { CentralAtencao } from "@/components/nina/CentralAtencao";

import logoSaoFranciscoCdn from "@/assets/logo-policlinica-sao-francisco-de-paula.png.asset.json";
import logoMeninoJesus from "@/assets/logo-menino-jesus.png";
import logoConsultaHoje from "@/assets/logo-consulta-hoje.png";
import { EstornosBell } from "@/components/EstornosBell";
import { BotaoTabelaValores } from "@/components/tabela-valores/tabela-valores-dialog";
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
  // Precisa ser uma cor literal, não `var(--...)`: o retorno vira `clinicColor`,
  // que é gravado em `--primary` e `--ring` no <html> e também é lido pelo
  // cálculo de contraste (que só entende hexadecimal). Um `var()` aqui deixaria
  // `--primary` inválido e TODO `bg-primary`/`text-primary` do app ficaria sem
  // cor. Mesmo neutro usado no modo "todas as clínicas".
  return "#0f172a";
}

/** Identificador da clínica usado no <html> para trocar a paleta de marca. */
function slugDaClinica(nome?: string): "sao-francisco" | "menino-jesus" | null {
  const n = (nome ?? "").toLowerCase();
  if (n.includes("são francisco") || n.includes("sao francisco")) return "sao-francisco";
  if (n.includes("menino jesus")) return "menino-jesus";
  return null;
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
  if (n.includes("são francisco") || n.includes("sao francisco")) return logoSaoFranciscoCdn.url;
  if (n.includes("menino jesus")) return logoMeninoJesus;
  if (n.includes("consulta hoje")) return logoConsultaHoje;
  return null;
}
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { AcessibilidadeProvider } from "@/components/acessibilidade/AcessibilidadeProvider";
import { AtalhosAcessibilidade } from "@/components/acessibilidade/AtalhosAcessibilidade";
import { BotaoAcessibilidade } from "@/components/acessibilidade/BotaoAcessibilidade";
import { aplicarCaixaAlta } from "@/components/ui/caixa-alta";

const VoiceInput = lazy(() =>
  import("@/components/voice-input").then((m) => ({ default: m.VoiceInput })),
);
const ChangePasswordDialog = lazy(() =>
  import("@/components/change-password-dialog").then((m) => ({ default: m.ChangePasswordDialog })),
);

type NavLeaf = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  hash?: string;
  aliases?: ReadonlyArray<string>;
  /**
   * Palavras que também encontram este item na busca do menu, além do rótulo.
   * Serve para os nomes que a equipe usa no dia a dia e que não cabem no
   * rótulo — o médico procura por "prontuário" e precisa achar a tela de
   * atendimento, que no menu tem outro nome.
   */
  busca?: ReadonlyArray<string>;
};
type NavParent = { label: string; icon: typeof LayoutDashboard; children: ReadonlyArray<NavLeaf> };
type NavItem = NavLeaf | NavParent;
const isParent = (it: NavItem): it is NavParent => "children" in it;

/** Rótulo do item somado aos sinônimos usados pela busca do menu lateral. */
const textoBuscavel = (it: NavLeaf): string => [it.label, ...(it.busca ?? [])].join(" ");

// Chave estável de um item de menu para a ordem personalizada por usuário
// (leaf = rota + hash; grupo expansível = prefixo com o rótulo).
const navItemKey = (it: NavItem): string =>
  isParent(it) ? `grupo:${it.label}` : `${it.to}${it.hash ? `#${it.hash}` : ""}`;

// Rotas que só ficam ativas em correspondência exata. "/app/clientes" tem
// sub-rotas com item próprio no menu (ex.: "/app/clientes/duplicados"), então
// o item pai não deve acender quando o usuário está numa sub-rota. O mesmo
// vale para as telas-raiz de Odontologia e Fisioterapia, que são prefixo das
// irmãs "/orcamentos" e "/pacotes" — sem isso os dois itens do grupo
// acenderiam ao mesmo tempo.
const ROTAS_MATCH_EXATO: ReadonlySet<string> = new Set([
  "/app",
  "/app/clientes",
  "/app/odontologia",
  "/app/fisioterapia",
]);

/** True quando o item do menu (`to`) corresponde à rota atual. */
export function itemDeMenuAtivo(pathname: string, to: string): boolean {
  // Rota de índice pode chegar com barra no fim ("/app/odontologia/"), que é o
  // caminho que o roteador gera para o arquivo `.index.tsx`. Sem normalizar, o
  // item de menu correspondente ficaria apagado nesse endereço.
  const p = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (ROTAS_MATCH_EXATO.has(to)) return p === to;
  return p === to || p.startsWith(`${to}/`);
}

// Barra inferior do celular (`md:hidden`), em todas as clínicas: os 4 atalhos
// mais usados. O resto do menu continua acessível pelo botão "Mais", que abre
// a mesma gaveta lateral do hambúrguer.
type BottomNavItem = { to: string; label: string; Icon: typeof CalendarDays };

const BOTTOM_NAV_ITENS: ReadonlyArray<BottomNavItem> = [
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
  itens,
}: {
  pathname: string;
  onNavigate: (to: string) => void;
  onMais: () => void;
  cor: string;
  /** Já filtrado pelas permissões do perfil — ver `bottomNavItens`. */
  itens: ReadonlyArray<BottomNavItem>;
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

  const rotaIdx = itens.findIndex((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));
  // Índice "otimista": move o indicador no toque, sem esperar a rota montar.
  const [idxOtimista, setIdxOtimista] = useState<number | null>(null);
  const [, startNav] = useTransition();
  useEffect(() => {
    setIdxOtimista(null);
  }, [rotaIdx]);
  const activeIdx = idxOtimista ?? rotaIdx;
  const slots = itens.length + 1;
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
        // No escuro a barra inferior segue a mesma superfície do menu lateral
        // em vez da cor cheia da clínica (ver comentário no <aside>).
        className="relative w-full rounded-t-2xl text-white shadow-2xl px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] flex items-stretch transform-gpu will-change-transform dark:bg-sidebar!"
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
        {itens.map(({ to, label, Icon }, idx) => {
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
                "flex-1 flex flex-col items-center justify-end gap-0.5 rounded-full px-2 pb-2 pt-3 text-[12px] font-medium transition-colors duration-300",
                active ? "text-white" : "text-white/70 hover:text-white",
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
          className="flex-1 flex flex-col items-center justify-end gap-0.5 rounded-full px-2 pb-2 pt-3 text-[12px] font-medium text-white/70 transition-colors duration-300 hover:text-white"
        >
          <MenuIcon className="h-5 w-5 shrink-0" />
          <span className="leading-none">Mais</span>
        </button>
      </nav>
      {navW > 0 && activeIdx >= 0 && (
        <div
          aria-hidden
          // `dark:bg-white` é intencional: a bolha do item ativo precisa
          // continuar branca para o ícone, que é pintado com a cor da
          // clínica, ter contraste em cima da barra escura.
          className="pointer-events-none absolute top-0 left-0 h-12 w-12 -mt-5 flex items-center justify-center rounded-full bg-card dark:bg-white shadow-lg transform-gpu will-change-transform"
          style={{
            color: cor,
            transform: `translate3d(${cx - 24}px, 0, 0)`,
            transition: `transform ${DUR} ${EASE}`,
          }}
        >
          {(() => {
            const Ativo = itens[activeIdx].Icon;
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

/**
 * O item de menu desta rota aparece para o usuário atual?
 *
 * Usa exatamente a mesma regra da guarda de rota (`moduloPermitido`): item
 * escondido no menu é item que também não abre pela URL, e item liberado na
 * URL é item que também aparece no menu. Antes eram dois trechos de código
 * parecidos, mas não iguais — e um submódulo novo sumia do menu apesar de a
 * tela abrir normalmente.
 *
 * A rota do menu é consultada por chave EXATA em ROUTE_TO_MODULE (sem casar
 * por prefixo), para que um item novo sem cadastro no mapa apareça como
 * ausente no teste de regressão em vez de herdar a permissão do vizinho.
 */
function leafAllowed(
  to: string,
  allowed: Set<string> | null,
  configured?: Set<string> | null,
): boolean {
  if (!allowed) return true;
  const mod = ROUTE_TO_MODULE[to];
  if (mod === undefined) return false; // rota não mapeada → ocultar
  return moduloPermitido(mod, allowed, configured);
}

const navRows: ReadonlyArray<{ label: string; items: ReadonlyArray<NavItem> }> = [
  {
    label: "Operação",
    items: [
      { to: "/app/painel", label: "Dashboard", icon: LayoutDashboard },
      { to: "/app/agenda", label: "Agenda", icon: CalendarDays },
      { to: "/app/agenda-medicos", label: "Escala e Horários", icon: Columns3 },
      { to: "/app/atendimento-multiplo", label: "Atendimento Múltiplo", icon: ClipboardList },
      { to: "/app/checkin", label: "Check-in", icon: BadgeCheck },
      { to: "/app/caixa", label: "Caixa", icon: Wallet },
      { to: "/app/chat", label: "Chat interno", icon: MessageCircle },
      { to: "/app/clientes", label: "Clientes", icon: Contact },
      { to: "/app/painel-executivo", label: "Painel Executivo", icon: FileBarChart2 },
      { to: "/app/fluxo", label: "Fluxo do paciente", icon: Workflow },
      { to: "/app/orcamentos", label: "Orçamentos", icon: FileText },
      { to: "/app/recepcao", label: "Recepção / Filas", icon: ConciergeBell },
      { to: "/app/tabela-valores", label: "Tabela de valores", icon: Tag },
      { to: "/app/triagem-enfermagem", label: "Triagem - Enfermagem", icon: HeartPulse },
      { to: "/app/cartao-beneficios/contratos", label: "Cartão Benefícios", icon: CreditCard },
      {
        to: "/app/cartao-terapeutico/contratos",
        label: "Cartão Terapêutico",
        icon: HeartHandshake,
      },
      { to: "/app/documentos", label: "Documentos do paciente", icon: FileText },
      { to: "/app/anamneses", label: "Anamneses", icon: FileHeart },
      { to: "/app/hiperdia", label: "Hiperdia", icon: HeartPulse },
      { to: "/app/consulta-ia", label: "Apoio Clínico", icon: ClipboardCheck },
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
      // "Perfis" define o que cada PERFIL abre; "Equipe e acessos" marca, pessoa
      // a pessoa, quem é da gestão. São coisas diferentes e ficam lado a lado
      // de propósito: quem procura uma costuma querer a outra.
      { to: "/app/equipe-acessos", label: "Equipe e acessos", icon: ShieldCheck },
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
      { to: "/app/revisao-convenio", label: "Revisão de convênio", icon: ShieldCheck },
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
      // Tela clínica do médico: fila dos pacientes do dia dele com o botão de
      // abrir o prontuário. O rótulo começa por "Meus Pacientes" porque é o
      // nome que os médicos procuram no menu.
      {
        to: "/app/atendimento-ia",
        label: "Meus Pacientes — Atendimento",
        icon: Stethoscope,
        busca: [
          "atendimento medico",
          "prontuario eletronico",
          "prontuario",
          "consultorio",
          "fila do medico",
        ],
      },
      // Histórico clínico de TODOS os pacientes da clínica, em ordem de data.
      // A tela existia desde sempre, mas não tinha item de menu nenhum: só
      // chegava nela quem digitasse o endereço ou caísse pela busca. O médico
      // que terminava um atendimento não tinha caminho para reler o que
      // escreveu, nem para consultar a consulta anterior do paciente.
      {
        to: "/app/prontuarios",
        label: "Prontuários — Histórico",
        icon: FileHeart,
        busca: [
          "prontuario",
          "prontuarios",
          "historico clinico",
          "historico do paciente",
          "evolucao",
          "consultas anteriores",
        ],
      },
      { to: "/app/crm", label: "CRM", icon: Target },
      { to: "/app/alertas-enfermagem", label: "Enfermeira IA — Alertas", icon: BellRing },
      { to: "/app/consulta-rapida", label: "Informações rápidas", icon: BookOpen },
      // O antigo grupo "Nina — WhatsApp" saiu daqui: tudo de atendimento por
      // mensagem passou a viver no portal "OS ZAP", nas seções
      // "Atendimento", "Nina" e "Configurações do WhatsApp" logo abaixo.
      {
        // Grupo expansível por especialidade. Cada filho tem rota própria —
        // antes os dois apontavam para a mesma rota e a tela escolhia a aba
        // pelo hash, o que deixava o endereço igual para telas diferentes.
        label: "Odontologia",
        icon: Tooth,
        children: [
          {
            to: "/app/odontologia",
            label: "Odontograma & Prontuário",
            icon: Tooth,
          },
          {
            to: "/app/odontologia/orcamentos",
            label: "Orçamentos de Odonto",
            icon: Receipt,
          },
        ],
      },
      {
        // Mesma estrutura da Odontologia: um grupo por especialidade, com a
        // tela clínica e a tela de gestão em rotas separadas.
        label: "Fisioterapia",
        icon: Activity,
        children: [
          {
            to: "/app/fisioterapia",
            label: "Mapa Corporal & Avaliação",
            icon: Activity,
          },
          {
            to: "/app/fisioterapia/pacotes",
            label: "Pacotes de Sessões",
            icon: ClipboardList,
          },
        ],
      },
      { to: "/app/exames-resultados", label: "Resultados de Exames", icon: FlaskConical },
    ],
  },
  {
    label: "Configurações",
    items: [
      { to: "/app/configuracoes/prontuario", label: "Numeração de Prontuário", icon: FolderOpen },
      { to: "/app/configuracoes/painel-totem", label: "Painel & Totem", icon: KeyRound },
      { to: "/app/configuracoes/voz", label: "Voz & Áudio (TTS)", icon: KeyRound },
      { to: "/app/clinicas", label: "Clínicas", icon: Building2 },
      { to: "/app/backups", label: "Backups", icon: ShieldCheck },
    ],
  },
  // ---------------------------------------------------------------------
  // Portal "OS ZAP" (atendimento por WhatsApp). As três seções abaixo só aparecem
  // nesse portal (o filtro do menu é por rótulo de seção). Nenhum endereço
  // mudou: são os mesmos itens que antes ficavam em "Inteligência" e
  // "Configurações", e o módulo de permissão continua sendo "nina".
  // ---------------------------------------------------------------------
  {
    label: "Atendimento",
    items: [
      { to: "/app/nina", hash: "atend-inbox", label: "Conversas WhatsApp", icon: Inbox },
      { to: "/app/nina", hash: "atend-macros", label: "/ Mensagens prontas", icon: Zap },
    ],
  },
  {
    label: "Nina",
    items: [
      {
        to: "/app/nina",
        hash: "base-conhecimento",
        label: "Base de conhecimentos",
        icon: BookOpen,
      },
      {
        to: "/app/nina",
        hash: "homologacao",
        label: "Homologação (chat)",
        icon: MessageCircle,
      },
      { to: "/app/nina", hash: "laboratorio-nina", label: "Laboratório Nina", icon: FlaskConical },
      { to: "/app/nina-aprendizado", label: "Revisão de Aprendizados", icon: ShieldCheck },
      { to: "/app/nina-metricas", label: "Métricas de Aprendizado", icon: BarChart3 },
      { to: "/app/nina-arquitetura", label: "Arquitetura", icon: Network },
    ],
  },
  {
    label: "Configurações do WhatsApp",
    items: [
      { to: "/app/nina", hash: "config", label: "Configuração", icon: KeyRound },
      { to: "/app/nina", hash: "templates", label: "Templates aprovados (Meta)", icon: FileText },
    ],
  },
  // ---------------------------------------------------------------------
  // Portal "Coach WhatsApp" (treinamento e avaliação de atendentes).
  // ---------------------------------------------------------------------
  {
    label: "Treinamento",
    items: [
      { to: "/app/coach", label: "Coach WhatsApp", icon: GraduationCap },
      { to: "/app/coach", hash: "progresso", label: "Progresso do curso", icon: BarChart3 },
      { to: "/app/coach", hash: "conversas", label: "Conversas & ligações", icon: MessageCircle },
      { to: "/app/coach", hash: "perfis", label: "Perfis & evolução", icon: Users },
      { to: "/app/coach", hash: "vozes", label: "Vozes", icon: Mic },
      { to: "/app/coach", hash: "analise", label: "Analisar atendimento", icon: Sparkles },
    ],
  },
];

// Rota "principal" de cada portal — é para onde o hub (/app) e o seletor de
// portais mandam o usuário quando ele clica no módulo (Clínica Médica →
// /app/painel, Funcionários / RH → /app/hr-ponto).
const ROTAS_HOME_PORTAL: ReadonlySet<string> = new Set(
  Object.values(SUBSYSTEMS).map((s) => s.home),
);

/**
 * A qual portal uma tela pertence, olhando a seção do menu em que ela está.
 * Serve para que um link antigo (ex.: /app/nina, que agora vive no portal
 * OS ZAP) não fique "fora do menu" quando o usuário estiver
 * com outro portal ativo: o portal correto é assumido automaticamente.
 * Telas em seções compartilhadas (Gestão, Configurações) devolvem `null` —
 * elas pertencem a mais de um portal e não devem trocar nada.
 */
function portalDaRota(path: string): SubsystemId | null {
  const secao = navRows.find((row) =>
    row.items.some((it) =>
      isParent(it)
        ? it.children.some((c) => c.to === path)
        : it.to === path || (it.aliases ?? []).includes(path),
    ),
  );
  if (!secao) return null;
  const donos = (Object.keys(SUBSYSTEMS) as SubsystemId[]).filter((id) =>
    SUBSYSTEMS[id].groups.includes(secao.label),
  );
  return donos.length === 1 ? donos[0]! : null;
}

/**
 * Famílias de rotas em que a tela é a MESMA instância mesmo quando o endereço
 * muda (ex.: links antigos /app/nina/<conversa>, que apenas voltam para a
 * Inbox). Trocar a `key` da área principal nesses casos remontaria a tela
 * inteira — lista, filtros, cache, prefetch e rascunhos — a cada clique.
 *
 * A comparação é por segmento exato, então /app/nina-metricas e
 * /app/nina-aprendizado continuam sendo telas independentes.
 */
const FAMILIAS_ROTA_ESTAVEL: readonly string[] = ["/app/nina"];

export function chaveAreaPrincipal(pathname: string): string {
  for (const base of FAMILIAS_ROTA_ESTAVEL) {
    if (pathname === base || pathname.startsWith(`${base}/`)) return base;
  }
  return pathname;
}

/**
 * Primeira tela que o usuário realmente pode abrir, na ordem em que ela
 * aparece no menu lateral já filtrado (portal + permissões + feature flags +
 * ordem personalizada). Grupos expansíveis (ex.: Nina) entram pelo primeiro
 * filho. Retorna null quando não sobrou nenhuma tela visível.
 */
function primeiraRotaVisivel(
  rows: ReadonlyArray<{ label: string; items: ReadonlyArray<NavItem> }>,
): { to: string; hash?: string } | null {
  for (const row of rows) {
    for (const item of row.items) {
      if (!isParent(item)) return { to: item.to };
      const filho = item.children[0];
      if (filho) return { to: filho.to, hash: filho.hash };
    }
  }
  return null;
}

export function AppShell() {
  return (
    <AcessibilidadeProvider>
      <AtalhosAcessibilidade />
      <AppShellInner />
    </AcessibilidadeProvider>
  );
}

function AppShellInner() {
  const { user, signOut, loading } = useAuth();
  const { memberships, clinicaAtual, setClinicaAtual, modoTodas, setModoTodas, branding } =
    useClinica();
  const {
    allowed: allowedModules,
    configured: configuredModules,
    loading: permsLoading,
  } = usePermissoes();
  // Catálogo (especialidades, serviços e médicos) alterado por um
  // administrador em OUTRA máquina só chegava aqui depois de recarregar a
  // página inteira. Revalida quando a janela volta ao foco.
  useCatalogoAtualizado(clinicaAtual?.clinica_id ?? null);
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
  // Guarda o último destino pedido: se o usuário clicar em dois itens
  // seguidos, a rede de segurança abaixo não pode puxar a tela de volta para o
  // primeiro.
  const ultimoDestinoRef = useRef<string | null>(null);
  const irPara = (href: string) => {
    if (!uxMelhorias) {
      window.location.assign(href);
      return;
    }
    // Navegação SPA pela API oficial do roteador. Antes aqui havia
    // `router.history.push(href)`, que empurra o endereço direto no histórico
    // sem passar pelo roteador: quando o histórico saía de sincronia, o clique
    // no menu não abria nada — a gaveta fechava e a tela continuava a mesma.
    const [destino, ancora] = href.split("#");
    const origem = `${window.location.pathname}${window.location.hash}`;
    ultimoDestinoRef.current = href;
    void Promise.resolve(navigate({ to: destino, hash: ancora || undefined })).catch(() => {});
    // Rede de segurança: um clique no menu NUNCA pode terminar em "não
    // aconteceu nada" no balcão da clínica. Se em 1,2s o endereço continuar
    // exatamente onde estava, abrimos a tela recarregando a página — mais
    // lento, porém infalível. Quando a navegação funciona, o endereço muda na
    // hora (mesmo com a tela ainda carregando) e nada disso roda.
    window.setTimeout(() => {
      const alvo = ultimoDestinoRef.current;
      if (!alvo || alvo !== href) return;
      const atual = `${window.location.pathname}${window.location.hash}`;
      if (atual !== origem || atual === alvo) return;
      window.location.assign(alvo);
    }, 1200);
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
  // Aberto, o menu ocupa uma coluna e desloca o conteúdo; fechado, devolve
  // toda a largura ao atendimento. AppSidebarLayout adapta as telas pequenas.
  const [sidebarAberta, setSidebarAberta] = useState(false);
  // Busca/filtro das telas dentro do menu lateral.
  const [buscaMenu, setBuscaMenu] = useState("");
  const buscaMenuInputRef = useRef<HTMLInputElement | null>(null);

  // Fechar limpa o termo: na próxima abertura, um filtro esquecido esconderia
  // itens do menu sem o usuário entender o porquê.
  const fecharSidebar = useCallback(() => {
    setSidebarAberta(false);
    setBuscaMenu("");
  }, []);

  const alternarSidebar = useCallback(() => {
    setSidebarAberta((v) => {
      if (v) setBuscaMenu("");
      return !v;
    });
  }, []);

  // Esc fecha o menu. Com o cursor na busca e algo digitado, o primeiro
  // Esc só limpa a busca.
  useEffect(() => {
    if (!sidebarAberta) return;
    const aoEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (e.target === buscaMenuInputRef.current && buscaMenu) return;
      fecharSidebar();
    };
    window.addEventListener("keydown", aoEsc);
    return () => window.removeEventListener("keydown", aoEsc);
  }, [sidebarAberta, fecharSidebar, buscaMenu]);

  // Ctrl+B (ou ⌘B) alterna o menu, padrão da maioria dos editores. Ignorado
  // enquanto o usuário digita, para não atrapalhar campos de texto.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== "b") return;
      const alvo = e.target as HTMLElement | null;
      if (
        alvo &&
        (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      alternarSidebar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [alternarSidebar]);
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
  // Fecha a gaveta ao navegar (inclusive por atalho de teclado ou voltar do
  // navegador, não só pelo clique no item do menu).
  useEffect(() => {
    setSidebarAberta(false);
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
                : /terap[êe]utic/.test(t)
                  ? "/app/cartao-terapeutico/contratos"
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
                                      : /consulta r[áa]pida|lembrete|valor|tabela|hor[áa]rio/.test(
                                            t,
                                          )
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

  // O redirecionamento acontece dentro de signOut (recarga completa da
  // página, para descartar o cache do React Query). Não use navigate aqui:
  // navegação SPA mantém o cache em memória.
  const handleSignOut = async () => {
    await signOut();
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
    // A cor da clínica é gravada em `--clinic-color`, e o CSS deriva dela o
    // `--primary`, o `--ring` e o realce (ver styles.css).
    //
    // Antes o `--primary` era escrito aqui direto. Como `style` no elemento
    // vence qualquer regra de folha de estilo, o tema escuro não conseguia
    // ajustar a cor — e as cores das clínicas são escuras (o azul da Menino
    // Jesus é #00008B), então no fundo escuro todo `text-primary` e
    // `border-primary` ficava ilegível. Passando pela variável intermediária,
    // o tema claro usa a cor como está e o escuro usa a mesma cor clareada.
    root.style.setProperty("--clinic-color", clinicColor);
    return () => {
      root.style.removeProperty("--clinic-color");
    };
  }, [clinicColor]);

  // Marca a clínica ativa no <html> para a paleta de marca (tela de portais).
  const nomeClinicaAtual = clinicaAtual?.clinica.nome;
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const slug = modoTodas ? null : slugDaClinica(nomeClinicaAtual);
    if (slug) root.dataset["clinica"] = slug;
    else delete root.dataset["clinica"];
    return () => {
      delete root.dataset["clinica"];
    };
  }, [modoTodas, nomeClinicaAtual]);


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
  // Link antigo/atalho para uma tela de outro portal: assume o portal dono da
  // tela em vez de deixar o menu sem o item. Não navega, não mexe em permissão.
  const caminhoAtivo = location.pathname;
  useEffect(() => {
    if (!subsystem) return;
    const path =
      caminhoAtivo.length > 1 && caminhoAtivo.endsWith("/")
        ? caminhoAtivo.slice(0, -1)
        : caminhoAtivo;
    const dono = portalDaRota(path);
    if (dono && dono !== subsystem) setSubsystem(dono);
  }, [caminhoAtivo, subsystem]);

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
  // Antes havia aqui um bypass por e-mail fixo ("isRodrigoFullAccess"), que
  // liberava o menu inteiro para um endereço específico. Autorização baseada
  // em string de e-mail é trocável no painel do Supabase e não deixa rastro
  // de auditoria — quem precisar de acesso amplo deve receber o papel/perfil
  // correspondente em Perfis de Acesso.
  const permissionFilteredRows = scopedNavRows
    .map((row) => {
      const items = row.items
        .map((item): NavItem | null => {
          if (isParent(item)) {
            // Grupo expansível (Odontologia, Fisioterapia): cada filho tem o
            // módulo dele, então o grupo aparece quando pelo menos um filho
            // está liberado — e mostra só os filhos liberados. Antes olhava
            // apenas o primeiro filho, e fechar a tela principal escondia
            // junto a tela de orçamentos/pacotes que continuava liberada.
            const filhos = item.children.filter((c) =>
              leafAllowed(c.to, allowedModules, configuredModules),
            );
            if (filhos.length === 0) return null;
            return { ...item, children: filhos };
          }
          return leafAllowed(item.to, allowedModules, configuredModules) ? item : null;
        })
        .filter((it): it is NavItem => it !== null);
      return { ...row, items };
    })
    .filter((row) => row.items.length > 0);
  // Feature flag por clínica: `atendimento_multiplo_disabled` remove o item
  // "Atendimento Múltiplo" do menu para a clínica atual.
  const { disabled: atendimentoMultiploDisabled } = useAtendimentoMultiploDisabled();
  // Obs.: a flag `nina_desativada` desliga apenas a ASSISTENTE de IA (chat e
  // respostas automáticas). A ferramenta de atendimento do WhatsApp continua
  // no menu, pois é usada pela equipe manualmente.
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

  // Barra inferior do celular: só entram as telas que o perfil realmente pode
  // abrir. Sem esse filtro uma recepcionista veria "Início" e "Caixa" fixos no
  // rodapé e tocaria neles para cair em "Acesso negado".
  const bottomNavItens = useMemo(
    () => BOTTOM_NAV_ITENS.filter((i) => leafAllowed(i.to, allowedModules, configuredModules)),
    [allowedModules, configuredModules],
  );

  // Portal sem nenhuma tela liberada não aparece no hub nem no seletor.
  // O OS ZAP depende do módulo "nina", o mesmo de sempre — nenhum módulo novo.
  const portaisOcultos = useMemo<SubsystemId[]>(() => {
    const ocultos: SubsystemId[] = [];
    if (!leafAllowed("/app/nina", allowedModules, configuredModules)) ocultos.push("os-zap");
    // Coach WhatsApp: some para quem não tem o módulo, como já era com o OS ZAP.
    if (!leafAllowed("/app/coach", allowedModules, configuredModules)) ocultos.push("coach");
    return ocultos;
  }, [allowedModules, configuredModules]);

  // Resultado da busca do menu lateral (sem acento, case-insensitive).
  const termoMenu = buscaMenu.trim();
  const buscandoMenu = termoMenu.length > 0;
  const searchedNavRows = useMemo(() => {
    if (!buscandoMenu) return visibleNavRows;
    const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const alvo = norm(termoMenu);
    return visibleNavRows
      .map((row) => {
        const items = row.items
          .map((it) => {
            if (!isParent(it)) return norm(textoBuscavel(it)).includes(alvo) ? it : null;
            if (norm(it.label).includes(alvo)) return it;
            const children = it.children.filter((c) => norm(textoBuscavel(c)).includes(alvo));
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
      ? cn(
          dragMenu.key === key && "opacity-50",
          dragOverKey === key && dragMenu.key !== key && "ring-1 ring-white/70",
        )
      : "";
  const subsystemLabel = subsystem ? SUBSYSTEMS[subsystem].label : null;

  // Troca rápida de ambiente (menu em grade do botão de portal). Cada destino
  // só aparece se o perfil pode abrir pelo menos uma das telas candidatas, na
  // ordem de preferência — assim ninguém cai em "Acesso negado" pelo atalho.
  const ambientesRapidos = useMemo(() => {
    const opcoes: Array<{
      key: string;
      label: string;
      icon: typeof Home;
      portal: SubsystemId | null;
      candidatas: string[];
    }> = [
      { key: "portal", label: "Portal Geral", icon: Home, portal: null, candidatas: ["/app"] },
      {
        key: "recepcao",
        label: "Recepção / Atendimentos",
        icon: ConciergeBell,
        portal: "recepcao",
        candidatas: ["/app/recepcao", "/app/agenda"],
      },
      {
        key: "financeiro",
        label: "Financeiro",
        icon: DollarSign,
        portal: "recepcao",
        candidatas: ["/app/financeiro"],
      },
      {
        key: "os-zap",
        label: "OS ZAP / Central de Atendimento",
        icon: MessageCircle,
        portal: "os-zap",
        candidatas: ["/app/nina"],
      },
      {
        key: "coach",
        label: "Coach WhatsApp",
        icon: GraduationCap,
        portal: "coach",
        candidatas: ["/app/coach"],
      },
    ];
    return opcoes
      .map((o) => ({
        ...o,
        destino:
          o.portal === null
            ? "/app"
            : o.candidatas.find((c) => leafAllowed(c, allowedModules, configuredModules)),
      }))
      .filter((o): o is typeof o & { destino: string } => Boolean(o.destino));
  }, [allowedModules, configuredModules]);

  const irParaAmbiente = (portal: SubsystemId | null, destino: string) => {
    fecharSidebar();
    if (portal) setSubsystem(portal);
    navigate({ to: destino });
  };

  // Cabeçalho recolhido (modo foco) — só existe no OS ZAP, onde a conversa
  // precisa de toda a altura da tela. Fica salvo neste navegador.
  const [headerRecolhidoPref, setHeaderRecolhidoPref] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("appshell:oszap-header-recolhido") === "1";
    } catch {
      return false;
    }
  });
  const alternarHeaderRecolhido = (valor: boolean) => {
    setHeaderRecolhidoPref(valor);
    try {
      window.localStorage.setItem("appshell:oszap-header-recolhido", valor ? "1" : "0");
    } catch {
      /* navegador sem armazenamento: vale só nesta sessão */
    }
  };
  const podeRecolherHeader = subsystem === "os-zap";
  const headerRecolhido = podeRecolherHeader && headerRecolhidoPref;

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
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tgt.isContentEditable)
          return;
        if (tgt.closest('[role="dialog"], [role="listbox"], [role="menu"], [role="combobox"]'))
          return;
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
      else
        next =
          e.key === "ArrowDown"
            ? (idx + 1) % items.length
            : (idx - 1 + items.length) % items.length;

      e.preventDefault();
      // Apenas move o foco — o Enter (padrão do link) é que abre a página.
      const alvo = items[next];
      alvo?.focus({ preventScroll: true });
      alvo?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A sidebar não é mais rolada automaticamente ao trocar de rota: a posição
  // de scroll escolhida pelo usuário é preservada durante a navegação.

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
    // Rotas administrativas: só o admin da clínica entra, mesmo digitando a URL.
    if (rotaSomenteAdmin(location.pathname)) return allowedModules === null;
    // Mesma regra do menu lateral (`leafAllowed`): submódulo sem linha salva
    // herda o pai, submódulo com linha salva vale pelo que está salvo, e a
    // casca de abas do Financeiro abre quando uma aba está liberada.
    return moduloPermitido(currentModulo, allowedModules, configuredModules);
  })();
  // Entrar num portal não pode terminar em "Acesso negado". A rota principal
  // da Clínica Médica é o Dashboard (/app/painel), que perfis operacionais
  // (Recepção, Médico, Caixa, Financeiro, Enfermagem) normalmente não têm —
  // o usuário só clicou no módulo, não pediu aquela tela. Nesse caso mandamos
  // ele, sem aviso, para a primeira tela do menu a que ele tem acesso (Agenda,
  // Clientes, Atendimento médico…). Fora das rotas-home de portal o
  // comportamento continua o mesmo: URL digitada ou link direto para uma tela
  // sem permissão segue mostrando o bloqueio, que é o aviso correto ali.
  const pathAtual =
    location.pathname.length > 1 && location.pathname.endsWith("/")
      ? location.pathname.slice(0, -1)
      : location.pathname;
  const areaConversas =
    pathAtual === "/app/nina" &&
    ["", "chat", "atend-inbox", "homologacao"].includes((location.hash ?? "").replace(/^#/, ""));
  const destinoPortal =
    !permsLoading && !rotaPermitida && ROTAS_HOME_PORTAL.has(pathAtual)
      ? primeiraRotaVisivel(visibleNavRows)
      : null;
  const guardedOutlet = permsLoading ? (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      Carregando permissões…
    </div>
  ) : rotaPermitida ? (
    <Outlet />
  ) : // A comparação com `pathAtual` é só uma trava contra laço infinito: se o
  // menu devolvesse a própria rota bloqueada, cairíamos no redirecionamento
  // para sempre.
  destinoPortal && destinoPortal.to !== pathAtual ? (
    <Navigate to={destinoPortal.to} hash={destinoPortal.hash} replace />
  ) : (
    <SemPermissao modulo={currentModulo ?? undefined} />
  );

  if (isEmbed) {
    return (
      <div
        className="h-screen w-full overflow-auto bg-background"
        style={{ background: "var(--surface-cream)" }}
      >
        {guardedOutlet}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col bg-background overflow-hidden",
        // `dvh` acompanha a barra de endereço do navegador do celular, que
        // aparece e some ao rolar. Com `100vh` o rodapé da tela ficava
        // escondido atrás dela. No desktop os dois valores são iguais.
        "h-dvh",
      )}
    >
      {/* Cabeçalho acompanha o tema, ocupa 100% da largura e é o único lugar do
          hambúrguer, em qualquer tamanho de tela. */}
      {/* Cabeçalho recolhido (OS ZAP): sobra só uma aba discreta no topo, com
          o menu e o botão de reabrir a barra. */}
      {!isChooser && headerRecolhido && (
        <div className="fixed top-0 left-1/2 z-30 -translate-x-1/2 flex items-center gap-0.5 rounded-b-lg border border-t-0 border-border bg-card/95 px-1 py-0.5 shadow-sm opacity-70 hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={alternarSidebar}
            className="h-6 w-7 rounded flex items-center justify-center text-primary hover:bg-accent hover:text-accent-foreground"
            aria-label={sidebarAberta ? "Fechar menu lateral" : "Abrir menu lateral"}
            aria-expanded={sidebarAberta}
            aria-controls="menu-lateral"
            title={sidebarAberta ? "Fechar menu (Ctrl+B)" : "Abrir menu (Ctrl+B)"}
          >
            <MenuIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => alternarHeaderRecolhido(false)}
            className="h-6 px-1.5 rounded flex items-center gap-1 text-[11px] font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label="Mostrar barra superior"
            title="Mostrar barra superior"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            Mostrar barra
          </button>
        </div>
      )}
      {!isChooser && !headerRecolhido && (
        <header className="shrink-0 relative z-30 h-14 w-full bg-card text-card-foreground border-b border-border flex items-center justify-between gap-2 px-4 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-3 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 shrink-0">
            <button
              type="button"
              onClick={alternarSidebar}
              className="h-9 w-9 -ml-1 rounded-md flex items-center justify-center text-primary hover:bg-accent hover:text-accent-foreground shrink-0 transition-colors duration-200"
              aria-label={sidebarAberta ? "Fechar menu lateral" : "Abrir menu lateral"}
              aria-expanded={sidebarAberta}
              aria-controls="menu-lateral"
              title={sidebarAberta ? "Fechar menu (Ctrl+B)" : "Abrir menu (Ctrl+B)"}
            >
              <MenuIcon className="h-5 w-5" />
            </button>
            {/* No celular o atalho para a home sai do cabeçalho: ele repete o
                "Início" da barra inferior e o espaço faz falta para o seletor
                de clínica. */}
            <Link
              to="/app"
              className="hidden sm:flex items-center gap-2 min-w-0 shrink-0"
              title="ClinicaOS"
            >
              <Activity className="h-5 w-5 shrink-0 text-foreground" />
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1.5 h-9 w-9 sm:w-auto sm:px-2.5 rounded-lg bg-muted hover:bg-accent text-xs font-medium text-foreground shrink-0"
                  title="Trocar de ambiente"
                >
                  <LayoutGrid className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline truncate max-w-[140px]">
                    {subsystemLabel ?? "Portais"}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72 p-2">
                <DropdownMenuLabel className="px-1 pb-2 text-xs text-muted-foreground">
                  Ir para
                </DropdownMenuLabel>
                <div className="grid grid-cols-2 gap-1.5">
                  {ambientesRapidos.map((a) => (
                    <DropdownMenuItem
                      key={a.key}
                      onSelect={() => irParaAmbiente(a.portal, a.destino)}
                      className="flex h-auto flex-col items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-3 text-center text-xs font-medium leading-tight text-foreground cursor-pointer focus:bg-accent"
                    >
                      <a.icon className="h-5 w-5 text-foreground" />
                      {a.label}
                    </DropdownMenuItem>
                  ))}
                </div>
                <DropdownMenuSeparator className="my-2" />
                <DropdownMenuItem
                  onSelect={() => abrirSeletorPortais()}
                  className="text-xs cursor-pointer"
                >
                  <LayoutGrid className="mr-2 h-3.5 w-3.5" />
                  Ver todos os portais
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Central de Atenção: exclusiva do portal OS ZAP, imediatamente à
                direita do botão de portal. */}
            {subsystem === "os-zap" && <CentralAtencao />}
          </div>

          <div className="flex flex-1 items-center justify-end gap-3 min-w-0 sm:flex-none sm:justify-center">
            {clinicaAtual && (branding?.logo_url || logoDaClinica(clinicaAtual.clinica.nome)) && (
              <img
                src={branding?.logo_url || logoDaClinica(clinicaAtual.clinica.nome)!}
                alt={clinicaAtual.clinica.nome}
                className="hidden sm:block h-8 w-auto max-w-[150px] shrink-0 object-contain dark:rounded-md dark:bg-white dark:p-0.5"
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
                <SelectTrigger
                  title={clinicaAtual?.clinica.nome}
                  style={{ width: "clamp(120px, 18vw, 300px)" }}
                  className="max-w-[180px] sm:max-w-[300px] min-w-0 h-9 px-2.5 text-xs font-semibold truncate shrink rounded-lg border-0 bg-muted text-foreground dark:text-foreground shadow-none focus:ring-0 focus-visible:ring-0 hover:bg-accent [&>svg]:w-4 [&>svg]:h-4 [&>svg]:shrink-0 [&>svg]:ml-1.5 [&>span]:truncate [&>span]:min-w-0"
                >
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
            {/* Consulta de preços — fica no cabeçalho para a atendente
                responder "quanto custa?" sem sair da Agenda ou da Recepção.
                No celular sai da barra (a tela continua no menu, em "Tabela de
                valores"): é ferramenta de balcão e o cabeçalho não comporta
                todos os ícones numa largura de telefone. */}
            <span className="hidden sm:contents">
              <BotaoTabelaValores />
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex h-9 w-9 p-0 rounded-full text-foreground hover:bg-accent hover:text-accent-foreground"
              title="Atalhos de teclado (?)"
              onClick={() => {
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
              }}
            >
              <span className="text-base font-semibold">?</span>
            </Button>
            <BotaoAcessibilidade />
            <div className="flex items-center gap-1.5 [&_button]:text-foreground [&_button:hover]:bg-muted [&_button:hover]:text-foreground">
              <EstornosBell />
              {/* Leitura em voz alta: recurso de mesa, escondido no celular
                  pelo mesmo motivo da tabela de valores. */}
              <span className="hidden sm:contents">
                <TTSToggle />
              </span>
            </div>
            {podeRecolherHeader && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 rounded-full text-foreground hover:bg-accent hover:text-accent-foreground"
                title="Recolher barra superior (modo foco)"
                aria-label="Recolher barra superior"
                onClick={() => alternarHeaderRecolhido(true)}
              >
                <ChevronUp className="h-5 w-5" />
              </Button>
            )}
          </div>
        </header>
      )}

      <AppSidebarLayout
        aberta={!isChooser && sidebarAberta}
        modo={subsystem === "os-zap" ? "coluna" : "gaveta"}
        onFechar={fecharSidebar}
        sidebar={
          !isChooser && (
            <aside
              id="menu-lateral"
              aria-hidden={!sidebarAberta}
              // `dark:bg-sidebar!` anula o `style` acima no tema escuro: a cor
              // da clínica é forte demais em fundo escuro (vira um bloco de
              // azul saturado ao lado do cinza-ardósia). No escuro o menu usa
              // a superfície da paleta, um degrau acima do fundo da página —
              // a identidade da clínica continua no resto do sistema (botões,
              // realces, abas), que seguem `--primary`.
              className="h-full w-full min-h-0 flex flex-col text-white dark:text-sidebar-foreground overflow-hidden border-r border-white/10 dark:border-sidebar-border dark:bg-sidebar!"
              style={{ backgroundColor: corSidebar }}
            >
              {/* Título da gaveta + botão de fechar. */}
              <div className="shrink-0 flex items-center gap-2 px-4 h-14 border-b border-white/10">
                <Activity className="h-5 w-5 shrink-0 text-white" />
                <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
                  ClinicaOS
                </span>
                <button
                  type="button"
                  onClick={fecharSidebar}
                  className="ml-auto shrink-0 p-1 rounded-lg flex items-center justify-center text-white/80 hover:bg-white/10 hover:text-white transition-colors duration-200 cursor-pointer group"
                  aria-label="Fechar menu lateral"
                  title="Fechar menu (Esc)"
                >
                  <X className="h-5 w-5 transition-transform duration-200 ease-out group-hover:rotate-90 motion-reduce:transition-none" />
                </button>
              </div>
              {/* Atalho fixo para voltar ao Portal (tela de escolha de ambiente). */}
              <div className="shrink-0 px-3 pt-3">
                <button
                  type="button"
                  onClick={() => irParaAmbiente(null, "/app")}
                  className="w-full flex items-center gap-2 rounded-md bg-white/10 border border-white/15 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/20"
                >
                  <Home className="h-3.5 w-3.5 shrink-0" />
                  Voltar ao Portal
                </button>
              </div>
              {/* Busca das telas do menu. */}
              <div className="shrink-0 px-3 pt-3 pb-1">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/60" />
                  <input
                    ref={buscaMenuInputRef}
                    value={buscaMenu}
                    onChange={(e) => setBuscaMenu(aplicarCaixaAlta(e.currentTarget))}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setBuscaMenu("");
                    }}
                    placeholder="Buscar no menu..."
                    aria-label="Buscar no menu"
                    className="w-full rounded-md bg-white/10 border border-white/15 pl-7 pr-2 py-1.5 text-xs text-white uppercase placeholder:normal-case placeholder:text-white/50 outline-none focus:border-white/40 focus:bg-white/15"
                  />
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
                  const leafIsActive = (to: string, hash?: string) =>
                    navLeafAtivo(itemDeMenuAtivo(location.pathname, to), location.hash, hash);
                  const itemHasActive = (it: NavItem): boolean =>
                    isParent(it)
                      ? it.children.some((c) => leafIsActive(c.to, c.hash))
                      : leafIsActive(it.to, it.hash);
                  const groupHasActive = row.items.some(itemHasActive);
                  const hideLabel =
                    subsystem === "gestao-pessoas" && row.label === "Recursos Humanos";
                  const open = hideLabel || buscandoMenu ? true : (openGroups[row.label] ?? true);
                  return (
                    <div key={row.label} className="space-y-1">
                      {!hideLabel && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setOpenGroups((prev) => ({
                              ...prev,
                              [row.label]: !(prev[row.label] ?? true),
                            }));
                          }}
                          className="w-full flex items-center justify-between px-3 py-1 text-[12px] font-bold uppercase tracking-[0.1em] text-white/70 hover:text-white transition-colors rounded-md"
                          aria-expanded={open}
                        >
                          <span>{row.label}</span>
                          <ChevronDown
                            className={`h-3 w-3 transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
                          />
                        </button>
                      )}
                      {open &&
                        row.items.map((item) => {
                          if (isParent(item)) {
                            const subActive = item.children.some((c) => leafIsActive(c.to, c.hash));
                            const subKey = `${row.label}::${item.label}`;
                            const subOpen = buscandoMenu ? true : (openGroups[subKey] ?? false);
                            return (
                              <div
                                key={subKey}
                                className={cn("space-y-1 rounded-md", dragCls(navItemKey(item)))}
                                {...dragProps(row.label, navItemKey(item))}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setOpenGroups((prev) => ({
                                      ...prev,
                                      [subKey]: !(prev[subKey] ?? false),
                                    }));
                                  }}
                                  className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium tracking-tight transition-all ${subActive ? "bg-white/10 text-white" : "text-white hover:bg-white/10 hover:text-white"}${hoverScaleCls}`}
                                  aria-expanded={subOpen}
                                >
                                  <item.icon className="h-[18px] w-[18px] shrink-0" />
                                  <span className="flex-1 text-left leading-snug break-words">
                                    {item.label}
                                  </span>
                                  <ChevronDown
                                    className={`h-3 w-3 transition-transform ${subOpen ? "rotate-0" : "-rotate-90"}`}
                                  />
                                </button>
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
                                          data-nav-to={child.to}
                                          className={`relative flex items-center gap-2.5 rounded-lg pl-8 pr-3 py-2 text-[14px] font-medium tracking-tight transition-all text-white hover:bg-white/10 hover:text-white${hoverScaleCls}`}
                                        >
                                          <child.icon className="h-[18px] w-[18px] shrink-0" />
                                          <span className="leading-snug break-words">
                                            {child.label}
                                          </span>
                                        </a>
                                      );
                                    }
                                    return (
                                      <a
                                        key={linkKey}
                                        href={href}
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
                                          fecharSidebar();
                                          irPara(href);
                                        }}
                                        className={`relative flex items-center gap-2.5 rounded-lg pl-8 pr-3 py-2 text-[14px] font-medium tracking-tight transition-all ${
                                          active
                                            ? "bg-card text-slate-900 shadow-sm"
                                            : "text-white hover:bg-white/10 hover:text-white"
                                        }${hoverScaleCls}`}
                                      >
                                        <child.icon className="h-[18px] w-[18px] shrink-0" />
                                        <span className="leading-snug break-words">
                                          {child.label}
                                        </span>
                                      </a>
                                    );
                                  })}
                              </div>
                            );
                          }
                          const aliases: string[] = (item as { aliases?: string[] }).aliases ?? [];
                          const active =
                            leafIsActive(item.to, item.hash) ||
                            (!item.hash &&
                              aliases.some((a) => itemDeMenuAtivo(location.pathname, a)));
                          const href = hrefDoNavLeaf(item);
                          return (
                            <a
                              key={navItemKey(item)}
                              href={href}
                              data-nav-to={item.to}
                              data-nav-active={active ? "true" : undefined}
                              aria-current={uxMelhorias && active ? "page" : undefined}
                              onMouseEnter={() => preCarregar(item.to)}
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
                                fecharSidebar();
                                irPara(href);
                              }}
                              {...dragProps(row.label, navItemKey(item))}
                              className={cn(
                                `relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium tracking-tight transition-all ${
                                  active
                                    ? "bg-card text-slate-900 shadow-sm"
                                    : "text-white hover:bg-white/10 hover:text-white"
                                }${hoverScaleCls}`,
                                dragCls(navItemKey(item)),
                              )}
                            >
                              <item.icon className="h-[18px] w-[18px] shrink-0" />
                              <span className="leading-snug break-words">{item.label}</span>
                            </a>
                          );
                        })}
                    </div>
                  );
                })}
              </nav>
              <div className="shrink-0 px-2 py-2 border-t border-white/15 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
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
          )
        }
      >
        <main
          key={uxMelhorias ? chaveAreaPrincipal(location.pathname) : "static"}
          className={cn(
            "flex-1 min-h-0 overflow-y-auto overflow-x-hidden min-w-0",
            isChooser
              ? "p-0 w-full"
              : cn(
                  // Com a barra recolhida, reserva só a altura da aba de
                  // reabrir, para ela não cobrir o topo da conversa.
                  headerRecolhido
                    ? "px-3 pt-7 sm:px-4 lg:px-6"
                    : "px-3 pt-1 sm:px-4 sm:pt-1.5 lg:px-6 lg:pt-2",
                  // Espaço extra embaixo no mobile para o conteúdo não ficar
                  // atrás da barra inferior (que só existe abaixo de `md`).
                  "pb-28 md:pb-4 lg:pb-6",
                ),
            // Mantém 5 px entre o menu e os painéis de conversas quando dividem a tela.
            areaConversas &&
              "transition-[padding-left] duration-200 ease-out motion-reduce:transition-none",
            sidebarAberta && areaConversas && "lg:pl-[5px]",
            uxMelhorias && "animate-in fade-in duration-200 motion-reduce:animate-none",
          )}
          style={{ background: "var(--surface-cream)" }}
        >
          {guardedOutlet}
        </main>
      </AppSidebarLayout>
      {pwOpen && (
        <Suspense fallback={null}>
          <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
        </Suspense>
      )}
      <KeyboardShortcuts />
      {/* A barra inferior é `md:hidden` — existe só no celular, em qualquer
          clínica. Antes dependia da flag `ux_melhorias` (desligada na São
          Francisco), e no celular sobrava apenas o hambúrguer para navegar.
          Ela some enquanto a gaveta está aberta: é fixa no rodapé e cobriria o
          menu do usuário dentro da gaveta. */}
      {!isChooser && !sidebarAberta && bottomNavItens.length > 0 && (
        <LiquidBottomNav
          pathname={location.pathname}
          onNavigate={irPara}
          cor={corSidebar}
          onMais={() => setSidebarAberta(true)}
          itens={bottomNavItens}
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
            className="absolute top-4 right-4 z-10 h-9 w-9 rounded-full bg-white/80 text-slate-600 shadow-md ring-1 ring-slate-200 flex items-center justify-center hover:bg-card"
            aria-label="Fechar seleção de portais"
            title="Voltar"
          >
            <X className="h-4 w-4" />
          </button>
          <PortalLauncher
            onPick={escolherPortal}
            className="min-h-[100dvh]"
            ocultos={portaisOcultos}
          />
        </div>
      )}
    </div>
  );
}
