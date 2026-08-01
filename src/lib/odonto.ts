export type OdontoStatus =
  | "higido" | "cariado" | "restaurado" | "ausente" | "extracao_indicada"
  | "tratamento_canal" | "coroa" | "implante" | "protese" | "fratura";

export const STATUS_COR: Record<OdontoStatus, string> = {
  higido: "hsl(var(--muted))",
  cariado: "#ef4444",
  restaurado: "#3b82f6",
  ausente: "#1f2937",
  extracao_indicada: "#f97316",
  tratamento_canal: "#a855f7",
  coroa: "#eab308",
  implante: "#0ea5e9",
  protese: "#14b8a6",
  fratura: "#dc2626",
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
};