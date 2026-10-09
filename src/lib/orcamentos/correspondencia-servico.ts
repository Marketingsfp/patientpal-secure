/**
 * Liga o exame lido no pedido médico ao serviço da tabela da clínica (regras puras, sem rede).
 *
 * A tabela tem vários cadastros para o mesmo exame ("POTASSIO", "POTASSIO (2)", "POTASSIO RS",
 * "HEMOGRAMA (URGENCIA DO DIA)") e o pedido vem escrito de outro jeito ("Urina tipo 1" x
 * "EAS (URINA TIPO I)", "Glicemia" x "GLICOSE"). A nota de cada cadastro soma:
 * - quanto do nome lido aparece no cadastro (siglas, acentos, plural e erro de uma letra contam);
 * - quanto do cadastro é só o que foi pedido (cadastro com qualificador a mais perde pontos);
 * - quantas vezes a recepção já escolheu esse cadastro em orçamentos da clínica.
 * Cadastro "de urgência", neonatal ou de urina sem o pedido dizer isso, e preço zerado, ficam
 * para trás. Equivalências servem só para achar o cadastro, nunca para preço ou preparo.
 */

/** Expressões que o pedido e a tabela escrevem de jeitos diferentes → uma forma só. */
const EXPRESSOES: Array<[RegExp, string]> = [
  [/\b(?:SUMARIO|ROTINA|PARCIAL) DE URINA\b/g, "EAS"],
  [/\bURINA (?:TIPO )?(?:I|1|UM)\b/g, "EAS"],
  [/\bURINA ROTINA\b/g, "EAS"],
  [/\bELEMENTOS ANORMAIS E SEDIMENTOSCOPIA\b/g, "EAS"],
  [/\bPARASITOLOGICO (?:DE|DAS) FEZES\b/g, "PARASITOLOGICO"],
  [/\b(?:BETA|B)[\s-]*HCG\b/g, "BHCG"],
  [/\b(?:HEMOGLOBINA GLICADA|HEMOGLOBINA GLICOSILADA|HB GLICADA|GLICOHEMOGLOBINA|A1C)\b/g, "HBA1C"],
  [/\bPERFIL LIPIDICO\b/g, "LIPIDOGRAMA"],
  [/\b(?:GAMA[\s-]*GT|GAMA GLUTAMIL TRANSFERASE|GAMA GLUTAMIL TRANSPEPTIDASE)\b/g, "GGT"],
  [/\bTRANSAMINASE OXALACETICA\b/g, "TGO"],
  [/\bTRANSAMINASE PIRUVICA\b/g, "TGP"],
  [/\bVELOCIDADE DE HEMOSSEDIMENTACAO\b/g, "VHS"],
  [/\b(?:UROCULTURA|CULTURA DE URINA)\b/g, "URINOCULTURA"],
  [/\bT4\s*L\b/g, "T4 LIVRE"],
  [/\bT3\s*L\b/g, "T3 LIVRE"],
  [/\bVIT\b/g, "VITAMINA"],
  [/\bRESSONANCIA MAGNETICA\b/g, "RM"],
  [/\bTOMOGRAFIA COMPUTADORIZADA\b/g, "TC"],
  [/\bRAIO[\s-]*X\b/g, "RX"],
];

/** Palavra → forma única usada na comparação. */
const SINONIMOS: Record<string, string> = {
  AST: "TGO",
  ALT: "TGP",
  GLICEMIA: "GLICOSE",
  EPF: "PARASITOLOGICO",
  RESSONANCIA: "RM",
  TOMOGRAFIA: "TC",
  ULTRASSONOGRAFIA: "USG",
  ULTRASSOM: "USG",
  ULTRASOM: "USG",
  ULTRASONOGRAFIA: "USG",
  RADIOGRAFIA: "RX",
  ELETROCARDIOGRAMA: "ECG",
  ECOCARDIOGRAMA: "ECO",
  ECOCARDIO: "ECO",
};

/** Palavras que não distinguem um exame de outro. */
const NEUTRAS = new Set(
  (
    "DE DA DO DAS DOS E COM EM A O AS OS PARA POR NA NO C " +
    "DOSAGEM EXAME EXAMES SANGUE SORO SERICO SERICA SORICO BIOQUIMICA HORMONIO HORMONIOS JEJUM DIA"
  ).split(" "),
);

/** Qualificadores que, sem o pedido dizer, indicam outro cadastro do mesmo exame. */
const PENALIDADES: Array<[RegExp, number]> = [
  [/^URGENCIA$/, 25],
  [/^(?:NEONATAL|NEO)$/, 20],
  [/^(?:URINA|URINARIA|URINARIO|24H|24|HRS|HORAS|ISOLADA)$/, 10],
  [/^\d$/, 6], // "POTASSIO (2)"
];

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function singular(p: string): string {
  return p.length > 4 && p.endsWith("S") ? p.slice(0, -1) : p;
}

/** Palavras do nome já na forma de comparação, sem repetição. */
export function palavrasDoExame(texto: string): string[] {
  let t = ` ${semAcento(texto ?? "").toUpperCase()} `;
  t = t.replace(/[^A-Z0-9]+/g, " ");
  for (const [re, para] of EXPRESSOES) t = t.replace(re, para);
  const out: string[] = [];
  for (const bruta of t.split(" ")) {
    if (!bruta) continue;
    const p = SINONIMOS[bruta] ?? SINONIMOS[singular(bruta)] ?? singular(bruta);
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/** Erro de uma letra (troca, falta ou sobra) em palavras de 6+ letras. */
function umaLetraDeDiferenca(a: string, b: string): boolean {
  if (Math.min(a.length, b.length) < 6 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return (
    a.slice(i + 1) === b.slice(i + 1) ||
    a.slice(i + 1) === b.slice(i) ||
    a.slice(i) === b.slice(i + 1)
  );
}

function mesmaPalavra(a: string, b: string): boolean {
  if (a === b) return true;
  if (/^\d+$/.test(a) || /^\d+$/.test(b)) return false;
  if (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  return umaLetraDeDiferenca(a, b);
}

export type ServicoComNota<T> = {
  servico: T;
  nota: number;
  /** Parte do nome lido encontrada no cadastro (0 a 1). */
  cobertura: number;
  usos: number;
};

/**
 * Ordena os cadastros pela nota (maior primeiro). Cadastro que não contém nenhuma palavra
 * do pedido fica de fora.
 */
export function ordenarServicosDoPedido<T extends { nome: string }>(
  lido: string,
  servicos: readonly T[],
  usos: (s: T) => number,
  preco: (s: T) => number,
): ServicoComNota<T>[] {
  const pedidas = palavrasDoExame(lido).filter((p) => !NEUTRAS.has(p));
  if (pedidas.length === 0) return [];
  const lidoExato = semAcento(lido).toUpperCase().replace(/\s+/g, " ").trim();
  const out: (ServicoComNota<T> & { base: number })[] = [];
  for (const s of servicos) {
    const doCadastro = palavrasDoExame(s.nome).filter((p) => !NEUTRAS.has(p));
    if (doCadastro.length === 0) continue;
    const achadas = pedidas.filter((p) => doCadastro.some((c) => mesmaPalavra(p, c))).length;
    if (achadas === 0) continue;
    const cobertura = achadas / pedidas.length;
    const sobra = doCadastro.filter((c) => !pedidas.some((p) => mesmaPalavra(p, c)));
    const precisao = 1 - sobra.length / doCadastro.length;
    let nota = 60 * cobertura + 25 * precisao;
    for (const c of sobra) for (const [re, pontos] of PENALIDADES) if (re.test(c)) nota -= pontos;
    if (!(preco(s) > 0)) nota -= 30;
    if (semAcento(s.nome).toUpperCase().trim() === lidoExato) nota += 6;
    out.push({ servico: s, nota, base: nota, cobertura, usos: Math.max(0, usos(s)) });
  }
  // Histórico: parte das escolhas da recepção entre estes cadastros. Poucas escolhas pesam menos.
  const totalUsos = out.reduce((t, x) => t + x.usos, 0);
  if (totalUsos > 0)
    for (const x of out) x.nota = x.base + 30 * (x.usos / totalUsos) * Math.min(1, totalUsos / 5);
  return out
    .sort((a, b) => b.nota - a.nota || a.servico.nome.length - b.servico.nome.length)
    .map(({ base: _base, ...x }) => x);
}

/** Distância mínima de nota para o primeiro entrar sozinho no orçamento. */
export const FOLGA_PARA_ESCOLHER_SOZINHO = 5;

/**
 * O primeiro da lista só entra sozinho quando cobre tudo o que foi pedido, tem preço e fica
 * claramente à frente do segundo. Senão a recepção escolhe, com o primeiro como sugestão.
 */
export function escolhaSegura<T>(
  ordenados: readonly ServicoComNota<T>[],
  preco: (s: T) => number,
): T | null {
  const [primeiro, segundo] = ordenados;
  if (!primeiro || primeiro.cobertura < 1 || !(preco(primeiro.servico) > 0)) return null;
  if (segundo && primeiro.nota - segundo.nota < FOLGA_PARA_ESCOLHER_SOZINHO) return null;
  return primeiro.servico;
}
