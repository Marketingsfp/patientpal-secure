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

export const TIPO_SESSAO_COR: Record<TipoSessao, string> = {
  consulta: "bg-blue-50 text-blue-900 border-blue-200",
  coleta_laboratorial: "bg-emerald-50 text-emerald-900 border-emerald-200",
  imagem: "bg-violet-50 text-violet-900 border-violet-200",
  cardiologica: "bg-rose-50 text-rose-900 border-rose-200",
  endoscopia: "bg-amber-50 text-amber-900 border-amber-200",
  cirurgia: "bg-red-50 text-red-900 border-red-200",
  procedimento_ambulatorial: "bg-slate-100 text-slate-900 border-slate-200",
};

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
  if (has(g, "laborat") || has(n, "coleta")) return "coleta_laboratorial";
  if (has(g, "endoscop") || has(g, "colonoscop")) return "endoscopia";
  if (has(g, "cardio")) return "cardiologica";
  if (has(g, "imagem") || has(g, "tomograf") || has(g, "ultrass") || has(g, "densitomet") || has(g, "raio") || has(g, "ressonan")) return "imagem";
  if (has(g, "cirurg") || has(n, "cirurgia")) return "cirurgia";
  if (has(t, "consulta")) return "consulta";
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