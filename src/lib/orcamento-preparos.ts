/**
 * Preparo de exames do orçamento de Laboratório.
 *
 * A lista e o rodapé reproduzem o formulário em papel que a recepção do
 * laboratório entregava ao paciente. As chaves (`id`) ficam gravadas em
 * `orcamentos.preparos`, então não renomeie uma chave já em uso.
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

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();

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
