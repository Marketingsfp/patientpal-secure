/**
 * Preparo de exames do orçamento de Laboratório.
 *
 * A lista e o rodapé reproduzem o formulário em papel que a recepção do
 * laboratório entregava ao paciente. Marcar um preparo escreve o rótulo,
 * uma linha só, no campo Observações do orçamento; a impressão reconhece a
 * linha pelo rótulo. Por isso, mudar um rótulo faz orçamentos antigos
 * deixarem de marcar aquele preparo no cupom.
 */
export const PREPAROS_PADRAO = [
  { id: "jejum_8h", label: "Jejum de 8 horas" },
  { id: "urina_eas", label: "1ª Urina do dia (EAS)" },
  {
    id: "urina_cultura",
    label: "1ª Urina do dia, com gelo em volta do recipiente (Cultura)",
  },
  { id: "urina_24h", label: "Urina de 24h" },
  { id: "fezes_1", label: "1 Amostra de Fezes (POP/EPF)" },
  { id: "fezes_3", label: "3 Amostras de Fezes (MIF)" },
  {
    id: "psa",
    label: "Abstinência Sexual, não praticar esportes, não fazer esforço físico, por 2 dias (PSA)",
  },
] as const;

export type PreparoId = (typeof PREPAROS_PADRAO)[number]["id"];

export const RODAPE_LABORATORIO = {
  horarioColeta: ["Segunda à Sexta das 07h às 12h", "Sábado de 07h às 11h"],
  documento: "TRAZER DOCUMENTO OFICIAL COM FOTO",
  obs: "Exames que não necessitam de jejum realizamos de Seg. a Sex. até as 15:00h",
  chegada: "Atendimento por ordem de chegada.",
};

// O banco grava Observações em maiúsculas e sem acento
// (uppercase_text_fields), então a comparação ignora os dois.
const normalizar = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();

const preparoDaLinha = (linha: string): PreparoId | null => {
  const n = normalizar(linha.trim());
  return PREPAROS_PADRAO.find((p) => normalizar(p.label) === n)?.id ?? null;
};

/** Preparos presentes (uma linha cada) no texto de Observações. */
export function preparosNoTexto(texto: string | null | undefined): Set<PreparoId> {
  const out = new Set<PreparoId>();
  for (const linha of (texto ?? "").split("\n")) {
    const id = preparoDaLinha(linha);
    if (id) out.add(id);
  }
  return out;
}

/** Observações sem as linhas de preparo (o resto que a recepção digitou). */
export function textoSemPreparos(texto: string | null | undefined): string {
  return (texto ?? "")
    .split("\n")
    .filter((l) => !preparoDaLinha(l))
    .join("\n")
    .trim();
}

/** Liga ou desliga a linha de um preparo no texto de Observações. */
export function alternarPreparoNoTexto(texto: string, id: PreparoId, marcar: boolean): string {
  const linhas = texto.split("\n").filter((l) => preparoDaLinha(l) !== id);
  if (marcar) {
    const label = PREPAROS_PADRAO.find((p) => p.id === id)!.label;
    while (linhas.length > 0 && !linhas[linhas.length - 1].trim()) linhas.pop();
    linhas.push(label);
  }
  return linhas.join("\n").trim();
}

/**
 * Sugere os preparos pelo nome do exame. Cobre só os itens cujo rótulo já
 * cita o exame (EAS, Cultura, 24h, EPF, MIF, PSA). Jejum não é sugerido:
 * quais exames exigem jejum é regra clínica e o cadastro não informa.
 */
export function sugerirPreparos(nomeExame: string): PreparoId[] {
  const n = normalizar(nomeExame);
  const out: PreparoId[] = [];
  if (/\bEAS\b|URINA TIPO|ROTINA DE URINA/.test(n)) out.push("urina_eas");
  if (/UROCULTURA|CULTURA (DE |EM )?URINA/.test(n)) out.push("urina_cultura");
  if (/\b24\s?H/.test(n)) out.push("urina_24h");
  if (/\bMIF\b|COLHEITA MULTIPLA/.test(n)) out.push("fezes_3");
  else if (/PARASITOLOGICO|\bEPF\b|\bPOP\b/.test(n)) out.push("fezes_1");
  if (/\bPSA\b/.test(n)) out.push("psa");
  return out;
}
