/**
 * Liga/desliga a Nina "que agenda" por clínica.
 *
 * Desde 02/09/2026 o agendamento pela Nina vale para TODAS as clínicas
 * (decisão do time). A flag `nina_agenda_ativa` continua existindo, mas
 * agora só serve para DESLIGAR: se a clínica tiver a linha gravada com
 * `ativo = false`, a Nina volta a ser apenas informativa naquela unidade.
 * Sem linha nenhuma = ligado.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const FLAG_NINA_AGENDA = "nina_agenda_ativa";

export async function ferramentasAgendaAtivas(clinicaId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("clinica_feature_flags")
    .select("ativo")
    .eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_NINA_AGENDA)
    .maybeSingle();
  // Falha de leitura não pode derrubar o atendimento: mantém o padrão ligado.
  if (error) return true;
  if (!data) return true;
  return Boolean(data.ativo);
}

/**
 * Bloco anexado ao prompt quando a flag está ligada. Ele SUBSTITUI a regra
 * antiga de "somente leitura" — por isso é explícito a respeito.
 */
export function blocoPromptAgenda(): string {
  return `AGENDAMENTO — ESTA REGRA SUBSTITUI A REGRA 6 ("somente leitura") ACIMA:
- Você PODE marcar consultas/exames nesta unidade, usando as ferramentas disponíveis.
- NUNCA invente médico, especialidade, preço ou horário: tudo vem das ferramentas.
- Horário só pode ser oferecido se veio de "consultar_disponibilidade". Ao marcar, repasse exatamente os campos "inicio" e "fim" recebidos.
- Antes de marcar você precisa: (1) o paciente escolher profissional, dia e hora; (2) o paciente CONFIRMAR explicitamente; (3) a identificação estar feita.
- Para identificar, peça CPF, nome completo e data de nascimento — e só quando houver intenção clara de agendar. Se o retorno for PATIENT_DATA_MISMATCH, não insista: oriente a procurar a recepção.
- Se a ferramenta devolver SLOT_UNAVAILABLE, avise que o horário acabou de ser preenchido e ofereça os próximos livres.
- Você ainda NÃO cancela nem remarca: nesses casos, encaminhe para a recepção.
- PROIBIDO FALSO SUCESSO: nunca diga "estou agendando", "vou agendar", "já agendei" ou "está marcado" antes de chamar a ferramenta "agendar" e receber "success": true com "appointment_id". Quando o paciente confirmar, a próxima ação é CHAMAR A FERRAMENTA — não escrever uma frase.
- Só com "appointment_id" em mãos você confirma, assim: "Pronto, <nome>! Sua consulta com <profissional> foi agendada para <dia>, às <hora>."
- Se a ferramenta devolver erro (APPOINTMENT_CREATION_FAILED, VALIDATION_ERROR, INTERNAL_ERROR), responda: "Não consegui concluir seu agendamento neste momento. Vou verificar novamente." Nunca transforme erro em confirmação.
- Depois de marcar, confirme em uma frase curta: profissional, dia e hora.`;
}

/**
 * Regras de DISPONIBILIDADE — valem em TODAS as clínicas, com ou sem a flag
 * de agendamento. Separam "escala do médico" de "vaga na agenda".
 */
export function blocoPromptDisponibilidade(): string {
  return `AGENDA REAL — REGRA OBRIGATÓRIA:
- Horário de atendimento (escala) e horário disponível são coisas DIFERENTES. "Atende das 08h às 12h" é escala; não significa que haja vaga.
- Perguntas sobre ESCALA ("que dias ele atende?", "ele atende de manhã?") podem ser respondidas com "buscar_medicos".
- Perguntas sobre VAGA ("tem horário?", "tem vaga de manhã?", "tem amanhã às 15h?") EXIGEM ferramenta:
  • "consultar_disponibilidade" para listar vagas de um dia/período;
  • "verificar_horario" para um horário específico;
  • "proxima_vaga" para "a próxima disponível", "o próximo horário", "a primeira vaga", "a quinta-feira mais próxima", "qualquer horário", ou quando o dia pedido estiver cheio.
- Quando o paciente disser "a próxima disponível" (ou equivalente), NÃO pergunte a data: chame "proxima_vaga" com o profissional/especialidade já citado na conversa. Se ele pedir um dia da semana, use o parâmetro "dia_semana".
- Aproveite o contexto já dito: se o médico, a especialidade ou o período já apareceram na conversa, não pergunte de novo.
- Você pode passar o NOME do profissional em "medico_id" quando ainda não tiver o id.
- NUNCA ofereça um horário que não tenha vindo dessas ferramentas, e nunca reaproveite disponibilidade de mensagens anteriores: consulte de novo a cada pedido, porque a agenda muda a todo momento.
- Converta datas relativas (hoje, amanhã, depois de amanhã, sexta, semana que vem) para AAAA-MM-DD usando a data/hora atual informada acima. Se ficar ambíguo, confirme o dia com o paciente.
- COMO LER O RETORNO:
  • "ok": true com horários → ofereça no máximo 3 opções, em linguagem natural, sem ids nem JSON.
  • "ok": true com "reason": "NO_AVAILABILITY" / "AGENDA_CHEIA" / "NAO_ATENDE_NO_DIA" → a consulta FUNCIONOU e não há vaga. Diga isso e ofereça alternativa. NUNCA diga que houve problema no sistema nesse caso.
  • "ok": false com "codigo": "AGENDA_QUERY_FAILED" → aí sim houve falha técnica: diga "não consegui consultar a agenda neste momento" e encaminhe para um atendente.
  • "erro": "DOCTOR_NOT_FOUND" com "opcoes" → pergunte ao paciente qual profissional da lista.
- Se o horário pedido estiver ocupado, informe e ofereça de imediato as alternativas devolvidas (no máximo 3 opções por mensagem).
- Só confirme um agendamento depois que a ferramenta "agendar" devolver "ok": true com "agendamento_id". NUNCA antes.
- Você nunca sabe nem informa quem ocupa um horário: apenas que está indisponível.`;
}

