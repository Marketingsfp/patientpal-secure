// Regras clínicas de apoio à triagem de enfermagem.
// Nenhuma regra aqui bloqueia o salvamento — são apenas alertas visuais.

export type NivelAlerta = "ok" | "atencao" | "critico";

export function numero(v: string): number | null {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return isFinite(n) ? n : null;
}

/** IMC = peso / altura². Aceita altura em cm (>3) ou metros. */
export function calcularImc(peso: string, altura: string): number | null {
  const p = numero(peso);
  const a = numero(altura);
  if (!p || !a) return null;
  const aM = a > 3 ? a / 100 : a;
  const v = p / (aM * aM);
  return isFinite(v) && v > 0 ? Number(v.toFixed(2)) : null;
}

export function classificarImc(imc: number | null) {
  if (imc == null) return null;
  if (imc < 18.5)
    return { label: "Abaixo do peso", classe: "bg-blue-500/15 text-blue-700 dark:text-blue-300" };
  if (imc < 25)
    return {
      label: "Peso normal",
      classe: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    };
  if (imc < 30)
    return { label: "Sobrepeso", classe: "bg-amber-500/15 text-amber-700 dark:text-amber-300" };
  return {
    label: "Obesidade",
    classe: "bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold",
  };
}

export type Alerta = { nivel: NivelAlerta; texto: string } | null;

export function alertaPressao(sis: string, dia: string): Alerta {
  const s = numero(sis),
    d = numero(dia);
  if (s == null && d == null) return null;
  if ((s ?? 0) >= 180 || (d ?? 0) >= 120) return { nivel: "critico", texto: "Crise hipertensiva" };
  if ((s ?? 0) >= 140 || (d ?? 0) >= 90) return { nivel: "critico", texto: "Hipertensão" };
  if ((s != null && s < 90) || (d != null && d < 60))
    return { nivel: "atencao", texto: "Hipotensão" };
  return { nivel: "ok", texto: "Normal" };
}

export function alertaTemperatura(v: string): Alerta {
  const t = numero(v);
  if (t == null) return null;
  if (t >= 39) return { nivel: "critico", texto: "Febre alta" };
  if (t >= 37.8) return { nivel: "critico", texto: "Febre" };
  if (t >= 37.3) return { nivel: "atencao", texto: "Febrícula" };
  if (t < 35) return { nivel: "critico", texto: "Hipotermia" };
  return { nivel: "ok", texto: "Normal" };
}

export function alertaSaturacao(v: string): Alerta {
  const s = numero(v);
  if (s == null) return null;
  if (s < 90) return { nivel: "critico", texto: "Hipoxemia grave" };
  if (s < 95) return { nivel: "critico", texto: "Baixa oxigenação" };
  return { nivel: "ok", texto: "Normal" };
}

export function alertaFc(v: string): Alerta {
  const f = numero(v);
  if (f == null) return null;
  if (f < 50) return { nivel: "atencao", texto: "Bradicardia" };
  if (f > 100) return { nivel: "atencao", texto: "Taquicardia" };
  return { nivel: "ok", texto: "Normal" };
}

export function alertaGlicemia(v: string): Alerta {
  const g = numero(v);
  if (g == null) return null;
  if (g < 70) return { nivel: "critico", texto: "Hipoglicemia" };
  if (g >= 250) return { nivel: "critico", texto: "Hiperglicemia" };
  if (g >= 140) return { nivel: "atencao", texto: "Glicemia elevada" };
  return { nivel: "ok", texto: "Normal" };
}

export function classeInput(a: Alerta) {
  if (!a || a.nivel === "ok") return "";
  return a.nivel === "critico"
    ? "border-rose-500 focus-visible:ring-rose-500/40 bg-rose-500/5"
    : "border-amber-500 focus-visible:ring-amber-500/40 bg-amber-500/5";
}

export function classeBadge(a: Alerta) {
  if (!a) return "";
  if (a.nivel === "ok") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  return a.nivel === "critico"
    ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 font-semibold"
    : "bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium";
}

export const MANCHESTER = [
  {
    v: "vermelho",
    emoji: "🔴",
    label: "Emergência",
    tempo: "Atendimento imediato",
    prioridade: "urgente",
    classe: "border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
  {
    v: "laranja",
    emoji: "🟠",
    label: "Muito urgente",
    tempo: "Até 10 min",
    prioridade: "urgente",
    classe: "border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  },
  {
    v: "amarelo",
    emoji: "🟡",
    label: "Urgente",
    tempo: "Até 60 min",
    prioridade: "prioritario",
    classe: "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  {
    v: "verde",
    emoji: "🟢",
    label: "Pouco urgente",
    tempo: "Até 120 min",
    prioridade: "normal",
    classe: "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  {
    v: "azul",
    emoji: "🔵",
    label: "Não urgente",
    tempo: "Eletivo",
    prioridade: "normal",
    classe: "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
] as const;

export type ManchesterCor = (typeof MANCHESTER)[number]["v"];
