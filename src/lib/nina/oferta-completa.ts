/**
 * OFERTA COMPLETA DE CONSULTA — Nina.
 *
 * Organiza a oferta em UMA mensagem: valor + médicos + horários REAIS
 * devolvidos pela Agenda, agrupados por profissional, e o resumo com valor.
 *
 * Módulo PURO: só formata texto. Não lê banco, não chama ferramenta e não
 * cria fato.
 */

/** Quantas opções de horário mostrar por vez (regra 8). */
export const MAX_HORARIOS_POR_MEDICO = 3;
export const MAX_HORARIOS_TOTAL = 5;

export type SlotOferta = {
  medico: string;
  data: string;
  hora: string;
};

export type OfertaMontada = {
  linhas: string[];
  temMaisHorarios: boolean;
};

/**
 * Agrupa os horários REAIS da agenda por profissional, respeitando o limite
 * de opções. Só entra aqui o que a Agenda devolveu — nada é inventado.
 */
export function montarOferta(entrada: {
  titulo: string;
  valor?: string | null;
  unidade?: string | null;
  slots: readonly SlotOferta[];
}): OfertaMontada {
  const linhas: string[] = [entrada.titulo];
  if (entrada.valor) linhas.push(`Valor: ${entrada.valor}`);

  const porMedico = new Map<string, SlotOferta[]>();
  for (const s of entrada.slots) {
    porMedico.set(s.medico, [...(porMedico.get(s.medico) ?? []), s]);
  }

  let usados = 0;
  let sobrou = false;
  for (const [medico, slots] of porMedico) {
    const restante = MAX_HORARIOS_TOTAL - usados;
    if (restante <= 0) {
      sobrou = true;
      break;
    }
    const mostrar = slots.slice(0, Math.min(MAX_HORARIOS_POR_MEDICO, restante));
    if (mostrar.length < slots.length) sobrou = true;
    usados += mostrar.length;
    linhas.push(medico);
    const porData = new Map<string, string[]>();
    for (const s of mostrar) porData.set(s.data, [...(porData.get(s.data) ?? []), s.hora]);
    for (const [data, horas] of porData) linhas.push(`${data}: ${horas.join(", ")}`);
  }

  if (entrada.unidade) linhas.push(`Unidade: ${entrada.unidade}`);
  return { linhas, temMaisHorarios: sobrou };
}

/** Resumo final antes de confirmar — com valor quando existir (regra 16). */
export function textoResumoComValor(entrada: {
  paciente: string;
  atendimento: string;
  valor?: string | null;
  medico: string;
  data: string;
  hora: string;
  unidade: string;
}): string {
  const linhas = [
    `Paciente: ${entrada.paciente}`,
    `Consulta: ${entrada.atendimento}`,
    ...(entrada.valor ? [`Valor: ${entrada.valor}`] : []),
    `Médico: ${entrada.medico}`,
    `Data: ${entrada.data}`,
    `Horário: ${entrada.hora}`,
    `Unidade: ${entrada.unidade}`,
  ];
  return linhas.join("\n");
}
