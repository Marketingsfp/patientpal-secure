/**
 * Leitura dos eventos da sessão GPT-Live (canal de dados do WebRTC) e montagem
 * dos eventos enviados de volta. Módulo puro, sem navegador: a tela usa o
 * redutor e os testes cobrem os formatos.
 *
 * Nomes de eventos conforme a documentação do GPT-Live (OpenAI): transcrições
 * em `session.input_transcript.delta` / `session.output_transcript.delta`;
 * chamadas de ferramenta da delegação "responses" chegam como
 * `response.output_item.done` aninhado em `response.event`.
 */

export const CANAL_EVENTOS_LIVE = "oai-events";

export type QuemFala = "paciente" | "nina";
export type Fala = { id: number; quem: QuemFala; texto: string };
export type StatusLigacao = "parada" | "conectando" | "em_andamento" | "encerrando" | "encerrada";

export type EstadoLigacao = {
  status: StatusLigacao;
  falas: Fala[];
  segundos: number;
  erro: string | null;
  motivoFim: string | null;
};

export type ChamadaFerramenta = { callId: string; nome: string; argumentos: string };

export const ESTADO_INICIAL_LIGACAO: EstadoLigacao = {
  status: "parada",
  falas: [],
  segundos: 0,
  erro: null,
  motivoFim: null,
};

type Evento = { type?: unknown; [k: string]: unknown };

function obj(v: unknown): Evento | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Evento) : null;
}

/** Acrescenta o trecho à fala atual da mesma pessoa ou abre uma nova fala. */
function acrescentar(falas: Fala[], quem: QuemFala, delta: string): Fala[] {
  if (!delta) return falas;
  const ultima = falas[falas.length - 1];
  if (ultima && ultima.quem === quem)
    return [...falas.slice(0, -1), { ...ultima, texto: ultima.texto + delta }];
  return [...falas, { id: (ultima?.id ?? 0) + 1, quem, texto: delta.trimStart() }];
}

/** Chamada de ferramenta concluída, direta ou dentro de `response.event`. */
export function chamadaDoEvento(evento: unknown): ChamadaFerramenta | null {
  let e = obj(evento);
  if (e?.type === "response.event") e = obj(e.event) ?? obj(e.data) ?? obj(e.response_event);
  if (!e || e.type !== "response.output_item.done") return null;
  const item = obj(e.item);
  if (!item || item.type !== "function_call") return null;
  const callId = typeof item.call_id === "string" ? item.call_id : null;
  const nome = typeof item.name === "string" ? item.name : null;
  if (!callId || !nome) return null;
  return { callId, nome, argumentos: typeof item.arguments === "string" ? item.arguments : "" };
}

export function aplicarEventoLigacao(estado: EstadoLigacao, evento: unknown): EstadoLigacao {
  const e = obj(evento);
  if (!e) return estado;
  switch (e.type) {
    case "session.started":
      return { ...estado, status: "em_andamento", erro: null };
    case "session.input_transcript.delta":
      return { ...estado, falas: acrescentar(estado.falas, "paciente", String(e.delta ?? "")) };
    case "session.output_transcript.delta":
      return { ...estado, falas: acrescentar(estado.falas, "nina", String(e.delta ?? "")) };
    case "session.usage.updated": {
      const segundos = Number(obj(e.usage)?.seconds);
      return Number.isFinite(segundos) ? { ...estado, segundos } : estado;
    }
    case "session.closed": {
      const segundos = Number(obj(e.usage)?.seconds);
      return {
        ...estado,
        status: "encerrada",
        motivoFim: typeof e.reason === "string" ? e.reason : null,
        segundos: Number.isFinite(segundos) ? segundos : estado.segundos,
      };
    }
    case "error": {
      // Mensagem técnica fica no console; a tela mostra um texto genérico.
      const codigo = obj(e.error)?.code;
      return {
        ...estado,
        erro: `Erro na ligação${typeof codigo === "string" ? ` (${codigo})` : ""}.`,
      };
    }
    default:
      return estado;
  }
}

let sequencia = 0;
function idEvento(prefixo: string) {
  sequencia += 1;
  return `${prefixo}_${Date.now().toString(36)}_${sequencia}`;
}

/** Devolve o resultado da ferramenta e pede para o modelo de apoio continuar. */
export function eventosResultadoFerramenta(callId: string, saida: string): Evento[] {
  return [
    {
      type: "response.item.create",
      event_id: idEvento("resultado"),
      item: { type: "function_call_output", call_id: callId, output: saida },
    },
    { type: "response.create", event_id: idEvento("continuar") },
  ];
}

export function eventoEncerrar(): Evento {
  return { type: "session.close", event_id: idEvento("encerrar") };
}

/** Nome de cada ferramenta como aparece nos bastidores da tela. */
export const ROTULOS_FERRAMENTAS: Record<string, string> = {
  consultar_cadastro: "Consultou o catálogo publicado",
  listar_especialidades: "Listou especialidades",
  buscar_medicos: "Buscou profissionais",
  buscar_procedimentos: "Buscou procedimentos",
  dados_da_clinica: "Consultou dados da clínica",
  horario_funcionamento: "Consultou horário de funcionamento",
  consultar_disponibilidade: "Consultou vagas",
  verificar_horario: "Verificou um horário",
  consultar_primeiro_disponivel: "Consultou o primeiro horário",
  proxima_vaga: "Consultou a próxima vaga",
  selecionar_horario: "Selecionou o horário (simulado)",
  consultar_cadastro_paciente: "Consultou cadastro do paciente (simulado)",
  identificar_paciente: "Identificou o paciente (simulado)",
  meus_agendamentos: "Consultou agendamentos (simulado)",
  agendar: "Agendou (simulado)",
  solicitar_atendente_humano: "Encaminhou para a equipe (simulado)",
  solicitar_nome_atendimento: "Pediu o nome do atendimento",
};
