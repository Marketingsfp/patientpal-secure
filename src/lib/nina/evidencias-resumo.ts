/**
 * FASE 5 — CONTAGENS E LIMITES DAS EVIDÊNCIAS (módulo puro).
 *
 * Corrige leituras enganosas do painel "Detalhes técnicos da resposta":
 *
 *  - "mensagens do turno" (mensagens RECEBIDAS) não é o mesmo que as ENTRADAS
 *    enviadas ao modelo; as duas contagens aparecem separadas;
 *  - a duplicação de blocos `user` na requisição registrada é PRESERVADA e
 *    apontada — nunca deduplicada só na tela (a correção da montagem do
 *    contexto está registrada em docs/nina/defeito-contexto-duplicado.md e é
 *    deliberadamente fora desta fase);
 *  - ferramentas DISPONÍVEIS ≠ ferramentas CHAMADAS, e ausência de metadados
 *    não vira afirmação de "não usou";
 *  - campo sem informação aparece como "Não registrado";
 *  - a captura nunca é apresentada como "requisição completa": sanitização,
 *    truncamento e campos omitidos são declarados a partir do conteúdo
 *    efetivamente persistido, não de uma flag anterior aos cortes.
 *
 * Nada aqui altera geração, nem preenche campo histórico por suposição.
 */
import { MARCA_TRUNCADO } from "./rastreio/turno";
import type { Etapa } from "./evidencias";

export const TEXTO_NAO_REGISTRADO = "Não registrado";

/** Campo vazio/ausente nunca vira "—" mudo nem afirmação de ausência de uso. */
export function valorOuNaoRegistrado(v: unknown): string {
  if (v === null || v === undefined) return TEXTO_NAO_REGISTRADO;
  if (typeof v === "string" && v.trim() === "") return TEXTO_NAO_REGISTRADO;
  if (Array.isArray(v)) return v.length ? v.map((i) => String(i)).join(", ") : TEXTO_NAO_REGISTRADO;
  return String(v);
}

type BlocoEntrada = { role?: string | null; content?: unknown };

export type ResumoEntradas = {
  /** Total de blocos enviados ao modelo na requisição registrada. */
  total: number | null;
  /** Blocos com papel `user`. */
  user: number | null;
  /** Conteúdos `user` repetidos, preservados como estão na captura. */
  duplicados: { conteudo: string; vezes: number }[];
  texto: string;
};

/**
 * Entradas ENVIADAS ao modelo, lidas da etapa `contexto_modelo`. Sem etapa
 * registrada, devolve `null` nas contagens — não presume zero.
 */
export function resumirEntradasDoModelo(etapa?: {
  dados?: Record<string, unknown> | null;
} | null): ResumoEntradas {
  const brutas = etapa?.dados?.["mensagens"];
  if (!Array.isArray(brutas)) {
    return { total: null, user: null, duplicados: [], texto: TEXTO_NAO_REGISTRADO };
  }
  const blocos = brutas as BlocoEntrada[];
  const users = blocos.filter((b) => b?.role === "user");
  const contagem = new Map<string, number>();
  for (const b of users) {
    const c = typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? null);
    contagem.set(c, (contagem.get(c) ?? 0) + 1);
  }
  const duplicados = [...contagem.entries()]
    .filter(([, n]) => n > 1)
    .map(([conteudo, vezes]) => ({ conteudo, vezes }));

  let texto = `${blocos.length} entrada(s) enviada(s) ao modelo · ${users.length} do paciente (user)`;
  if (duplicados.length) {
    const vezes = duplicados.reduce((s, d) => s + d.vezes, 0);
    texto += ` · ${vezes} entradas user repetidas na requisição registrada (duplicação preservada, defeito de montagem registrado à parte)`;
  }
  return { total: blocos.length, user: users.length, duplicados, texto };
}

export type ResumoFerramentas = {
  /** null = não registrado (nunca confundir com lista vazia). */
  disponiveis: string[] | null;
  chamadas: string[] | null;
  texto: string;
};

/**
 * Ferramentas DISPONÍVEIS (declaradas na requisição) x CHAMADAS pelo modelo.
 * Sem registro da resposta do modelo, "chamadas" fica como não registrado —
 * ausência de metadado não é prova de que nenhuma ferramenta foi usada.
 */
export function resumirFerramentas(
  contexto?: { dados?: Record<string, unknown> | null } | null,
  respostaOriginal?: { dados?: Record<string, unknown> | null } | null,
): ResumoFerramentas {
  const brutasDisp = contexto?.dados?.["ferramentas_disponiveis"];
  const disponiveis = Array.isArray(brutasDisp)
    ? brutasDisp.map((n) => (n == null ? "(sem nome)" : String(n)))
    : null;

  const brutasCham = respostaOriginal?.dados?.["tool_calls"];
  const chamadas = Array.isArray(brutasCham)
    ? brutasCham.map((t) => {
        const nome = (t as { nome?: unknown } | null)?.nome;
        return nome == null ? "(sem nome)" : String(nome);
      })
    : null;

  const parteDisp =
    disponiveis === null
      ? `Disponíveis: ${TEXTO_NAO_REGISTRADO}`
      : disponiveis.length
        ? `Disponíveis (${disponiveis.length}): ${disponiveis.join(", ")}`
        : "Disponíveis: nenhuma declarada nesta requisição";
  const parteCham =
    chamadas === null
      ? `Chamadas pelo modelo: ${TEXTO_NAO_REGISTRADO} (a ausência de metadado não comprova que nenhuma foi usada)`
      : chamadas.length
        ? `Chamadas pelo modelo (${chamadas.length}): ${chamadas.join(", ")}`
        : "Chamadas pelo modelo: nenhuma";

  return { disponiveis, chamadas, texto: `${parteDisp} · ${parteCham}` };
}

export type LimitesCaptura = {
  /** A captura NUNCA é a requisição completa; isto é sempre false. */
  completa: false;
  truncada: boolean;
  sanitizada: boolean;
  /** Etapas esperadas que não existem nesta captura. */
  camposOmitidos: string[];
  descricao: string;
};

const MARCAS_SANITIZACAO = ["[redigido]", "[removido]", "[omitido]"];

function contemMarca(valor: unknown, marcas: readonly string[]): boolean {
  const s = typeof valor === "string" ? valor : JSON.stringify(valor ?? null);
  return marcas.some((m) => s.includes(m));
}

/**
 * Limites da captura, decididos pelo conteúdo REALMENTE persistido. Se houve
 * corte em qualquer camada posterior, o indicador de truncamento acompanha o
 * que sobrou — nenhuma flag de "conteúdo integral" sobrevive ao corte.
 */
export function limitesDaCaptura(
  etapas: readonly Pick<Etapa, "tipo" | "dados">[],
  esperadas: readonly string[] = ["contexto_modelo", "modelo_parametros", "resposta_original"],
): LimitesCaptura {
  const truncada = etapas.some((e) => contemMarca(e.dados, [MARCA_TRUNCADO, "…[truncado]"]));
  const sanitizada = etapas.some((e) => contemMarca(e.dados, MARCAS_SANITIZACAO));
  const presentes = new Set(etapas.map((e) => e.tipo));
  const camposOmitidos = esperadas.filter((t) => !presentes.has(t as Etapa["tipo"]));

  const partes = [
    "Captura parcial da requisição — registro de auditoria, não a requisição completa",
  ];
  if (truncada) partes.push("conteúdo truncado no registro");
  if (sanitizada) partes.push("conteúdo sanitizado (dados sensíveis removidos)");
  if (camposOmitidos.length) partes.push(`etapas ausentes: ${camposOmitidos.join(", ")}`);
  if (!truncada && !sanitizada && !camposOmitidos.length) {
    partes.push("sem indicador de corte no conteúdo persistido");
  }

  return { completa: false, truncada, sanitizada, camposOmitidos, descricao: partes.join(" · ") };
}
