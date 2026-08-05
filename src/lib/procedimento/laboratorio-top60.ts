// Lista curada dos 60 exames laboratoriais mais solicitados no Brasil.
// Usada como "pesquisa rápida" tanto na Agenda quanto no Orçamento — NÃO
// remove nem substitui os demais exames cadastrados; apenas destaca os
// mais comuns em um bloco de acesso direto.
//
// Cada entrada tem:
// - `label`: rótulo humano exibido no chip.
// - `aliases`: variações de nome que costumam aparecer nos cadastros das
//   clínicas (sinônimos, siglas, formas abreviadas). O casamento é feito
//   por SUBSTRING normalizada (sem acento, minúsculo).

export type LabExamTop60 = {
  label: string;
  aliases: string[];
};

export const LABORATORIO_TOP60: ReadonlyArray<LabExamTop60> = [
  { label: "Hemograma completo", aliases: ["hemograma"] },
  { label: "Glicemia de jejum", aliases: ["glicemia", "glicose"] },
  { label: "Colesterol total", aliases: ["colesterol total"] },
  { label: "HDL Colesterol", aliases: ["hdl"] },
  { label: "LDL Colesterol", aliases: ["ldl"] },
  { label: "Triglicerídeos", aliases: ["triglic"] },
  { label: "Ureia", aliases: ["ureia"] },
  { label: "Creatinina", aliases: ["creatinina"] },
  { label: "Ácido úrico", aliases: ["acido urico", "ácido úrico"] },
  { label: "TGO / AST", aliases: ["tgo", "ast", "aspartato"] },
  { label: "TGP / ALT", aliases: ["tgp", "alt", "alanina"] },
  { label: "Gama GT (GGT)", aliases: ["gama gt", "ggt", "gama-gt", "gamaglutamil"] },
  { label: "Fosfatase alcalina", aliases: ["fosfatase alcalina"] },
  { label: "Bilirrubinas T e F", aliases: ["bilirrubina"] },
  { label: "Proteínas totais e frações", aliases: ["proteinas totais", "proteínas totais"] },
  { label: "Albumina", aliases: ["albumina"] },
  { label: "TSH", aliases: ["tsh"] },
  { label: "T4 livre", aliases: ["t4 livre", "t4l"] },
  { label: "T3", aliases: ["t3 total", "t3 livre", " t3"] },
  { label: "Hemoglobina glicada", aliases: ["hemoglobina glicada", "hba1c", "glicada"] },
  { label: "PSA total", aliases: ["psa total"] },
  { label: "PSA livre", aliases: ["psa livre"] },
  { label: "Beta HCG", aliases: ["beta hcg", "b-hcg", "bhcg", "hcg"] },
  { label: "Sódio", aliases: ["sodio", "sódio"] },
  { label: "Potássio", aliases: ["potassio", "potássio"] },
  { label: "Cálcio", aliases: ["calcio", "cálcio"] },
  { label: "Magnésio", aliases: ["magnesio", "magnésio"] },
  { label: "Fósforo", aliases: ["fosforo", "fósforo"] },
  { label: "Ferro sérico", aliases: ["ferro serico", "ferro sérico"] },
  { label: "Ferritina", aliases: ["ferritina"] },
  { label: "Transferrina", aliases: ["transferrina"] },
  { label: "Vitamina D (25-OH)", aliases: ["vitamina d", "25-oh", "25 oh"] },
  { label: "Vitamina B12", aliases: ["vitamina b12", "b12"] },
  { label: "Ácido fólico", aliases: ["acido folico", "ácido fólico", "folato"] },
  { label: "VHS", aliases: ["vhs", "hemossedimenta"] },
  { label: "PCR (Prot. C reativa)", aliases: ["pcr", "proteina c reativa", "proteína c reativa"] },
  { label: "TAP / INR", aliases: ["tap", "tempo de protrombina", "inr"] },
  { label: "TTPA", aliases: ["ttpa", "tromboplastina"] },
  { label: "Urina tipo I (EAS)", aliases: ["urina tipo", "eas", "urina i"] },
  { label: "Urocultura", aliases: ["urocultura"] },
  { label: "Parasitológico de fezes", aliases: ["parasitologico", "parasitológico", "epf"] },
  { label: "Coprocultura", aliases: ["coprocultura"] },
  { label: "Sangue oculto nas fezes", aliases: ["sangue oculto"] },
  { label: "HBsAg", aliases: ["hbsag", "antigeno hbs", "antígeno hbs"] },
  { label: "Anti-HBs", aliases: ["anti-hbs", "anti hbs"] },
  { label: "Anti-HCV", aliases: ["anti-hcv", "anti hcv"] },
  { label: "HIV", aliases: ["hiv", "anti hiv", "anti-hiv"] },
  { label: "VDRL", aliases: ["vdrl", "sifilis", "sífilis"] },
  { label: "Toxoplasmose IgG", aliases: ["toxoplasmose igg"] },
  { label: "Toxoplasmose IgM", aliases: ["toxoplasmose igm"] },
  { label: "Rubéola IgG", aliases: ["rubeola igg", "rubéola igg"] },
  { label: "Citomegalovírus IgG", aliases: ["citomegalo", "cmv igg"] },
  { label: "FAN", aliases: ["fan", "fator antinuclear", "antinuclear"] },
  { label: "Fator reumatoide", aliases: ["fator reumatoide", "reumatoide"] },
  { label: "ASLO", aliases: ["aslo", "antiestreptolisina"] },
  { label: "CK / CPK", aliases: [" ck ", "cpk", "creatinofosfoquinase", "creatino quinase"] },
  { label: "LDH", aliases: ["ldh", "desidrogenase lactica"] },
  { label: "Amilase", aliases: ["amilase"] },
  { label: "Lipase", aliases: ["lipase"] },
  { label: "Tipagem sanguínea", aliases: ["tipagem", "grupo sanguineo", "grupo sanguíneo", "fator rh", "abo"] },
];

export function normalizarNome(s: string | null | undefined): string {
  return ` ${(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()} `;
}

/**
 * Dada uma lista de procedimentos da clínica, retorna, na ORDEM do Top 60,
 * as entradas que possuem correspondente cadastrado. Cada slot devolve o
 * primeiro procedimento cujo nome case com algum alias.
 *
 * Procedimentos não pareados continuam disponíveis pela busca normal —
 * este helper serve apenas para o bloco de acesso rápido.
 */
export function pickTop60<T extends { nome: string }>(
  procedimentos: ReadonlyArray<T>,
): Array<{ item: LabExamTop60; proc: T }> {
  const normed = procedimentos.map((p) => ({ p, n: normalizarNome(p.nome) }));
  const out: Array<{ item: LabExamTop60; proc: T }> = [];
  const usados = new Set<T>();
  for (const item of LABORATORIO_TOP60) {
    const aliasesNorm = item.aliases.map((a) => normalizarNome(a).trim());
    const hit = normed.find(({ p, n }) => {
      if (usados.has(p)) return false;
      return aliasesNorm.some((a) => n.includes(a));
    });
    if (hit) {
      usados.add(hit.p);
      out.push({ item, proc: hit.p });
    }
  }
  return out;
}