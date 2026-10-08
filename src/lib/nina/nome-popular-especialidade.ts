/**
 * Nome popular de especialidade ("consulta do coração", "médico de vista") é o
 * paciente dizendo QUAL atendimento quer — não é sintoma. Tabela validada pelo
 * usuário em 07/10/2026. Nomes ambíguos ("médico de cabeça", "de nervo") ficam
 * de fora: nesses casos a Nina continua pedindo o nome do atendimento.
 */
const TABELA: Array<[RegExp, string]> = [
  [/cora[cç][aã]o/, "CARDIOLOGIA"],
  [/vista|olhos?/, "OFTALMOLOGIA"],
  [/crian[cç]as?/, "PEDIATRIA"],
  [/mulher(?:es)?/, "GINECOLOGIA"],
  [/ossos?/, "ORTOPEDIA"],
  [/pele/, "DERMATOLOGIA"],
  [/pulm[aã]o|pulm[oõ]es/, "PNEUMOLOGIA"],
  [/ouvidos?|nariz|garganta/, "OTORRINOLARINGOLOGIA"],
  [/est[oô]mago/, "GASTROENTEROLOGIA"],
  [/pr[oó]stata|urina/, "UROLOGIA"],
  [/idosos?/, "GERIATRIA"],
  [/dentes?/, "ODONTOLOGIA"],
];

/** "médico do", "consulta de", "doutora pra", "especialista em"… */
const QUEM = String.raw`(?:m[eé]dic[oa]s?|medcio|consultas?|doutor[a]?|dotor[a]?|dr[a]?|especialista)`;
const LIGA = String.raw`(?:d[oa]s?|de|pr[oa]|pra|para|em)`;

export type NomePopular = { termo: string; especialidade: string };

export function especialidadePorNomePopular(mensagem: string | null | undefined): NomePopular | null {
  const texto = (mensagem ?? "").toLowerCase();
  if (/\bdentista\b/.test(texto)) return { termo: "dentista", especialidade: "ODONTOLOGIA" };
  for (const [alvo, especialidade] of TABELA) {
    const m = texto.match(new RegExp(String.raw`\b${QUEM}\s+${LIGA}\s+(?:(?:o|a|os|as)\s+)?(?:${alvo.source})\b`));
    if (m) return { termo: m[0], especialidade };
  }
  return null;
}
