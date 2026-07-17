import { Link, useLocation } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { usePermissoes } from "@/hooks/use-permissoes";

export interface SectionTab {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Chave de módulo (tela Perfis de Acesso) que governa esta aba. */
  modulo: string;
}

interface SectionTabsProps {
  title: string;
  icon: LucideIcon;
  tabs: ReadonlyArray<SectionTab>;
}

export function SectionTabs({ title, icon: TitleIcon, tabs }: SectionTabsProps) {
  const loc = useLocation();
  // Antes as abas apareciam todas, sempre — mesmo quando o módulo de uma
  // aba específica estava com acesso "Sem" no perfil do usuário (clicar
  // nela ainda era bloqueado pela guarda de rota do AppShell, mas a aba
  // "não sumia" como o esperado). Filtra aqui do mesmo jeito que o menu
  // lateral já faz.
  const { allowed } = usePermissoes();
  const visiveis = allowed === null ? tabs : tabs.filter((t) => allowed.has(t.modulo));
  return (
    <div className="space-y-3 mb-4">
      <div className="flex items-center gap-2">
        <TitleIcon className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>
      <nav className="flex flex-wrap gap-1 border-b">
        {visiveis.map((t) => {
          const active = loc.pathname === t.to || loc.pathname.startsWith(t.to + "/");
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

import { Megaphone, Send, Sparkles, Users, Filter, Clock, Palmtree, FileText, FileSignature, GraduationCap, BookOpen, HeartPulse, LayoutGrid, ClipboardList, ShieldCheck, KeyRound, Stethoscope } from "lucide-react";

export const MARKETING_TABS: ReadonlyArray<SectionTab> = [
  { to: "/app/mkt-leads", label: "Leads", icon: Users, modulo: "mkt-leads" },
  { to: "/app/campanhas", label: "Campanhas", icon: Megaphone, modulo: "campanhas" },
  { to: "/app/mkt-envios", label: "Envios", icon: Send, modulo: "mkt-envios" },
  { to: "/app/mkt-segmentos", label: "Segmentos", icon: Filter, modulo: "mkt-segmentos" },
  { to: "/app/mkt-landing", label: "Landing Pages", icon: Sparkles, modulo: "mkt-landing" },
];

export const RH_TABS: ReadonlyArray<SectionTab> = [
  { to: "/app/hr-ponto", label: "Ponto", icon: Clock, modulo: "hr-ponto" },
  { to: "/app/hr-contratos", label: "Contratos", icon: FileSignature, modulo: "hr-contratos" },
  { to: "/app/hr-ferias", label: "Férias", icon: Palmtree, modulo: "hr-ferias" },
  { to: "/app/hr-holerites", label: "Holerites", icon: FileText, modulo: "hr-holerites" },
  { to: "/app/treinamentos", label: "Treinamentos", icon: GraduationCap, modulo: "treinamentos" },
  { to: "/app/lms-admin", label: "Cursos (admin)", icon: BookOpen, modulo: "lms-admin" },
];

export const SERVICOS_TABS: ReadonlyArray<SectionTab> = [
  { to: "/app/especialidades", label: "Especialidades", icon: HeartPulse, modulo: "especialidades" },
  { to: "/app/tipos-servico", label: "Categorias", icon: LayoutGrid, modulo: "tipos-servico" },
  { to: "/app/procedimentos", label: "Serviços", icon: ClipboardList, modulo: "procedimentos" },
];

export const SEGURANCA_TABS: ReadonlyArray<SectionTab> = [
  { to: "/app/auditoria", label: "Auditoria", icon: ShieldCheck, modulo: "auditoria" },
  { to: "/app/lgpd", label: "LGPD", icon: ShieldCheck, modulo: "lgpd" },
  { to: "/app/integration-secrets", label: "Integrações", icon: KeyRound, modulo: "integration-secrets" },
];

export const MARKETING_META = { title: "Marketing", icon: Megaphone };
export const RH_META = { title: "RH", icon: Users };
export const SERVICOS_META = { title: "Serviços", icon: Stethoscope };
export const SEGURANCA_META = { title: "Segurança & Compliance", icon: ShieldCheck };