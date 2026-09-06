/**
 * OFERTA COMPLETA DE CONSULTA — Nina.
 *
 * Regra da casa: quando o paciente pede informação sobre uma consulta /
 * especialidade, ou demonstra intenção de agendar, a resposta deve reunir
 * em UMA mensagem organizada:
 *   valor + médicos + dias/horários de atendimento + unidade
 * e, quando o assunto for disponibilidade, também as datas e horários REAIS
 * devolvidos pela Agenda.
 *
 * Duas fontes que NUNCA se misturam:
 *   - Base de Conhecimentos (planilha): valor, médicos, dias, horário de
 *     atendimento, unidade, regras;
 *   - Agenda do sistema: datas/horários realmente disponíveis e a criação do
 *     agendamento.
 *
 * Módulo PURO: só detecta intenção, formata texto e monta prompt. Não lê
 * banco, não chama ferramenta e não cria fato.
 */
import type { EstadoFluxoNina } from "./fluxo-estado.server";

function norm(texto: string): string {
  return (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const PADROES_INFO_CONSULTA: RegExp[] = [
  /\b(informacao|informacoes|info|saber|sobre)\b/,
  /\b(quanto custa|valor|preco|precos|quanto e|quanto fica)\b/,
  /\b(consulta|especialidade|atendimento)\b/,
  /\b(atende|atendem|tem)\s+(medico|doutor|dr|dra)\b/,
];

const PADROES_DISPONIBILIDADE: RegExp[] = [
  /\b(hoje|amanha|essa semana|proxima semana|sabado|domingo|segunda|terca|quarta|quinta|sexta)\b/,
  /\b(disponivel|disponiveis|disponibilidade|vaga|vagas|horario|horarios|encaixe)\b/,
  /\b(tem\s+(algum|alguma|vaga|horario))\b/,
  /\b(quando|que dia|qual dia)\b/,
];

const PADROES_AGENDAR: RegExp[] = [
  /\b(agendar|agendamento|marcar|marca|remarcar|remarcacao)\b/,
];

const PERIODOS: Array<[RegExp, string]> = [
  [/\bmanha\b/, "manhã"],
  [/\btarde\b/, "tarde"],
  [/\bnoite\b/, "noite"],
];

const DIAS: Array<[RegExp, string]> = [
  [/\bsegunda\b/, "segunda-feira"],
  [/\bterca\b/, "terça-feira"],
  [/\bquarta\b/, "quarta-feira"],
  [/\bquinta\b/, "quinta-feira"],
  [/\bsexta\b/, "sexta-feira"],
  [/\bsabado\b/, "sábado"],
  [/\bdomingo\b/, "domingo"],
  [/\bhoje\b/, "hoje"],
  [/\bamanha\b/, "amanhã"],
];

export type LeituraOferta = {
  /** Paciente quer conhecer a consulta/especialidade (valor, médicos, dias). */
  pedeInfoConsulta: boolean;
  /** Paciente quer saber datas/horários realmente livres. */
  pedeDisponibilidade: boolean;
  /** Paciente pediu para marcar. */
  pedeAgendamento: boolean;
  /** Preferências ditas pelo paciente ("sábado de manhã"). */
  preferencias: string[];
};

export function lerPedidoOferta(mensagem: string): LeituraOferta {
  const t = norm(mensagem);
  const preferencias = [
    ...DIAS.filter(([r]) => r.test(t)).map(([, rotulo]) => rotulo),
    ...PERIODOS.filter(([r]) => r.test(t)).map(([, rotulo]) => rotulo),
  ];
  const pedeAgendamento = PADROES_AGENDAR.some((r) => r.test(t));
  const pedeDisponibilidade = PADROES_DISPONIBILIDADE.some((r) => r.test(t)) || pedeAgendamento;
  return {
    pedeInfoConsulta: PADROES_INFO_CONSULTA.some((r) => r.test(t)) || pedeDisponibilidade,
    pedeDisponibilidade,
    pedeAgendamento,
    preferencias,
  };
}

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

export type EntradaOferta = {
  mensagem: string;
  estado: EstadoFluxoNina;
  nomeUnidade: string;
  /** A clínica tem planilha ativa na Base de Conhecimentos? */
  baseAtiva: boolean;
};

export function blocoPromptOfertaCompleta({
  mensagem,
  estado,
  nomeUnidade,
  baseAtiva,
}: EntradaOferta): string {
  const leitura = lerPedidoOferta(mensagem);
  const a = estado.appointment;
  const assunto = a.procedure ?? a.specialty ?? null;

  const linhas: string[] = [
    "RESPOSTA COMPLETA SOBRE CONSULTA / ESPECIALIDADE:",
    "- Duas fontes, nunca misturadas: o CATÁLOGO publicado é a fonte oficial de valor, médicos, especialidades, escala, unidade e regras; a AGENDA é a única fonte de DATA e HORÁRIO realmente disponíveis. As regras de leitura do catálogo estão no bloco da base de conhecimentos — não as reinterprete aqui.",
    "- Escala do catálogo (ex.: 09h às 18h) não é vaga. Só chame um horário de \"disponível\" se ele veio agora de \"consultar_disponibilidade\".",
    "- É proibido estimar valor, preço médio, médico, dia ou vaga. Sem o dado na fonte oficial, diga que vai confirmar com a equipe.",
  ];

  if (!baseAtiva) {
    linhas.push(
      "- Esta clínica ainda não tem catálogo publicado: não afirme valores nem escalas; use apenas o que as ferramentas devolverem e siga o fluxo humano quando faltar informação.",
    );
  }


  if (leitura.pedeInfoConsulta && !leitura.pedeDisponibilidade) {
    linhas.push(
      `- O paciente pediu INFORMAÇÃO sobre ${assunto ?? "uma consulta/especialidade"}. Chame "consultar_base_conhecimento" e responda reunindo, quando existirem: valor da consulta, médicos, dias de atendimento, horários de atendimento e unidade. Mostre só o que a base realmente trouxe.`,
      '- Feche com uma frase curta oferecendo o próximo passo, por exemplo: "Se quiser, posso verificar as próximas datas e horários disponíveis. 😊"',
    );
  }

  if (leitura.pedeDisponibilidade) {
    linhas.push(
      `- O paciente quer DISPONIBILIDADE${assunto ? ` de ${assunto}` : ""}: use as DUAS fontes — "consultar_base_conhecimento" (valor, médicos, unidade) e "consultar_disponibilidade" (datas e horários reais).`,
      "- Organize assim: nome da consulta, valor (quando houver na base), médico, data, horários disponíveis e unidade. Com vários profissionais, agrupe POR MÉDICO.",
      `- Ofereça de 3 a 5 boas opções no total (até ${MAX_HORARIOS_POR_MEDICO} por médico), priorizando as próximas datas. Se houver mais, pergunte: "Quer que eu veja mais horários?"`,
      "- Termine perguntando qual médico, dia ou horário o paciente prefere.",
    );
  }

  if (leitura.preferencias.length > 0) {
    linhas.push(
      `- Preferência declarada pelo paciente: ${leitura.preferencias.join(", ")}. Priorize essas opções; só mostre alternativas fora da preferência se a agenda não tiver vaga nela, dizendo isso claramente.`,
    );
  }

  if (leitura.pedeAgendamento) {
    linhas.push(
      "- Intenção de AGENDAR: mantenha a regra atual de coletar os dados obrigatórios do paciente antes de seguir. Depois disso, consulte base + agenda e apresente valor, médico, data, horários e unidade.",
    );
  }

  linhas.push(
    "- REGRA DO VALOR: sempre que estiver mostrando consulta ou disponibilidade e existir valor cadastrado na base, o valor faz parte da resposta. Nunca entregue médico + horário sem o valor quando ele existir. Se não existir, apenas não fale de preço — jamais estime.",
    "- Apresentar médico, data e horário NÃO cria agendamento. Depois da escolha, mostre o resumo (paciente, consulta, valor quando houver, médico, data, horário, unidade) e pergunte \"Posso confirmar esse agendamento?\". Só execute a ferramenta após a confirmação.",
    `- Unidade de referência desta conversa: ${nomeUnidade}.`,
  );

  return linhas.join("\n");
}
