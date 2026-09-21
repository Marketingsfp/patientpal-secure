/** Opções consultadas, escolha validada e aceite são evidências distintas. */
import type { EstadoFluxoNina } from "./fluxo-estado-normalizar";
import { permiteReserva, type ModalidadeAtendimento } from "./modalidade-atendimento";

export type VagaAgendamento = {
  medico_id: string;
  medico: string;
  especialidade?: string | null;
  procedimento: string | null;
  data: string;
  hora: string;
  inicio: string;
  fim: string;
  modalidade: ModalidadeAtendimento;
  agenda_id: string | null;
};
export type OpcoesAgendamento = {
  clinica_id: string;
  session_id: string;
  vagas: VagaAgendamento[];
};
export type ConfirmacaoAgendamento = {
  clinica_id: string;
  session_id: string;
  vaga: VagaAgendamento;
  /** Texto do resumo que precisa ter sido entregue antes do aceite. */
  resumo: string;
  aceita: boolean;
};

export function limparEscolhaAgendamento(estado: EstadoFluxoNina) {
  Object.assign(estado.appointment, {
    date: null,
    time: null,
    slot_inicio: null,
    slot_fim: null,
    slot_confirmed_by_patient: false,
    intent_confirmed: false,
    confirmation: null,
    modalidade_atendimento: null,
    agenda_id: null,
  });
}

/** Uma consulta, inclusive de uma única vaga, nunca equivale a uma escolha. */
export function registrarOpcoesAgendamento(
  estado: EstadoFluxoNina | undefined,
  clinicaId: string,
  vagas: VagaAgendamento[],
) {
  if (!estado || estado.appointment.appointment_id || estado.appointment.confirmation?.aceita)
    return;
  const escolha = confirmacaoDaEscolha(estado, clinicaId);
  const preservar = escolha && vagas.some(v => mesmaVaga(v, escolha.vaga));
  if (!preservar) limparEscolhaAgendamento(estado);
  estado.appointment.slot_options = estado.session_id
    ? { clinica_id: clinicaId, session_id: estado.session_id, vagas }
    : null;
  if (preservar) return;
  const medico = vagas[0];
  if (medico && vagas.every((v) => v.medico_id === medico.medico_id)) {
    estado.appointment.doctor_id = medico.medico_id;
    estado.appointment.doctor_name = medico.medico;
    estado.appointment.procedure = medico.procedimento;
    estado.appointment.specialty = medico.especialidade ?? estado.appointment.specialty;
  }
  estado.flow.stage = "WAITING_SLOT_SELECTION";
}

const normalizar = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Não confunde pergunta de preço, recusa, dois horários ou outro médico com escolha. */
export function lerEscolhaHorario(texto: string): { hora: string; data: string | null } | null {
  const t = normalizar(texto);
  if (/\b(nao|nem|talvez|valor|preco|custa|cpf|nasci|nascimento|telefone)\b/.test(t)) return null;
  const horas = [
    ...t.matchAll(/\b([01]?\d|2[0-3])(?:\s*:\s*([0-5]\d)|\s*h(?:\s*([0-5]\d))?)(?!\d)/g),
  ];
  if (horas.length !== 1) return null;
  const h = horas[0]!;
  const resto = t.replace(h[0], " ");
  const data = resto.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{4})?)\b/);
  // Extrai de linguagem livre. Qualificadores que exigem interpretação
  // seguem para a ferramenta de escolha do modelo e seu resumo validado.
  if (
    /\b(amanha|hoje|segunda|terca|quarta|quinta|sexta|sabado|domingo|dr|dra|doutor|doutora|medico|profissional|antes|depois|entre|ate|partir|funciona|preparo|exame)\b/.test(
      resto,
    )
  )
    return null;
  return { hora: `${h[1]!.padStart(2, "0")}:${h[2] ?? h[3] ?? "00"}`, data: data?.[0] ?? null };
}

export function vagasDaSessao(estado: EstadoFluxoNina, clinicaId: string): VagaAgendamento[] {
  const o = estado.appointment.slot_options;
  return o &&
    o.clinica_id === clinicaId &&
    o.session_id === estado.session_id &&
    Array.isArray(o.vagas)
    ? o.vagas
    : [];
}

export function vagasDaEscolha(
  vagas: VagaAgendamento[],
  escolha: { hora: string; data: string | null },
) {
  return vagas.filter((v) => {
    if (v.hora !== escolha.hora) return false;
    if (!escolha.data) return true;
    if (escolha.data.includes("-")) return v.data === escolha.data;
    const [dia, mes, ano] = escolha.data.split("/");
    return (
      v.data.slice(5) === `${mes!.padStart(2, "0")}-${dia!.padStart(2, "0")}` &&
      (!ano || v.data.startsWith(ano))
    );
  });
}

export function selecionarVagaValidada(
  estado: EstadoFluxoNina,
  clinicaId: string,
  vaga: VagaAgendamento,
  resumo: string,
) {
  const anterior = confirmacaoDaEscolha(estado, clinicaId);
  if (anterior && !estado.appointment.appointment_id && mesmaVaga(anterior.vaga, vaga)) return;
  if (estado.appointment.confirmation?.aceita || estado.appointment.appointment_id)
    throw new Error("A vaga confirmada não pode ser substituída.");
  limparEscolhaAgendamento(estado);
  Object.assign(estado.appointment, {
    doctor_id: vaga.medico_id,
    doctor_name: vaga.medico,
    specialty: vaga.especialidade ?? null,
    procedure: vaga.procedimento,
    date: vaga.data,
    time: vaga.hora,
    slot_inicio: vaga.inicio,
    slot_fim: vaga.fim,
    modalidade_atendimento: vaga.modalidade,
    agenda_id: vaga.agenda_id,
    confirmation: {
      clinica_id: clinicaId,
      session_id: estado.session_id ?? "",
      vaga: { ...vaga },
      resumo,
      aceita: false,
    },
  });
  estado.flow.stage = "WAITING_FINAL_CONFIRMATION";
}

const mesmoInstante = (a: string | null | undefined, b: string) =>
  Boolean(a) && Number.isFinite(Date.parse(b)) && Date.parse(a!) === Date.parse(b);

function mesmaVaga(a: VagaAgendamento, b: VagaAgendamento) {
  return a.medico_id === b.medico_id && a.procedimento === b.procedimento &&
    a.data === b.data && a.hora === b.hora && a.modalidade === b.modalidade &&
    a.agenda_id === b.agenda_id && mesmoInstante(a.inicio, b.inicio) && mesmoInstante(a.fim, b.fim);
}

/** A prova independente do resumo impede que um campo mutado reutilize o aceite. */
export function confirmacaoDaEscolha(
  estado: EstadoFluxoNina | undefined,
  clinicaId?: string,
): ConfirmacaoAgendamento | null {
  const a = estado?.appointment,
    c = a?.confirmation;
  if (
    !estado?.session_id ||
    !a ||
    !c?.vaga ||
    !c.resumo ||
    c.session_id !== estado.session_id ||
    (clinicaId && c.clinica_id !== clinicaId)
  )
    return null;
  const v = c.vaga;
  if (!permiteReserva(v.modalidade) || a.modalidade_atendimento !== v.modalidade || a.agenda_id !== v.agenda_id) return null;
  return a.doctor_id === v.medico_id &&
    a.procedure === v.procedimento &&
    a.date === v.data &&
    a.time === v.hora &&
    mesmoInstante(a.slot_inicio, v.inicio) &&
    mesmoInstante(a.slot_fim, v.fim)
    ? c
    : null;
}

export function consentimentoDaEscolha(estado: EstadoFluxoNina | undefined, clinicaId?: string) {
  const c = confirmacaoDaEscolha(estado, clinicaId);
  return c?.aceita && estado?.appointment.slot_confirmed_by_patient === true ? c : null;
}

export function aceitarResumoEntregue(
  estado: EstadoFluxoNina,
  clinicaId: string,
  historico: Array<{ role: string; content: string | null }>,
) {
  const c = confirmacaoDaEscolha(estado, clinicaId);
  const ultima = historico.at(-1);
  const normalizarEntrega = (t: string) => t.replace(/\r\n/g, "\n").trim();
  if (
    !c ||
    ultima?.role !== "assistant" ||
    normalizarEntrega(ultima.content ?? "") !== normalizarEntrega(c.resumo)
  )
    return false;
  c.aceita = true;
  estado.appointment.intent_confirmed = true;
  estado.appointment.slot_confirmed_by_patient = true;
  return true;
}
