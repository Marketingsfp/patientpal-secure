/**
 * Definições do módulo de Fisioterapia — regiões do mapa corporal, tipos de
 * marcação e status de sessão.
 *
 * IMPORTANTE — lateralidade: `lado` é sempre do ponto de vista do PACIENTE.
 * Na vista de frente, o lado direito do paciente aparece à esquerda de quem
 * olha; na vista de costas, aparece à direita. As coordenadas abaixo já estão
 * espelhadas para respeitar isso, então uma marcação em "ombro direito"
 * acende o mesmo ombro nas duas vistas.
 */

export type FisioTipo =
  | "dor"
  | "edema"
  | "limitacao"
  | "contratura"
  | "parestesia"
  | "cicatriz"
  | "deformidade"
  | "outro";

export type FisioVista = "frente" | "costas";
/** D = direita do paciente, E = esquerda do paciente, C = central/axial. */
export type FisioLado = "D" | "E" | "C";

export const TIPO_LABEL: Record<FisioTipo, string> = {
  dor: "Dor",
  edema: "Edema / inchaço",
  limitacao: "Limitação de movimento",
  contratura: "Contratura / encurtamento",
  parestesia: "Formigamento / dormência",
  cicatriz: "Cicatriz",
  deformidade: "Deformidade",
  outro: "Outro",
};

export const TIPO_COR: Record<FisioTipo, string> = {
  dor: "#ef4444",
  edema: "#3b82f6",
  limitacao: "#f59e0b",
  contratura: "#a855f7",
  parestesia: "#14b8a6",
  cicatriz: "#64748b",
  deformidade: "#f97316",
  outro: "#6b7280",
};

export type FisioSessaoStatus = "pendente" | "agendada" | "realizada" | "faltou" | "cancelada";

export const SESSAO_LABEL: Record<FisioSessaoStatus, string> = {
  pendente: "A marcar",
  agendada: "Agendada",
  realizada: "Realizada",
  faltou: "Faltou",
  cancelada: "Cancelada",
};

/** Classes Tailwind da "bolinha" de cada sessão na régua do pacote. */
export const SESSAO_CLASSE: Record<FisioSessaoStatus, string> = {
  pendente: "border-border bg-muted text-muted-foreground",
  agendada: "border-sky-400 bg-sky-50 text-sky-700",
  realizada: "border-emerald-500 bg-emerald-50 text-emerald-700",
  faltou: "border-red-400 bg-red-50 text-red-700",
  cancelada: "border-border bg-muted text-muted-foreground line-through",
};

export const PACOTE_STATUS_LABEL: Record<string, string> = {
  ativo: "Ativo",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

// ── Mapa corporal ───────────────────────────────────────────────────────────

type Forma =
  | { tipo: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { tipo: "rect"; x: number; y: number; w: number; h: number; r?: number };

export interface RegiaoCorporal {
  /** Código gravado em `fisio_marcacoes.regiao`. Nunca renomear: é histórico. */
  codigo: string;
  label: string;
  vista: FisioVista;
  lado: FisioLado;
  forma: Forma;
}

/** viewBox usado pelas duas vistas. */
export const MAPA_VIEWBOX = { largura: 200, altura: 380 };

const el = (cx: number, cy: number, rx: number, ry: number): Forma => ({
  tipo: "ellipse",
  cx,
  cy,
  rx,
  ry,
});
const rc = (x: number, y: number, w: number, h: number, r = 6): Forma => ({
  tipo: "rect",
  x,
  y,
  w,
  h,
  r,
});

// Eixo horizontal: 100 é a linha média. Direita do paciente < 100 na vista de
// frente e > 100 na vista de costas.
const REGIOES_FRENTE: RegiaoCorporal[] = [
  {
    codigo: "cabeca",
    label: "Cabeça / face",
    vista: "frente",
    lado: "C",
    forma: el(100, 30, 21, 26),
  },
  { codigo: "pescoco", label: "Pescoço", vista: "frente", lado: "C", forma: rc(89, 54, 22, 14) },
  {
    codigo: "ombro_D",
    label: "Ombro direito",
    vista: "frente",
    lado: "D",
    forma: el(69, 79, 15, 11),
  },
  {
    codigo: "ombro_E",
    label: "Ombro esquerdo",
    vista: "frente",
    lado: "E",
    forma: el(131, 79, 15, 11),
  },
  { codigo: "torax", label: "Tórax", vista: "frente", lado: "C", forma: rc(78, 72, 44, 46) },
  { codigo: "abdome", label: "Abdome", vista: "frente", lado: "C", forma: rc(80, 120, 40, 40) },
  {
    codigo: "quadril",
    label: "Quadril / pelve",
    vista: "frente",
    lado: "C",
    forma: rc(78, 162, 44, 26),
  },
  {
    codigo: "braco_D",
    label: "Braço direito",
    vista: "frente",
    lado: "D",
    forma: rc(52, 88, 15, 46),
  },
  {
    codigo: "braco_E",
    label: "Braço esquerdo",
    vista: "frente",
    lado: "E",
    forma: rc(133, 88, 15, 46),
  },
  {
    codigo: "cotovelo_D",
    label: "Cotovelo direito",
    vista: "frente",
    lado: "D",
    forma: el(59, 141, 9, 8),
  },
  {
    codigo: "cotovelo_E",
    label: "Cotovelo esquerdo",
    vista: "frente",
    lado: "E",
    forma: el(141, 141, 9, 8),
  },
  {
    codigo: "antebraco_D",
    label: "Antebraço direito",
    vista: "frente",
    lado: "D",
    forma: rc(50, 150, 14, 42),
  },
  {
    codigo: "antebraco_E",
    label: "Antebraço esquerdo",
    vista: "frente",
    lado: "E",
    forma: rc(136, 150, 14, 42),
  },
  {
    codigo: "mao_D",
    label: "Punho / mão direita",
    vista: "frente",
    lado: "D",
    forma: el(57, 202, 9, 11),
  },
  {
    codigo: "mao_E",
    label: "Punho / mão esquerda",
    vista: "frente",
    lado: "E",
    forma: el(143, 202, 9, 11),
  },
  {
    codigo: "coxa_D",
    label: "Coxa direita",
    vista: "frente",
    lado: "D",
    forma: rc(79, 190, 19, 56),
  },
  {
    codigo: "coxa_E",
    label: "Coxa esquerda",
    vista: "frente",
    lado: "E",
    forma: rc(102, 190, 19, 56),
  },
  {
    codigo: "joelho_D",
    label: "Joelho direito",
    vista: "frente",
    lado: "D",
    forma: el(88, 254, 10, 9),
  },
  {
    codigo: "joelho_E",
    label: "Joelho esquerdo",
    vista: "frente",
    lado: "E",
    forma: el(112, 254, 10, 9),
  },
  {
    codigo: "perna_D",
    label: "Perna direita",
    vista: "frente",
    lado: "D",
    forma: rc(80, 264, 17, 54),
  },
  {
    codigo: "perna_E",
    label: "Perna esquerda",
    vista: "frente",
    lado: "E",
    forma: rc(103, 264, 17, 54),
  },
  {
    codigo: "tornozelo_D",
    label: "Tornozelo direito",
    vista: "frente",
    lado: "D",
    forma: el(88, 325, 8, 7),
  },
  {
    codigo: "tornozelo_E",
    label: "Tornozelo esquerdo",
    vista: "frente",
    lado: "E",
    forma: el(112, 325, 8, 7),
  },
  { codigo: "pe_D", label: "Pé direito", vista: "frente", lado: "D", forma: el(88, 342, 11, 10) },
  { codigo: "pe_E", label: "Pé esquerdo", vista: "frente", lado: "E", forma: el(112, 342, 11, 10) },
];

const REGIOES_COSTAS: RegiaoCorporal[] = [
  {
    codigo: "cabeca_post",
    label: "Nuca / occipital",
    vista: "costas",
    lado: "C",
    forma: el(100, 30, 21, 26),
  },
  { codigo: "cervical", label: "Cervical", vista: "costas", lado: "C", forma: rc(89, 54, 22, 14) },
  {
    codigo: "ombro_D",
    label: "Ombro direito",
    vista: "costas",
    lado: "D",
    forma: el(131, 79, 15, 11),
  },
  {
    codigo: "ombro_E",
    label: "Ombro esquerdo",
    vista: "costas",
    lado: "E",
    forma: el(69, 79, 15, 11),
  },
  {
    codigo: "escapula_D",
    label: "Escápula direita",
    vista: "costas",
    lado: "D",
    forma: rc(101, 74, 21, 34),
  },
  {
    codigo: "escapula_E",
    label: "Escápula esquerda",
    vista: "costas",
    lado: "E",
    forma: rc(78, 74, 21, 34),
  },
  {
    codigo: "dorsal",
    label: "Dorsal (torácica)",
    vista: "costas",
    lado: "C",
    forma: rc(80, 110, 40, 34),
  },
  { codigo: "lombar", label: "Lombar", vista: "costas", lado: "C", forma: rc(80, 146, 40, 30) },
  {
    codigo: "gluteo_D",
    label: "Glúteo direito",
    vista: "costas",
    lado: "D",
    forma: rc(101, 178, 21, 26),
  },
  {
    codigo: "gluteo_E",
    label: "Glúteo esquerdo",
    vista: "costas",
    lado: "E",
    forma: rc(78, 178, 21, 26),
  },
  {
    codigo: "braco_D",
    label: "Braço direito",
    vista: "costas",
    lado: "D",
    forma: rc(133, 88, 15, 46),
  },
  {
    codigo: "braco_E",
    label: "Braço esquerdo",
    vista: "costas",
    lado: "E",
    forma: rc(52, 88, 15, 46),
  },
  {
    codigo: "cotovelo_D",
    label: "Cotovelo direito",
    vista: "costas",
    lado: "D",
    forma: el(141, 141, 9, 8),
  },
  {
    codigo: "cotovelo_E",
    label: "Cotovelo esquerdo",
    vista: "costas",
    lado: "E",
    forma: el(59, 141, 9, 8),
  },
  {
    codigo: "antebraco_D",
    label: "Antebraço direito",
    vista: "costas",
    lado: "D",
    forma: rc(136, 150, 14, 42),
  },
  {
    codigo: "antebraco_E",
    label: "Antebraço esquerdo",
    vista: "costas",
    lado: "E",
    forma: rc(50, 150, 14, 42),
  },
  {
    codigo: "mao_D",
    label: "Punho / mão direita",
    vista: "costas",
    lado: "D",
    forma: el(143, 202, 9, 11),
  },
  {
    codigo: "mao_E",
    label: "Punho / mão esquerda",
    vista: "costas",
    lado: "E",
    forma: el(57, 202, 9, 11),
  },
  {
    codigo: "coxa_post_D",
    label: "Posterior de coxa direita",
    vista: "costas",
    lado: "D",
    forma: rc(102, 206, 19, 42),
  },
  {
    codigo: "coxa_post_E",
    label: "Posterior de coxa esquerda",
    vista: "costas",
    lado: "E",
    forma: rc(79, 206, 19, 42),
  },
  {
    codigo: "joelho_post_D",
    label: "Poplíteo direito",
    vista: "costas",
    lado: "D",
    forma: el(112, 254, 10, 9),
  },
  {
    codigo: "joelho_post_E",
    label: "Poplíteo esquerdo",
    vista: "costas",
    lado: "E",
    forma: el(88, 254, 10, 9),
  },
  {
    codigo: "panturrilha_D",
    label: "Panturrilha direita",
    vista: "costas",
    lado: "D",
    forma: rc(103, 264, 17, 54),
  },
  {
    codigo: "panturrilha_E",
    label: "Panturrilha esquerda",
    vista: "costas",
    lado: "E",
    forma: rc(80, 264, 17, 54),
  },
  {
    codigo: "calcanhar_D",
    label: "Calcâneo direito",
    vista: "costas",
    lado: "D",
    forma: el(112, 328, 9, 8),
  },
  {
    codigo: "calcanhar_E",
    label: "Calcâneo esquerdo",
    vista: "costas",
    lado: "E",
    forma: el(88, 328, 9, 8),
  },
  {
    codigo: "pe_post_D",
    label: "Pé direito (planta)",
    vista: "costas",
    lado: "D",
    forma: el(112, 345, 11, 9),
  },
  {
    codigo: "pe_post_E",
    label: "Pé esquerdo (planta)",
    vista: "costas",
    lado: "E",
    forma: el(88, 345, 11, 9),
  },
];

export const REGIOES: RegiaoCorporal[] = [...REGIOES_FRENTE, ...REGIOES_COSTAS];

export function regioesDaVista(vista: FisioVista): RegiaoCorporal[] {
  return REGIOES.filter((r) => r.vista === vista);
}

const POR_CHAVE = new Map(REGIOES.map((r) => [`${r.vista}:${r.codigo}`, r]));

export function regiaoLabel(vista: FisioVista, codigo: string): string {
  return POR_CHAVE.get(`${vista}:${codigo}`)?.label ?? codigo;
}

/**
 * Rótulo legível de uma marcação já gravada, sem depender da vista atual da
 * tela — usado nas listagens e no resumo da ficha.
 */
export function marcacaoLabel(regiao: string, vista: string, lado: string): string {
  const r = POR_CHAVE.get(`${vista}:${regiao}`);
  if (r) return r.label;
  const sufixo = lado === "D" ? " direito(a)" : lado === "E" ? " esquerdo(a)" : "";
  return `${regiao}${sufixo}`;
}
