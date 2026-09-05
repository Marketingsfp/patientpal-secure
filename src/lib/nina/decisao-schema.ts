/**
 * FASE 4 — STRUCTURED OUTPUT para decisões INTERNAS da Nina.
 *
 * Não é resposta ao paciente: é o objeto que descreve o que a rodada precisa
 * (conhecimento? ferramenta? falta algum dado?). Usado para orquestração e
 * debug interno; nunca substitui a validação do backend.
 */

export type IntencaoNina =
  | "greeting"
  | "info" // valores, endereço, documentos, preparo (planilha)
  | "availability" // disponibilidade (agenda)
  | "appointment" // criar/alterar agendamento (agenda + backend)
  | "patient_data" // dados do paciente (CRM)
  | "handoff"
  | "other";

export type DecisaoNina = {
  intent: IntencaoNina;
  needs_knowledge: boolean;
  needs_tool: boolean;
  missing_fields: string[];
};

const INTENCOES: IntencaoNina[] = [
  "greeting",
  "info",
  "availability",
  "appointment",
  "patient_data",
  "handoff",
  "other",
];

/** JSON Schema para `response_format` quando o provedor suportar. */
export const SCHEMA_DECISAO_NINA = {
  name: "nina_decisao",
  strict: true,
  schema: {
    type: "object",
    properties: {
      intent: { type: "string", enum: INTENCOES },
      needs_knowledge: { type: "boolean" },
      needs_tool: { type: "boolean" },
      missing_fields: { type: "array", items: { type: "string" } },
    },
    required: ["intent", "needs_knowledge", "needs_tool", "missing_fields"],
    additionalProperties: false,
  },
} as const;

export const DECISAO_PADRAO: DecisaoNina = {
  intent: "other",
  needs_knowledge: false,
  needs_tool: false,
  missing_fields: [],
};

/** Nunca lança: entrada inválida vira decisão neutra. */
export function parseDecisaoNina(bruto: unknown): DecisaoNina {
  let obj: unknown = bruto;
  if (typeof bruto === "string") {
    try {
      obj = JSON.parse(bruto);
    } catch {
      return DECISAO_PADRAO;
    }
  }
  if (!obj || typeof obj !== "object") return DECISAO_PADRAO;
  const o = obj as Record<string, unknown>;
  const intent = INTENCOES.includes(o["intent"] as IntencaoNina)
    ? (o["intent"] as IntencaoNina)
    : "other";
  const campos = Array.isArray(o["missing_fields"])
    ? (o["missing_fields"] as unknown[]).filter((c): c is string => typeof c === "string").slice(0, 10)
    : [];
  return {
    intent,
    needs_knowledge: o["needs_knowledge"] === true,
    needs_tool: o["needs_tool"] === true,
    missing_fields: campos,
  };
}

/** Campos obrigatórios do agendamento — a regra é de código, não do modelo. */
export function camposFaltantesAgendamento(estado: {
  paciente_identificado?: boolean;
  medico_id?: string | null;
  inicio?: string | null;
  procedimento?: string | null;
}): string[] {
  const faltam: string[] = [];
  if (!estado.paciente_identificado) faltam.push("identificacao_paciente");
  if (!estado.medico_id) faltam.push("medico");
  if (!estado.inicio) faltam.push("horario");
  if (!estado.procedimento) faltam.push("procedimento");
  return faltam;
}
