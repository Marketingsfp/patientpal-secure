/**
 * Preferências de acessibilidade — camada de dados pura (sem React).
 *
 * Mantida separada do provider para poder ser testada isoladamente e para
 * evitar espalhar condicionais de acessibilidade pelos componentes: tudo é
 * aplicado por classes globais + CSS variables no elemento <html>.
 */

export type FontScale = 0.9 | 1 | 1.15 | 1.35;
export type Densidade = "compacta" | "confortavel" | "grande";
export type ColorVision = "padrao" | "protanopia" | "deuteranopia" | "tritanopia";

export type AlertasSonoros = {
  novaMensagem: boolean;
  novaConversa: boolean;
  naoAtribuida: boolean;
  transferencia: boolean;
  filaCritica: boolean;
};

export type A11yPrefs = {
  fontScale: FontScale;
  densidade: Densidade;
  altoContraste: boolean;
  modoEscuro: boolean;
  botoesMaiores: boolean;
  espacamentoMaior: boolean;
  destacarSelecionado: boolean;
  reduzirAnimacoes: boolean;
  visaoCores: ColorVision;
  modoFoco: boolean;
  destacarFocoTeclado: boolean;
  atalhosTeclado: boolean;
  sons: AlertasSonoros;
};

export const A11Y_DEFAULTS: A11yPrefs = {
  fontScale: 1,
  densidade: "compacta",
  altoContraste: false,
  modoEscuro: false,
  botoesMaiores: false,
  espacamentoMaior: false,
  destacarSelecionado: false,
  reduzirAnimacoes: false,
  visaoCores: "padrao",
  modoFoco: false,
  destacarFocoTeclado: true,
  atalhosTeclado: true,
  sons: {
    novaMensagem: false,
    novaConversa: false,
    naoAtribuida: false,
    transferencia: false,
    filaCritica: false,
  },
};

export const A11Y_STORAGE_KEY = "hhp:a11y";

/** Aceita qualquer JSON e devolve preferências válidas (sem lançar). */
export function normalizarPrefs(bruto: unknown): A11yPrefs {
  const p = (bruto ?? {}) as Partial<A11yPrefs>;
  const escalas: FontScale[] = [0.9, 1, 1.15, 1.35];
  const densidades: Densidade[] = ["compacta", "confortavel", "grande"];
  const cores: ColorVision[] = ["padrao", "protanopia", "deuteranopia", "tritanopia"];
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const sons = (p.sons ?? {}) as Partial<AlertasSonoros>;
  return {
    fontScale: escalas.includes(p.fontScale as FontScale)
      ? (p.fontScale as FontScale)
      : A11Y_DEFAULTS.fontScale,
    densidade: densidades.includes(p.densidade as Densidade)
      ? (p.densidade as Densidade)
      : A11Y_DEFAULTS.densidade,
    altoContraste: bool(p.altoContraste, false),
    modoEscuro: bool(p.modoEscuro, false),
    botoesMaiores: bool(p.botoesMaiores, false),
    espacamentoMaior: bool(p.espacamentoMaior, false),
    destacarSelecionado: bool(p.destacarSelecionado, false),
    reduzirAnimacoes: bool(p.reduzirAnimacoes, false),
    visaoCores: cores.includes(p.visaoCores as ColorVision)
      ? (p.visaoCores as ColorVision)
      : "padrao",
    modoFoco: bool(p.modoFoco, false),
    destacarFocoTeclado: bool(p.destacarFocoTeclado, true),
    atalhosTeclado: bool(p.atalhosTeclado, true),
    sons: {
      novaMensagem: bool(sons.novaMensagem, false),
      novaConversa: bool(sons.novaConversa, false),
      naoAtribuida: bool(sons.naoAtribuida, false),
      transferencia: bool(sons.transferencia, false),
      filaCritica: bool(sons.filaCritica, false),
    },
  };
}

/** Classes que o <html> recebe para as preferências informadas. */
export function classesDe(p: A11yPrefs): string[] {
  const cls = [`a11y-dens-${p.densidade}`, `a11y-cores-${p.visaoCores}`];
  if (p.altoContraste) cls.push("a11y-alto-contraste");
  if (p.modoEscuro) cls.push("dark", "a11y-escuro");
  if (p.botoesMaiores) cls.push("a11y-botoes-maiores");
  if (p.espacamentoMaior) cls.push("a11y-espacamento");
  if (p.destacarSelecionado) cls.push("a11y-destacar-selecao");
  if (p.reduzirAnimacoes) cls.push("a11y-reduzir-animacao");
  if (p.modoFoco) cls.push("a11y-modo-foco");
  if (p.destacarFocoTeclado) cls.push("a11y-foco-teclado");
  return cls;
}

const TODAS_CLASSES = [
  "a11y-dens-compacta",
  "a11y-dens-confortavel",
  "a11y-dens-grande",
  "a11y-cores-padrao",
  "a11y-cores-protanopia",
  "a11y-cores-deuteranopia",
  "a11y-cores-tritanopia",
  "a11y-alto-contraste",
  "a11y-escuro",
  "dark",
  "a11y-botoes-maiores",
  "a11y-espacamento",
  "a11y-destacar-selecao",
  "a11y-reduzir-animacao",
  "a11y-modo-foco",
  "a11y-foco-teclado",
];

/** Aplica as preferências no documento (idempotente). */
export function aplicarPrefs(p: A11yPrefs, doc: Document = document) {
  const html = doc.documentElement;
  html.classList.remove(...TODAS_CLASSES);
  html.classList.add(...classesDe(p));
  html.style.setProperty("--a11y-font-scale", String(p.fontScale));
  html.style.fontSize = `${16 * p.fontScale}px`;
}

export function lerLocal(): A11yPrefs | null {
  try {
    const raw = localStorage.getItem(A11Y_STORAGE_KEY);
    if (!raw) return null;
    return normalizarPrefs(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function salvarLocal(p: A11yPrefs) {
  try {
    localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* modo privado / sem storage: as preferências valem só nesta sessão */
  }
}
