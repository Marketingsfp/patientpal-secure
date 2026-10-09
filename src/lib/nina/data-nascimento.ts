const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const MES =
  "(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)";
const DATA_EXTENSO = new RegExp(
  `\\b(\\d{1,2})(?:[º°])?\\s+(?:de\\s+)?${MES}\\s+(?:de\\s+)?(\\d{4})\\b`,
  "i",
);
/** "1950 dia 20 de julho": o ano vem antes do dia (07/10/2026, teste com paciente real). */
const DATA_ANO_ANTES = new RegExp(
  `\\b(\\d{4})\\s*,?\\s*(?:dia\\s+)?(\\d{1,2})(?:[º°])?\\s+(?:de\\s+)?${MES}\\b`,
  "i",
);
/** "02 04 2001": números separados só por espaço. */
const DATA_ESPACOS = /\b(\d{1,2})\s+(\d{1,2})\s+(\d{4})\b/;

/** Recorta também a data inválida para que mês/ano não virem parte do nome. */
export function encontrarDataNascimento(
  texto: string,
): { trecho: string; data: string | null } | null {
  const iso = texto.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const br = iso ? null : texto.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})\b/);
  const extenso = iso || br ? null : texto.match(DATA_EXTENSO);
  const anoAntes = iso || br || extenso ? null : texto.match(DATA_ANO_ANTES);
  const espacos = iso || br || extenso || anoAntes ? null : texto.match(DATA_ESPACOS);
  const encontrado = iso ?? br ?? extenso ?? anoAntes ?? espacos;
  if (!encontrado) return null;
  const nomeMes = extenso?.[2] ?? anoAntes?.[3];
  const dia = Number(iso ? iso[3] : anoAntes ? anoAntes[2] : encontrado[1]);
  const mes = nomeMes
    ? MESES.indexOf(nomeMes.toLowerCase().replace("marco", "março")) + 1
    : Number(encontrado[2]);
  let ano = Number(iso ? iso[1] : anoAntes ? anoAntes[1] : encontrado[3]);
  // Preserva a interpretação já usada para anos com dois dígitos.
  if (br && br[3]!.length === 2) ano += ano > 30 ? 1900 : 2000;
  const data = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  const instante = new Date(Date.UTC(ano, mes - 1, dia));
  const valida =
    ano >= 1900 && instante.getTime() <= Date.now() && instante.toISOString().slice(0, 10) === data;
  return { trecho: encontrado[0], data: valida ? data : null };
}
