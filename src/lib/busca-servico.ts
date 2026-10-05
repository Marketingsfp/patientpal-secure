import { sanitizePostgrestSearch } from "@/lib/sanitize-search";

/**
 * Busca de serviço por PALAVRAS, não pela frase inteira.
 *
 * O cadastro usa abreviações ("RM DE JOELHO", "USG DOPPLER CAROTIDAS E
 * VERTEBRAIS") e a recepção digita o nome por extenso ("Ressonância Magnética
 * do Joelho", "Doppler de Carótidas"). Procurando a frase inteira, a primeira
 * não achava nada e a segunda só achava um cadastro duplicado com preço zero.
 *
 * Cada palavra digitada precisa aparecer no nome (em qualquer ordem), e cada
 * uma aceita as suas formas abreviadas. Conectivos ("de", "do", "e") e
 * acentos são ignorados; plural vira singular ("CAROTIDAS" acha "CAROTIDA").
 */

const CONECTIVOS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "COM", "EM", "A", "O", "PARA"]);

/** Expressões que o cadastro abrevia numa sigla só. */
const EXPRESSOES: Array<[RegExp, string]> = [
  [/\bRESSONANCIA MAGNETICA\b/g, "RESSONANCIA"],
  [/\bTOMOGRAFIA COMPUTADORIZADA\b/g, "TOMOGRAFIA"],
  [/\bRAIO[\s-]?X\b/g, "RX"],
];

/** Palavra → formas aceitas no nome do serviço. */
const SINONIMOS: Record<string, string[]> = {
  RESSONANCIA: ["RESSONANCIA", "RM"],
  RM: ["RM", "RESSONANCIA"],
  TOMOGRAFIA: ["TOMOGRAFIA", "TC"],
  TC: ["TC", "TOMOGRAFIA"],
  ULTRASSONOGRAFIA: ["ULTRASSONOGRAFIA", "USG"],
  ULTRASSOM: ["ULTRASSONOGRAFIA", "USG"],
  ULTRASSON: ["ULTRASSONOGRAFIA", "USG"],
  ULTRASOM: ["ULTRASSONOGRAFIA", "USG"],
  USG: ["USG", "ULTRASSONOGRAFIA"],
  RX: ["RX", "RAIO X", "RAIO-X"],
  ELETROCARDIOGRAMA: ["ELETROCARDIOGRAMA", "ECG"],
  ECG: ["ECG", "ELETROCARDIOGRAMA"],
};

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Plural simples: "CAROTIDAS" → "CAROTIDA". Siglas e palavras curtas ficam. */
function singular(p: string): string {
  return p.length > 4 && p.endsWith("S") ? p.slice(0, -1) : p;
}

/**
 * Grupos de alternativas: o serviço precisa casar com pelo menos uma forma
 * de CADA grupo.
 */
export function termosDaBusca(texto: string): string[][] {
  let t = semAcento(texto ?? "").toUpperCase();
  for (const [re, sub] of EXPRESSOES) t = t.replace(re, sub);
  const palavras = t.split(/[^A-Z0-9]+/).filter((p) => p && !CONECTIVOS.has(p));
  return palavras
    .map((p) => {
      const formas = SINONIMOS[p] ?? [singular(p)];
      return Array.from(new Set(formas.map(sanitizePostgrestSearch).filter((f) => f.length > 0)));
    })
    .filter((g) => g.length > 0);
}

/**
 * Filtros para `.or()` do PostgREST — um por grupo; chamadas seguidas de
 * `.or()` se somam com E.
 */
export function filtrosOrNomeServico(texto: string, coluna = "nome"): string[] {
  return termosDaBusca(texto).map((grupo) => grupo.map((f) => `${coluna}.ilike.%${f}%`).join(","));
}
