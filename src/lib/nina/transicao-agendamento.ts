import type { IntencaoNina } from "./atendimento-fase1";

/**
 * Agendamento pela Nina controlado por item do catalogo (regras de 11 e 12/10/2026).
 * Trocar para false devolve o controle apenas para a flag por clinica.
 */
export const TRANSICAO_AGENDAMENTO_ATIVA = true;

export function temIntencaoDeAgendar(intencoes: readonly IntencaoNina[]): boolean {
  return intencoes.some((intencao) => ["agendamento", "disponibilidade"].includes(intencao));
}

export const REGRA_TRANSICAO_AGENDAMENTO = `INFORMAR ANTES DE ENCAMINHAR — REGRA INEGOCIAVEL (agendamento pela equipe):
- A Nina nao consulta vagas, nao escolhe horario individual, nao coleta cadastro para reserva e nao cria, confirma, remarca ou cancela agendamentos. Horario habitual nao e vaga disponivel.
- Quando o paciente quiser marcar, primeiro tire as duvidas e passe as informacoes do atendimento pedido, conforme o cadastro publicado: profissionais, dias e horarios habituais, modalidade, horario de funcionamento da clinica e valores.
- Nao chame solicitar_atendente_humano por motivo de agendamento e nao diga que ja encaminhou: o sistema pergunta ao paciente se pode encaminhar e faz o encaminhamento, setor Agendamento, motivo AGENDAMENTO_TRANSICAO, quando ele confirmar.
- Se a modalidade salva for chegada_sem_pre_agendamento, nao encaminhe: diga que nao precisa agendar, basta comparecer a clinica nos horarios informados, e que o atendimento segue a ordem de chegada.
- Pergunta apenas informativa recebe a informacao pedida.
- Se ainda nao souber qual consulta, exame ou procedimento o paciente deseja, esclareca somente o nome do atendimento antes de consultar o cadastro.`;

/**
 * Regra de 12/10/2026: com algum item marcado com "Nina pode agendar", a Nina
 * agenda somente esses itens. O executor das ferramentas confere o cadastro e
 * recusa o restante (AGENDAMENTO_NAO_PERMITIDO); a Nina informa e o sistema
 * pergunta ao paciente se pode encaminhar.
 */
export const REGRA_AGENDAMENTO_POR_ITEM = `AGENDAMENTO POR ITEM DO CATALOGO — REGRA INEGOCIAVEL:
- Agende somente o atendimento cujo cadastro publicado traga nina_pode_agendar = true e modalidade hora_marcada, chegada_com_pre_agendamento ou ficha. Nesses casos: passe as informacoes do atendimento, verifique a disponibilidade, peca os dados e agende.
- Com nina_pode_agendar = false ou ausente, ou modalidade nao informada: nao consulte vagas, nao escolha horario e nao colete cadastro. Primeiro tire as duvidas com o cadastro (profissionais, horarios habituais, modalidade, funcionamento da clinica e valores). Nao chame solicitar_atendente_humano por motivo de agendamento: o sistema pergunta ao paciente se pode encaminhar e encaminha, setor Agendamento, motivo AGENDAMENTO_TRANSICAO, quando ele confirmar.
- Se a modalidade salva for chegada_sem_pre_agendamento, nao agende nem encaminhe: diga que nao precisa agendar, basta comparecer nos horarios informados, e que o atendimento segue a ordem de chegada.
- Pergunta apenas informativa recebe a informacao pedida e nao deve ser encaminhada por isso.
- Se ainda nao souber qual consulta, exame ou procedimento o paciente deseja, esclareca somente o nome do atendimento antes de consultar o cadastro.
- Se a ferramenta recusar com AGENDAMENTO_NAO_PERMITIDO, nao tente outra ferramenta de agenda: responda com as informacoes do cadastro.
- Para atendimentos que a Nina nao pode agendar, ESCOLHA_ANTES_DOS_DETALHES, PRIMEIRO HORARIO e o cadastro para reserva nao se aplicam: apresente as informacoes e nao termine perguntando por primeiro horario, profissional ou agendamento; o sistema faz a pergunta de encaminhamento.`;
