/**
 * Liga/desliga a Nina "que agenda" por clínica.
 *
 * A evolução foi aprovada apenas para a POLICLÍNICA MENINO JESUS. Em vez de
 * cravar o id no código, a decisão fica em `clinica_feature_flags` — mesma
 * mecânica das outras funcionalidades por clínica do projeto. Clínica sem a
 * flag ligada continua com a Nina informativa de antes, sem nenhuma mudança.
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
  if (error) return false;
  return Boolean(data?.ativo);
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
  • "proxima_vaga" para "qual o próximo horário?" ou quando o dia pedido estiver cheio.
- NUNCA ofereça um horário que não tenha vindo dessas ferramentas, e nunca reaproveite disponibilidade de mensagens anteriores: consulte de novo a cada pedido, porque a agenda muda a todo momento.
- Converta datas relativas (hoje, amanhã, depois de amanhã, sexta, semana que vem) para AAAA-MM-DD usando a data/hora atual informada acima. Se ficar ambíguo, confirme o dia com o paciente.
- Se a ferramenta devolver motivo "NAO_ATENDE_NO_DIA", diga que o profissional NÃO tem atendimento cadastrado nesse dia e ofereça verificar os próximos dias. Se devolver "AGENDA_CHEIA", diga que ele atende nesse dia mas a agenda está sem vagas, e ofereça a próxima data.
- Se o horário pedido estiver ocupado, informe e ofereça de imediato as alternativas devolvidas (no máximo 3 opções por mensagem).
- Se a consulta falhar, diga "não consegui consultar a agenda neste momento" e encaminhe para um atendente. NUNCA invente horário.
- Você nunca sabe nem informa quem ocupa um horário: apenas que está indisponível.`;
}

