/**
 * Identidade visual por clínica: cada unidade ganha uma cor de destaque estável
 * (derivada do nome) e um monograma, para o sistema parecer "da clínica".
 */
const HUES = [165, 200, 265, 30, 130, 320, 95, 240];

function hash(texto: string) {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) % 100000;
  return h;
}

export type TemaClinica = {
  monograma: string;
  cor: string;
  corSuave: string;
  corBorda: string;
  gradiente: string;
  logo?: string;
};

/** Identidade fixa da Policlínica Menino Jesus: azul e branco, com logo oficial. */
const MENINO_JESUS_HUE = 250;

export function temaClinica(nome: string | null | undefined): TemaClinica {
  const limpo = (nome ?? "").trim();
  const isMeninoJesus = /menino\s*jesus/i.test(limpo);
  const hue = isMeninoJesus
    ? MENINO_JESUS_HUE
    : HUES[hash(limpo || "clinica") % HUES.length];
  const monograma =
    limpo
      .replace(/policl[íi]nica|cl[íi]nica/gi, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "CL";
  return {
    monograma,
    cor: `oklch(0.5 0.13 ${hue})`,
    corSuave: `oklch(0.5 0.13 ${hue} / 0.12)`,
    corBorda: `oklch(0.5 0.13 ${hue} / 0.35)`,
    gradiente: isMeninoJesus
      ? `linear-gradient(135deg, oklch(0.34 0.10 ${hue}) 0%, oklch(0.50 0.14 ${hue}) 55%, oklch(0.72 0.10 ${hue}) 100%)`
      : `linear-gradient(135deg, oklch(0.32 0.08 ${hue}) 0%, oklch(0.46 0.12 ${hue}) 60%, oklch(0.68 0.16 ${(hue + 20) % 360}) 100%)`,
  };
}
