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
    chip: "bg-blue-100 text-blue-700 border-transparent",
    iconWrap: "bg-blue-500 shadow-lg shadow-blue-200/60",
    iconColor: "text-white",
    cardBg: "bg-blue-50/40 border-blue-100 hover:shadow-blue-100/60",
    short: "Consulta",
  },
  coleta_laboratorial: {
    accent: "hsl(160 84% 39%)",
    chip: "bg-emerald-100 text-emerald-700 border-transparent",
    iconWrap: "bg-emerald-500 shadow-lg shadow-emerald-200/60",
    iconColor: "text-white",
    cardBg: "bg-emerald-50/40 border-emerald-100 hover:shadow-emerald-100/60",
    short: "Laboratório",
  },
  imagem: {
    accent: "hsl(262 83% 58%)",
    chip: "bg-violet-100 text-violet-700 border-transparent",
    iconWrap: "bg-violet-500 shadow-lg shadow-violet-200/60",
    iconColor: "text-white",
    cardBg: "bg-violet-50/40 border-violet-100 hover:shadow-violet-100/60",
    short: "Imagem",
  },
  cardiologica: {
    accent: "hsl(346 77% 55%)",
    chip: "bg-rose-100 text-rose-700 border-transparent",
    iconWrap: "bg-rose-500 shadow-lg shadow-rose-200/60",
    iconColor: "text-white",
    cardBg: "bg-rose-50/40 border-rose-100 hover:shadow-rose-100/60",
    short: "Cardiologia",
  },
  endoscopia: {
    accent: "hsl(38 92% 50%)",
    chip: "bg-amber-100 text-amber-700 border-transparent",
    iconWrap: "bg-amber-500 shadow-lg shadow-amber-200/60",
    iconColor: "text-white",
    cardBg: "bg-amber-50/40 border-amber-100 hover:shadow-amber-100/60",
    short: "Endoscopia",
  },
  cirurgia: {
    accent: "hsl(0 84% 55%)",
    chip: "bg-red-100 text-red-700 border-transparent",
    iconWrap: "bg-red-500 shadow-lg shadow-red-200/60",
    iconColor: "text-white",
    cardBg: "bg-red-50/40 border-red-100 hover:shadow-red-100/60",
    short: "Cirurgia",
  },
  procedimento_ambulatorial: {
    accent: "hsl(220 9% 46%)",
    chip: "bg-slate-200 text-slate-700 border-transparent",
    iconWrap: "bg-slate-500 shadow-lg shadow-slate-200/60",
    iconColor: "text-white",
    cardBg: "bg-slate-50/60 border-slate-100 hover:shadow-slate-100/60",
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
  if (has(g, "endoscop") || has(g, "colonoscop") || has(n, "endoscop") || has(n, "colonoscop"))
    return "endoscopia";
  if (has(g, "cardio") || has(n, "eletrocardio") || has(n, "ecocardio")) return "cardiologica";
  if (
    has(g, "imagem") ||
    has(g, "tomograf") ||
    has(g, "ultrass") ||
    has(g, "densitomet") ||
    has(g, "raio") ||
    has(g, "ressonan") ||
    has(n, "raio-x") ||
    has(n, "raio x") ||
    has(n, "tomograf") ||
    has(n, "ultrass") ||
    has(n, "densitomet") ||
    has(n, "ressonan") ||
    has(n, "mamograf")
  )
    return "imagem";
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
    "cirurgia",
    "endoscopia",
    "cardiologica",
    "imagem",
    "coleta_laboratorial",
    "procedimento_ambulatorial",
    "consulta",
  ];
  for (const p of prioridade) if (uniq.has(p)) return p;
  return "consulta";
}
