/**
 * Garante contraste mínimo (WCAG AA, 4.5:1) entre texto branco e uma cor de
 * fundo arbitrária — escurece a cor progressivamente até passar, sem alterar
 * o matiz. Usado na sidebar, onde a cor vem da clínica (branding livre) e
 * pode ser clara demais para texto branco legível.
 */

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [rl, gl, bl] = [toLinear(r), toLinear(g), toLinear(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrastWithWhite(rgb: [number, number, number]): number {
  const l = relativeLuminance(rgb);
  return (1.0 + 0.05) / (l + 0.05);
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

export function garantirContrasteTextoBranco(hex: string, minRatio = 4.5): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  let [r, g, b] = rgb;
  let guard = 0;
  while (contrastWithWhite([r, g, b]) < minRatio && guard < 20) {
    r *= 0.88; g *= 0.88; b *= 0.88;
    guard++;
  }
  return guard === 0 ? hex : rgbToHex([r, g, b]);
}
