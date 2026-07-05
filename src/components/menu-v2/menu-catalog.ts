import {
  CalendarDays, Users, ClipboardList, FileHeart, HeartPulse, MessageCircle, Send,
  Wallet, FileText, DollarSign, Receipt, Building2, ArrowRightLeft, BarChart3,
  CreditCard, Gift, Contact, Briefcase,
  Stethoscope, FlaskConical, BookOpen, LayoutGrid, Activity,
  LayoutDashboard, Target, Megaphone, ShieldCheck, Inbox,
  Settings, KeyRound, MapPin, BadgeCheck,
  type LucideIcon,
} from "lucide-react";

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
      { path: "/app/clientes", label: "Clientes", icon: Users, modulo: "clientes" },
      { path: "/app/prontuarios", label: "Prontuários", icon: FileHeart },
      { path: "/app/anamneses", label: "Anamneses", icon: ClipboardList },
      { path: "/app/triagem-enfermagem", label: "Triagem", icon: Activity, modulo: "triagem-enfermagem" },
      { path: "/app/chat", label: "Chat interno", icon: MessageCircle, modulo: "chat" },
      { path: "/app/whatsapp", label: "WhatsApp", icon: Send },
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
      { path: "/app/financeiro/splits", label: "Splits", icon: ArrowRightLeft },
      { path: "/app/financeiro/estornos", label: "Estornos", icon: Inbox },
      { path: "/app/relatorios/financeiro", label: "Relatórios", icon: BarChart3 },
    ],
  },
  {
    key: "cartao",
    label: "Cartão de Benefícios",
    icon: CreditCard,
    items: [
      { path: "/app/cartao-beneficios/contratos", label: "Contratos", icon: FileText, modulo: "cartao-beneficios" },
      { path: "/app/cartao-beneficios/mensalidades", label: "Mensalidades", icon: DollarSign },
      { path: "/app/cartao-beneficios/dependentes", label: "Dependentes", icon: Users },
      { path: "/app/cartao-beneficios/regras", label: "Regras do Cartão", icon: ShieldCheck },
      { path: "/app/cartao-beneficios/faixas", label: "Faixas", icon: LayoutGrid },
      { path: "/app/cartao-beneficios/associados", label: "Associados", icon: Contact },
      { path: "/app/cartao-beneficios/empresas", label: "Empresas Associadas", icon: Briefcase },
      { path: "/app/cartao-beneficios/beneficios", label: "Benefícios", icon: Gift },
    ],
  },
  {
    key: "clinico",
    label: "Clínico",
    icon: Stethoscope,
    items: [
      { path: "/app/procedimentos", label: "Procedimentos", icon: LayoutGrid },
      { path: "/app/exames-resultados", label: "Exames", icon: FlaskConical, modulo: "exames-resultados" },
      { path: "/app/prontuario-modelos", label: "Modelos de Prontuário", icon: BookOpen },
      { path: "/app/anamnese-modelos", label: "Modelos de Anamnese", icon: BookOpen },
      { path: "/app/odontologia", label: "Odontograma", icon: Activity, modulo: "odontologia" },
      { path: "/app/medicos", label: "Médicos", icon: Stethoscope },
      { path: "/app/especialidades", label: "Especialidades", icon: BadgeCheck },
      { path: "/app/escalas", label: "Escalas", icon: CalendarDays },
    ],
  },
  {
    key: "gestao",
    label: "Gestão",
    icon: LayoutDashboard,
    items: [
      { path: "/app/painel", label: "Dashboard", icon: LayoutDashboard, modulo: "painel" },
      { path: "/app/relatorios", label: "Relatórios", icon: BarChart3 },
      { path: "/app/crm", label: "CRM", icon: Target, modulo: "crm" },
      { path: "/app/mkt-leads", label: "Marketing", icon: Megaphone, modulo: "mkt-leads" },
      { path: "/app/campanhas", label: "Campanhas", icon: Send },
      { path: "/app/lgpd", label: "LGPD", icon: ShieldCheck },
      { path: "/app/auditoria", label: "Auditoria", icon: ShieldCheck },
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
      { path: "/app/perfis-acesso", label: "Perfis & Permissões", icon: KeyRound },
      { path: "/app/cargos", label: "Cargos", icon: BadgeCheck },
      { path: "/app/setores", label: "Setores", icon: LayoutGrid },
      { path: "/app/rh", label: "RH", icon: Users },
      { path: "/app/integracoes", label: "Integrações", icon: ArrowRightLeft },
      { path: "/app/configuracoes/preferencias", label: "Preferências", icon: Settings },
    ],
  },
];

export type PerfilKey = "recepcao" | "medico" | "caixa" | "financeiro" | "gestor" | "admin";

export const PERFIL_DEFAULTS: Record<PerfilKey, { pinned: string[]; centros: string[] }> = {
  recepcao: {
    pinned: ["/app/agenda", "/app/caixa", "/app/clientes", "/app/orcamentos"],
    centros: ["atendimento", "financeiro", "cartao"],
  },
  medico: {
    pinned: ["/app/agenda", "/app/prontuarios", "/app/clientes"],
    centros: ["atendimento", "clinico"],
  },
  caixa: {
    pinned: ["/app/caixa", "/app/boletos", "/app/nfse"],
    centros: ["financeiro", "atendimento"],
  },
  financeiro: {
    pinned: ["/app/financeiro/atendimentos", "/app/financeiro/contas", "/app/relatorios/financeiro"],
    centros: ["financeiro", "gestao"],
  },
  gestor: {
    pinned: ["/app/painel", "/app/relatorios", "/app/agenda"],
    centros: ["atendimento", "financeiro", "cartao", "clinico", "gestao"],
  },
  admin: {
    pinned: ["/app/painel", "/app/clinicas", "/app/equipe"],
    centros: ["atendimento", "financeiro", "cartao", "clinico", "gestao", "config"],
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