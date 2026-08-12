// Base curada de medicamentos de uso ambulatorial comum no Brasil.
// Não é bula nem substitui julgamento clínico — serve só como atalho de digitação.
export type Medicamento = { nome: string; apresentacao: string; posologia?: string };

export const MEDICAMENTOS: Medicamento[] = [
  { nome: "Dipirona sódica", apresentacao: "500 mg comprimido", posologia: "1 comprimido via oral de 6 em 6 horas se dor ou febre" },
  { nome: "Dipirona sódica", apresentacao: "500 mg/mL solução oral", posologia: "20 gotas via oral de 6 em 6 horas se dor ou febre" },
  { nome: "Paracetamol", apresentacao: "750 mg comprimido", posologia: "1 comprimido via oral de 8 em 8 horas se dor ou febre" },
  { nome: "Ibuprofeno", apresentacao: "600 mg comprimido", posologia: "1 comprimido via oral de 8 em 8 horas por 5 dias após as refeições" },
  { nome: "Nimesulida", apresentacao: "100 mg comprimido", posologia: "1 comprimido via oral de 12 em 12 horas por 5 dias" },
  { nome: "Amoxicilina", apresentacao: "500 mg cápsula", posologia: "1 cápsula via oral de 8 em 8 horas por 7 dias" },
  { nome: "Amoxicilina + Clavulanato", apresentacao: "875 + 125 mg comprimido", posologia: "1 comprimido via oral de 12 em 12 horas por 7 dias" },
  { nome: "Azitromicina", apresentacao: "500 mg comprimido", posologia: "1 comprimido via oral 1 vez ao dia por 5 dias" },
  { nome: "Cefalexina", apresentacao: "500 mg cápsula", posologia: "1 cápsula via oral de 6 em 6 horas por 7 dias" },
  { nome: "Ciprofloxacino", apresentacao: "500 mg comprimido", posologia: "1 comprimido via oral de 12 em 12 horas por 7 dias" },
  { nome: "Metronidazol", apresentacao: "400 mg comprimido", posologia: "1 comprimido via oral de 8 em 8 horas por 7 dias" },
  { nome: "Omeprazol", apresentacao: "20 mg cápsula", posologia: "1 cápsula via oral 1 vez ao dia em jejum por 30 dias" },
  { nome: "Pantoprazol", apresentacao: "40 mg comprimido", posologia: "1 comprimido via oral 1 vez ao dia em jejum" },
  { nome: "Ranitidina", apresentacao: "150 mg comprimido", posologia: "1 comprimido via oral de 12 em 12 horas" },
  { nome: "Bromoprida", apresentacao: "10 mg comprimido", posologia: "1 comprimido via oral de 8 em 8 horas se náusea" },
  { nome: "Ondansetrona", apresentacao: "4 mg comprimido", posologia: "1 comprimido via oral de 8 em 8 horas se náusea ou vômito" },
  { nome: "Escopolamina + Dipirona", apresentacao: "comprimido", posologia: "1 comprimido via oral de 8 em 8 horas se cólica" },
  { nome: "Loratadina", apresentacao: "10 mg comprimido", posologia: "1 comprimido via oral 1 vez ao dia por 7 dias" },
  { nome: "Dexclorfeniramina", apresentacao: "2 mg comprimido", posologia: "1 comprimido via oral de 8 em 8 horas por 5 dias" },
  { nome: "Prednisona", apresentacao: "20 mg comprimido", posologia: "1 comprimido via oral 1 vez ao dia pela manhã por 5 dias" },
  { nome: "Dexametasona", apresentacao: "4 mg comprimido", posologia: "1 comprimido via oral 1 vez ao dia por 3 dias" },
  { nome: "Salbutamol", apresentacao: "spray 100 mcg", posologia: "2 jatos inalatórios de 6 em 6 horas se falta de ar" },
  { nome: "Budesonida", apresentacao: "spray nasal 32 mcg", posologia: "1 jato em cada narina 1 vez ao dia" },
  { nome: "Losartana potássica", apresentacao: "50 mg comprimido", posologia: "1 comprimido via oral de 12 em 12 horas — uso contínuo" },
  { nome: "Enalapril", apresentacao: "10 mg comprimido", posologia: "1 comprimido via oral de 12 em 12 horas — uso contínuo" },
  { nome: "Anlodipino", apresentacao: "5 mg comprimido", posologia: "1 comprimido via oral 1 vez ao dia — uso contínuo" },
  { nome: "Hidroclorotiazida", apresentacao: "25 mg comprimido", posologia: "1 comprimido via oral 1 vez ao dia pela manhã — uso contínuo" },
  { nome: "Atenolol", apresentacao: "25 mg comprimido", posologia: "1 comprimido via oral 1 vez ao dia — uso contínuo" },
  { nome: "Metformina", apresentacao: "850 mg comprimido", posologia: "1 comprimido via oral de 12 em 12 horas após as refeições — uso contínuo" },
  { nome: "Glibenclamida", apresentacao: "5 mg comprimido", posologia: "1 comprimido via oral 1 vez ao dia antes do café — uso contínuo" },
  { nome: "Sinvastatina", apresentacao: "20 mg comprimido", posologia: "1 comprimido via oral à noite — uso contínuo" },
  { nome: "Ácido acetilsalicílico", apresentacao: "100 mg comprimido", posologia: "1 comprimido via oral 1 vez ao dia após o almoço — uso contínuo" },
  { nome: "Levotiroxina sódica", apresentacao: "50 mcg comprimido", posologia: "1 comprimido via oral em jejum, 30 min antes do café — uso contínuo" },
  { nome: "Sertralina", apresentacao: "50 mg comprimido", posologia: "1 comprimido via oral 1 vez ao dia pela manhã — uso contínuo" },
  { nome: "Fluoxetina", apresentacao: "20 mg cápsula", posologia: "1 cápsula via oral 1 vez ao dia pela manhã — uso contínuo" },
  { nome: "Clonazepam", apresentacao: "2 mg comprimido", posologia: "1 comprimido via oral à noite" },
  { nome: "Amitriptilina", apresentacao: "25 mg comprimido", posologia: "1 comprimido via oral à noite" },
  { nome: "Ciclobenzaprina", apresentacao: "5 mg comprimido", posologia: "1 comprimido via oral à noite por 7 dias" },
  { nome: "Diclofenaco sódico", apresentacao: "50 mg comprimido", posologia: "1 comprimido via oral de 8 em 8 horas por 5 dias após as refeições" },
  { nome: "Cetoprofeno", apresentacao: "100 mg comprimido", posologia: "1 comprimido via oral de 12 em 12 horas por 5 dias" },
  { nome: "Soro fisiológico 0,9%", apresentacao: "frasco nasal", posologia: "Lavagem nasal 3 a 4 vezes ao dia" },
  { nome: "Sulfato ferroso", apresentacao: "40 mg comprimido", posologia: "1 comprimido via oral 1 vez ao dia em jejum por 90 dias" },
  { nome: "Ácido fólico", apresentacao: "5 mg comprimido", posologia: "1 comprimido via oral 1 vez ao dia" },
  { nome: "Vitamina D (colecalciferol)", apresentacao: "7.000 UI", posologia: "1 cápsula via oral 1 vez por semana" },
  { nome: "Albendazol", apresentacao: "400 mg comprimido", posologia: "1 comprimido via oral dose única" },
  { nome: "Ivermectina", apresentacao: "6 mg comprimido", posologia: "1 comprimido via oral dose única conforme peso" },
  { nome: "Fluconazol", apresentacao: "150 mg cápsula", posologia: "1 cápsula via oral dose única" },
  { nome: "Nistatina", apresentacao: "creme vaginal", posologia: "1 aplicação à noite por 7 dias" },
];

/** Frases de posologia pré-configuradas — clique único no builder. */
export const POSOLOGIAS: string[] = [
  "1 comprimido via oral de 8 em 8 horas por 7 dias",
  "1 comprimido via oral de 12 em 12 horas por 7 dias",
  "1 comprimido via oral de 6 em 6 horas se dor ou febre",
  "1 comprimido via oral 1 vez ao dia — uso contínuo",
  "1 comprimido via oral 1 vez ao dia por 30 dias",
  "1 cápsula via oral em jejum 1 vez ao dia",
  "20 gotas via oral de 6 em 6 horas se dor",
  "1 aplicação tópica 2 vezes ao dia por 7 dias",
  "2 jatos inalatórios de 6 em 6 horas se falta de ar",
  "Dose única",
  "Uso contínuo",
];

export function buscarMedicamentos(q: string, limite = 30): Medicamento[] {
  const t = q.trim().toLowerCase();
  if (!t) return MEDICAMENTOS.slice(0, limite);
  const out = MEDICAMENTOS.filter(
    (m) => m.nome.toLowerCase().includes(t) || m.apresentacao.toLowerCase().includes(t),
  );
  return out.slice(0, limite);
}
