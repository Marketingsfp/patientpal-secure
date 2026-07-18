import {
  CalendarDays, Users, ClipboardList, FileHeart, HeartPulse, MessageCircle, Send,
  Wallet, FileText, DollarSign, Receipt, Building2, ArrowRightLeft, BarChart3,
  CreditCard, Contact, Briefcase,
  Stethoscope, FlaskConical, BookOpen, LayoutGrid, Activity,
  LayoutDashboard, Target, Megaphone, ShieldCheck, Inbox,
  Settings, KeyRound, MapPin, BadgeCheck,
  type LucideIcon,
} from "lucide-react";
import {
  Zap, LogIn, Workflow, ListChecks, Brain, Sparkles, Bell, FileSignature,
  TrendingUp, HardDrive,
} from "lucide-react";
import { Tooth } from "@/components/icons/tooth";

export type MenuItem = {
  path: string;
  label: string;
  icon: LucideIcon;
  /** chave de módulo em perfil_permissoes, se aplicável */
  modulo?: string;
};

export type Centro = {
  key: string;
  label: string;
  icon: LucideIcon;
  items: MenuItem[];
};

export const CENTROS: Centro[] = [
  {
    key: "atendimento",
    label: "Atendimento",
    icon: HeartPulse,
    items: [
      { path: "/app/agenda", label: "Agenda", icon: CalendarDays, modulo: "agenda" },
      { path: "/app/atendimento-multiplo", label: "Atendimento Múltiplo", icon: ListChecks },
      { path: "/app/checkin", label: "Check-in", icon: LogIn },
      { path: "/app/fluxo", label: "Fluxo", icon: Workflow },
      { path: "/app/recepcao", label: "Recepção / Filas", icon: ListChecks },
      { path: "/app/clientes", label: "Clientes", icon: Users, modulo: "clientes" },
      { path: "/app/orcamentos", label: "Orçamentos", icon: FileSignature },
      { path: "/app/prontuarios", label: "Prontuários", icon: FileHeart },
      { path: "/app/anamneses", label: "Anamneses", icon: ClipboardList },
      { path: "/app/triagem-enfermagem", label: "Triagem", icon: Activity, modulo: "triagem-enfermagem" },
      { path: "/app/chat", label: "Chat interno", icon: MessageCircle, modulo: "chat" },
      { path: "/app/nina", label: "WhatsApp / Nina", icon: Send },
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    icon: Wallet,
    items: [
      { path: "/app/caixa", label: "Caixa", icon: Wallet, modulo: "caixa" },
      { path: "/app/boletos", label: "Boletos", icon: FileText },
      { path: "/app/nfse", label: "NFS-e", icon: Receipt },
      { path: "/app/financeiro/atendimentos", label: "Lançamentos", icon: DollarSign, modulo: "financeiro" },
      { path: "/app/financeiro/contas", label: "Contas", icon: Building2 },
      { path: "/app/financeiro/categorias", label: "Categorias", icon: LayoutGrid },
      { path: "/app/financeiro/movimento", label: "Movimento", icon: ArrowRightLeft },
      { path: "/app/financeiro/alertas", label: "Alertas", icon: Inbox },
      { path: "/app/financeiro/relatorios", label: "Relatórios", icon: BarChart3 },
    ],
  },
  {
    key: "cartao",
    label: "Cartão de Benefícios",
    icon: CreditCard,
    items: [
      { path: "/app/cartao-beneficios/contratos", label: "Cartão de Benefícios", icon: CreditCard, modulo: "cartao-beneficios" },
      { path: "/app/financeiro/empresas", label: "Empresas Associadas", icon: Briefcase },
    ],
  },
  {
    key: "clinico",
    label: "Clínico",
    icon: Stethoscope,
    items: [
      { path: "/app/procedimentos", label: "Catálogo de Serviços", icon: LayoutGrid },
      { path: "/app/exames-resultados", label: "Resultados de Exames / Laudos IA", icon: FlaskConical, modulo: "exames-resultados" },
      { path: "/app/prontuario-modelos", label: "Modelos de Prontuário", icon: BookOpen },
      { path: "/app/odontologia", label: "Odontograma", icon: Tooth, modulo: "odontologia" },
      { path: "/app/medicos", label: "Médicos", icon: Stethoscope },
      { path: "/app/disponibilidades", label: "Disponibilidades", icon: CalendarDays },
    ],
  },
  {
    key: "inteligencia",
    label: "Inteligência",
    icon: Brain,
    items: [
      { path: "/app/atendimento-ia", label: "Atendimento IA", icon: Sparkles },
      { path: "/app/consulta-rapida", label: "Consulta Rápida", icon: Zap },
      { path: "/app/alertas-enfermagem", label: "Alertas Enfermagem", icon: Bell },
    ],
  },
  {
    key: "gestao",
    label: "Gestão",
    icon: LayoutDashboard,
    items: [
      { path: "/app/painel-executivo", label: "Painel de Indicadores", icon: TrendingUp },
      { path: "/app/painel", label: "Dashboard", icon: LayoutDashboard, modulo: "painel" },
      { path: "/app/relatorios", label: "Relatórios", icon: BarChart3 },
      { path: "/app/crm", label: "CRM", icon: Target, modulo: "crm" },
      { path: "/app/mkt-leads", label: "Marketing", icon: Megaphone, modulo: "mkt-leads" },
      { path: "/app/campanhas", label: "Campanhas", icon: Send },
      { path: "/app/lgpd", label: "LGPD", icon: ShieldCheck },
      { path: "/app/auditoria", label: "Auditoria", icon: ShieldCheck },
      { path: "/app/backups", label: "Backups Diários", icon: HardDrive },
      { path: "/app/estoque", label: "Estoque", icon: LayoutGrid },
    ],
  },
  {
    key: "config",
    label: "Configurações",
    icon: Settings,
    items: [
      { path: "/app/clinicas", label: "Clínica", icon: Building2 },
      { path: "/app/unidades", label: "Unidades", icon: MapPin },
      { path: "/app/equipe", label: "Usuários", icon: Users, modulo: "equipe" },
      { path: "/app/perfis", label: "Perfis & Permissões", icon: KeyRound },
      { path: "/app/cargos", label: "Cargos", icon: BadgeCheck },
      { path: "/app/setores", label: "Setores", icon: LayoutGrid },
      { path: "/app/hr-contratos", label: "RH · Contratos", icon: Users },
      { path: "/app/hr-ferias", label: "RH · Férias", icon: Users },
      { path: "/app/hr-holerites", label: "RH · Holerites", icon: Users },
      { path: "/app/hr-ponto", label: "RH · Ponto", icon: Users },
      { path: "/app/integration-secrets", label: "Integrações", icon: ArrowRightLeft },
      { path: "/app/configuracoes/nfse", label: "Configuração NFS-e", icon: Receipt },
      { path: "/app/configuracoes/painel-totem", label: "Painel & Totem", icon: KeyRound },
    ],
  },
];

export type PerfilKey = "recepcao" | "medico" | "caixa" | "financeiro" | "gestor" | "admin";

export const PERFIL_DEFAULTS: Record<PerfilKey, { pinned: string[]; centros: string[] }> = {
  recepcao: {
    pinned: ["/app/agenda", "/app/caixa", "/app/clientes", "/app/orcamentos"],
    centros: ["atendimento", "financeiro", "cartao", "inteligencia"],
  },
  medico: {
    pinned: ["/app/agenda", "/app/prontuarios", "/app/clientes"],
    centros: ["atendimento", "clinico", "inteligencia"],
  },
  caixa: {
    pinned: ["/app/caixa", "/app/orcamentos", "/app/boletos", "/app/nfse"],
    centros: ["financeiro", "atendimento"],
  },
  financeiro: {
    pinned: ["/app/financeiro/atendimentos", "/app/financeiro/contas", "/app/financeiro/relatorios", "/app/orcamentos"],
    centros: ["financeiro", "gestao"],
  },
  gestor: {
    pinned: ["/app/painel-executivo", "/app/painel", "/app/relatorios", "/app/agenda"],
    centros: ["atendimento", "financeiro", "cartao", "clinico", "inteligencia", "gestao"],
  },
  admin: {
    pinned: ["/app/painel-executivo", "/app/painel", "/app/clinicas", "/app/equipe"],
    centros: ["atendimento", "financeiro", "cartao", "clinico", "inteligencia", "gestao", "config"],
  },
};

/** procura um item pelo path em todos os centros */
export function findItem(path: string): MenuItem | null {
  for (const c of CENTROS) {
    const it = c.items.find((i) => i.path === path);
    if (it) return it;
  }
  return null;
}