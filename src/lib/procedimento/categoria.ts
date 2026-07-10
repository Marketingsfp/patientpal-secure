/**
 * Categoria operacional do procedimento — fonte da verdade é
 * `procedimentos.tipo_procedimento`, ajustado por regra de negócio aprovada
 * em 07/07/2026:
 *
 * - `laboratorio` → conta como **1 atendimento por paciente/dia**, mesmo com
 *   N exames na mesma ficha.
 * - `imagem` → cada exame conta **1 atendimento** (RX, USG, TC, RM, etc.).
 * - `consulta`, `procedimento`, `cirurgia` → sempre 1 atendimento por linha.
 * - `exame` (legado) → tratado como `imagem` até ser reclassificado.
 * - `equipamento`, `vacina`, `telemedicina` → contam 1 por linha (`outro`).
 *
 * Todo consumo (Painel, Painel Executivo, Relatórios, Repasse) deve passar
 * pela função `contarAtendimentos` em `src/lib/agenda/contagem.ts`, que usa
 * este helper para decidir agrupamento.
 */

export type CategoriaProc =
  | "laboratorio"
  | "imagem"
  | "consulta"
  | "procedimento"
  | "cirurgia"
  | "outro";

export function categoriaDoProcedimento(tipo: string | null | undefined): CategoriaProc {
  const t = (tipo ?? "").trim().toLowerCase();
  if (t === "laboratorio") return "laboratorio";
  if (t === "imagem") return "imagem";
  if (t === "exame") return "imagem"; // legado — mesma regra operacional de imagem
  if (t === "consulta") return "consulta";
  if (t === "procedimento") return "procedimento";
  if (t === "cirurgia") return "cirurgia";
  return "outro";
}

/** Categorias que aceitam múltiplos exames na mesma ficha de agendamento. */
export function permiteMultiExame(cat: CategoriaProc): boolean {
  return cat === "laboratorio" || cat === "imagem";
}

/**
 * Regra de contagem: apenas laboratório agrupa (N exames = 1 atendimento).
 * Todas as outras categorias contam 1 atendimento por linha de agendamento.
 */
export function contaComoUmAtendimento(cat: CategoriaProc): boolean {
  return cat === "laboratorio";
}

function normalizarNome(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export type ProcedimentoCatRow = {
  id?: string;
  nome: string | null;
  tipo_procedimento?: string | null;
};

/**
 * Constrói o resolver `nome → categoria` a partir das linhas de `procedimentos`.
 * O agendamento guarda `procedimento` como texto livre; para casos
 * "laboratório concatenado" (`HEMOGRAMA + GLICEMIA + TSH`), o campo `procedimento`
 * é dividido por ` + ` e a categoria mais "pesada" prevalece.
 */
export function buildCategoriaResolver(rows: ProcedimentoCatRow[]) {
  const byName = new Map<string, CategoriaProc>();
  for (const r of rows) {
    const k = normalizarNome(r.nome);
    if (!k) continue;
    const c = categoriaDoProcedimento(r.tipo_procedimento);
    // Preserva a mais específica se o mesmo nome aparecer com tipos distintos.
    const atual = byName.get(k);
    if (!atual || (atual === "outro" && c !== "outro")) byName.set(k, c);
  }
  return {
    /** Categoria do texto do procedimento (aceita `A + B + C`). */
    categoriaDoTexto(texto: string | null | undefined): CategoriaProc {
      const t = (texto ?? "").trim();
      if (!t) return "outro";
      const partes = t.split(/\s+\+\s+/).map((s) => s.trim()).filter(Boolean);
      if (partes.length === 0) return "outro";
      const cats = partes.map((p) => byName.get(normalizarNome(p)) ?? "outro" as CategoriaProc);
      // Regra: laboratório prevalece quando todos são lab; se qualquer for imagem
      // ou cirurgia, sobe para essa; senão a mais rica dentre as encontradas.
      const uniq = new Set(cats);
      if (uniq.size === 1) return cats[0];
      // Prioridade decrescente (mais operacional para menos)
      const ordem: CategoriaProc[] = ["cirurgia", "imagem", "procedimento", "consulta", "laboratorio", "outro"];
      for (const c of ordem) if (uniq.has(c)) return c;
      return "outro";
    },
  };
}

export type CategoriaResolver = ReturnType<typeof buildCategoriaResolver>;