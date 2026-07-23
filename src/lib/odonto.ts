export type OdontoStatus =
  | "higido" | "cariado" | "restaurado" | "ausente" | "extracao_indicada"
  | "tratamento_canal" | "coroa" | "implante" | "protese" | "fratura"
  | "selante" | "sangramento" | "mobilidade" | "tartaro" | "aparelho" | "faceta";

export type OdontoFace = "O" | "M" | "D" | "V" | "L" | "INTEIRO";

export const FACE_LABEL: Record<OdontoFace, string> = {
  O: "Oclusal / Incisal",
  M: "Mesial",
  D: "Distal",
  V: "Vestibular",
  L: "Lingual / Palatina",
  INTEIRO: "Dente inteiro",
};

/** FDI permanente */
export const DENTES_PERMANENTES = {
  supDir: [18, 17, 16, 15, 14, 13, 12, 11],
  supEsq: [21, 22, 23, 24, 25, 26, 27, 28],
  infEsq: [31, 32, 33, 34, 35, 36, 37, 38],
  infDir: [48, 47, 46, 45, 44, 43, 42, 41],
} as const;

/** FDI decíduo (5x-8x). */
export const DENTES_DECIDUOS = {
  supDir: [55, 54, 53, 52, 51],
  supEsq: [61, 62, 63, 64, 65],
  infEsq: [71, 72, 73, 74, 75],
  infDir: [85, 84, 83, 82, 81],
} as const;

export function isDecidua(dente: number): boolean {
  return dente >= 51 && dente <= 85;
}

export const STATUS_COR: Record<OdontoStatus, string> = {
  higido: "#f8fafc",
  cariado: "#ef4444",
  restaurado: "#3b82f6",
  ausente: "#1f2937",
  extracao_indicada: "#f97316",
  tratamento_canal: "#a855f7",
  coroa: "#eab308",
  implante: "#0ea5e9",
  protese: "#14b8a6",
  fratura: "#dc2626",
  selante: "#84cc16",
  sangramento: "#be123c",
  mobilidade: "#9333ea",
  tartaro: "#a16207",
  aparelho: "#64748b",
  faceta: "#0d9488",
};

export const STATUS_LABEL: Record<OdontoStatus, string> = {
  higido: "Hígido",
  cariado: "Cariado",
  restaurado: "Restaurado",
  ausente: "Ausente",
  extracao_indicada: "Extração indicada",
  tratamento_canal: "Tratamento de canal",
  coroa: "Coroa",
  implante: "Implante",
  protese: "Prótese",
  fratura: "Fratura",
  selante: "Selante",
  sangramento: "Sangramento",
  mobilidade: "Mobilidade",
  tartaro: "Tártaro",
  aparelho: "Aparelho ortodôntico",
  faceta: "Faceta",
};