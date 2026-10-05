const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DATA_EXTENSO = /\b(\d{1,2})(?:[º°])?\s+(?:de\s+)?(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(?:de\s+)?(\d{4})\b/i;

/** Recorta também a data inválida para que mês/ano não virem parte do nome. */
export function encontrarDataNascimento(texto: string): { trecho: string; data: string | null } | null {
  const iso = texto.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const br = iso ? null : texto.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})\b/);
  const extenso = iso || br ? null : texto.match(DATA_EXTENSO);
  const encontrado = iso ?? br ?? extenso;
  if (!encontrado) return null;
  const dia = Number(iso ? iso[3] : encontrado[1]);
  const mes = extenso ? MESES.indexOf(extenso[2]!.toLowerCase().replace("marco", "março")) + 1 : Number(encontrado[2]);
  let ano = Number(iso ? iso[1] : encontrado[3]);
  // Preserva a interpretação já usada para anos com dois dígitos.
  if (br && br[3]!.length === 2) ano += ano > 30 ? 1900 : 2000;
  const data = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  const instante = new Date(Date.UTC(ano, mes - 1, dia));
  const valida = ano >= 1900 && instante.getTime() <= Date.now() && instante.toISOString().slice(0, 10) === data;
  return { trecho: encontrado[0], data: valida ? data : null };
}
