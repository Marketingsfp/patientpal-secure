/**
 * FASE 1 — FIXTURES DE FATOS CONCRETOS (clínica fictícia, dados de teste).
 *
 * A verdade destes cenários vem DAQUI, nunca do próprio avaliador. Cada teste
 * de regressão compara a saída do motor contra o fato declarado nesta fixture.
 *
 * Nada aqui toca banco, provedor, WhatsApp ou clínica real: os identificadores
 * usam o prefixo `fict-` e o telefone é de faixa reservada para documentação.
 */
import type { EstadoDoTurno } from "../runtime";
import type { ContextoConfianca, FonteRecuperada } from "../types";

export const CLINICA_FICTICIA = {
  id: "fict-clinica-0001",
  nome: "Clínica Fictícia Aurora",
  unidade: {
    id: "fict-unidade-centro",
    nome: "Unidade Centro",
    endereco: "Rua Fictícia das Acácias, 100 — Centro",
  },
  telefonePaciente: "+5500900000001",
} as const;

/** Catálogo PUBLICADO — única fonte oficial de preço, preparo e regra. */
export const CATALOGO_PUBLICADO = {
  ultrassomAbdomeTotal: {
    referencia: "fict-proc-usg-abdome",
    nome: "Ultrassom de abdome total",
    precoParticular: 250.0,
    preparo: "Jejum de 6 horas",
    vigenteAte: "2027-12-31",
  },
  ressonanciaMagnetica: {
    referencia: "fict-proc-rm",
    /** A clínica NÃO realiza este exame — a negativa é um fato do catálogo. */
    realizadoPelaClinica: false,
  },
  convenioBoaSaude: {
    referencia: "fict-conv-boa-saude",
    nome: "Boa Saúde",
    cobreUltrassomAbdome: true,
    exigeGuiaAutorizada: true,
  },
} as const;

/** Escala do profissional — quando ele ATENDE (não é o mesmo que ter vaga). */
export const PROFISSIONAL = {
  referencia: "fict-medico-0001",
  nome: "Dra. Fictícia Nogueira",
  especialidade: "Radiologia",
  escala: [{ diaSemana: 1, inicio: "08:00", fim: "12:00" }],
} as const;

/** Vagas REAIS na agenda para a data usada nos cenários. */
export const VAGAS = {
  /** Segunda-feira em que a profissional atende, porém sem vaga livre. */
  segundaSemVaga: { data: "2027-03-01", slots: [] as Array<{ inicio: string; fim: string }> },
  segundaComVaga: {
    data: "2027-03-08",
    slots: [{ inicio: "2027-03-08T08:00:00-03:00", fim: "2027-03-08T08:30:00-03:00" }],
  },
} as const;

/** Agendamento criado em turno ANTERIOR (reserva já existente na conversa). */
export const RESERVA_ANTERIOR = {
  appointmentId: "fict-agend-0001",
  inicio: "2027-03-08T08:00:00-03:00",
  fim: "2027-03-08T08:30:00-03:00",
} as const;

export const FONTE_CATALOGO_COM_CONTEUDO: FonteRecuperada = {
  tipo: "catalogo_publicado",
  referencia: CATALOGO_PUBLICADO.ultrassomAbdomeTotal.referencia,
  temConteudo: true,
  publicado: true,
  ativo: true,
};

export const FONTE_AGENDA_COM_CONTEUDO: FonteRecuperada = {
  tipo: "agenda",
  referencia: PROFISSIONAL.referencia,
  temConteudo: true,
  publicado: true,
  ativo: true,
};

/** Estado de turno base: nada consultado, nada confirmado. */
export function turnoBase(parcial: Partial<EstadoDoTurno> = {}): EstadoDoTurno {
  return {
    ambiente: "homologacao",
    clinicaId: CLINICA_FICTICIA.id,
    conversaId: "fict-conversa-0001",
    messageId: "fict-msg-0001",
    ferramentas: [],
    catalogoEncontrou: false,
    agendamentoConfirmado: false,
    pacienteIdentificado: false,
    esclarecimentoUsado: false,
    handoffSolicitado: false,
    ...parcial,
  };
}

/** Consulta ao catálogo que devolveu conteúdo (mesma fonte, dado real acima). */
export const FERRAMENTA_CATALOGO_OK = {
  nome: "consultar_catalogo",
  capacidade: "searchKnowledgeBase",
  fonte: CATALOGO_PUBLICADO.ultrassomAbdomeTotal.referencia,
  success: true,
};

/** Consulta de disponibilidade tecnicamente bem-sucedida e SEM vaga. */
export const FERRAMENTA_DISPONIBILIDADE_VAZIA = {
  nome: "consultar_disponibilidade",
  capacidade: "checkAvailability",
  fonte: PROFISSIONAL.referencia,
  success: true,
};

export function contextoDe(estado: EstadoDoTurno, extras: Partial<ContextoConfianca> = {}) {
  return { estado, extras };
}
