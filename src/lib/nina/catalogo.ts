/**
 * Catálogo estruturado da Base de Conhecimentos da Nina — regras puras.
 *
 * Este módulo NÃO acessa banco: só define o formato dos dados, valida e
 * formata. É usado pela tela (validação imediata) e pelas server functions
 * (validação real, que é a que vale).
 *
 * Princípios preservados aqui:
 *  - Ausência de informação NUNCA vira preço zero, gratuidade ou dia fechado:
 *    campo não preenchido é `null`, não `0` nem `false`.
 *  - O valor exibido no resumo e o valor das formas de pagamento têm UMA
 *    fonte: havendo formas de pagamento com valor, o resumo é derivado delas.
 */
import { z } from "zod";

export const STATUS_CATALOGO = ["RASCUNHO", "PUBLICADO", "ARQUIVADO"] as const;
export type StatusCatalogo = (typeof STATUS_CATALOGO)[number];

export const ROTULO_STATUS: Record<StatusCatalogo, string> = {
  RASCUNHO: "Rascunho",
  PUBLICADO: "Publicado",
  ARQUIVADO: "Arquivado",
};

export const DIAS_SEMANA = [
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
  "Domingo",
] as const;

/** Recorrência: preserva exceções (quinzenal etc.) sem virar regra permanente. */
export const RECORRENCIAS = [
  "Toda semana",
  "Quinzenal",
  "Mensal",
  "Data específica",
] as const;

/* ------------------------------------------------------------------ */
/* Utilitários de formato                                              */
/* ------------------------------------------------------------------ */

/** Texto "1.234,56" | "1234.56" | "R$ 130,00" → número, ou null se vazio. */
export function paraNumero(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const txt = String(v).trim();
  if (!txt) return null;
  const limpo = txt.replace(/[^\d,.-]/g, "");
  if (!limpo) return null;
  const norm =
    limpo.includes(",") && limpo.lastIndexOf(",") > limpo.lastIndexOf(".")
      ? limpo.replace(/\./g, "").replace(",", ".")
      : limpo.replace(/,/g, "");
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

export function formatarBRL(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "8", "8:0", "0800" → "08:00". Retorna null quando não dá para interpretar. */
export function normalizarHora(v: unknown): string | null {
  const txt = String(v ?? "").trim();
  if (!txt) return null;
  const m = /^(\d{1,2})\s*[:hH.]?\s*(\d{2})?$/.exec(txt);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** ISO "2026-09-06" → "06/09/2026". */
export function formatarDataBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

const textoOpcional = z
  .string()
  .trim()
  .max(4000)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const textoCurtoOpcional = z
  .string()
  .trim()
  .max(200)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const valorOpcional = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    const n = paraNumero(v ?? null);
    return n === null ? null : Math.round(n * 100) / 100;
  })
  .refine((v) => v === null || v >= 0, "Valor não pode ser negativo");

const horaOpcional = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => normalizarHora(v ?? null));

const dataOpcional = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    const txt = String(v ?? "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(txt) ? txt : null;
  });

/* ------------------------------------------------------------------ */
/* Exames e procedimentos                                              */
/* ------------------------------------------------------------------ */

export const formaPagamentoSchema = z.object({
  forma: z.string().trim().min(1, "Informe a forma de pagamento").max(80),
  valor: valorOpcional,
  condicao: textoCurtoOpcional,
  observacao: textoOpcional,
});
export type FormaPagamento = z.infer<typeof formaPagamentoSchema>;

export const executanteSchema = z.object({
  medico_id: z.string().uuid().nullable().optional().default(null),
  nome: z.string().trim().min(1, "Informe quem realiza").max(160),
  horarios: textoCurtoOpcional,
  observacao: textoOpcional,
});
export type Executante = z.infer<typeof executanteSchema>;

export const servicoSchema = z.object({
  procedimento_id: z.string().uuid().nullable().optional().default(null),
  nome: z.string().trim().min(2, "Informe o procedimento").max(200),
  valor: valorOpcional,
  valor_observacao: textoCurtoOpcional,
  descricao_publica: textoOpcional,
  preparo: textoOpcional,
  restricoes: textoOpcional,
  nota_interna: textoOpcional,
  executantes: z.array(executanteSchema).max(50).default([]),
  formas_pagamento: z.array(formaPagamentoSchema).max(30).default([]),
});
export type ServicoCatalogo = z.infer<typeof servicoSchema>;

/**
 * Fonte única de preço: havendo formas de pagamento com valor, o resumo é o
 * MENOR valor informado (normalmente à vista). Sem formas com valor, vale o
 * campo "Valor". Nunca devolve 0 por ausência de informação.
 */
export function valorResumo(dados: {
  valor?: number | null;
  formas_pagamento?: Array<{ valor?: number | null }>;
}): number | null {
  const valores = (dados.formas_pagamento ?? [])
    .map((f) => paraNumero(f?.valor ?? null))
    .filter((v): v is number => v !== null);
  if (valores.length) return Math.min(...valores);
  return paraNumero(dados.valor ?? null);
}

/* ------------------------------------------------------------------ */
/* Consultas e profissionais                                           */
/* ------------------------------------------------------------------ */

export const vinculoSchema = z.object({
  id: z.string().uuid().nullable().optional().default(null),
  nome: z.string().trim().min(1).max(160),
});
export type Vinculo = z.infer<typeof vinculoSchema>;

export const horarioSchema = z
  .object({
    dia: z.enum(DIAS_SEMANA),
    inicio: horaOpcional,
    fim: horaOpcional,
    recorrencia: z.enum(RECORRENCIAS).default("Toda semana"),
    observacao: textoCurtoOpcional,
  })
  .refine(
    (h) => !h.inicio || !h.fim || h.fim > h.inicio,
    "O término precisa ser depois do início",
  );
export type HorarioAtendimento = z.infer<typeof horarioSchema>;

export const profissionalSchema = z
  .object({
    medico_id: z.string().uuid().nullable().optional().default(null),
    unidade_id: z.string().uuid().nullable().optional().default(null),
    nome: z.string().trim().min(2, "Informe o nome do profissional").max(200),
    especialidades: z.array(vinculoSchema).max(30).default([]),
    /** null = não informado. Nunca assumir "não atende" por ausência. */
    atende_consultorio: z.boolean().nullable().optional().default(null),
    formas_pagamento: z.array(formaPagamentoSchema).max(30).default([]),
    convenios: z.array(vinculoSchema).max(60).default([]),
    horarios: z.array(horarioSchema).max(60).default([]),
    tipo_atendimento: textoCurtoOpcional,
    observacao_publica: textoOpcional,
    aviso_dia: textoOpcional,
    aviso_valido_de: dataOpcional,
    aviso_valido_ate: dataOpcional,
    nota_interna: textoOpcional,
  })
  .refine(
    (p) =>
      !p.aviso_valido_de || !p.aviso_valido_ate || p.aviso_valido_ate >= p.aviso_valido_de,
    "O fim da validade do aviso não pode ser antes do início",
  );
export type ProfissionalCatalogo = z.infer<typeof profissionalSchema>;

/** O aviso do dia é temporário: fora da validade, não deve ser tratado como regra. */
export function avisoVigente(
  item: { aviso_dia?: string | null; aviso_valido_de?: string | null; aviso_valido_ate?: string | null },
  hojeIso: string,
): boolean {
  if (!item.aviso_dia) return false;
  if (item.aviso_valido_de && hojeIso < item.aviso_valido_de) return false;
  if (item.aviso_valido_ate && hojeIso > item.aviso_valido_ate) return false;
  return true;
}

/** Resumo curto de horários para listagem. */
export function resumoHorarios(horarios: Array<Partial<HorarioAtendimento>>): string {
  if (!horarios?.length) return "Horários não informados";
  return horarios
    .map((h) => {
      const faixa = h.inicio ? (h.fim ? `${h.inicio}–${h.fim}` : `a partir de ${h.inicio}`) : "";
      const rec = h.recorrencia && h.recorrencia !== "Toda semana" ? ` (${h.recorrencia})` : "";
      return `${h.dia}${faixa ? ` ${faixa}` : ""}${rec}`;
    })
    .join(" · ");
}
