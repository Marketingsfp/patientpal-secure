import { Link, useLocation } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

export interface SectionTab {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface SectionTabsProps {
  title: string;
  icon: LucideIcon;
  tabs: ReadonlyArray<SectionTab>;
}

export function SectionTabs({ title, icon: TitleIcon, tabs }: SectionTabsProps) {
  const loc = useLocation();
  return (
    <div className="space-y-3 mb-4">
      <div className="flex items-center gap-2">
        <TitleIcon className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>
      <nav className="flex flex-wrap gap-1 border-b">
        {tabs.map((t) => {
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

import { Megaphone, Send, Sparkles, Users, Filter, Clock, Palmtree, FileText, GraduationCap, BookOpen, HeartPulse, LayoutGrid, ClipboardList, ShieldCheck, KeyRound, Stethoscope } from "lucide-react";

export const MARKETING_TABS: ReadonlyArray<SectionTab> = [
  { to: "/app/mkt-leads", label: "Leads", icon: Users },
  { to: "/app/campanhas", label: "Campanhas", icon: Megaphone },
  { to: "/app/mkt-envios", label: "Envios", icon: Send },
  { to: "/app/mkt-segmentos", label: "Segmentos", icon: Filter },
  { to: "/app/mkt-landing", label: "Landing Pages", icon: Sparkles },
];

export const RH_TABS: ReadonlyArray<SectionTab> = [
  { to: "/app/hr-ponto", label: "Ponto", icon: Clock },
  { to: "/app/hr-ferias", label: "Férias", icon: Palmtree },
  { to: "/app/hr-holerites", label: "Holerites", icon: FileText },
  { to: "/app/treinamentos", label: "Treinamentos", icon: GraduationCap },
  { to: "/app/lms-admin", label: "Cursos (admin)", icon: BookOpen },
];

export const SERVICOS_TABS: ReadonlyArray<SectionTab> = [
  { to: "/app/especialidades", label: "Especialidades", icon: HeartPulse },
  { to: "/app/tipos-servico", label: "Categorias", icon: LayoutGrid },
  { to: "/app/procedimentos", label: "Serviços", icon: ClipboardList },
  { to: "/app/enfermagem-recursos", label: "Enfermagem", icon: HeartPulse },
];

export const SEGURANCA_TABS: ReadonlyArray<SectionTab> = [
  { to: "/app/auditoria", label: "Auditoria", icon: ShieldCheck },
  { to: "/app/lgpd", label: "LGPD", icon: ShieldCheck },
  { to: "/app/integration-secrets", label: "Integrações", icon: KeyRound },
];

export const MARKETING_META = { title: "Marketing", icon: Megaphone };
export const RH_META = { title: "RH", icon: Users };
export const SERVICOS_META = { title: "Serviços", icon: Stethoscope };
export const SEGURANCA_META = { title: "Segurança & Compliance", icon: ShieldCheck };