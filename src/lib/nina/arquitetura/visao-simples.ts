/**
 * Visão simples "Como a Nina atende" (parte pura).
 *
 * Resumo em linguagem do dia a dia para quem não é técnico. Cada etapa e cada
 * saída aponta para as caixas do mapa técnico (`manifesto.ts`) que ela resume:
 * o teste `visao-simples.test.ts` garante que toda caixa do atendimento real
 * aparece em algum ponto do resumo, para os dois não se desencontrarem.
 */

export type EtapaVisaoSimples = {
  id: string;
  titulo: string;
  resumo: string;
  /** "paciente" = o que o paciente faz ou recebe; "nina" = o caminho da Nina. */
  tipo: "paciente" | "nina";
  explicacao: string[];
  /** IDs do manifesto resumidos por esta etapa. */
  componentes: string[];
};

export type SaidaVisaoSimples = {
  id: string;
  titulo: string;
  resumo: string;
  /** Etapa depois da qual o atendimento pode sair da Nina por aqui. */
  depoisDe: string;
  explicacao: string[];
  componentes: string[];
};

export const ETAPAS_VISAO_SIMPLES: EtapaVisaoSimples[] = [
  {
    id: "mensagem",
    titulo: "Paciente manda mensagem",
    resumo: "Texto ou áudio",
    tipo: "paciente",
    explicacao: [
      "A mensagem chega pelo WhatsApp da clínica e fica gravada na conversa.",
      "Áudio é transcrito para texto antes de seguir. Se a transcrição falhar, o paciente recebe a mensagem automática de áudio com falha.",
      "Se a mesma mensagem chegar duas vezes, a repetida é ignorada.",
    ],
    componentes: [
      "message.inbound",
      "message.log_raw",
      "message.validate",
      "audio.transcribe",
      "message.deduplicate",
    ],
  },
  {
    id: "conferencia",
    titulo: "Sistema confere antes",
    resumo: "Precisa mesmo da Nina?",
    tipo: "nina",
    explicacao: [
      "Resposta a lembrete de consulta: o sistema atualiza a agenda e responde sozinho.",
      "Código de verificação do site: o sistema responde sozinho.",
      "Conversa encerrada volta a abrir quando o paciente escreve de novo.",
      "Se a conversa já está com um atendente, ou se a Nina foi desligada na clínica, a Nina não responde.",
    ],
    componentes: ["reminder.reply", "verification.code", "conversation.reopen", "routing.decide"],
  },
  {
    id: "espera",
    titulo: "Espera terminar de escrever",
    resumo: "Junta mensagens seguidas",
    tipo: "nina",
    explicacao: [
      "A Nina espera até 2,5 segundos para juntar mensagens mandadas em sequência e responder tudo de uma vez.",
      "Enquanto ela responde, a conversa fica reservada, para não sair resposta dupla.",
      "Se o paciente escreve de novo no meio, a resposta antiga é descartada e vale a mais nova.",
    ],
    componentes: ["turn.batch", "turn.stale"],
  },
  {
    id: "preparo",
    titulo: "Reúne o que precisa saber",
    resumo: "Instruções, histórico e paciente",
    tipo: "nina",
    explicacao: [
      "Reconhece o paciente quando a conversa já está ligada a um cadastro. Não há busca de paciente pelo telefone; o número do WhatsApp fica guardado para o cadastro.",
      "Lê as instruções publicadas pela clínica aqui na Arquitetura, as mensagens automáticas e os aprendizados aprovados pela equipe.",
      "Usa só o trecho recente da conversa e o ponto em que o atendimento parou. Nunca manda a agenda inteira nem o cadastro completo para o modelo.",
    ],
    componentes: [
      "conversation.ensure",
      "session.resolve",
      "flow.state",
      "context.load",
      "instructions.published",
      "instructions.learnings",
      "instructions.catalog",
      "instructions.phases",
      "instructions.greeting",
      "prompt.compose",
      "response.templates",
    ],
  },
  {
    id: "consulta",
    titulo: "Consulta o sistema",
    resumo: "Médicos, preços e vagas",
    tipo: "nina",
    explicacao: [
      "O modelo de IA (Gemini 3.8, o mesmo para todas as clínicas) lê a mensagem e decide o que precisa consultar.",
      "Quando ligado na clínica, um segundo modelo (Jev) confere o que o paciente pediu, levando em conta as opções já oferecidas a ele.",
      "Consulta o catálogo publicado (médicos, exames, preços e regras), a agenda (vagas reais) e o horário de funcionamento.",
      "Pode consultar várias vezes antes de responder. Cada consulta aparece em Detalhes técnicos da mensagem.",
    ],
    componentes: [
      "jev.filtro",
      "llm.model_flag",
      "llm.generate",
      "tool.execute",
      "tool.catalog.lookup",
      "tool.catalog.list",
      "tool.knowledge.lookup",
      "tool.business_hours",
      "tool.schedule.availability",
      "tool.doctor_schedule",
    ],
  },
  {
    id: "acao",
    titulo: "Age quando precisa",
    resumo: "Identifica, reserva, marca consulta",
    tipo: "nina",
    explicacao: [
      "Identifica ou cadastra o paciente pelo número do WhatsApp, nome completo e data de nascimento (sem CPF) e liga o cadastro à conversa.",
      "Só marca a consulta depois de identificar o paciente e de ele aceitar o resumo com o horário escolhido.",
      "Se a Nina disser que agendou sem a consulta estar gravada, o sistema corrige a resposta antes de enviar.",
      "O agendamento pela Nina vem ligado e pode ser desligado por clínica.",
    ],
    componentes: [
      "tool.patient.lookup",
      "patient.link",
      "identity.gate",
      "tool.schedule.select",
      "tool.schedule.book",
      "tool.my_appointments",
      "response.guard",
    ],
  },
  {
    id: "resposta",
    titulo: "Responde ao paciente",
    resumo: "Texto ou áudio, tudo registrado",
    tipo: "paciente",
    explicacao: [
      "A resposta recebe o acabamento final e sai pelo WhatsApp.",
      "Se o paciente mandou áudio, a Nina responde em áudio; resposta longa vai também por escrito. Se o áudio falhar, vai em texto.",
      "Com o encerramento automático ligado na clínica, a Nina pode encerrar a conversa depois de confirmar o envio.",
      "Tudo fica registrado e pode ser conferido em Detalhes técnicos da mensagem.",
    ],
    componentes: [
      "response.finalize",
      "response.validate",
      "message.outbound",
      "audio.fallback",
      "message.persist",
      "status.update",
      "conversation.close",
      "metrics.record",
      "evidence.record",
      "trace.record",
      "metrics.period",
      "data.retention",
    ],
  },
];

export const SAIDAS_VISAO_SIMPLES: SaidaVisaoSimples[] = [
  {
    id: "sem-nina",
    titulo: "Segue sem a Nina",
    resumo: "Lembrete, código ou atendente",
    depoisDe: "conferencia",
    explicacao: [
      "Lembrete de consulta e código do site recebem resposta automática, sem passar pela Nina.",
      "Conversa que já é da equipe fica com a equipe. Sem responsável, vai na hora para o atendente online com menos conversas; sem ninguém online, fica em Não atribuídas.",
    ],
    componentes: ["reminder.reply", "verification.code", "routing.decide", "handoff.assign"],
  },
  {
    id: "equipe",
    titulo: "Vai para a equipe",
    resumo: "Pedido, regra ou falha",
    depoisDe: "acao",
    explicacao: [
      "Quando o paciente pede uma pessoa, quando uma regra da clínica manda encaminhar, quando não há vaga ou quando o pedido continua sem entendimento mesmo depois de duas perguntas de esclarecimento, a conversa passa para a equipe.",
      "O paciente recebe uma única mensagem de transferência, com o número do protocolo.",
      "Se algo falhar ou travar, o vigia do atendimento tenta retomar. Sem sucesso, avisa o paciente com a frase padrão de encaminhamento e coloca a conversa na fila.",
      "Quem assume recebe um resumo do que já foi conversado. Na homologação a transferência é simulada: a mensagem leva o aviso de simulação e nenhuma atendente real é acionada.",
    ],
    componentes: [
      "tool.handoff",
      "handoff.queue",
      "handoff.summary",
      "handoff.assign",
      "protocol.generate",
      "error.handle",
      "turn.watchdog",
    ],
  },
  {
    id: "espera-30",
    titulo: "30 min sem resposta",
    resumo: "Equipe assume a conversa",
    depoisDe: "resposta",
    explicacao: [
      "Depois de cada mensagem da Nina, o sistema espera 30 minutos pelo retorno do paciente enquanto a conversa estiver só com ela.",
      "Sem retorno, a conversa vai para a equipe. Se uma consulta já foi marcada e confirmada nessa conversa, a espera é dispensada.",
    ],
    componentes: ["wait.start", "wait.timeout_job", "wait.timeout"],
  },
];

/** Aviso sobre a homologação, exibido abaixo do resumo. */
export const NOTA_HOMOLOGACAO_VISAO_SIMPLES =
  "Na homologação o caminho é o mesmo, mas a resposta aparece só na conversa de teste e nenhum atendente real é acionado. A agenda e o cadastro consultados são os reais.";
