/**
 * O editor rico da fila do médico grava a evolução em HTML no mesmo campo
 * (`prontuarios.historia_doenca`) que as telas antigas gravam como texto puro.
 * Estas funções deixam as duas formas convivendo.
 */
import DOMPurify from "isomorphic-dompurify";

export function ehHtml(v: string | null | undefined): boolean {
  return /<\/?(p|br|strong|em|u|s|ul|ol|li|table|span|h[1-6]|sup|sub|div)\b/i.test(v ?? "");
}

/** HTML limpo para exibir (sem scripts nem atributos perigosos). */
export function htmlSeguro(v: string): string {
  return DOMPurify.sanitize(v, { USE_PROFILES: { html: true } });
}

/** Converte HTML em texto simples, preservando quebras de parágrafo. */
export function textoDoProntuario(v: string | null | undefined): string {
  const s = v ?? "";
  if (!ehHtml(s)) return s;
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Texto puro vira HTML com parágrafos (para abrir no editor rico). */
export function htmlDoProntuario(v: string | null | undefined): string {
  const s = v ?? "";
  if (!s || ehHtml(s)) return s;
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return s
    .split(/\n/)
    .map((l) => `<p>${esc(l) || "<br>"}</p>`)
    .join("");
}

/** "33 ANOS 8 MESES 11 DIAS" a partir de "AAAA-MM-DD". */
export function idadeCompleta(nasc: string | null | undefined, ref: Date = new Date()): string {
  if (!nasc) return "";
  const [a, m, d] = nasc.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return "";
  let anos = ref.getFullYear() - a;
  let meses = ref.getMonth() + 1 - m;
  let dias = ref.getDate() - d;
  if (dias < 0) {
    meses -= 1;
    dias += new Date(ref.getFullYear(), ref.getMonth(), 0).getDate();
  }
  if (meses < 0) {
    anos -= 1;
    meses += 12;
  }
  if (anos < 0) return "";
  const p = (n: number, s: string, pl: string) => `${n} ${n === 1 ? s : pl}`;
  return `${p(anos, "ANO", "ANOS")} ${p(meses, "MÊS", "MESES")} ${p(dias, "DIA", "DIAS")}`;
}

/** "1h 05min" / "12 min" desde um instante ISO. */
export function tempoDesde(iso: string | null | undefined, agora: number = Date.now()): string {
  if (!iso) return "—";
  const min = Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}min`;
}
