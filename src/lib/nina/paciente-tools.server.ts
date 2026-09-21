/**
 * Ferramentas da Nina para ATENDIMENTO AO PACIENTE (server-only).
 *
 * Por que existe: no WhatsApp a Nina era somente-leitura e recebia TODO o
 * catálogo da clínica dentro do prompt (todos os médicos, horários e
 * procedimentos, a cada mensagem). Isso custava caro, atrasava a resposta e
 * ainda assim não permitia agendar. Aqui a lógica inverte: a Nina consulta
 * sob demanda, com funções pequenas, tipadas e auditáveis.
 *
 * Garantias desta camada:
 *
 *  1. NADA de SQL livre. São funções fechadas, com Zod na entrada e DTO
 *     enxuto na saída. Não existe "consultar_dados" genérico aqui — esse
 *     continua exclusivo da Nina interna, que roda com o token do funcionário.
 *  2. Escopo de clínica em toda consulta (`clinica_id` obrigatório no ctx).
 *  3. Escopo de paciente: dados pessoais e agendamentos só saem quando há um
 *     `paciente_id` já resolvido pelo telefone da conversa ou por CPF + nome +
 *     nascimento conferidos. Nome sozinho nunca identifica ninguém.
 *  4. Agendamento passa pelo MESMO núcleo da tela de Agenda
 *     (`criar-agendamento.core.server`), que revalida slot no momento da
 *     gravação — é o que impede dupla reserva.
 *  5. Idempotência: antes de criar, procura agendamento equivalente do mesmo
 *     paciente no mesmo horário. Chamada repetida devolve o mesmo id.
 */

import { z } from "zod";
import { REGRA_CONSULTA_CATALOGO } from "./catalogo-busca";
import { consultarDadosClinicasGrupo, consultarHorariosClinicasGrupo, selecionarClinicasGrupo, PARAMETRO_CLINICA_INFORMATIVA } from "./clinicas-grupo";
import { OBJETIVOS_PESQUISA_CATALOGO, TIPOS_ATENDIMENTO_CATALOGO } from "./catalogo-pesquisa";
import { agoraNaClinica, FUSO_PADRAO } from "@/lib/nina-agora";
import { janelaDiaClinica } from "@/lib/date-utils";
import { diaDaSemanaISO } from "./horario-oficial";
import { atendimentoExigeHumano } from "./regras-catalogo.server";
import { MOTIVO_SFP } from "./regras-catalogo";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isCPFValido, somenteDigitos } from "@/lib/cpf";
import { normalizar, raizEspecialidade } from "@/lib/nina-especialidade";
import { cadastroAutorizado, cadastroMinimoSchema } from "./cadastro-paciente";
import { consultarCadastroConfirmado } from "./cadastro-paciente.server";
import { processamentoWatchdogAtual } from "./watchdog-contexto.server";
import { confirmacaoDaEscolha, consentimentoDaEscolha, limparEscolhaAgendamento, registrarOpcoesAgendamento, selecionarVagaValidada,
  vagasDaSessao, vagasDaEscolha, lerEscolhaHorario, type VagaAgendamento } from "./agendamento-escolha";
import { chaveResumoModalidade, permiteReserva, orientacaoModalidade, type ModalidadeResolvida } from "./modalidade-atendimento";
import { enriquecerModalidades, fichaDoAgendamento, modalidadeAtualDaAgenda } from "./modalidade-atendimento.server";
import {
  resolverMedicoAgenda as resolverMedico,
  vincularProfissionaisCatalogo,
  modalidadePublicadaDoMedico,
} from "./vinculo-catalogo-agenda.server";
import { autorizarAcao, type CodigoRecusa, type EntradaAutorizacao } from "./acoes/autorizacao";
import {
  consultaAgendaPendente,
  FERRAMENTAS_DE_VAGAS,
  type ContextoConsultaAgenda,
} from "./consulta-agenda";
import {
  verificarResultadoAgendamento,
  type RegistroAgendamento,
} from "./acoes/resultado";

/** Códigos de erro estáveis — a Nina usa para decidir como continuar a conversa. */
export type CodigoErroNina =
  | "PROFISSIONAL_SFP"
  | "PATIENT_NOT_FOUND"
  | "PATIENT_NOT_VERIFIED"
  | "PATIENT_DATA_MISMATCH"
  | "PATIENT_AMBIGUOUS"
  | "PATIENT_DATA_REQUIRED"
  | "DOCTOR_NOT_FOUND"
  | "PROCEDURE_NOT_FOUND"
  | "NO_AVAILABILITY"
  | "SLOT_UNAVAILABLE"
  | "APPOINTMENT_ALREADY_EXISTS"
  | "APPOINTMENT_CREATION_FAILED"
  | "APPOINTMENT_UNCERTAIN"
  | "ACTION_NOT_AUTHORIZED"
  | "MODALIDADE_NAO_DEFINIDA"
  | "MODALIDADE_ALTERADA"
  | "VALIDATION_ERROR"
  | "PERMISSION_DENIED"
  | "INTERNAL_ERROR";

export type ResultadoFerramenta =
  | { ok: true; [k: string]: unknown }
  | { ok: false; erro: CodigoErroNina; mensagem: string; [k: string]: unknown };

function falha(erro: CodigoErroNina, mensagem: string, extra?: Record<string, unknown>) {
  return { ok: false as const, erro, mensagem, ...(extra ?? {}) };
}

/* ------------------------------------------------- estado estruturado (ctx) */

/** Atualiza o estado do fluxo em memória; quem persiste é o pipeline chamador. */
function mutarEstado(
  ctx: CtxNinaPaciente,
  patch: {
    patient?: Partial<import("./fluxo-estado.server").EstadoFluxoNina["patient"]>;
    appointment?: Partial<import("./fluxo-estado.server").EstadoFluxoNina["appointment"]>;
    stage?: import("./fluxo-estado.server").EtapaFluxoNina;
  },
) {
  if (!ctx.estado) return;
  if (patch.patient) Object.assign(ctx.estado.patient, patch.patient);
  if (patch.appointment) Object.assign(ctx.estado.appointment, patch.appointment);
  if (patch.appointment?.appointment_id) {
    ctx.estado.appointment.confirmed_in_session = ctx.estado.session_id ?? null;
  }
  if (patch.stage) ctx.estado.flow.stage = patch.stage;
}


/** Contexto da conversa. `pacienteId` só existe depois de identificação válida. */
export type CtxNinaPaciente = {
  clinicaId: string;
  /** Telefone normalizado (10-11 dígitos) do remetente, quando houver. */
  telefone: string | null;
  pacienteId: string | null;
  pacienteNome: string | null;
  conversaId: string | null;
  /** Origem do disparo — auditoria e marcação do agendamento. */
  origem: "whatsapp" | "chat_interno" | "homologacao";
  /** Flag de agendamento da clínica. Sem ela, só ferramentas de consulta. */
  podeAgendar?: boolean;
  /**
   * Estado estruturado do fluxo, carregado da conversa antes da chamada do
   * modelo e regravado depois. É o que impede a Nina de "esquecer" o paciente
   * já identificado entre uma mensagem e outra.
   */
  estado?: import("./fluxo-estado.server").EstadoFluxoNina;
  /**
   * Conversa do console de Homologação. Tudo que for gravado nasce marcado
   * como teste (`is_mock_data`), com o nome prefixado por [TESTE NINA] e
   * removível ao resolver a sessão.
   */
  teste?: boolean;
  /** Pedido e histórico entregue da sessão; nunca fornecidos pelos argumentos do modelo. */
  consultaAgenda?: ContextoConsultaAgenda;
  nomeUnidade?: string;
  /** Havia opções oficiais antes de o paciente enviar esta mensagem? */
  opcoesAgendamentoInicioTurno?: boolean;
  /** Dúvida encontrada neste turno; só uma nova mensagem do paciente pode esclarecê-la. */
  esclarecimentoCatalogo?: import("./knowledge-contract").ResultadoConhecimento["esclarecimento"];
};


/**
 * Protocolo do atendimento após agendamento CONFIRMADO no banco.
 * Devolve `null` quando a clínica não usa protocolo — a Nina só cita o número
 * que vem do backend, nunca inventa.
 */
async function protocoloDoAgendamento(ctx: CtxNinaPaciente): Promise<string | null> {
  if (!ctx.conversaId) return null;
  try {
    const { garantirProtocoloAtendimento } = await import(
      "@/lib/atendimento/protocolo-atendimento.server"
    );
    const r = await garantirProtocoloAtendimento({
      clinicaId: ctx.clinicaId,
      conversaId: ctx.conversaId,
      gatilho: "agendamento",
    });
    return r?.protocolo ?? null;
  } catch (e) {
    console.error("[nina-tools] protocolo do agendamento", e);
    return null;
  }
}

/** Marca gravada em `agendamentos.origem_integracao`. */
export function origemAgendamentoNina(ctx: CtxNinaPaciente): string {
  if (ctx.teste || ctx.origem === "homologacao") return "nina_homologacao";
  return ctx.origem === "whatsapp" ? "nina_whatsapp" : "nina_chat_interno";
}

/**
 * Paciente SINTÉTICO do lead de homologação.
 *
 * Na homologação nenhum cadastro real é lido, criado ou vinculado: cada lead de
 * teste tem um paciente próprio, marcado como dado de teste (`is_mock_data` e
 * `teste`), reaproveitado a cada ciclo do mesmo lead. Isso garante que agenda,
 * "meus agendamentos" e qualquer ferramenta que dependa do paciente enxerguem
 * apenas registros de teste — e nunca os dados de um paciente real.
 */
async function pacienteSinteticoDoLead(
  ctx: CtxNinaPaciente,
  nomeInformado: string,
): Promise<{ id: string; nome: string } | null> {
  try {
    const telefone = ctx.telefone ?? "";
    const { data: lead } = await supabaseAdmin
      .from("nina_teste_leads")
      .select("id, indice, paciente_teste_id")
      .eq("clinica_id", ctx.clinicaId)
      .eq("telefone_sessao", telefone)
      .maybeSingle();
    const indice = (lead as { indice?: number } | null)?.indice ?? 0;
    const nome = `[TESTE NINA] Paciente Teste ${String(indice || 0).padStart(2, "0")}`;

    const existenteId = (lead as { paciente_teste_id?: string | null } | null)?.paciente_teste_id;
    if (existenteId) {
      const { data: pac } = await supabaseAdmin
        .from("pacientes")
        .select("id, nome, is_mock_data, data_nascimento")
        .eq("id", existenteId)
        .eq("clinica_id", ctx.clinicaId)
        .maybeSingle();
      const p = pac as { id: string; nome: string; is_mock_data: boolean; data_nascimento: string | null } | null;
      if (p?.is_mock_data) {
        if (!p.data_nascimento) {
          const { error } = await supabaseAdmin.from("pacientes").update({ data_nascimento: "2000-01-01" })
            .eq("id", p.id).eq("clinica_id", ctx.clinicaId).eq("is_mock_data", true).is("data_nascimento", null);
          if (error) throw new Error("Falha ao completar paciente sintético");
        }
        return { id: p.id, nome: p.nome };
      }
    }

    // Reaproveita o paciente de teste já criado para este telefone virtual.
    const { data: achado } = await supabaseAdmin
      .from("pacientes")
      .select("id, nome")
      .eq("clinica_id", ctx.clinicaId)
      .eq("is_mock_data", true)
      .eq("telefone", telefone)
      .maybeSingle();
    let pacienteId = (achado as { id: string } | null)?.id ?? null;
    let pacienteNome = (achado as { nome: string } | null)?.nome ?? nome;

    if (!pacienteId) {
      const { data: criado, error } = await supabaseAdmin
        .from("pacientes")
        .insert({
          clinica_id: ctx.clinicaId,
          nome,
          telefone,
          data_nascimento: "2000-01-01",
          is_mock_data: true,
          teste: true,
        } as never)

        .select("id, nome")
        .maybeSingle();
      if (error) throw new Error(error.message);
      pacienteId = (criado as { id: string } | null)?.id ?? null;
      pacienteNome = (criado as { nome: string } | null)?.nome ?? nome;
    }
    if (!pacienteId) return null;
    // Um paciente sintético reaproveitado também precisa do mínimo da Agenda.
    const { error: erroNascimentoTeste } = await supabaseAdmin.from("pacientes")
      .update({ data_nascimento: "2000-01-01" }).eq("id", pacienteId)
      .eq("clinica_id", ctx.clinicaId).eq("is_mock_data", true).is("data_nascimento", null);
    if (erroNascimentoTeste) throw new Error("Falha ao completar paciente sintético");

    const leadId = (lead as { id?: string } | null)?.id;
    if (leadId && existenteId !== pacienteId) {
      await supabaseAdmin
        .from("nina_teste_leads")
        .update({ paciente_teste_id: pacienteId } as never)
        .eq("id", leadId);
    }
    return { id: pacienteId, nome: pacienteNome };
  } catch (e) {
    console.error("[nina-tools] paciente sintético de homologação", e);
    return null;
  }
}


/* ------------------------------------------------------------------ auditoria */

/**
 * Registra a operação da Nina no `audit_log`.
 *
 * Guardamos apenas o necessário para responder "qual ferramenta ela chamou,
 * com quais parâmetros e o que o backend respondeu". Nunca gravamos o
 * raciocínio do modelo nem o texto livre da conversa.
 */
async function auditar(
  ctx: CtxNinaPaciente,
  ferramenta: string,
  entrada: unknown,
  resultado: { ok: boolean; erro?: string; id?: string | null },
) {
  try {
    await supabaseAdmin.from("audit_log").insert({
      clinica_id: ctx.clinicaId,
      user_id: null,
      user_email: null,
      table_name: "nina_ferramenta",
      record_id: resultado.id ?? ctx.conversaId,
      action: `NINA_${ferramenta.toUpperCase()}`,
      dados_depois: {
        source: "nina_ai",
        origem: ctx.origem,
        teste: ctx.teste === true,
        conversa_id: ctx.conversaId,
        paciente_id: ctx.pacienteId,
        ferramenta,
        entrada: JSON.parse(JSON.stringify(entrada ?? null)),
        ok: resultado.ok,
        erro: resultado.erro ?? null,
        registro_id: resultado.id ?? null,
      },
    });
  } catch (e) {
    // Auditoria nunca derruba o atendimento — mas grita no log do servidor.
    console.error("[nina-tools] falha ao auditar", ferramenta, e);
  }
}

/* --------------------------------------------------------------- utilitários */

const HORA_LOCAL = FUSO_PADRAO;

function formatarData(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: HORA_LOCAL,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function formatarHora(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: HORA_LOCAL,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

function horaNumerica(iso: string): number {
  return Number(formatarHora(iso).slice(0, 2));
}

function dentroDoPeriodo(iso: string, periodo?: string | null) {
  if (!periodo) return true;
  const h = horaNumerica(iso);
  if (periodo === "manha") return h < 12;
  if (periodo === "tarde") return h >= 12 && h < 18;
  if (periodo === "noite") return h >= 18;
  return true;
}

/* ------------------------------------------------------------------ catálogo */

async function listarEspecialidades(clinicaId: string) {
  const { data } = await supabaseAdmin
    .from("especialidades")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");
  const todas = (data ?? []) as Array<{ id: string; nome: string }>;

  // `medico_especialidades` não guarda clínica: o escopo vem dos médicos.
  const medicos = await medicosDaClinica(clinicaId);
  if (medicos.length === 0) return todas;
  const { data: vinc } = await supabaseAdmin
    .from("medico_especialidades")
    .select("especialidade_id")
    .in("medico_id", medicos);
  const espIds = new Set(
    ((vinc ?? []) as Array<{ especialidade_id: string }>).map((v) => v.especialidade_id),
  );
  const filtradas = todas.filter((e) => espIds.has(e.id));
  return filtradas.length > 0 ? filtradas : todas;
}

/** Ids dos médicos ativos da clínica — base de escopo para tabelas de vínculo. */
async function medicosDaClinica(clinicaId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("medicos")
    .select("id")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true);
  return ((data ?? []) as Array<{ id: string }>).map((m) => m.id);
}

/** Casa o texto do paciente ("cardio", "coração"?) com uma especialidade cadastrada. */
function acharEspecialidade(termo: string, lista: Array<{ id: string; nome: string }>) {
  const t = normalizar(termo);
  if (!t) return null;
  const exata = lista.find((e) => normalizar(e.nome) === t);
  if (exata) return exata;
  const porRaiz = lista.find((e) => {
    const raiz = raizEspecialidade(e.nome);
    return (raiz.length >= 4 && t.includes(raiz)) || t.includes(normalizar(e.nome));
  });
  if (porRaiz) return porRaiz;
  return lista.find((e) => normalizar(e.nome).startsWith(t.slice(0, 5))) ?? null;
}

/* -------------------------------------------------- disponibilidade (núcleo) */

async function guardarOpcoes(ctx: CtxNinaPaciente, slots: SlotNina[], procedimentos?: ReadonlyMap<string, string>) {
  if (consentimentoDaEscolha(ctx.estado, ctx.clinicaId)) return null;
  const { conhecimentoDaMesmaSessao } = await import("./confidence/conhecimento-sessao");
  const { normalizarSelecaoContextual } = await import("./confidence/selecao-contextual");
  const conhecimento = conhecimentoDaMesmaSessao(ctx.estado?.knowledge_context, ctx.clinicaId, ctx.estado?.session_id ?? null);
  let publicados = procedimentos;
  if (!publicados && conhecimento && slots.length) {
    // A referência persistida é uma pesquisa, não um fato antigo: releia a
    // publicação e associe cada atendimento ao UUID operacional do executante.
    const preferencia = ctx.consultaAgenda?.selecaoRevalidada ?? normalizarSelecaoContextual(conhecimento.selecao);
    const selecao = preferencia?.clinicaId === ctx.clinicaId && preferencia.sessaoId === ctx.estado?.session_id ? preferencia : null;
    const atendimento = selecao?.modalidade?.nome ?? conhecimento.consulta.termo;
    const tipo = conhecimento.consulta.tipo_atendimento;
    const { candidatosPrimeiraVaga } = await import("./primeiro-disponivel-catalogo.server");
    let candidatos = tipo === "consulta" || tipo === "exame_procedimento"
      ? await candidatosPrimeiraVaga(ctx.clinicaId, tipo === "consulta" ? "consulta" : "procedimento", atendimento)
      : [];
    // Ex.: a pesquisa salva foi "cardio", mas todas as referências indicam
    // "Consulta — CARDIOLOGIA". Use esse nome apenas para nova leitura oficial.
    const referencias = [...new Set(conhecimento.referencias.map(r => r.procedimento).filter((p): p is string => !!p))];
    if (!candidatos.length && referencias.length === 1 && !referencias[0]!.includes(",") &&
      (tipo === "consulta" || tipo === "exame_procedimento"))
      candidatos = await candidatosPrimeiraVaga(ctx.clinicaId, tipo === "consulta" ? "consulta" : "procedimento", referencias[0]!);
    publicados = new Map(slots.flatMap(s => {
      const nomes = [...new Set(candidatos.filter(c => c.medicoId === s.medico_id)
        .map(c => c.registro.procedimento).filter((p): p is string => !!p))];
      return nomes.length === 1 ? [[s.medico_id, nomes[0]!] as const] : [];
    }));
  }
  const vagas: VagaAgendamento[] = slots.flatMap((s) => !permiteReserva(s.modalidade) ? [] : [{
    medico_id: s.medico_id, medico: s.medico_nome, especialidade: s.especialidade,
    procedimento: publicados ? publicados.get(s.medico_id) ?? null :
      (ctx.estado?.appointment.doctor_id === s.medico_id ? ctx.estado.appointment.procedure : null),
    data: dataISODoSlot(s.inicio), hora: s.hora, inicio: s.inicio, fim: s.fim,
    modalidade: s.modalidade, agenda_id: s.agenda,
  }]);
  if (ctx.podeAgendar && vagas.some(v => !v.procedimento)) {
    registrarOpcoesAgendamento(ctx.estado, ctx.clinicaId, []);
    return falha("ACTION_NOT_AUTHORIZED", "Não foi possível vincular o atendimento publicado às vagas da agenda. A equipe deve conferir esse vínculo; isso não comprova ausência na base nem falta de vagas.",
      { codigo: "ATENDIMENTO_AGENDA_NAO_VINCULADO", encaminhar_para_humano: true });
  }
  registrarOpcoesAgendamento(ctx.estado, ctx.clinicaId, vagas);
  return null;
}

export type SlotNina = {
  medico_id: string;
  medico_nome: string;
  especialidade: string | null;
  agenda: string | null;
  modalidade?: ModalidadeResolvida;
  data: string;
  hora: string;
  inicio: string;
  fim: string;
};

/**
 * Disponibilidade REAL da agenda. Usa a mesma RPC
 * (`get_horarios_disponiveis`) já consumida pela API de integração v1 — a
 * fonte de verdade é a mesma da recepção. A Nina nunca calcula horário.
 */
export async function consultarDisponibilidadeCore(params: {
  clinicaId: string;
  especialidadeId?: string | null;
  medicoId?: string | null;
  dias?: number;
  limite?: number;
  periodo?: "manha" | "tarde" | "noite" | null;
  data?: string | null;
  /** Comparação entre médicos não pode perder vagas por corte de linhas ocupadas. */
  completa?: boolean;
}, agora: Date = new Date()): Promise<SlotNina[]> {
  // Fonte de verdade: as linhas "DISPONÍVEL" da própria agenda — exatamente o
  // que o núcleo de criação exige que exista para deixar marcar (regra 3 de
  // `criar-agendamento.core.server`). Oferecer qualquer outra coisa criaria a
  // situação pior possível: a Nina propõe um horário que o sistema recusa na
  // hora de gravar. A RPC `get_horarios_disponiveis` não serve aqui porque
  // depende de `auth.uid()`, que não existe num atendimento de WhatsApp.
  const dias = Math.min(Math.max(params.dias ?? 14, 1), 60);
  const ate = new Date(agora.getTime() + dias * 86_400_000);
  const diaPedido = params.data ? janelaDiaClinica(params.data, HORA_LOCAL) : null;

  let medicosFiltro: string[] | null = params.medicoId ? [params.medicoId] : null;
  if (params.especialidadeId) {
    const daClinica = await medicosDaClinica(params.clinicaId);
    const { data: vinc } = await supabaseAdmin
      .from("medico_especialidades")
      .select("medico_id")
      .eq("especialidade_id", params.especialidadeId)
      .in("medico_id", daClinica.length > 0 ? daClinica : [SEM_RESULTADO]);
    const daEsp = ((vinc ?? []) as Array<{ medico_id: string }>).map((v) => v.medico_id);
    medicosFiltro = medicosFiltro
      ? medicosFiltro.filter((m) => daEsp.includes(m))
      : daEsp;
    if (medicosFiltro.length === 0) return [];
  }

  let q = supabaseAdmin
    .from("agendamentos")
    .select("id, medico_id, inicio, fim, paciente_nome, status, agenda_id")
    .eq("clinica_id", params.clinicaId)
    .gte("inicio", agora.toISOString())
    .lte("inicio", ate.toISOString())
    .neq("status", "cancelado")
    .order("inicio").order("id");
  if (!params.completa) q = q.limit(Math.min(Math.max(params.limite ?? 400, 1), 800));
  if (medicosFiltro) q = q.in("medico_id", medicosFiltro);
  // Recorta o dia civil ANTES do limite de linhas. A data UTC do slot pode
  // ser o dia seguinte; o paciente sempre escolhe uma data em São Paulo.
  if (diaPedido) q = q.gte("inicio", diaPedido.inicio).lt("inicio", diaPedido.fimExclusivo);

  const data = [];
  for (let pagina = 0; ; pagina++) {
    const r = await (params.completa ? q.range(pagina * 500, pagina * 500 + 499) : q);
    if (r.error) throw new Error(r.error.message);
    data.push(...(r.data ?? []));
    if (!params.completa || (r.data?.length ?? 0) < 500) break;
  }

  const linhas = (data ?? []) as Array<{
    medico_id: string | null;
    inicio: string;
    fim: string;
    paciente_nome: string | null;
    agenda_id?: string | null;
  }>;
  const livres = linhas.filter((l) => {
    const n = normalizar(l.paciente_nome ?? "");
    return n === "disponivel";
  });
  if (livres.length === 0) return [];

  const medIds = [...new Set(livres.map((l) => l.medico_id).filter(Boolean) as string[])];
  const { data: meds } = await supabaseAdmin
    .from("medicos")
    .select("id, nome, especialidade_id")
    .in("id", medIds.length > 0 ? medIds : [SEM_RESULTADO]);
  const infoMedico = new Map<string, { nome: string; especialidade_id: string | null }>();
  for (const m of (meds ?? []) as Array<{
    id: string;
    nome: string;
    especialidade_id: string | null;
  }>)
    infoMedico.set(m.id, { nome: m.nome, especialidade_id: m.especialidade_id });

  const espIds = [
    ...new Set([...infoMedico.values()].map((m) => m.especialidade_id).filter(Boolean) as string[]),
  ];
  const nomeEsp = new Map<string, string>();
  if (espIds.length > 0) {
    const { data: esps } = await supabaseAdmin
      .from("especialidades")
      .select("id, nome")
      .in("id", espIds);
    for (const e of (esps ?? []) as Array<{ id: string; nome: string }>) nomeEsp.set(e.id, e.nome);
  }

  const alvo = params.data ? formatarData(`${params.data}T12:00:00-03:00`) : null;

  return livres
    .map((l) => {
      const info = l.medico_id ? infoMedico.get(l.medico_id) : undefined;
      return {
        medico_id: String(l.medico_id ?? ""),
        medico_nome: info?.nome ?? "",
        especialidade: info?.especialidade_id ? (nomeEsp.get(info.especialidade_id) ?? null) : null,
        agenda: l.agenda_id ?? null,
        data: formatarData(l.inicio),
        hora: formatarHora(l.inicio),
        inicio: l.inicio,
        fim: l.fim,
      } satisfies SlotNina;
    })
    .filter((s) => s.medico_id && s.medico_nome)
    .filter((s) => (alvo ? s.data === alvo : true))
    .filter((s) => dentroDoPeriodo(s.inicio, params.periodo ?? null));
}

/** Sentinela para `in()` vazio — nunca casa com nada. */
const SEM_RESULTADO = "00000000-0000-0000-0000-000000000000";

/* ------------------------------------------------- escala × disponibilidade */

/** AAAA-MM-DD -> dia da semana (0=Dom) no fuso da clínica. */
function diaSemanaDe(dataISO: string): number | null {
  return diaDaSemanaISO(dataISO);
}

/**
 * Escala teórica do médico (`medico_disponibilidades`). Serve APENAS para
 * diferenciar "não atende nesse dia" de "atende, mas agenda cheia". Nunca é
 * usada para oferecer horário — vaga só sai de `consultarDisponibilidadeCore`.
 */
async function escalaDoMedico(clinicaId: string, medicoId: string) {
  const { data, error } = await supabaseAdmin
    .from("medico_disponibilidades")
    .select("dia_semana, hora_inicio, hora_fim")
    .eq("clinica_id", clinicaId)
    .eq("medico_id", medicoId)
    .eq("ativo", true);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ dia_semana: number; hora_inicio: string; hora_fim: string }>;
}

async function medicoAtendeNoDia(clinicaId: string, medicoId: string, dataISO: string) {
  const escala = await escalaDoMedico(clinicaId, medicoId);
  const dow = diaSemanaDe(dataISO);
  return { atende: escala.length ? escala.some((e) => e.dia_semana === dow) : null, escala };
}

async function nomeMedico(medicoId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("medicos")
    .select("nome")
    .eq("id", medicoId)
    .maybeSingle();
  return (data as { nome?: string } | null)?.nome ?? null;
}

/** "AAAA-MM-DD" do slot, no fuso da clínica (para comparar com a data pedida). */
function dataISODoSlot(iso: string) {
  const [dd, mm, yyyy] = formatarData(iso).split("/");
  return `${yyyy}-${mm}-${dd}`;
}

/* ------------------------------------------------ agenda: resultado e logs */

/** Log técnico de homologação. Nunca chega ao paciente. */
function logAgenda(ferramenta: string, dados: Record<string, unknown>) {
  try {
    console.info(`[NINA_AGENDA] ${ferramenta}`, JSON.stringify(dados));
  } catch {
    /* log nunca derruba atendimento */
  }
}

/**
 * "Consultei e não há vaga" NÃO é erro. Antes isso voltava como `ok:false`, e
 * o modelo respondia "houve um problema ao consultar a agenda" — confundindo
 * agenda cheia com falha de sistema. Agora sai como sucesso, com `slots` vazio
 * e um motivo explícito.
 */
function semVaga(motivo: string, mensagem: string, extra?: Record<string, unknown>) {
  return { ok: true as const, slots: [], horarios: [], reason: motivo, mensagem, ...(extra ?? {}) };
}

/** Falha TÉCNICA de consulta — só aqui a Nina pode dizer que não conseguiu consultar. */
function falhaAgenda(e: unknown, ferramenta: string) {
  console.error(`[NINA_AGENDA] AGENDA_QUERY_FAILED em ${ferramenta}`, e);
  return {
    ok: false as const,
    erro: "INTERNAL_ERROR" as const,
    codigo: "AGENDA_QUERY_FAILED",
    mensagem: "Não consegui consultar a agenda neste momento.",
  };
}

/* ------------------------------------------------------------ definições AI */

/**
 * Ferramentas de CONSULTA (catálogo + agenda real). Disponíveis em todas as
 * clínicas — consultar disponibilidade não cria nada e não expõe paciente.
 */
export const FERRAMENTAS_NINA_CONSULTA = [
  {
    type: "function",
    function: {
      name: "listar_especialidades",
      description:
        "Lista as especialidades realmente atendidas nesta clínica. Use antes de afirmar que a clínica atende (ou não atende) alguma área.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_medicos",
      description:
        "Busca profissionais da clínica por especialidade e/ou nome, com dias e horários habituais publicados. Retorna vinculos_agenda com medico_id operacional, separado de catalogo_id. Use medico_id para consultar vagas do profissional escolhido. Se o vínculo for ambíguo ou ausente, não invente um identificador. Os horários publicados são escala administrativa; não confirmam vagas na agenda.",
      parameters: {
        type: "object",
        properties: {
          especialidade: { type: "string", description: "Ex.: cardiologia, ortopedia" },
          nome: { type: "string", description: "Parte do nome do profissional" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_procedimentos",
      description:
      "Busca exames/procedimentos cadastrados: valores com suas formas de pagamento específicas e preparo. Pix tem sempre o mesmo valor do cartão: informe juntos como Pix/cartão. Dinheiro fica separado. Use sempre que perguntarem preço ou preparo.",
      parameters: {
        type: "object",
        properties: {
          termo: { type: "string", description: "Nome ou parte do nome do exame/procedimento" },
        },
        required: ["termo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dados_da_clinica",
      description: "Informações públicas: nome, endereço, CEP e telefone. Para clínicas do grupo, consulte Menino Jesus, São Francisco de Paula ou Consulta Hoje pelo parâmetro clinica. Telefone de contato não comprova WhatsApp. Não muda a clínica do atendimento ou do agendamento.",
      parameters: { type: "object", properties: { clinica: PARAMETRO_CLINICA_INFORMATIVA } },
    },
  },
  {
    type: "function",
    function: {
      name: "horario_funcionamento",
      description:
        "Horário de funcionamento da clínica informada (clinica): calendário publicado ou horário presencial habitual confirmado no diretório do grupo. Para uma data específica, passe data e respeite dia.encontrado; rotina semanal não comprova exceções/feriados. NÃO é horário de atendente no WhatsApp, profissional ou vaga — para vaga use consultar_disponibilidade. Ausência de confirmação nunca significa fechado.",
      parameters: {
        type: "object",
        properties: {
          clinica: PARAMETRO_CLINICA_INFORMATIVA,
          data: {
            type: "string",
            description: "AAAA-MM-DD quando o paciente perguntou de um dia específico (aplica exceções e vigência).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_disponibilidade",
      description:
        "Consulta vagas REALMENTE livres na agenda do médico escolhido, após solicitação do paciente ou aceite da oferta de verificar vagas. Horários habituais de atendimento vêm do catálogo e dispensam esta consulta. Não usar em uma pergunta geral sobre médicos ou escala.",
      parameters: {
        type: "object",
        properties: {
          especialidade: { type: "string" },
          medico_id: {
            type: "string",
            description: "medico_id de vinculos_agenda devolvido por buscar_medicos OU nome do profissional escolhido. catalogo_id/id do registro de conhecimento não é o UUID operacional.",
          },
          data: { type: "string", description: "AAAA-MM-DD, quando o paciente pediu um dia" },
          periodo: { type: "string", description: "manha, tarde ou noite" },
          dias: { type: "number", description: "Janela de busca em dias (padrão 14, máx 60)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "verificar_horario",
      description:
        "Verifica UMA vaga específica solicitada pelo paciente, com o médico já escolhido ('tem 15h amanhã com o Dr. João?'). Devolve se está livre e, se ocupado, alternativas no mesmo dia. Não consulta escala habitual nem informa quem ocupa a vaga.",
      parameters: {
        type: "object",
        properties: {
          medico_id: {
            type: "string",
            description: "medico_id de vinculos_agenda devolvido por buscar_medicos OU nome do profissional escolhido. catalogo_id/id do registro de conhecimento não é o UUID operacional.",
          },
          data: { type: "string", description: "AAAA-MM-DD já resolvida (hoje/amanhã viram data)" },
          hora: { type: "string", description: "HH:MM, ex.: 15:00" },
        },
        required: ["medico_id", "data", "hora"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_primeiro_disponivel",
      description: "Quando o paciente escolher o primeiro disponível/sem preferência de médico, compara as agendas de TODOS os profissionais publicados do atendimento solicitado. Não exige médico definido. Informe o nome oficial do atendimento obtido no catálogo. Retorna a disponibilidade mais próxima, modalidade, orientações e valores próprios do profissional. Não seleciona vaga nem reserva. Um sim à pergunta com duas alternativas não escolhe automaticamente este caminho.",
      parameters: { type: "object", properties: {
        tipo: { type: "string", enum: ["consulta", "procedimento"] },
        atendimento: { type: "string", description: "Especialidade ou procedimento exato publicado, ex.: Otorrinolaringologia. Preserve a consulta/procedimento do paciente." },
        data: { type: "string", description: "AAAA-MM-DD para dia exato, inclusive hoje; não substitua por outro dia." },
        a_partir_de: { type: "string", description: "AAAA-MM-DD quando houver data mínima" },
        periodo: { type: "string", enum: ["manha", "tarde", "noite"] },
        dia_semana: { type: "number", description: "0=domingo até 6=sábado" },
        dias: { type: "number", description: "Janela a partir de agora, padrão e máximo 60 dias" },
      }, required: ["tipo", "atendimento"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "proxima_vaga",
      description:
        "Primeira vaga REAL disponível do médico escolhido, após pedido do paciente por vagas. Aceita 'a próxima disponível', 'a primeira vaga', 'a quinta-feira mais próxima' ou 'qualquer horário', sem exigir uma data exata. Exige definir o médico; uma pergunta geral sobre a especialidade não autoriza consultar vagas.",
      parameters: {
        type: "object",
        properties: {
          medico_id: {
            type: "string",
            description: "medico_id de vinculos_agenda devolvido por buscar_medicos OU nome do profissional escolhido. catalogo_id/id do registro de conhecimento não é o UUID operacional.",
          },
          especialidade: { type: "string" },
          a_partir_de: { type: "string", description: "AAAA-MM-DD (padrão: hoje)" },
          periodo: { type: "string", description: "manha, tarde ou noite" },
          dia_semana: {
            type: "number",
            description:
              "Filtra por dia da semana: 0=domingo, 1=segunda ... 4=quinta, 6=sábado. Use em 'a próxima quinta-feira'.",
          },
          dias: { type: "number", description: "Janela de busca em dias (padrão 60)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_base_conhecimento",
      description:
        "FONTE DE VERDADE administrativa da clínica (catálogo publicado). " +
        REGRA_CONSULTA_CATALOGO +
        " Cada valor vem com sua forma de pagamento e condição; preserve essa associação e agrupe valores somente quando todas as opções e condições forem iguais.",
      parameters: {
        type: "object",
        properties: {
          nova_solicitacao: {
            type: "boolean",
            description:
              "Use true somente quando o paciente iniciar outra solicitação independente no histórico, para começar a contagem de esclarecimentos desse novo pedido. Ao responder à pergunta de identificação, detalhar o mesmo exame, escolher uma opção ou corrigir sua grafia, use false ou omita. Não reinicie a contagem para repetir perguntas da mesma solicitação.",
          },
          termo: {
            type: "string",
            description:
              "Nome do atendimento identificado após interpretar a mensagem e o histórico da sessão (ex.: 'ultrassom de tireoide', 'neurologista', 'cardiologia'). Não copie a frase inteira: saudação, sintomas relatados e preferências de data não compõem o nome do atendimento. Exemplo: 'Boa tarde, quero cardiologista nos próximos dias, tenho palpitações' → 'cardiologia'. Preserve qualificadores do procedimento, como órgão, total/superior, infantil e com/sem contraste. Consulte separadamente cada atendimento pedido. Em continuação, reconsulte o item identificado no histórico ou na referencia_da_sessao; não reutilize seus fatos antigos nem invente equivalências para siglas desconhecidas.",
          },
          objetivos: {
            type: "array", items: { type: "string", enum: OBJETIVOS_PESQUISA_CATALOGO },
            minItems: 1, maxItems: 7,
            description: "O que o paciente quer saber sobre ESTE atendimento, após analisar a mensagem inteira e o histórico. Pode haver vários objetivos. Use informacoes_gerais para apresentação geral; valor, horarios, medicos, preparo ou condicoes para dúvidas específicas; agendamento somente quando há intenção de marcar. Use o retorno para responder aos objetivos identificados com as condições publicadas relevantes. Perguntar preço ou horário não significa querer agendar. Estes objetivos não fazem parte do termo de busca.",
          },
          tipo_atendimento: {
            type: "string", enum: TIPOS_ATENDIMENTO_CATALOGO,
            description: "Categoria identificada na mensagem completa e no histórico: consulta para atendimento com médico/especialidade (ex.: consulta com cardiologista → termo cardiologia, tipo consulta); exame_procedimento para exame ou procedimento (ex.: ECG, MAPA, nebulização); nao_identificado somente se ainda não houver informação suficiente. Consulta não é exame: sintomas não autorizam substituir a consulta por exames nem pedir pedido médico. Agendamento é objetivo e pode existir nas duas categorias. Para consulta e exame na mesma mensagem, faça pesquisas separadas. Preserve a categoria nas continuações da mesma solicitação.",
          },
          medico: { type: "string", description: "Filtrar por nome do profissional (opcional)." },
          dia: { type: "string", description: "Filtrar por dia da semana (opcional)." },
        },
        required: ["termo", "objetivos", "tipo_atendimento"],
      },
    },
  },
] as const;


/** Ferramentas que alteram estado/expõem paciente — só com a flag de agenda. */
export const FERRAMENTAS_NINA_AGENDAMENTO = [
  {
    type: "function",
    function: {
      name: "selecionar_horario",
      description: "Interprete a escolha do paciente em linguagem natural (por exemplo: eu prefiro 10:20, marca pra 10:20, eu vou 10:20, dez e vinte, o segundo horário). Use exclusivamente uma vaga retornada pela agenda. Consultar opções não é escolher. Havendo ambiguidade de médico, dia ou horário, pergunte antes. Esta ferramenta revalida a vaga e devolve o resumo final obrigatório para o paciente confirmar. Nunca cria reserva e nunca substitui uma vaga indisponível.",
      parameters: { type: "object", properties: {
        medico_id: { type: "string" }, inicio: { type: "string" }, fim: { type: "string" },
      }, required: ["medico_id", "inicio", "fim"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_cadastro_paciente",
      description: "Depois de definir e confirmar procedimento, médico e vaga, verifica o cadastro já confirmado na conversa e devolve apenas os campos obrigatórios faltantes do Clínica OS. Telefone sozinho não confirma identidade. Não cria cadastro.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "identificar_paciente",
      description:
        "Após confirmar procedimento, profissional e vaga, confere ou cadastra o paciente no Clínica OS. Peça apenas nome, data de nascimento e telefone que estiverem faltando; aproveite o telefone do WhatsApp. CPF é opcional, nunca solicite. Cadastro confirmado é reutilizado e apenas campos vazios podem ser completados.",
      parameters: {
        type: "object",
        properties: {
          cpf: { type: "string" },
          nome: { type: "string", description: "Nome completo" },
          data_nascimento: { type: "string", description: "AAAA-MM-DD" },
          telefone: { type: "string", description: "Só quando não houver telefone do WhatsApp ou do cadastro confirmado" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "meus_agendamentos",
      description:
        "Agendamentos futuros do paciente já identificado nesta conversa. Nunca traz dados de outra pessoa.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "agendar",
      description:
        "Cria exclusivamente a vaga do resumo final devolvido por selecionar_horario e aceito pelo paciente em uma mensagem posterior. Use o mesmo profissional, procedimento, inicio e fim desse resumo. Não selecione a primeira opção consultada. Se a vaga ficar indisponível, encaminhe para atendimento humano, sem substituí-la.",
      parameters: {
        type: "object",
        properties: {
          medico_id: { type: "string" },
          inicio: { type: "string", description: "ISO 8601 vindo de consultar_disponibilidade" },
          fim: { type: "string", description: "ISO 8601 vindo de consultar_disponibilidade" },
          procedimento: { type: "string", description: "Nome do procedimento/consulta" },
          observacoes: { type: "string" },
        },
        required: ["medico_id", "inicio", "fim", "procedimento"],
      },
    },
  },
] as const;

/** Conjunto completo (consulta + agendamento) usado quando a flag está ligada. */
export const FERRAMENTAS_NINA_PACIENTE = [
  ...FERRAMENTAS_NINA_CONSULTA,
  ...FERRAMENTAS_NINA_AGENDAMENTO,
] as const;



/* -------------------------------------------------------------- schemas Zod */

const zEspecialidade = z.object({ especialidade: z.string().max(120).optional() });
// `medico_id` aceita o UUID operacional de `buscar_medicos` OU o nome dito pelo
// paciente. Exigir UUID fazia o Zod recusar a chamada ("Parâmetros
// inválidos"), e o modelo traduzia isso para "houve um problema ao consultar a
// agenda" — erro técnico que na verdade era só um nome no lugar do id.
const zVerificarHorario = z.object({
  medico_id: z.string().trim().min(2).max(160),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().regex(/^\d{1,2}:\d{2}$/),
});
const zProximaVaga = z.object({
  medico_id: z.string().trim().min(2).max(160).optional(),
  especialidade: z.string().max(120).optional(),
  a_partir_de: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  periodo: z.enum(["manha", "tarde", "noite"]).optional(),
  /** 0=domingo … 6=sábado. "a próxima quinta" vira dia_semana = 4. */
  dia_semana: z.coerce.number().int().min(0).max(6).optional(),
  dias: z.coerce.number().int().min(1).max(60).optional(),
});
const zBuscarMedicos = zEspecialidade.extend({ nome: z.string().max(120).optional() });
const zProcedimentos = z.object({ termo: z.string().trim().min(2).max(120) });
const zDisponibilidade = z.object({
  especialidade: z.string().max(120).optional(),
  medico_id: z.string().trim().min(2).max(160).optional(),
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  periodo: z.enum(["manha", "tarde", "noite"]).optional(),
  dias: z.coerce.number().int().min(1).max(60).optional(),
});
const zIdentificar = z.object({
  cpf: z.string().max(20).optional(),
  nome: z.string().trim().min(2).max(200).optional(),
  telefone: z.string().max(30).optional(),
  // Aceita AAAA-MM-DD e também DD/MM/AAAA — o paciente escreve como fala e o
  // modelo às vezes repassa igual. Normaliza para ISO antes de consultar.
  data_nascimento: z
    .string()
    .trim()
    .transform((v) => {
      const br = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
      if (!br) return v;
      return `${br[3]}-${br[2]!.padStart(2, "0")}-${br[1]!.padStart(2, "0")}`;
    })
    .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

const zAgendar = z.object({
  // Aceita id ou nome; a resolução acontece no executor (mesma regra das
  // ferramentas de consulta). A gravação continua exigindo um id real.
  medico_id: z.string().trim().min(2).max(160),
  inicio: z.string().min(10),
  fim: z.string().min(10),
  procedimento: z.string().trim().min(2).max(200),
  observacoes: z.string().max(500).optional(),
});

/* ------------------------------------------------------------------ executor */

async function orientarSemPreAgendamento(ctx: CtxNinaPaciente, profissional: string): Promise<ResultadoFerramenta> {
  if (ctx.estado?.appointment.confirmation?.aceita)
    return falha("MODALIDADE_ALTERADA", "A modalidade mudou após o aceite. A equipe precisa conferir o atendimento.");
  const [{ carregarTemplatesPublicados }, { textoDaChave }] = await Promise.all([
    import("./resposta/templates.server"), import("./resposta/templates"),
  ]);
  const publicados = await carregarTemplatesPublicados({ clinicaId: ctx.clinicaId });
  const texto = textoDaChave("fluxo.agendamento.sem_pre_agendamento", {
    profissional, unidade: ctx.nomeUnidade?.trim() || "nossa clínica",
  }, publicados.textos).texto;
  if (ctx.estado && !ctx.estado.appointment.appointment_id) {
    limparEscolhaAgendamento(ctx.estado);
    ctx.estado.appointment.slot_options = null;
    ctx.estado.flow.stage = "INFORMATION_RESPONSE";
  }
  return { ok: true, modalidade_atendimento: "chegada_sem_pre_agendamento",
    consulta_realizada: false, sem_agendamento: true, orientacao_atendimento: texto,
    instrucao: "Não selecione horário, não colete cadastro para reserva e não agende. Não peça 15 minutos de antecedência. Oriente o comparecimento nos dias e períodos publicados desse profissional." };
}

const modalidadePendente = () => falha("MODALIDADE_NAO_DEFINIDA",
  "A modalidade precisa ser conferida pela equipe. Ordem de chegada sem indicação de pré-agendamento não permite presumir uma reserva.");

/**
 * Executor público. Toda chamada — inclusive as que já auditam por dentro —
 * passa por aqui, e o painel de Homologação lê exatamente esse rastro
 * (`audit_log`, ação `NINA_TOOL`) para mostrar "qual ferramenta a Nina usou,
 * com quais parâmetros e o que o backend respondeu".
 */
export async function executarFerramentaPaciente(
  ctx: CtxNinaPaciente,
  nome: string,
  argsRaw: unknown,
): Promise<ResultadoFerramenta> {
  // O gate de cadastro também chama este executor diretamente, sem Tool Broker.
  // Depois deste ponto uma falha não autoriza repetir a preparação do turno.
  await processamentoWatchdogAtual()?.checkpoint("generating");
  const inicio = Date.now();
  const resultado = await executarFerramentaInterna(ctx, nome, argsRaw);
  void auditar(
    ctx,
    "tool",
    {
      ferramenta: nome,
      argumentos: nome === "identificar_paciente" ? "[dados pessoais omitidos]" : argsRaw ?? null,
      ms: Date.now() - inicio,
      resposta: JSON.parse(JSON.stringify(resultado)),
    },
    { ok: resultado.ok, erro: resultado.ok ? undefined : resultado.erro },
  );
  return resultado;
}

async function executarFerramentaInterna(
  ctx: CtxNinaPaciente,
  nome: string,
  argsRaw: unknown,
): Promise<ResultadoFerramenta> {
  let args: Record<string, unknown> = {};
  if (typeof argsRaw === "string" && argsRaw.trim()) {
    try {
      args = JSON.parse(argsRaw);
    } catch {
      return falha("VALIDATION_ERROR", "Argumentos inválidos.");
    }
  } else if (argsRaw && typeof argsRaw === "object") {
    args = argsRaw as Record<string, unknown>;
  }

  // Defesa: mesmo que o modelo invente uma chamada, sem a flag da clínica
  // nenhuma ferramenta que grava ou expõe paciente executa.
  const SOMENTE_COM_FLAG = new Set(["selecionar_horario", "consultar_cadastro_paciente", "identificar_paciente", "meus_agendamentos", "agendar"]);
  if (SOMENTE_COM_FLAG.has(nome) && ctx.podeAgendar === false)
    return falha("PERMISSION_DENIED", "Agendamento pela assistente não está ativo nesta unidade.");

  if (ctx.esclarecimentoCatalogo && (FERRAMENTAS_DE_VAGAS.has(nome) || ["selecionar_horario", "agendar"].includes(nome)))
    return { ok: true, consulta_realizada: false, precisa_esclarecer: true,
      esclarecimento: ctx.esclarecimentoCatalogo,
      instrucao: `Antes de consultar ou reservar, aguarde a resposta do paciente: ${ctx.esclarecimentoCatalogo.pergunta}` };

  try {
    // A Nina interpreta a intenção com o histórico e escolhe a ferramenta.
    // O executor valida fatos e permissões; não reinterpreta a fala por regex.
    // Consultar disponibilidade nunca equivale a consentir uma reserva.
    async function conferirRegraCatalogo(procedimentoEscolhido?: string | null) {
      const selecao = ctx.consultaAgenda?.selecaoRevalidada;
      const medico = String(args.medico_id ?? ctx.estado?.appointment.doctor_id ?? selecao?.medicoId ?? selecao?.medicoNome ?? "");
      const procedimento = String(procedimentoEscolhido ?? args.procedimento ?? ctx.estado?.appointment.procedure ?? selecao?.modalidade?.procedimento ?? "");
      if ((medico || procedimento) && await atendimentoExigeHumano({ clinicaId: ctx.clinicaId,
        medico, procedimento, referencias: selecao?.raizesFonte.map(r => r.registro) })) {
        return falha("PROFISSIONAL_SFP", MOTIVO_SFP, {
          codigo: "PROFISSIONAL_SFP", consulta_realizada: false, atendimento_humano_obrigatorio: true,
        });
      }
      return null;
    }
    if (["consultar_cadastro_paciente", "identificar_paciente"].includes(nome)) {
      const bloqueio = await conferirRegraCatalogo();
      if (bloqueio) return bloqueio;
    }
    let medicoAgenda: { ok: true; id: string; nome: string } | null = null;
    if (FERRAMENTAS_DE_VAGAS.has(nome) && nome !== "consultar_primeiro_disponivel") {
      const termo = typeof args.medico_id === "string" ? args.medico_id.trim() : "";
      if (!termo) return consultaAgendaPendente("MEDICO_NAO_DEFINIDO");
      const bloqueio = await conferirRegraCatalogo();
      if (bloqueio) return bloqueio;
      const resolvido = await resolverMedico(ctx.clinicaId, termo);
      if (!resolvido.ok) return {
        ...consultaAgendaPendente("MEDICO_NAO_DEFINIDO"),
        opcoes: resolvido.opcoes.map(o => ({ medico_id: o.id, nome: o.nome })),
      };
      medicoAgenda = resolvido;
      args.medico_id = resolvido.id;
      const modalidade = await modalidadePublicadaDoMedico(ctx.clinicaId, resolvido.id);
      if (modalidade === "chegada_sem_pre_agendamento") return orientarSemPreAgendamento(ctx, resolvido.nome);
      if (modalidade === "nao_definida") return modalidadePendente();
    }
    switch (nome) {
      case "consultar_primeiro_disponivel": {
        const p = zProximaVaga.omit({ medico_id: true, especialidade: true }).extend({
          tipo: z.enum(["consulta", "procedimento"]), atendimento: z.string().trim().min(3).max(160),
          data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        }).parse(args);
        const { candidatosPrimeiraVaga } = await import("./primeiro-disponivel-catalogo.server");
        const candidatos = await candidatosPrimeiraVaga(ctx.clinicaId, p.tipo, p.atendimento);
        if (!candidatos.length) return falha("PROCEDURE_NOT_FOUND",
          "Não encontrei esse atendimento publicado. Encaminhe para a equipe humana.", { encaminhar_para_humano: true });
        // SFP, vínculo ausente e consulta com erro não equivalem a agenda vazia.
        for (const c of candidatos) {
          if (await atendimentoExigeHumano({ clinicaId: ctx.clinicaId, medico: c.medicoId ?? c.medicoNome,
            procedimento: c.registro.procedimento, referencias: c.registro.id ? [c.registro.id] : [] }))
            return falha("PROFISSIONAL_SFP", MOTIVO_SFP, { atendimento_humano_obrigatorio: true });
          if (!c.medicoId) return falha("DOCTOR_NOT_FOUND",
            "Não foi possível resolver todos os vínculos com a agenda. A equipe deve conferir antes de afirmar qual é o primeiro disponível.",
            { encaminhar_para_humano: true, comparacao_completa: false });
        }
        const porMedico = new Map(candidatos.map(c => [c.medicoId!, c]));
        if (porMedico.size !== candidatos.length) return falha("ACTION_NOT_AUTHORIZED",
          "Há mais de um registro publicado para o mesmo profissional e atendimento. A equipe deve conferir os dados antes da comparação.",
          { encaminhar_para_humano: true, comparacao_completa: false });
        const primeiras: SlotNina[] = [];
        const semAgendamento: Record<string, unknown>[] = [];
        const consultados: Record<string, unknown>[] = [];
        for (const [medicoId, c] of porMedico) {
          await processamentoWatchdogAtual()?.checkpoint("generating");
          const modo = await modalidadePublicadaDoMedico(ctx.clinicaId, medicoId);
          if (modo === "chegada_sem_pre_agendamento") {
            semAgendamento.push({ medico: c.medicoNome, registro: c.registro,
              modalidade_atendimento: modo, orientacao: orientacaoModalidade(modo), sem_agendamento: true });
            continue;
          }
          if (modo === "nao_definida") return modalidadePendente();
          let vagas: SlotNina[];
          try {
            vagas = await consultarDisponibilidadeCore({ clinicaId: ctx.clinicaId, medicoId,
              data: p.data, dias: p.dias ?? 60, periodo: p.periodo, completa: true });
            vagas = vagas.filter(s => (!p.a_partir_de || dataISODoSlot(s.inicio) >= p.a_partir_de) &&
              (p.dia_semana === undefined || diaSemanaDe(dataISODoSlot(s.inicio)) === p.dia_semana))
              .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
            vagas = await enriquecerModalidades(ctx.clinicaId, vagas.slice(0, 1));
          } catch (e) { return falhaAgenda(e, nome); }
          if (vagas.some(s => !permiteReserva(s.modalidade))) return modalidadePendente();
          consultados.push({ medico_id: medicoId, catalogo_id: c.registro.id, encontrou_vaga: vagas.length > 0 });
          primeiras.push(...vagas);
        }
        primeiras.sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio) || a.medico_id.localeCompare(b.medico_id));
        await auditar(ctx, nome, { ...p, consultados, sem_pre_agendamento: semAgendamento.length }, { ok: true });
        const melhores = primeiras.filter(s => Date.parse(s.inicio) === Date.parse(primeiras[0]!.inicio));
        const pendencia = await guardarOpcoes(ctx, melhores, new Map([...porMedico].map(([id, c]) => [id, c.registro.procedimento!])));
        if (pendencia) return pendencia;
        if (!primeiras.length && semAgendamento.length && ctx.estado && !consentimentoDaEscolha(ctx.estado, ctx.clinicaId))
          ctx.estado.flow.stage = "INFORMATION_RESPONSE";
        if (!primeiras.length && !semAgendamento.length)
          return semVaga("NO_AVAILABILITY", "Nenhum profissional tem vaga no período consultado.", { consulta_realizada: true });
        const apresentar = (s: SlotNina) => ({ medico_id: s.medico_id, medico: porMedico.get(s.medico_id)!.medicoNome,
          atendimento: porMedico.get(s.medico_id)!.registro.procedimento, data: s.data, hora: s.hora,
          inicio: s.inicio, fim: s.fim, modalidade_atendimento: s.modalidade,
          orientacao: orientacaoModalidade(s.modalidade!), registro: porMedico.get(s.medico_id)!.registro });
        return { ok: true, consulta_realizada: consultados.length > 0,
          criterio: "menor data e horário entre os profissionais com agendamento", dias_consultados: p.dias ?? 60,
          proxima: melhores[0] ? apresentar(melhores[0]) : null,
          empatados: melhores.slice(1).map(apresentar), sem_pre_agendamento: semAgendamento,
          instrucao: "Apresente médico, atendimento, dia/data, horário real, modalidade, orientações e todas as formas de pagamento do registro desse médico. Em empate, mostre as opções e peça a escolha. Não confirme reserva: a vaga ainda depende da escolha e do resumo final aceito. Se há atendimento sem pré-agendamento, informe separadamente os dias/períodos publicados e que basta comparecer; não prometa horário individual nem diga que a vaga agendada é mais cedo que o atendimento sem agendamento." };
      }
      case "selecionar_horario": {
        const p = z.object({ medico_id: z.string(), inicio: z.string(), fim: z.string() }).parse(args);
        const estado = ctx.estado;
        const existente = confirmacaoDaEscolha(estado, ctx.clinicaId);
        if (existente && !estado?.appointment.appointment_id && existente.vaga.medico_id === p.medico_id &&
          Date.parse(existente.vaga.inicio) === Date.parse(p.inicio) && Date.parse(existente.vaga.fim) === Date.parse(p.fim))
          return { ok: true, selecao_preservada: true, confirmacao_recebida: existente.aceita,
            instrucao: existente.aceita ? "O paciente já confirmou esta vaga. Continue com os dados faltantes e a gravação autorizada; não peça confirmação novamente."
              : "Esta vaga já tem um resumo de confirmação. Não reinicie a escolha nem repita o resumo; esclareça somente a dúvida atual do paciente." };
        if (!estado || estado.appointment.appointment_id || estado.appointment.confirmation?.aceita)
          return falha("ACTION_NOT_AUTHORIZED", "O horário já confirmado não pode ser alterado por esta operação.");
        const opcoes = vagasDaSessao(estado, ctx.clinicaId);
        const vaga = opcoes.find((v) => v.medico_id === p.medico_id && v.inicio === p.inicio && v.fim === p.fim);
        if (!vaga?.procedimento)
          return falha("ACTION_NOT_AUTHORIZED", "Escolha uma vaga e um procedimento consultados na agenda desta sessão.");
        const bloqueio = await conferirRegraCatalogo(vaga.procedimento);
        if (bloqueio) return bloqueio;
        const publicada = await modalidadePublicadaDoMedico(ctx.clinicaId, vaga.medico_id);
        if (publicada === "chegada_sem_pre_agendamento") return orientarSemPreAgendamento(ctx, vaga.medico);
        if (publicada === "nao_definida") return modalidadePendente();
        const mensagem = ctx.consultaAgenda?.mensagemAtual ?? "";
        const escolha = lerEscolhaHorario(mensagem);
        if (escolha) {
          const compativeis = vagasDaEscolha(opcoes, escolha);
          if (compativeis.length !== 1 || compativeis[0] !== vaga)
            return falha("ACTION_NOT_AUTHORIZED", "Confirme a data e o profissional: a vaga solicitada não corresponde unicamente ao horário escrito pelo paciente.");
        } else if (!ctx.opcoesAgendamentoInicioTurno ||
          /^(?:sim(?:,?\s*por\s*favor)?|ok|isso(?:\s*mesmo)?|pode\s*(?:ser|marcar|agendar)|oi|ol[aá])[!.\s]*$/i.test(mensagem.trim()) ||
          /\b(?:quais|disponibilidade|valor|preço|preco)\b/i.test(mensagem)) {
          return falha("ACTION_NOT_AUTHORIZED", "Consultar opções ou dizer sim sem resumo não seleciona uma vaga. Aguarde a escolha do paciente.");
        }
        const vagasAtuais = await enriquecerModalidades(ctx.clinicaId, await consultarDisponibilidadeCore({
          clinicaId: ctx.clinicaId, medicoId: vaga.medico_id, data: vaga.data, dias: 90,
        }));
        // Uma tentativa de nova escolha invalida qualquer resumo anterior.
        limparEscolhaAgendamento(estado);
        const livre = vagasAtuais.find((s) => s.medico_id === vaga.medico_id &&
          Date.parse(s.inicio) === Date.parse(vaga.inicio) && Date.parse(s.fim) === Date.parse(vaga.fim));
        if (!livre) return falha("SLOT_UNAVAILABLE", "A vaga escolhida não está mais disponível.", { vaga_escolhida: true });
        if (!permiteReserva(livre.modalidade)) return modalidadePendente();
        if (livre.modalidade !== vaga.modalidade || livre.agenda !== vaga.agenda_id)
          return falha("MODALIDADE_ALTERADA", "A modalidade ou a agenda da vaga mudou. Encaminhe para a equipe conferir.");
        const { carregarTemplatesPublicados } = await import("./resposta/templates.server");
        const { textoDaChave } = await import("./resposta/templates");
        const publicados = await carregarTemplatesPublicados({ clinicaId: ctx.clinicaId });
        const resumo = textoDaChave(chaveResumoModalidade(vaga.modalidade), {
          profissional: vaga.medico, procedimento: vaga.procedimento,
          data: vaga.data.split("-").reverse().join("/"), horario: vaga.hora,
          unidade: ctx.nomeUnidade?.trim() || "nossa clínica",
        }, publicados.textos).texto;
        selecionarVagaValidada(estado, ctx.clinicaId, vaga, resumo);
        return { ok: true, resumo_confirmacao: resumo, vaga_escolhida: vaga,
          instrucao: "Entregue o resumo final ao paciente. Apenas o próximo aceite desse resumo permite gravar a vaga exata." };
      }
      case "consultar_base_conhecimento": {
        const p = z
          .object({
            termo: z.string().trim().min(2).max(200),
            objetivos: z.array(z.enum(OBJETIVOS_PESQUISA_CATALOGO)).min(1).max(7).optional(),
            // Opcional apenas para chamadores legados; o schema enviado ao modelo exige o campo.
            tipo_atendimento: z.enum(TIPOS_ATENDIMENTO_CATALOGO).optional(),
            medico: z.string().trim().max(160).optional(),
            dia: z.string().trim().max(40).optional(),
          })
          .parse(args);
        // FASE 3: mesma camada de retrieval usada pelo painel interno.
        const { searchKnowledgeBase } = await import("@/lib/nina/knowledge.server");
        const resultado = await searchKnowledgeBase({
          clinicaId: ctx.clinicaId,
          query: p.termo,
          tipo_atendimento: p.tipo_atendimento,
          medico: p.medico ?? null,
          dia: p.dia ?? null,
          canal: "whatsapp",
        });
        if (resultado.esclarecimento) ctx.esclarecimentoCatalogo = resultado.esclarecimento;
        // Consulta de leitura: `price` resume o primeiro resultado e pode ser
        // de outro serviço, profissional ou forma de pagamento. Não é o preço
        // do atendimento selecionado e não pode sobrescrever seu estado.
        return { ok: true, ...resultado,
          pedido_interpretado: { atendimento: p.termo,
            tipo_atendimento: resultado.tipo_atendimento ?? p.tipo_atendimento ?? "nao_identificado",
            objetivos: p.objetivos ?? ["informacoes_gerais"] } };

      }

      case "listar_especialidades": {
        // FONTE ÚNICA: catálogo publicado. Sem publicação = desconhecido.
        const { especialidadesPublicadas, SEM_CATALOGO_INSTRUCAO } = await import(
          "./catalogo-fonte.server"
        );
        const nomes = await especialidadesPublicadas(ctx.clinicaId);
        if (nomes.length === 0)
          return falha("PROCEDURE_NOT_FOUND", SEM_CATALOGO_INSTRUCAO, {
            fonte: "catalogo_publicado",
            encaminhar_para_humano: true,
          });
        return { ok: true, fonte: "catalogo_publicado", especialidades: nomes };
      }

      case "buscar_medicos": {
        const p = zBuscarMedicos.parse(args);
        const { searchKnowledgeBase } = await import("./knowledge.server");
        const { SEM_CATALOGO_INSTRUCAO } = await import("./catalogo-fonte.server");
        const r = await searchKnowledgeBase({
          clinicaId: ctx.clinicaId,
          query: [p.especialidade, p.nome].filter(Boolean).join(" ") || "consulta profissional",
          tipo_atendimento: "consulta",
          medico: p.nome ?? null,
          canal: ctx.origem,
        });
        if (r.esclarecimento) {
          ctx.esclarecimentoCatalogo = r.esclarecimento;
          return { ok: true, ...r };
        }
        if (!r.found || r.records.length === 0)
          return falha("DOCTOR_NOT_FOUND", SEM_CATALOGO_INSTRUCAO, {
            fonte: "catalogo_publicado",
            knowledge_status: r.knowledge_status,
            encaminhar_para_humano: true,
          });
        const vinculos = await vincularProfissionaisCatalogo(ctx.clinicaId, r.records);
        const porCatalogo = new Map(vinculos.map((v) => [v.catalogo_id, v]));
        return {
          ok: true,
          fonte: "catalogo_publicado",
          knowledge_status: r.knowledge_status,
          profissionais: r.doctors,
          vinculos_agenda: vinculos,
          dias: r.days,
          observacoes: r.notes,
          registros: r.records.map((registro) => {
            const vinculo = registro.id ? porCatalogo.get(registro.id) : undefined;
            return vinculo
              ? { ...registro, catalogo_id: vinculo.catalogo_id, medico_id: vinculo.medico_id }
              : registro;
          }),
          trace: r.trace,
          instrucao: r.instrucao,
        };
      }

      case "buscar_procedimentos": {
        const p = zProcedimentos.parse(args);
        const { searchKnowledgeBase } = await import("./knowledge.server");
        const { SEM_CATALOGO_INSTRUCAO } = await import("./catalogo-fonte.server");
        const r = await searchKnowledgeBase({
          clinicaId: ctx.clinicaId,
          query: p.termo,
          tipo_atendimento: "exame_procedimento",
          canal: ctx.origem,
        });
        if (r.esclarecimento) {
          ctx.esclarecimentoCatalogo = r.esclarecimento;
          return { ok: true, ...r };
        }
        if (!r.found || r.records.length === 0)
          return falha("PROCEDURE_NOT_FOUND", SEM_CATALOGO_INSTRUCAO, {
            fonte: "catalogo_publicado",
            knowledge_status: r.knowledge_status,
            encaminhar_para_humano: true,
          });
        return {
          ok: true,
          fonte: "catalogo_publicado",
          knowledge_status: r.knowledge_status,
          procedimento: r.procedure,
          preco: r.price,
          observacoes: r.notes,
          registros: r.records,
          trace: r.trace,
          instrucao: r.instrucao,
        };
      }

      case "dados_da_clinica": {
        const grupo = consultarDadosClinicasGrupo(ctx.clinicaId, args.clinica);
        if (grupo) return grupo;
        if (args.clinica) return { ok: true, encontrado: false, instrucao: "Não há diretório de outras clínicas confirmado para este atendimento. Peça confirmação à equipe; não forneça os dados da clínica atual como se fossem da unidade mencionada." };
        const { data } = await supabaseAdmin
          .from("clinicas")
          .select("nome, endereco, cidade, estado, cep, telefone, email")
          .eq("id", ctx.clinicaId)
          .maybeSingle();
        const c = (data ?? {}) as Record<string, unknown>;
        return {
          ok: true,
          clinica: {
            nome: c["nome"] ?? null,
            endereco:
              [c["endereco"], [c["cidade"], c["estado"]].filter(Boolean).join("/"), c["cep"]]
                .filter((x) => x && String(x).trim())
                .join(" - ") || null,
            telefone: c["telefone"] ?? null,
            email: c["email"] ?? null,
          },
        };
      }

      case "horario_funcionamento": {
        const grupo = selecionarClinicasGrupo(ctx.clinicaId, args.clinica);
        if (grupo) {
          if (!grupo.length) return consultarDadosClinicasGrupo(ctx.clinicaId, args.clinica)!;
          // Só calendário público das unidades fixas do grupo; nenhum dado de paciente.
          const { carregarCalendariosPublicadosCache } = await import("./classificador-periodo.functions");
          const calendarios = (await Promise.all(grupo.map((c) => carregarCalendariosPublicadosCache(supabaseAdmin, c.id)))).flat();
          return consultarHorariosClinicasGrupo(ctx.clinicaId, args.clinica, args.data, calendarios, agoraNaClinica(HORA_LOCAL).iso)!;
        }
        if (args.clinica) return { ok: true, encontrado: false, instrucao: "Horário da clínica mencionada não confirmado para este atendimento. Confirme com a equipe; não presuma abertura ou fechamento." };
        // Fonte única: calendário publicado na Base de Conhecimentos (Fases 1-3).
        const { carregarCalendariosPublicadosCache } = await import("./classificador-periodo.functions");
        const { horarioOficialDoDia, semanaOficial, nomeDia } = await import("./horario-oficial");
        const calendarios = await carregarCalendariosPublicadosCache(supabaseAdmin, ctx.clinicaId);
        const hoje = agoraNaClinica(HORA_LOCAL).iso;
        const alvo = typeof (args as any)?.data === "string" && (args as any).data ? String((args as any).data) : hoje;
        // Unidade histórica não é inferida: sem unidade no contexto, só calendário geral.
        const escopo = { clinica_id: ctx.clinicaId, unidade_id: null };
        const dia = horarioOficialDoDia({ data: alvo, escopo, calendarios });
        const semana = semanaOficial({ referencia: alvo, escopo, calendarios });
        return {
          ok: true,
          data: alvo,
          fuso: dia.fuso,
          dia: {
            encontrado: dia.encontrado,
            fechado: dia.fechado,
            faixas: dia.faixas,
            excecao: dia.excecao,
            motivo: dia.motivo,
          },
          semana: semana.encontrado
            ? semana.dias.map((d) => ({
                dia: nomeDia(d.dia_semana),
                fechado: d.fechado,
                faixas: d.faixas,
              }))
            : [],
          versao_calendario: dia.versao,
          instrucao: dia.instrucao,
        };
      }


      case "consultar_disponibilidade": {
        const p = zDisponibilidade.parse(args);
        let especialidadeId: string | null = null;
        if (p.especialidade) {
          const lista = await listarEspecialidades(ctx.clinicaId);
          const esp = acharEspecialidade(p.especialidade, lista);
          if (!esp)
            return semVaga(
              "ESPECIALIDADE_NAO_ATENDIDA",
              `A clínica não atende "${p.especialidade}". Atende: ${lista.map((e) => e.nome).join(", ")}`,
            );
          especialidadeId = esp.id;
        }
        let medicoId: string | null = null;
        let medicoNome: string | null = null;
        if (p.medico_id) {
          const r = medicoAgenda ?? await resolverMedico(ctx.clinicaId, p.medico_id);
          if (!r.ok)
            return falha(
              "DOCTOR_NOT_FOUND",
              r.opcoes.length > 0
                ? "Há mais de um profissional com esse nome. Pergunte ao paciente qual deles."
                : "Não encontrei esse profissional nesta unidade.",
              { opcoes: r.opcoes.map((o) => ({ medico_id: o.id, nome: o.nome })) },
            );
          medicoId = r.id;
          medicoNome = r.nome;
        }
        let slots: SlotNina[];
        try {
          slots = await consultarDisponibilidadeCore({
            clinicaId: ctx.clinicaId,
            especialidadeId,
            medicoId,
            dias: p.dias ?? (p.data ? 30 : 14),
            periodo: p.periodo ?? null,
            data: p.data ?? null,
          });
          slots = await enriquecerModalidades(ctx.clinicaId, slots);
          if (slots.some(s => !permiteReserva(s.modalidade))) return modalidadePendente();
        } catch (e) {
          return falhaAgenda(e, "consultar_disponibilidade");
        }
        logAgenda("consultar_disponibilidade", {
          medico: medicoNome,
          medico_id: medicoId,
          especialidade_id: especialidadeId,
          data: p.data ?? null,
          periodo: p.periodo ?? null,
          slots: slots.length,
        });
        await auditar(ctx, "consultar_disponibilidade", { ...p, slots_encontrados: slots.length }, {
          ok: true,
        });
        const pendencia = await guardarOpcoes(ctx, slots.slice(0, 12));
        if (pendencia) return pendencia;
        if (slots.length === 0) {
          // Diferencia "não atende nesse dia" de "atende, mas está cheio".
          if (medicoId && p.data) {
            const { atende } = await medicoAtendeNoDia(ctx.clinicaId, medicoId, p.data);
            const nome = medicoNome ?? "O profissional";
            const proximos = await enriquecerModalidades(ctx.clinicaId, await consultarDisponibilidadeCore({
              clinicaId: ctx.clinicaId,
              medicoId,
              dias: 60,
            }));
            if (proximos.some(s => !permiteReserva(s.modalidade))) return modalidadePendente();
            const pendencia = await guardarOpcoes(ctx, proximos.slice(0, 3));
            if (pendencia) return pendencia;
            const sugestoes = proximos.slice(0, 3).map((s) => ({ data: s.data, hora: s.hora,
              medico_id: s.medico_id, inicio: s.inicio, fim: s.fim,
              modalidade_atendimento: s.modalidade, orientacao: orientacaoModalidade(s.modalidade!) }));
            return semVaga(
              atende === null ? "NO_AVAILABILITY" : atende ? "AGENDA_CHEIA" : "NAO_ATENDE_NO_DIA",
              atende
                ? `${nome} atende nesse dia, mas a agenda está sem horários disponíveis.`
                : `Não encontrei horários livres de ${nome} nos critérios consultados.`,
              { motivo: atende === null ? "NO_AVAILABILITY" : atende ? "AGENDA_CHEIA" : "NAO_ATENDE_NO_DIA", proximos: sugestoes },
            );
          }
          return semVaga("NO_AVAILABILITY", "Nenhum horário livre com esses critérios.");
        }
        return {

          ok: true,
          horarios: slots.slice(0, 12).map((s) => ({
            medico_id: s.medico_id,
            medico: s.medico_nome,
            especialidade: s.especialidade,
            data: s.data,
            hora: s.hora,
            inicio: s.inicio,
            fim: s.fim,
            modalidade_atendimento: s.modalidade,
            orientacao: orientacaoModalidade(s.modalidade ?? "nao_definida"),
          })),
          total: slots.length,
          // Estes são os ÚNICOS horários realmente livres. A escala da planilha
          // (ex.: 09h-18h) não é vaga.
          instrucao:
            "Ao apresentar estes horários, inclua também o valor oficial da consulta vindo de consultar_base_conhecimento, com a forma de pagamento e a condição correspondentes (se ainda não consultou, consulte antes de responder). Se não houver valor cadastrado, não estime nem cite preço. Mostre de 3 a 5 opções, agrupadas por médico, com data, horário e unidade.",
        };

      }

      case "verificar_horario": {
        const p = zVerificarHorario.parse(args);
        const hora = p.hora.padStart(5, "0");
        const r = medicoAgenda ?? await resolverMedico(ctx.clinicaId, p.medico_id);
        if (!r.ok)
          return falha(
            "DOCTOR_NOT_FOUND",
            r.opcoes.length > 0
              ? "Há mais de um profissional com esse nome. Pergunte ao paciente qual deles."
              : "Não encontrei esse profissional nesta unidade.",
            { opcoes: r.opcoes.map((o) => ({ medico_id: o.id, nome: o.nome })) },
          );
        const nome = r.nome;
        let doDia: SlotNina[];
        try {
          doDia = await consultarDisponibilidadeCore({
            clinicaId: ctx.clinicaId,
            medicoId: r.id,
            dias: 60,
            data: p.data,
          });
          doDia = await enriquecerModalidades(ctx.clinicaId, doDia);
          if (doDia.some(s => !permiteReserva(s.modalidade))) return modalidadePendente();
        } catch (e) {
          return falhaAgenda(e, "verificar_horario");
        }
        const alvo = doDia.find((s) => s.hora === hora);
        // A agenda real tem precedência. Escala ausente não significa que o
        // médico não atende e nem uma falha nessa leitura pode apagar uma vaga.
        const atende = doDia.length > 0 ? true : (await medicoAtendeNoDia(ctx.clinicaId, r.id, p.data)).atende;
        logAgenda("verificar_horario", {
          medico: nome,
          medico_id: r.id,
          data: p.data,
          hora,
          atende_no_dia: atende,
          slots: doDia.length,
          disponivel: Boolean(alvo),
        });
        await auditar(
          ctx,
          "verificar_horario",
          { ...p, atende_no_dia: atende, slots_encontrados: doDia.length },
          { ok: true },
        );
        const alternativas = doDia.filter(s => s.hora !== hora).slice(0, 4);
        const pendencia = await guardarOpcoes(ctx, [...(alvo ? [alvo] : []), ...alternativas]);
        if (pendencia) return pendencia;
        if (atende === false)
          return {
            ok: true,
            medico: nome,
            medico_id: r.id,
            data: p.data,
            hora,
            disponivel: false,
            motivo: "NAO_ATENDE_NO_DIA",
            alternativas: [],
          };
        return {

          ok: true,
          medico: nome,
          medico_id: r.id,
          data: p.data,
          hora,
          disponivel: Boolean(alvo),
          motivo: alvo ? null : doDia.length === 0 ? (atende === null ? "NO_AVAILABILITY" : "AGENDA_CHEIA") : "HORARIO_OCUPADO",
          // Só horário — nunca quem ocupa a vaga.
          ...(alvo ? { inicio: alvo.inicio, fim: alvo.fim, modalidade_atendimento: alvo.modalidade,
            orientacao: orientacaoModalidade(alvo.modalidade ?? "nao_definida") } : {}),
          alternativas: alternativas.map((s) => ({ hora: s.hora, inicio: s.inicio, fim: s.fim, modalidade_atendimento: s.modalidade,
              orientacao: orientacaoModalidade(s.modalidade ?? "nao_definida") })),
        };
      }

      case "proxima_vaga": {
        const p = zProximaVaga.parse(args);
        let especialidadeId: string | null = null;
        if (p.especialidade) {
          const lista = await listarEspecialidades(ctx.clinicaId);
          const esp = acharEspecialidade(p.especialidade, lista);
          if (!esp)
            return semVaga(
              "ESPECIALIDADE_NAO_ATENDIDA",
              `A clínica não atende "${p.especialidade}". Atende: ${lista.map((e) => e.nome).join(", ")}`,
            );
          especialidadeId = esp.id;
        }
        let medicoId: string | null = null;
        let medicoNome: string | null = null;
        if (p.medico_id) {
          const r = medicoAgenda ?? await resolverMedico(ctx.clinicaId, p.medico_id);
          if (!r.ok)
            return falha(
              "DOCTOR_NOT_FOUND",
              r.opcoes.length > 0
                ? "Há mais de um profissional com esse nome. Pergunte ao paciente qual deles."
                : "Não encontrei esse profissional nesta unidade.",
              { opcoes: r.opcoes.map((o) => ({ medico_id: o.id, nome: o.nome })) },
            );
          medicoId = r.id;
          medicoNome = r.nome;
        }
        let todos: SlotNina[];
        try {
          todos = await consultarDisponibilidadeCore({
            clinicaId: ctx.clinicaId,
            especialidadeId,
            medicoId,
            // Busca larga: "a próxima disponível" não pode depender de o
            // paciente informar cada data. 60 dias cobre médicos que atendem
            // só um dia da semana.
            dias: p.dias ?? 60,
            limite: 800,
            periodo: p.periodo ?? null,
          });
          todos = await enriquecerModalidades(ctx.clinicaId, todos);
          if (todos.some(s => !permiteReserva(s.modalidade))) return modalidadePendente();
        } catch (e) {
          return falhaAgenda(e, "proxima_vaga");
        }
        const desde = p.a_partir_de ?? null;
        let slots = desde ? todos.filter((s) => dataISODoSlot(s.inicio) >= desde) : todos;
        if (p.dia_semana !== undefined)
          slots = slots.filter((s) => diaSemanaDe(dataISODoSlot(s.inicio)) === p.dia_semana);
        logAgenda("proxima_vaga", {
          medico: medicoNome,
          medico_id: medicoId,
          especialidade_id: especialidadeId,
          a_partir_de: desde,
          dia_semana: p.dia_semana ?? null,
          periodo: p.periodo ?? null,
          slots: slots.length,
          primeira: slots[0] ? `${slots[0].data} ${slots[0].hora}` : null,
        });
        await auditar(
          ctx,
          "proxima_vaga",
          { ...p, slots_encontrados: slots.length },
          { ok: slots.length > 0 },
        );
        const pendencia = await guardarOpcoes(ctx, slots.slice(0, 4));
        if (pendencia) return pendencia;
        if (slots.length === 0)
          return semVaga(
            "NO_AVAILABILITY",
            `Não há vaga disponível nos próximos ${p.dias ?? 60} dias com esses critérios.`,
            { medico: medicoNome },
          );
        const primeira = slots[0]!;
        return {

          ok: true,
          proxima: {
            modalidade_atendimento: primeira.modalidade,
            orientacao: orientacaoModalidade(primeira.modalidade!),
            medico_id: primeira.medico_id,
            medico: primeira.medico_nome,
            especialidade: primeira.especialidade,
            data: primeira.data,
            hora: primeira.hora,
            inicio: primeira.inicio,
            fim: primeira.fim,
          },
          seguintes: slots.slice(1, 4).map((s) => ({
            modalidade_atendimento: s.modalidade,
            orientacao: orientacaoModalidade(s.modalidade!),
            medico: s.medico_nome,
            medico_id: s.medico_id,
            data: s.data,
            hora: s.hora,
            inicio: s.inicio,
            fim: s.fim,
          })),
        };
      }





      case "consultar_cadastro_paciente": {
        if (!cadastroAutorizado(ctx.estado)) return falha("ACTION_NOT_AUTHORIZED", "Defina o atendimento e aguarde a confirmação da vaga antes de consultar o cadastro.");
        const cadastro = await consultarCadastroConfirmado(ctx);
        return { ok: true, cadastro: cadastro.confirmado ? "confirmado" : "a_identificar",
          campos_faltantes: cadastro.camposFaltantes };
      }

      case "identificar_paciente": {
        if (!cadastroAutorizado(ctx.estado)) return falha("ACTION_NOT_AUTHORIZED", "Defina o atendimento e aguarde a confirmação da vaga antes de cadastrar.");
        const entrada = zIdentificar.parse(args);
        const cadastro = await consultarCadastroConfirmado(ctx);
        const p = cadastroMinimoSchema.safeParse({
          nome: cadastro.dados.nome || entrada.nome,
          data_nascimento: cadastro.dados.data_nascimento || entrada.data_nascimento,
          telefone: cadastro.dados.telefone || entrada.telefone,
        });
        if (!p.success) return falha("PATIENT_DATA_REQUIRED", "Ainda faltam dados obrigatórios válidos.", {
          campos_faltantes: [...new Set(p.error.issues.map(i => String(i.path[0])))],
        });
        const dados = p.data;
        const cpfInformado = somenteDigitos(entrada.cpf ?? "");
        const cpf = isCPFValido(cpfInformado) ? cpfInformado : null;

        // HOMOLOGAÇÃO: jamais tocar em cadastro real de paciente. A identificação
        // é amarrada a um paciente SINTÉTICO exclusivo do lead de teste — nenhum
        // CPF real é gravado, consultado ou vinculado.
        if (ctx.teste || ctx.origem === "homologacao") {
          const sintetico = await pacienteSinteticoDoLead(ctx, dados.nome);
          if (!sintetico) {
            await auditar(ctx, "identificar_paciente", { cpf: "***", teste: true }, {
              ok: false,
              erro: "TEST_PATIENT_UNAVAILABLE",
            });
            return falha(
              "INTERNAL_ERROR",
              "Não consegui concluir a identificação no ambiente de homologação.",
            );
          }
          ctx.pacienteId = sintetico.id;
          ctx.pacienteNome = sintetico.nome;
          mutarEstado(ctx, {
            patient: {
              id: sintetico.id,
              first_name: sintetico.nome.split(" ")[0] ?? null,
              identified: true,
              validated: true,
            },
            stage: "CHOOSING_SLOT",
          });
          if (ctx.conversaId) {
            await supabaseAdmin
              .from("atend_conversas")
              .update({ contato_paciente_id: sintetico.id, identidade_confirmada: true })
              .eq("id", ctx.conversaId);
          }
          await auditar(ctx, "identificar_paciente", { cpf: "***", teste: true }, {
            ok: true,
            id: sintetico.id,
          });
          return {
            ok: true,
            paciente: { nome: sintetico.nome.split(" ")[0], cadastro: "teste" },
          };
        }

        const { data, error } = await supabaseAdmin.rpc("nina_resolver_cadastro", {
          _clinica_id: ctx.clinicaId,
          _conversa_id: ctx.conversaId,
          _cpf: cpf,
          _nome: dados.nome,
          _data_nascimento: dados.data_nascimento,
          _telefone: dados.telefone,
        } as never);
        if (error) {
          await auditar(ctx, "identificar_paciente", { cpf: "***" }, {
            ok: false,
            erro: "INTERNAL_ERROR",
          });
          return falha("INTERNAL_ERROR", "Não consegui concluir a identificação agora.");
        }
        const r = (data ?? {}) as { ok?: boolean; paciente_id?: string; criado?: boolean; erro?: string };
        if (!r.ok || !r.paciente_id) {
          await auditar(ctx, "identificar_paciente", { cpf: "***" }, {
            ok: false,
            erro: "PATIENT_DATA_MISMATCH",
          });
          return falha(
            r.erro === "PATIENT_AMBIGUOUS" ? "PATIENT_AMBIGUOUS" : "PATIENT_DATA_MISMATCH",
            "Não foi possível vincular o cadastro com segurança. A equipe precisa conferir os dados; não foi criado outro cadastro.",
          );
        }
        ctx.pacienteId = r.paciente_id;
        ctx.pacienteNome = dados.nome;
        // Estado estruturado: a partir daqui, esta conversa tem paciente
        // identificado e validado — nada de pedir CPF/nome/nascimento de novo.
        mutarEstado(ctx, {
          patient: {
            id: r.paciente_id,
            first_name: dados.nome.split(" ")[0] ?? null,
            identified: true,
            validated: true,
          },
          stage: "CHOOSING_SLOT",
        });
        if (ctx.conversaId) {
          await supabaseAdmin
            .from("atend_conversas")
            .update({ contato_paciente_id: r.paciente_id, identidade_confirmada: true })
            .eq("id", ctx.conversaId);
        }

        await auditar(ctx, "identificar_paciente", { cpf: "***", criado: r.criado }, {
          ok: true,
          id: r.paciente_id,
        });
        return {
          ok: true,
          paciente: { nome: dados.nome.split(" ")[0], cadastro: r.criado ? "novo" : "existente" },
        };
      }

      case "meus_agendamentos": {
        if (!ctx.pacienteId)
          return falha(
            "PATIENT_NOT_VERIFIED",
            "Preciso identificar o paciente antes (CPF, nome completo e data de nascimento).",
          );
        const { data } = await supabaseAdmin
          .from("agendamentos")
          .select("id, inicio, fim, procedimento, status, medico_id")
          .eq("clinica_id", ctx.clinicaId)
          .eq("paciente_id", ctx.pacienteId)
          .gte("inicio", new Date().toISOString())
          .not("status", "in", "(cancelado,faltou)")
          .order("inicio")
          .limit(10);
        const linhas = (data ?? []) as Array<Record<string, unknown>>;
        if (linhas.length === 0) return { ok: true, agendamentos: [] };
        const medIds = [
          ...new Set(linhas.map((l) => l["medico_id"]).filter(Boolean) as string[]),
        ];
        const nomeMedico = new Map<string, string>();
        if (medIds.length > 0) {
          const { data: meds } = await supabaseAdmin
            .from("medicos")
            .select("id, nome")
            .in("id", medIds);
          for (const m of (meds ?? []) as Array<{ id: string; nome: string }>)
            nomeMedico.set(m.id, m.nome);
        }
        return {
          ok: true,
          agendamentos: linhas.map((l) => ({
            data: formatarData(String(l["inicio"])),
            hora: formatarHora(String(l["inicio"])),
            profissional: nomeMedico.get(String(l["medico_id"])) ?? null,
            procedimento: l["procedimento"] ?? null,
            status: l["status"],
          })),
        };
      }

      case "agendar": {
        const p = zAgendar.parse(args);
        if (!ctx.pacienteId || !ctx.pacienteNome)
          return falha(
            "PATIENT_NOT_VERIFIED",
            "Preciso identificar o paciente antes de marcar (CPF, nome completo e data de nascimento).",
          );

        const confirmacao = consentimentoDaEscolha(ctx.estado, ctx.clinicaId);
        const ofertaCorrente = confirmacao?.vaga;
        const consentimentoExplicito = Boolean(confirmacao);
        // Uma chamada do modelo não prova consentimento. Sem a oferta aceita
        // no estado do servidor, nem idempotência nem vagas podem ler a agenda.
        if (!consentimentoExplicito)
          return falha(
            "ACTION_NOT_AUTHORIZED",
            "Aguarde a confirmação do paciente para o médico e horário oferecidos.",
            {
              motivos: [ctx.estado?.appointment.confirmation?.aceita ? "CONSENTIMENTO_DE_OUTRO_SLOT" : "CONSENTIMENTO_AUSENTE"],
              consulta_realizada: false,
              aguardando_paciente: true,
            },
          );

        const bloqueio = await conferirRegraCatalogo();
        if (bloqueio) return bloqueio;
        const rMed = await resolverMedico(ctx.clinicaId, p.medico_id);
        if (!rMed.ok)
          return falha("DOCTOR_NOT_FOUND", "Não encontrei esse profissional nesta unidade.", {
            opcoes: rMed.opcoes.map((o) => ({ medico_id: o.id, nome: o.nome })),
          });
        const medicoIdReal = rMed.id;

        const autorizacaoBase: EntradaAutorizacao = {
          operacao: "criar_agendamento",
          clinicaId: ctx.clinicaId,
          paciente: {
            id: ctx.pacienteId,
            nome: ctx.pacienteNome,
            identificado: true,
            validado: true,
          },
          medicoId: medicoIdReal,
          procedimento: p.procedimento,
          intervalo: { inicio: p.inicio, fim: p.fim },
          consentimento: {
            confirmado: consentimentoExplicito,
            medicoId: ofertaCorrente?.medico_id,
            inicio: ofertaCorrente?.inicio,
            fim: ofertaCorrente?.fim,
          },
          idempotenciaBase: ctx.conversaId ?? ctx.telefone ?? null,
        };
        // O mesmo autorizador confere clínica, paciente, intervalo e oferta
        // aceita ANTES da leitura. Só a disponibilidade fica pendente até a
        // consulta real abaixo; nenhuma vaga fictícia é usada para autorizar.
        const previa = autorizarAcao(autorizacaoBase);
        const motivosPrevios = previa.autorizado
          ? []
          : previa.motivos.filter((m) => m !== "DISPONIBILIDADE_NAO_CONSULTADA");
        if (p.procedimento !== ofertaCorrente?.procedimento) motivosPrevios.push("CONSENTIMENTO_DE_OUTRO_SLOT");
        if (motivosPrevios.length)
          return falha(
            "ACTION_NOT_AUTHORIZED",
            "Os dados pedidos não correspondem à confirmação do paciente.",
            {
              motivos: motivosPrevios,
              consulta_realizada: false,
              aguardando_paciente: true,
            },
          );

        const origemMarca = origemAgendamentoNina(ctx);
        const modalidade = await modalidadeAtualDaAgenda(ctx.clinicaId, medicoIdReal, ofertaCorrente!.agenda_id);
        if (!permiteReserva(modalidade) || modalidade !== ofertaCorrente!.modalidade)
          return falha("MODALIDADE_ALTERADA", "A modalidade difere do resumo confirmado. A equipe precisa conferir antes de reservar.");
        const lerFicha = (id: string, inicio: string) => modalidade === "ficha"
          ? fichaDoAgendamento(ctx.clinicaId, medicoIdReal, inicio, id).catch(() => null)
          : Promise.resolve(null);
        const ehTeste = origemMarca === "nina_homologacao";
        // Chave de idempotência: mesma conversa + mesmo profissional + mesmo
        // horário nunca gera dois registros (índice único no banco).
        const idExterno = `${ctx.conversaId ?? ctx.telefone ?? "sem-conversa"}|${medicoIdReal}|${p.inicio}`;

        // --- FASE 3: idempotência ANTES de qualquer gravação. Consultar uma
        // reserva anterior não exige criar de novo: a prova sai da leitura do
        // registro existente, com os dados REAIS dele (nunca os do pedido).
        const { data: jaExiste } = await supabaseAdmin
          .from("agendamentos")
          .select("id, clinica_id, paciente_id, medico_id, inicio, fim, status, agenda_id")
          .eq("clinica_id", ctx.clinicaId)
          .eq("paciente_id", ctx.pacienteId)
          .eq("medico_id", medicoIdReal)
          .eq("inicio", p.inicio)
          .not("status", "in", "(cancelado)")
          .maybeSingle();
        if (jaExiste) {
          if ((jaExiste.agenda_id ?? null) !== ofertaCorrente!.agenda_id)
            return falha("APPOINTMENT_UNCERTAIN", "O registro existente pertence a outra agenda. A equipe precisa conferir antes de confirmar.");
          const anterior = verificarResultadoAgendamento(
            { clinicaId: ctx.clinicaId, pacienteId: ctx.pacienteId,
              medicoId: medicoIdReal, inicio: p.inicio, fim: p.fim },
            jaExiste as RegistroAgendamento,
            { jaExistia: true },
          );
          await auditar(ctx, "agendar", p, {
            ok: anterior.estado === "EXISTING",
            erro: anterior.estado === "EXISTING" ? "APPOINTMENT_ALREADY_EXISTS" : "APPOINTMENT_UNCERTAIN",
            id: anterior.agendamentoId ?? undefined,
          });
          if (anterior.estado !== "EXISTING")
            return falha(
              "APPOINTMENT_UNCERTAIN",
              "Não consegui confirmar com segurança o agendamento existente.",
              { divergencias: anterior.divergencias },
            );
          const reg = anterior.registro!;
          mutarEstado(ctx, {
            appointment: { appointment_id: anterior.agendamentoId },
            stage: "BOOKED",
          });
          return {
            ok: true,
            duplicado: true,
            modalidade_atendimento: modalidade,
            ficha_numero: await lerFicha(anterior.agendamentoId!, String(reg.inicio)),
            date: formatarData(String(reg.inicio)),
            time: formatarHora(String(reg.inicio)),
            medico: rMed.nome,
            estado_acao: "EXISTING",
            appointment_id: anterior.agendamentoId,
            agendamento_id: anterior.agendamentoId,
            status: reg.status ?? null,
            doctor_id: reg.medico_id ?? null,
            patient_id: reg.paciente_id ?? null,
            verificado_no_banco: true,
            // Mesmo atendimento: reaproveita o protocolo já gerado.
            protocolo: await protocoloDoAgendamento(ctx),
            agendamento: {
              // Dados da reserva EXISTENTE, não do pedido novo.
              data: formatarData(String(reg.inicio ?? p.inicio)),
              hora: formatarHora(String(reg.inicio ?? p.inicio)),
              procedimento: p.procedimento,
            },
          };
        }

        // --- FASE 3: autorização prévia da operação pretendida. Criar um
        // agendamento NOVO nunca exige appointment_id; exige paciente validado,
        // clínica, profissional, procedimento, intervalo, VAGA correspondente
        // (revalidada agora) e consentimento amarrado ao slot resumido.
        let vagasReais: SlotNina[];
        try {
          vagasReais = await consultarDisponibilidadeCore({
            clinicaId: ctx.clinicaId, medicoId: medicoIdReal,
            dias: 90, data: ofertaCorrente!.data,
          });
          vagasReais = await enriquecerModalidades(ctx.clinicaId, vagasReais);
        } catch (e) {
          return falhaAgenda(e, "agendar");
        }
        const auth = autorizarAcao({
          ...autorizacaoBase,
          disponibilidadeConsultada: true,
          vagasConsultadas: vagasReais.filter(s => s.modalidade === modalidade && s.agenda === ofertaCorrente!.agenda_id).map((s) => ({
            medicoId: s.medico_id,
            inicio: s.inicio,
            fim: s.fim,
          })),
        });
        if (!auth.autorizado) {
          const semVagaCorrespondente = auth.motivos.some(
            (m: CodigoRecusa) => m === "SEM_VAGA_DISPONIVEL" || m === "VAGA_NAO_CORRESPONDENTE",
          );
          logAgenda("agendar", {
            medico: rMed.nome,
            medico_id: medicoIdReal,
            inicio: p.inicio,
            confirmado: false,
            erro: semVagaCorrespondente ? "SLOT_UNAVAILABLE" : "ACTION_NOT_AUTHORIZED",
            detalhe: auth.motivos.join(","),
          });
          await auditar(ctx, "agendar", p, {
            ok: false,
            erro: semVagaCorrespondente ? "SLOT_UNAVAILABLE" : "ACTION_NOT_AUTHORIZED",
          });
          return falha(
            semVagaCorrespondente ? "SLOT_UNAVAILABLE" : "ACTION_NOT_AUTHORIZED",
            semVagaCorrespondente
              ? "Esse horário não está mais disponível."
              : "Ainda faltam confirmações para marcar esse horário.",
            { motivos: auth.motivos },
          );
        }


        // --- Mesma mecânica da tela de Agenda: marcar é CONVERTER o slot
        // "DISPONIVEL" que cobre o intervalo, e não inserir uma linha nova ao
        // lado dele. Sem isso o horário continuava aparecendo como livre e a
        // grade podia receber outra marcação na mesma vaga.
        let consultaSlotLivre = supabaseAdmin
          .from("agendamentos")
          .select("id")
          .eq("clinica_id", ctx.clinicaId)
          .eq("medico_id", medicoIdReal)
          .eq("paciente_nome", "DISPONIVEL")
          .eq("inicio", p.inicio)
          .eq("fim", p.fim);
        if (ofertaCorrente!.agenda_id) consultaSlotLivre = consultaSlotLivre.eq("agenda_id", ofertaCorrente!.agenda_id);
        else consultaSlotLivre = consultaSlotLivre.is("agenda_id", null);
        const { data: slotLivre } = await consultaSlotLivre
          .order("inicio")
          .limit(1)
          .maybeSingle();
        const slotId = (slotLivre as { id: string } | null)?.id ?? null;
        if (!slotId)
          return falha("SLOT_UNAVAILABLE", "A vaga confirmada não está mais disponível. Nenhum outro horário foi reservado.");

        // --- Núcleo compartilhado com a tela de Agenda. Ele revalida o slot no
        // momento da gravação: é isso que impede dupla reserva.
        const { criarAgendamentoCore } = await import("@/lib/agenda/criar-agendamento.core.server");
        const r = await criarAgendamentoCore(
          {
            db: supabaseAdmin as never,
            // Ator "integracao": sob service role a RLS não protege nada, e é
            // esse tipo que obriga o núcleo a conferir a clínica no código.
            ator: {
              tipo: "integracao",
              api_key_id: "nina-ai",
              clinica_id: ctx.clinicaId,
              origem_integracao: origemMarca,
            },
          },
          {
            clinica_id: ctx.clinicaId,
            editing_id: slotId,
            payload: {
              clinica_id: ctx.clinicaId,
              // Agendamento de homologação fica visível na agenda com marca
              // clara — a recepção nunca confunde com paciente real.
              paciente_nome: ehTeste ? `[TESTE NINA] ${ctx.pacienteNome}` : ctx.pacienteNome,
              paciente_id: ctx.pacienteId,
              medico_id: medicoIdReal,
              inicio: p.inicio,
              fim: p.fim,
              procedimento: p.procedimento,
              status: "agendado",
              observacoes: [
                ehTeste
                  ? "TESTE — agendado pela Nina (Homologação)"
                  : ctx.origem === "whatsapp"
                    ? "Agendado pela Nina (WhatsApp)"
                    : "Agendado pela Nina (chat interno)",
                p.observacoes,
              ]
                .filter(Boolean)
                .join(" — "),
              data_pagamento: null,
              orcamento_id: null,
              tipo_atendimento: "particular",
              forma_pagamento_prevista: null,
            },
            checagens: {
              validar_paciente_completo: true,
              validar_agenda_aberta: true,
              validar_inadimplencia: false,
            },
            pending_orc_item_ids: [],
            // Sem tela para perguntar: atendimento em paralelo com OUTRO
            // profissional já entra confirmado (choque com o mesmo
            // profissional continua bloqueado).
            confirmacoes: { permitir_conflito_paciente: true },
            integracao_marca: { origem_integracao: origemMarca, id_externo: idExterno },
          },
        );

        if (!r.ok) {
          const msg =
            "validation_error" in r ? r.validation_error.message : r.pg_error.message;
          const slotOcupado = /slot|hor[áa]rio|dispon/i.test(msg);
          logAgenda("agendar", {
            medico: rMed.nome,
            medico_id: medicoIdReal,
            inicio: p.inicio,
            confirmado: false,
            erro: slotOcupado ? "SLOT_UNAVAILABLE" : "VALIDATION_ERROR",
            detalhe: msg,
          });
          await auditar(ctx, "agendar", p, {
            ok: false,
            erro: slotOcupado ? "SLOT_UNAVAILABLE" : "VALIDATION_ERROR",
          });
          return falha(slotOcupado ? "SLOT_UNAVAILABLE" : "VALIDATION_ERROR", msg);
        }

        if (ehTeste) {
          // Marca de dado de teste: usada pelos filtros/limpeza da homologação.
          await supabaseAdmin
            .from("agendamentos")
            .update({ is_mock_data: true } as never)
            .eq("id", r.id)
            .eq("clinica_id", ctx.clinicaId);
        }

        // --- FASE 3: prova do resultado. Relê o registro e confere ID, estado,
        // paciente, profissional e horário. Sem leitura conferida o desfecho é
        // INCERTO — a Nina jamais confirma o que não está comprovado.
        const { data: conferido } = await supabaseAdmin
          .from("agendamentos")
          .select("id, clinica_id, paciente_id, medico_id, inicio, fim, status, agenda_id")
          .eq("id", r.id)
          .eq("clinica_id", ctx.clinicaId)
          .maybeSingle();
        const desfecho = verificarResultadoAgendamento(
          {
            clinicaId: ctx.clinicaId,
            pacienteId: ctx.pacienteId,
            medicoId: medicoIdReal,
            inicio: p.inicio,
            fim: p.fim,
          },
          (conferido ?? null) as RegistroAgendamento | null,
        );
        if (desfecho.estado !== "CREATED" || (conferido?.agenda_id ?? null) !== ofertaCorrente!.agenda_id) {
          logAgenda("agendar", {
            medico: rMed.nome,
            medico_id: medicoIdReal,
            inicio: p.inicio,
            confirmado: false,
            erro: conferido ? "APPOINTMENT_UNCERTAIN" : "APPOINTMENT_NOT_PERSISTED",
            detalhe: desfecho.divergencias.join(","),
            agendamento_id: r.id,
          });
          await auditar(ctx, "agendar", p, {
            ok: false,
            erro: conferido ? "APPOINTMENT_UNCERTAIN" : "APPOINTMENT_NOT_PERSISTED",
          });
          return falha(
            conferido ? "APPOINTMENT_UNCERTAIN" : "APPOINTMENT_CREATION_FAILED",
            "Não consegui confirmar a gravação do agendamento no sistema.",
            { divergencias: desfecho.divergencias },
          );
        }


        logAgenda("agendar", {
          medico: rMed.nome,
          medico_id: medicoIdReal,
          inicio: p.inicio,
          confirmado: true,
          agendamento_id: r.id,
          verificado: true,
          teste: ehTeste,
        });
        await auditar(ctx, "agendar", p, { ok: true, id: r.id });
        mutarEstado(ctx, {
          appointment: {
            doctor_id: medicoIdReal,
            doctor_name: rMed.nome,
            procedure: p.procedimento,
            slot_inicio: p.inicio,
            slot_fim: p.fim,
            slot_confirmed_by_patient: true,
            appointment_id: r.id,
          },
          stage: "BOOKED",
        });
        return {
          ok: true,
          // Contrato estruturado: a Nina só confirma quando vê `success` e
          // `appointment_id`.
          success: true,
          estado_acao: "CREATED",
          modalidade_atendimento: modalidade,
          ficha_numero: await lerFicha(r.id, p.inicio),
          appointment_id: r.id,
          // Gerado no banco só depois da gravação conferida.
          protocolo: await protocoloDoAgendamento(ctx),
          patient_id: (conferido as { paciente_id: string | null }).paciente_id,
          doctor_id: (conferido as { medico_id: string | null }).medico_id,
          unit_id: (conferido as { clinica_id: string }).clinica_id,
          date: formatarData(p.inicio),
          time: formatarHora(p.inicio),
          status: (conferido as { status: string }).status,
          verificado_no_banco: true,
          agendamento_id: r.id,
          teste: ehTeste,
          medico: rMed.nome,
          agendamento: {
            data: formatarData(p.inicio),
            hora: formatarHora(p.inicio),
            procedimento: p.procedimento,
          },
        };

      }

      default:
        return falha("VALIDATION_ERROR", `Ferramenta desconhecida: ${nome}`);
    }
  } catch (e) {
    if (e instanceof z.ZodError) return falha("VALIDATION_ERROR", "Parâmetros inválidos.");
    console.error("[nina-tools]", nome, e);
    return falha("INTERNAL_ERROR", "Falha interna ao consultar o sistema.");
  }
}
