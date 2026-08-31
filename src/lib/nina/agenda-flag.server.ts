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
