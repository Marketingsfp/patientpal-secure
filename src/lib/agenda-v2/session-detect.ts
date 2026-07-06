/**
 * Detecção automática do tipo de Sessão de Atendimento (Fase 1).
 * Regra derivada de `procedimentos.tipo` + `procedimentos.grupo`, sem
 * exigir migration. Quando surgir `procedimento_unidade_regras.tipo_sessao`
 * (Fase 2), passa a ter prioridade.
 */
export type TipoSessao =
  | "consulta"
  | "coleta_laboratorial"
  | "imagem"
  | "cardiologica"
  | "endoscopia"
  | "cirurgia"
  | "procedimento_ambulatorial";

export const TIPO_SESSAO_LABEL: Record<TipoSessao, string> = {
  consulta: "Consulta",
  coleta_laboratorial: "Coleta Laboratorial",
  imagem: "Sessão de Imagem",
  cardiologica: "Sessão Cardiológica",
  endoscopia: "Endoscopia",
  cirurgia: "Cirurgia",
  procedimento_ambulatorial: "Procedimento Ambulatorial",
};

/** Estilos visuais por tipo — pensados para diferenciação clara e leveza. */
export interface TipoSessaoEstilo {
  /** cor sólida CSS usada no filete lateral esquerdo (a "identidade" do card). */
  accent: string;
  /** classes tailwind para o chip/badge do tipo (fundo claro + texto forte). */
  chip: string;
  /** classe tailwind para o círculo do ícone no card e no KPI. */
  iconWrap: string;
  /** cor de texto do ícone. */
  iconColor: string;
  /** fundo suave do card no modo confortável (gradient discreto). */
  cardBg: string;
  /** rótulo curto para UI. */
  short: string;
}

// Paleta oklch alinhada aos tokens do design system. Mantida clara em ambos os modos.
export const TIPO_SESSAO_ESTILO: Record<TipoSessao, TipoSessaoEstilo> = {
  consulta: {
    accent: "hsl(217 91% 60%)",
    chip: "bg-sky-50 text-sky-800 border-sky-200",
    iconWrap: "bg-sky-100",
    iconColor: "text-sky-700",
    cardBg: "bg-gradient-to-r from-sky-50/60 to-transparent",
    short: "Consulta",
  },
  coleta_laboratorial: {
    accent: "hsl(160 84% 39%)",
    chip: "bg-emerald-50 text-emerald-800 border-emerald-200",
    iconWrap: "bg-emerald-100",
    iconColor: "text-emerald-700",
    cardBg: "bg-gradient-to-r from-emerald-50/60 to-transparent",
    short: "Laboratório",
  },
  imagem: {
    accent: "hsl(262 83% 58%)",
    chip: "bg-violet-50 text-violet-800 border-violet-200",
    iconWrap: "bg-violet-100",
    iconColor: "text-violet-700",
    cardBg: "bg-gradient-to-r from-violet-50/60 to-transparent",
    short: "Imagem",
  },
  cardiologica: {
    accent: "hsl(346 77% 55%)",
    chip: "bg-rose-50 text-rose-800 border-rose-200",
    iconWrap: "bg-rose-100",
    iconColor: "text-rose-700",
    cardBg: "bg-gradient-to-r from-rose-50/60 to-transparent",
    short: "Cardiologia",
  },
  endoscopia: {
    accent: "hsl(38 92% 50%)",
    chip: "bg-amber-50 text-amber-800 border-amber-200",
    iconWrap: "bg-amber-100",
    iconColor: "text-amber-700",
    cardBg: "bg-gradient-to-r from-amber-50/60 to-transparent",
    short: "Endoscopia",
  },
  cirurgia: {
    accent: "hsl(0 84% 55%)",
    chip: "bg-red-50 text-red-800 border-red-200",
    iconWrap: "bg-red-100",
    iconColor: "text-red-700",
    cardBg: "bg-gradient-to-r from-red-50/60 to-transparent",
    short: "Cirurgia",
  },
  procedimento_ambulatorial: {
    accent: "hsl(220 9% 46%)",
    chip: "bg-slate-100 text-slate-800 border-slate-200",
    iconWrap: "bg-slate-100",
    iconColor: "text-slate-700",
    cardBg: "bg-gradient-to-r from-slate-50/60 to-transparent",
    short: "Ambulatorial",
  },
};

// Retro-compat: alguns lugares antigos importavam TIPO_SESSAO_COR.
export const TIPO_SESSAO_COR: Record<TipoSessao, string> = Object.fromEntries(
  (Object.keys(TIPO_SESSAO_ESTILO) as TipoSessao[]).map((k) => [k, TIPO_SESSAO_ESTILO[k].cardBg]),
) as Record<TipoSessao, string>;

export interface ProcMeta {
  nome: string | null;
  tipo: string | null;
  grupo: string | null;
}

const has = (s: string | null | undefined, needle: string) =>
  !!s && s.toLowerCase().includes(needle);

/** Classifica um único procedimento (usado no agrupamento). */
export function tipoDoProcedimento(p: ProcMeta): TipoSessao {
  const g = p.grupo ?? "";
  const t = p.tipo ?? "";
  const n = p.nome ?? "";
  // Nome tem prioridade (o texto livre do agendamento costuma trazer o tipo entre parênteses).
  if (has(g, "laborat") || has(n, "laborat") || has(n, "coleta")) return "coleta_laboratorial";
  if (has(g, "endoscop") || has(g, "colonoscop") || has(n, "endoscop") || has(n, "colonoscop")) return "endoscopia";
  if (has(g, "cardio") || has(n, "eletrocardio") || has(n, "ecocardio")) return "cardiologica";
  if (
    has(g, "imagem") || has(g, "tomograf") || has(g, "ultrass") || has(g, "densitomet") ||
    has(g, "raio") || has(g, "ressonan") ||
    has(n, "raio-x") || has(n, "raio x") || has(n, "tomograf") || has(n, "ultrass") ||
    has(n, "densitomet") || has(n, "ressonan") || has(n, "mamograf")
  ) return "imagem";
  if (has(g, "cirurg") || has(n, "cirurgia")) return "cirurgia";
  if (has(t, "consulta")) return "consulta";
  if (has(t, "exame")) return "procedimento_ambulatorial";
  if (has(t, "procedimento")) return "procedimento_ambulatorial";
  return "consulta";
}

/**
 * Regra do agrupador (item 2.2 do planejamento):
 * - Se todos os itens forem laboratório → coleta_laboratorial
 * - Se todos forem imagem → imagem
 * - Se houver consulta cardio + exames cardio → cardiologica
 * - Caso contrário, herda o tipo do item de maior "peso clínico"
 */
export function tipoDaSessao(items: ProcMeta[]): TipoSessao {
  if (items.length === 0) return "consulta";
  const tipos = items.map(tipoDoProcedimento);
  const uniq = new Set(tipos);
  if (uniq.size === 1) return tipos[0];
  if (tipos.every((t) => t === "coleta_laboratorial")) return "coleta_laboratorial";
  if (tipos.every((t) => t === "imagem")) return "imagem";
  const prioridade: TipoSessao[] = [
    "cirurgia", "endoscopia", "cardiologica", "imagem",
    "coleta_laboratorial", "procedimento_ambulatorial", "consulta",
  ];
  for (const p of prioridade) if (uniq.has(p)) return p;
  return "consulta";
}