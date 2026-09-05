/**
 * FASE 4 — TOOL BROKER DA NINA (parte pura, testável).
 *
 * Camada central entre o modelo e as ferramentas REAIS que já existem.
 * O Gemini decide "preciso consultar a agenda"; quem consulta é a tool.
 * O Gemini pede "createAppointment"; quem valida e grava é o backend.
 *
 * Aqui ficam apenas: catálogo de capacidades, divisão de fontes, chave de
 * idempotência e validação do resultado. Nada de acesso a banco.
 */

/** De onde o fato vem — a arquitetura da Fase 3/4 não mistura fontes. */
export type FonteDado =
  | "base_conhecimento" // planilha oficial: informações da clínica
  | "agenda" // disponibilidade atual e agendamento confirmado
  | "crm" // dados atuais do paciente
  | "atendimento"; // handoff/fila humana

export type Capacidade =
  | "searchKnowledgeBase"
  | "getPatient"
  | "checkAvailability"
  | "createAppointment"
  | "listCatalog"
  | "requestHumanHandoff";

export type DescritorFerramenta = {
  capacidade: Capacidade;
  fonte: FonteDado;
  /** Grava algo no sistema (exige confirmação, idempotência e verificação). */
  escrita: boolean;
};

/** Somente ferramentas que EXISTEM de fato no backend da Nina. */
export const CATALOGO_FERRAMENTAS: Record<string, DescritorFerramenta> = {
  consultar_base_conhecimento: {
    capacidade: "searchKnowledgeBase",
    fonte: "base_conhecimento",
    escrita: false,
  },
  listar_especialidades: { capacidade: "listCatalog", fonte: "base_conhecimento", escrita: false },
  buscar_medicos: { capacidade: "listCatalog", fonte: "base_conhecimento", escrita: false },
  buscar_procedimentos: { capacidade: "listCatalog", fonte: "base_conhecimento", escrita: false },
  dados_da_clinica: { capacidade: "listCatalog", fonte: "base_conhecimento", escrita: false },
  consultar_disponibilidade: { capacidade: "checkAvailability", fonte: "agenda", escrita: false },
  verificar_horario: { capacidade: "checkAvailability", fonte: "agenda", escrita: false },
  proxima_vaga: { capacidade: "checkAvailability", fonte: "agenda", escrita: false },
  identificar_paciente: { capacidade: "getPatient", fonte: "crm", escrita: true },
  meus_agendamentos: { capacidade: "getPatient", fonte: "crm", escrita: false },
  agendar: { capacidade: "createAppointment", fonte: "agenda", escrita: true },
  solicitar_atendente_humano: {
    capacidade: "requestHumanHandoff",
    fonte: "atendimento",
    escrita: true,
  },
};

export function descreverFerramenta(nome: string): DescritorFerramenta | null {
  return CATALOGO_FERRAMENTAS[nome] ?? null;
}

/** Chave de idempotência do turno: mesma ferramenta + mesmos argumentos. */
export function chaveIdempotencia(nome: string, args: unknown): string {
  let normalizado = "";
  try {
    const obj = typeof args === "string" ? JSON.parse(args || "{}") : (args ?? {});
    normalizado = JSON.stringify(obj, Object.keys(obj as object).sort());
  } catch {
    normalizado = String(args ?? "");
  }
  return `${nome}|${normalizado}`;
}

export type ResultadoBroker = {
  ferramenta: string;
  capacidade: Capacidade | null;
  fonte: FonteDado | null;
  /** Verdadeiro só quando o backend confirmou a operação. */
  success: boolean;
  /** Agendamento realmente gravado e verificado no banco. */
  appointment_confirmed: boolean;
  /** Resposta veio de cache do turno (retry) em vez de nova execução. */
  reused: boolean;
  erro?: string;
  dados: unknown;
};

/**
 * Validação central: nunca deixa passar "sucesso" que o backend não deu.
 * Para `agendar`, sucesso exige `appointment_id` (ou duplicado idempotente).
 */
export function validarResultado(nome: string, resultado: unknown): ResultadoBroker {
  const d = descreverFerramenta(nome);
  const r = (resultado ?? {}) as Record<string, unknown>;
  const ok = r["ok"] === true;
  const erro = typeof r["erro"] === "string" ? (r["erro"] as string) : undefined;

  let success = ok && !erro;
  let confirmado = false;

  if (d?.capacidade === "createAppointment") {
    confirmado = ok && Boolean(r["appointment_id"] || r["duplicado"]);
    success = confirmado;
  }

  const base: ResultadoBroker = {
    ferramenta: nome,
    capacidade: d?.capacidade ?? null,
    fonte: d?.fonte ?? null,
    success,
    appointment_confirmed: confirmado,
    reused: false,
    dados: resultado ?? null,
  };
  return erro ? { ...base, erro } : base;
}

/** Payload devolvido ao modelo: o modelo nunca vê "success" inventado. */
export function respostaParaModelo(r: ResultadoBroker): Record<string, unknown> {
  const dados = (r.dados ?? {}) as Record<string, unknown>;
  return {
    ...dados,
    success: r.success,
    source: r.fonte,
    ...(r.capacidade === "createAppointment"
      ? {
          appointment_confirmed: r.appointment_confirmed,
          ...(r.appointment_confirmed
            ? {}
            : {
                instrucao:
                  "O agendamento NÃO foi gravado. É proibido dizer ao paciente que está agendado, marcado ou confirmado.",
              }),
        }
      : {}),
  };
}
