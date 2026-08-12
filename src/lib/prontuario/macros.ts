/** Macros de texto clínico — preenchem campos do prontuário com 1 clique. */
export type Macro = { rotulo: string; campo: "exame_fisico" | "conduta" | "prescricao" | "historia_doenca" | "hipotese_diagnostica"; texto: string };

export const MACROS: Macro[] = [
  {
    rotulo: "Exame físico normal",
    campo: "exame_fisico",
    texto:
      "Bom estado geral, lúcido e orientado, corado, hidratado, anictérico, acianótico, afebril ao exame.\n" +
      "ACV: ritmo cardíaco regular em 2 tempos, bulhas normofonéticas, sem sopros.\n" +
      "AR: murmúrio vesicular presente bilateralmente, sem ruídos adventícios.\n" +
      "Abdome: plano, flácido, indolor à palpação, sem visceromegalias, ruídos hidroaéreos presentes.\n" +
      "MMII: sem edemas, panturrilhas livres.",
  },
  {
    rotulo: "Exame ORL normal",
    campo: "exame_fisico",
    texto: "Orofaringe sem hiperemia ou exsudato. Otoscopia com membranas timpânicas íntegras e translúcidas. Rinoscopia sem secreção purulenta. Linfonodos cervicais não palpáveis.",
  },
  {
    rotulo: "Atestado 1 dia",
    campo: "conduta",
    texto: "Atestado médico de 1 (um) dia de afastamento das atividades laborais a partir desta data.",
  },
  {
    rotulo: "Atestado 3 dias",
    campo: "conduta",
    texto: "Atestado médico de 3 (três) dias de afastamento das atividades laborais a partir desta data.",
  },
  {
    rotulo: "Retorno em 7 dias",
    campo: "conduta",
    texto: "Orientações gerais fornecidas. Retorno em 7 dias com exames ou antes se piora dos sintomas. Sinais de alarme explicados ao paciente.",
  },
  {
    rotulo: "Sintomáticos + hidratação",
    campo: "conduta",
    texto: "Repouso relativo, hidratação oral abundante e sintomáticos conforme prescrição. Retorno se febre persistente por mais de 72h.",
  },
  {
    rotulo: "Solicito exames de rotina",
    campo: "conduta",
    texto: "Solicito: hemograma completo, glicemia de jejum, ureia, creatinina, TGO, TGP, colesterol total e frações, triglicerídeos, TSH, EAS.",
  },
  {
    rotulo: "Receita padrão (dor/febre)",
    campo: "prescricao",
    texto:
      "1) Dipirona sódica — 500 mg comprimido .......... 20 comprimidos\n" +
      "   1 comprimido via oral de 6 em 6 horas se dor ou febre\n" +
      "2) Omeprazol — 20 mg cápsula .......... 14 cápsulas\n" +
      "   1 cápsula via oral 1 vez ao dia em jejum",
  },
  {
    rotulo: "HMA — quadro agudo",
    campo: "historia_doenca",
    texto: "Paciente refere início dos sintomas há ___ dias, de caráter progressivo, sem fatores de melhora identificados. Nega febre aferida, nega dispneia, nega vômitos. Sem uso de medicação prévia para o quadro.",
  },
];

export function macrosPorCampo(campo: Macro["campo"]): Macro[] {
  return MACROS.filter((m) => m.campo === campo);
}
