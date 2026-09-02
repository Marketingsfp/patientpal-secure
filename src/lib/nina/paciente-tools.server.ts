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
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isCPFValido, somenteDigitos } from "@/lib/cpf";
import { normalizar, raizEspecialidade } from "@/lib/nina-especialidade";

/** Códigos de erro estáveis — a Nina usa para decidir como continuar a conversa. */
export type CodigoErroNina =
  | "PATIENT_NOT_FOUND"
  | "PATIENT_NOT_VERIFIED"
  | "PATIENT_DATA_MISMATCH"
  | "DOCTOR_NOT_FOUND"
  | "PROCEDURE_NOT_FOUND"
  | "NO_AVAILABILITY"
  | "SLOT_UNAVAILABLE"
  | "APPOINTMENT_ALREADY_EXISTS"
  | "VALIDATION_ERROR"
  | "PERMISSION_DENIED"
  | "INTERNAL_ERROR";

export type ResultadoFerramenta =
  | { ok: true; [k: string]: unknown }
  | { ok: false; erro: CodigoErroNina; mensagem: string; [k: string]: unknown };

function falha(erro: CodigoErroNina, mensagem: string, extra?: Record<string, unknown>) {
  return { ok: false as const, erro, mensagem, ...(extra ?? {}) };
}

/** Contexto da conversa. `pacienteId` só existe depois de identificação válida. */
export type CtxNinaPaciente = {
  clinicaId: string;
  /** Telefone normalizado (10-11 dígitos) do remetente, quando houver. */
  telefone: string | null;
  pacienteId: string | null;
  pacienteNome: string | null;
  conversaId: string | null;
  /** Origem do disparo — só para auditoria. */
  origem: "whatsapp" | "chat_interno";
  /** Flag de agendamento da clínica. Sem ela, só ferramentas de consulta. */
  podeAgendar?: boolean;
};

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

const HORA_LOCAL = "America/Sao_Paulo";

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

export type SlotNina = {
  medico_id: string;
  medico_nome: string;
  especialidade: string | null;
  agenda: string | null;
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
}): Promise<SlotNina[]> {
  // Fonte de verdade: as linhas "DISPONÍVEL" da própria agenda — exatamente o
  // que o núcleo de criação exige que exista para deixar marcar (regra 3 de
  // `criar-agendamento.core.server`). Oferecer qualquer outra coisa criaria a
  // situação pior possível: a Nina propõe um horário que o sistema recusa na
  // hora de gravar. A RPC `get_horarios_disponiveis` não serve aqui porque
  // depende de `auth.uid()`, que não existe num atendimento de WhatsApp.
  const dias = Math.min(Math.max(params.dias ?? 14, 1), 30);
  const agora = new Date();
  const ate = new Date(agora.getTime() + dias * 86_400_000);

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
    .select("id, medico_id, inicio, fim, paciente_nome, status")
    .eq("clinica_id", params.clinicaId)
    .gte("inicio", agora.toISOString())
    .lte("inicio", ate.toISOString())
    .neq("status", "cancelado")
    .order("inicio")
    .limit(Math.min(Math.max(params.limite ?? 400, 1), 800));
  if (medicosFiltro) q = q.in("medico_id", medicosFiltro);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const linhas = (data ?? []) as Array<{
    medico_id: string | null;
    inicio: string;
    fim: string;
    paciente_nome: string | null;
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
        agenda: null,
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
function diaSemanaDe(dataISO: string): number {
  return new Date(`${dataISO}T12:00:00-03:00`).getDay();
}

/**
 * Escala teórica do médico (`medico_disponibilidades`). Serve APENAS para
 * diferenciar "não atende nesse dia" de "atende, mas agenda cheia". Nunca é
 * usada para oferecer horário — vaga só sai de `consultarDisponibilidadeCore`.
 */
async function escalaDoMedico(clinicaId: string, medicoId: string) {
  const { data } = await supabaseAdmin
    .from("medico_disponibilidades")
    .select("dia_semana, hora_inicio, hora_fim")
    .eq("clinica_id", clinicaId)
    .eq("medico_id", medicoId)
    .eq("ativo", true);
  return (data ?? []) as Array<{ dia_semana: number; hora_inicio: string; hora_fim: string }>;
}

async function medicoAtendeNoDia(clinicaId: string, medicoId: string, dataISO: string) {
  const escala = await escalaDoMedico(clinicaId, medicoId);
  const dow = diaSemanaDe(dataISO);
  return { atende: escala.some((e) => e.dia_semana === dow), escala };
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
        "Busca profissionais da clínica por especialidade e/ou nome, com os dias e horários de atendimento.",
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
        "Busca exames/procedimentos cadastrados: valores de tabela (dinheiro/PIX e cartão) e preparo. Use sempre que perguntarem preço ou preparo.",
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
      description: "Nome oficial, endereço, telefone e e-mail da unidade.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_disponibilidade",
      description:
        "Horários REALMENTE livres na agenda. É a ÚNICA fonte de horário — nunca ofereça um horário que não veio daqui.",
      parameters: {
        type: "object",
        properties: {
          especialidade: { type: "string" },
          medico_id: { type: "string", description: "Id devolvido por buscar_medicos" },
          data: { type: "string", description: "AAAA-MM-DD, quando o paciente pediu um dia" },
          periodo: { type: "string", description: "manha, tarde ou noite" },
          dias: { type: "number", description: "Janela de busca em dias (padrão 14)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "verificar_horario",
      description:
        "Verifica UM horário específico na agenda real ('tem 15h amanhã com o Dr. João?'). Devolve se está livre e, se ocupado, alternativas próximas no mesmo dia. Nunca informa quem ocupa o horário.",
      parameters: {
        type: "object",
        properties: {
          medico_id: { type: "string", description: "Id devolvido por buscar_medicos" },
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
      name: "proxima_vaga",
      description:
        "Primeira vaga REAL disponível, em ordem cronológica, para um médico ou especialidade. Use em 'qual o próximo horário?' ou quando o dia pedido estiver cheio.",
      parameters: {
        type: "object",
        properties: {
          medico_id: { type: "string" },
          especialidade: { type: "string" },
          a_partir_de: { type: "string", description: "AAAA-MM-DD (padrão: hoje)" },
          periodo: { type: "string", description: "manha, tarde ou noite" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_base_conhecimento",
      description:
        "FONTE DE VERDADE administrativa da clínica (planilha oficial). Consulte SEMPRE antes de falar sobre especialidades, exames, procedimentos, médicos, dias e horários de atendimento, preços em dinheiro/PIX e no cartão, preparos, observações e regras. Nunca responda esses assuntos sem chamar esta ferramenta. O horário retornado é a escala do profissional, não vaga disponível.",
      parameters: {
        type: "object",
        properties: {
          termo: {
            type: "string",
            description:
              "Assunto perguntado pelo paciente (ex.: 'ultrassom de tireoide', 'neurologista', 'consulta cardiologia').",
          },
          medico: { type: "string", description: "Filtrar por nome do profissional (opcional)." },
          dia: { type: "string", description: "Filtrar por dia da semana (opcional)." },
        },
        required: ["termo"],
      },
    },
  },
] as const;


/** Ferramentas que alteram estado/expõem paciente — só com a flag de agenda. */
export const FERRAMENTAS_NINA_AGENDAMENTO = [
  {
    type: "function",
    function: {
      name: "identificar_paciente",
      description:
        "Identifica ou cadastra o paciente com CPF, nome completo e data de nascimento. Necessário antes de consultar agendamentos ou marcar. Só peça esses dados quando houver intenção clara de agendar.",
      parameters: {
        type: "object",
        properties: {
          cpf: { type: "string" },
          nome: { type: "string", description: "Nome completo" },
          data_nascimento: { type: "string", description: "AAAA-MM-DD" },
        },
        required: ["cpf", "nome", "data_nascimento"],
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
        "Cria o agendamento. Só chame DEPOIS de o paciente confirmar explicitamente médico, dia e hora. Use exatamente 'inicio' e 'fim' de um horário devolvido por consultar_disponibilidade.",
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
const zVerificarHorario = z.object({
  medico_id: z.string().uuid(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().regex(/^\d{1,2}:\d{2}$/),
});
const zProximaVaga = z.object({
  medico_id: z.string().uuid().optional(),
  especialidade: z.string().max(120).optional(),
  a_partir_de: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  periodo: z.enum(["manha", "tarde", "noite"]).optional(),
});
const zBuscarMedicos = zEspecialidade.extend({ nome: z.string().max(120).optional() });
const zProcedimentos = z.object({ termo: z.string().trim().min(2).max(120) });
const zDisponibilidade = z.object({
  especialidade: z.string().max(120).optional(),
  medico_id: z.string().uuid().optional(),
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  periodo: z.enum(["manha", "tarde", "noite"]).optional(),
  dias: z.coerce.number().int().min(1).max(30).optional(),
});
const zIdentificar = z.object({
  cpf: z.string().min(11).max(20),
  nome: z.string().trim().min(3).max(200),
  data_nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const zAgendar = z.object({
  medico_id: z.string().uuid(),
  inicio: z.string().min(10),
  fim: z.string().min(10),
  procedimento: z.string().trim().min(2).max(200),
  observacoes: z.string().max(500).optional(),
});

/* ------------------------------------------------------------------ executor */

export async function executarFerramentaPaciente(
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
  const SOMENTE_COM_FLAG = new Set(["identificar_paciente", "meus_agendamentos", "agendar"]);
  if (SOMENTE_COM_FLAG.has(nome) && ctx.podeAgendar === false)
    return falha("PERMISSION_DENIED", "Agendamento pela assistente não está ativo nesta unidade.");

  try {
    switch (nome) {
      case "consultar_base_conhecimento": {
        const p = z
          .object({
            termo: z.string().trim().min(2).max(200),
            medico: z.string().trim().max(160).optional(),
            dia: z.string().trim().max(40).optional(),
          })
          .parse(args);
        const { consultarBase, registrarConsultaKb } = await import("@/lib/nina/kb.server");
        const { expandirTermos } = await import("@/lib/nina/kb-parser");
        const achado = await consultarBase({
          clinicaId: ctx.clinicaId,
          termo: p.termo,
          medico: p.medico ?? null,
          dia: p.dia ?? null,
        });
        void registrarConsultaKb({
          clinicaId: ctx.clinicaId,
          baseId: achado.base?.id ?? null,
          versao: achado.base?.versao ?? null,
          canal: "whatsapp",
          pergunta: p.termo,
          termos: expandirTermos(p.termo),
          encontrados: achado.registros,
        });
        if (!achado.encontrado)
          return {
            ok: true,
            encontrado: false,
            instrucao:
              "Nada encontrado na base oficial. Diga ao paciente que não encontrou a informação na base e encaminhe para a equipe. NÃO invente.",
          };
        return {
          ok: true,
          encontrado: true,
          ambiguo: achado.ambiguo,
          versao_base: achado.base?.versao ?? null,
          consolidado_por_profissional: achado.consolidado ?? [],
          instrucao: achado.ambiguo
            ? "Há mais de uma opção parecida: pergunte ao paciente qual exame está no pedido médico antes de responder."
            : "Responda usando SOMENTE estes registros. Horário é escala administrativa, não vaga; vaga vem das ferramentas de agenda.",
          registros: achado.registros,
        };
      }

      case "listar_especialidades": {
        const lista = await listarEspecialidades(ctx.clinicaId);
        return { ok: true, especialidades: lista.map((e) => e.nome) };
      }


      case "buscar_medicos": {
        const p = zBuscarMedicos.parse(args);
        const lista = await listarEspecialidades(ctx.clinicaId);
        const esp = p.especialidade ? acharEspecialidade(p.especialidade, lista) : null;
        if (p.especialidade && !esp)
          return falha(
            "DOCTOR_NOT_FOUND",
            `A clínica não tem "${p.especialidade}" cadastrada. Especialidades: ${lista
              .map((e) => e.nome)
              .join(", ")}`,
          );

        let medicoIds: string[] | null = null;
        if (esp) {
          const daClinica = await medicosDaClinica(ctx.clinicaId);
          const { data: vinc } = await supabaseAdmin
            .from("medico_especialidades")
            .select("medico_id")
            .eq("especialidade_id", esp.id)
            .in("medico_id", daClinica.length > 0 ? daClinica : ["00000000-0000-0000-0000-000000000000"]);
          medicoIds = ((vinc ?? []) as Array<{ medico_id: string }>).map((v) => v.medico_id);
          if (medicoIds.length === 0)
            return falha("DOCTOR_NOT_FOUND", `Nenhum profissional de ${esp.nome} no momento.`);
        }

        let q = supabaseAdmin
          .from("medicos")
          .select("id, nome")
          .eq("clinica_id", ctx.clinicaId)
          .eq("ativo", true)
          .order("nome")
          .limit(30);
        if (medicoIds) q = q.in("id", medicoIds);
        if (p.nome) q = q.ilike("nome", `%${p.nome}%`);
        const { data: meds } = await q;
        const linhas = (meds ?? []) as Array<{ id: string; nome: string }>;
        if (linhas.length === 0) return falha("DOCTOR_NOT_FOUND", "Nenhum profissional encontrado.");

        const { data: disp } = await supabaseAdmin
          .from("medico_disponibilidades")
          .select("medico_id, dia_semana, hora_inicio, hora_fim")
          .eq("clinica_id", ctx.clinicaId)
          .eq("ativo", true)
          .in(
            "medico_id",
            linhas.map((m) => m.id),
          );
        const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
        const porMedico = new Map<string, string[]>();
        for (const d of (disp ?? []) as Array<{
          medico_id: string;
          dia_semana: number;
          hora_inicio: string;
          hora_fim: string;
        }>) {
          const arr = porMedico.get(d.medico_id) ?? [];
          arr.push(
            `${DIAS[d.dia_semana] ?? "?"} ${String(d.hora_inicio).slice(0, 5)}-${String(d.hora_fim).slice(0, 5)}`,
          );
          porMedico.set(d.medico_id, arr);
        }

        return {
          ok: true,
          medicos: linhas.slice(0, 8).map((m) => ({
            medico_id: m.id,
            nome: m.nome,
            especialidade: esp?.nome ?? null,
            horarios: (porMedico.get(m.id) ?? []).slice(0, 6),
          })),
          total: linhas.length,
        };
      }

      case "buscar_procedimentos": {
        const p = zProcedimentos.parse(args);
        const { data } = await supabaseAdmin
          .from("procedimentos")
          .select("nome, grupo, valor_dinheiro_pix, valor_cartao, valor_padrao, preparo")
          .eq("clinica_id", ctx.clinicaId)
          .eq("ativo", true)
          .ilike("nome", `%${p.termo}%`)
          .order("nome")
          .limit(12);
        const linhas = (data ?? []) as Array<Record<string, unknown>>;
        if (linhas.length === 0)
          return falha("PROCEDURE_NOT_FOUND", `Nada cadastrado com "${p.termo}".`);
        return {
          ok: true,
          procedimentos: linhas.map((r) => ({
            nome: r["nome"],
            grupo: r["grupo"] ?? null,
            valor_dinheiro_pix:
              Number(r["valor_dinheiro_pix"] ?? 0) || Number(r["valor_padrao"] ?? 0) || null,
            valor_cartao: Number(r["valor_cartao"] ?? 0) || Number(r["valor_padrao"] ?? 0) || null,
            preparo: r["preparo"] ?? null,
          })),
        };
      }

      case "dados_da_clinica": {
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

      case "consultar_disponibilidade": {
        const p = zDisponibilidade.parse(args);
        let especialidadeId: string | null = null;
        if (p.especialidade) {
          const lista = await listarEspecialidades(ctx.clinicaId);
          const esp = acharEspecialidade(p.especialidade, lista);
          if (!esp)
            return falha(
              "NO_AVAILABILITY",
              `A clínica não atende "${p.especialidade}". Atende: ${lista.map((e) => e.nome).join(", ")}`,
            );
          especialidadeId = esp.id;
        }
        const slots = await consultarDisponibilidadeCore({
          clinicaId: ctx.clinicaId,
          especialidadeId,
          medicoId: p.medico_id ?? null,
          dias: p.dias ?? (p.data ? 30 : 14),
          periodo: p.periodo ?? null,
          data: p.data ?? null,
        });
        await auditar(ctx, "consultar_disponibilidade", { ...p, slots_encontrados: slots.length }, {
          ok: true,
        });
        if (slots.length === 0) {
          // Diferencia "não atende nesse dia" de "atende, mas está cheio".
          if (p.medico_id && p.data) {
            const { atende } = await medicoAtendeNoDia(ctx.clinicaId, p.medico_id, p.data);
            const nome = (await nomeMedico(p.medico_id)) ?? "O profissional";
            const proximos = await consultarDisponibilidadeCore({
              clinicaId: ctx.clinicaId,
              medicoId: p.medico_id,
              dias: 30,
            });
            const sugestoes = proximos.slice(0, 3).map((s) => ({ data: s.data, hora: s.hora }));
            return falha(
              "NO_AVAILABILITY",
              atende
                ? `${nome} atende nesse dia, mas a agenda está sem horários disponíveis.`
                : `${nome} não possui atendimento cadastrado nesse dia.`,
              { motivo: atende ? "AGENDA_CHEIA" : "NAO_ATENDE_NO_DIA", proximos: sugestoes },
            );
          }
          return falha("NO_AVAILABILITY", "Nenhum horário livre com esses critérios.");
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
          })),
          total: slots.length,
        };
      }

      case "verificar_horario": {
        const p = zVerificarHorario.parse(args);
        const hora = p.hora.padStart(5, "0");
        const nome = (await nomeMedico(p.medico_id)) ?? "O profissional";
        const { atende } = await medicoAtendeNoDia(ctx.clinicaId, p.medico_id, p.data);
        const doDia = await consultarDisponibilidadeCore({
          clinicaId: ctx.clinicaId,
          medicoId: p.medico_id,
          dias: 30,
          data: p.data,
        });
        const alvo = doDia.find((s) => s.hora === hora);
        await auditar(
          ctx,
          "verificar_horario",
          { ...p, atende_no_dia: atende, slots_encontrados: doDia.length },
          { ok: true },
        );
        if (!atende)
          return {
            ok: true,
            medico: nome,
            data: p.data,
            hora,
            disponivel: false,
            motivo: "NAO_ATENDE_NO_DIA",
            alternativas: [],
          };
        return {
          ok: true,
          medico: nome,
          data: p.data,
          hora,
          disponivel: Boolean(alvo),
          motivo: alvo ? null : doDia.length === 0 ? "AGENDA_CHEIA" : "HORARIO_OCUPADO",
          // Só horário — nunca quem ocupa a vaga.
          ...(alvo ? { inicio: alvo.inicio, fim: alvo.fim } : {}),
          alternativas: doDia
            .filter((s) => s.hora !== hora)
            .slice(0, 4)
            .map((s) => ({ hora: s.hora, inicio: s.inicio, fim: s.fim })),
        };
      }

      case "proxima_vaga": {
        const p = zProximaVaga.parse(args);
        let especialidadeId: string | null = null;
        if (p.especialidade) {
          const lista = await listarEspecialidades(ctx.clinicaId);
          const esp = acharEspecialidade(p.especialidade, lista);
          if (!esp)
            return falha(
              "NO_AVAILABILITY",
              `A clínica não atende "${p.especialidade}". Atende: ${lista.map((e) => e.nome).join(", ")}`,
            );
          especialidadeId = esp.id;
        }
        const todos = await consultarDisponibilidadeCore({
          clinicaId: ctx.clinicaId,
          especialidadeId,
          medicoId: p.medico_id ?? null,
          dias: 30,
          periodo: p.periodo ?? null,
        });
        const desde = p.a_partir_de ?? null;
        const slots = desde ? todos.filter((s) => dataISODoSlot(s.inicio) >= desde) : todos;
        await auditar(
          ctx,
          "proxima_vaga",
          { ...p, slots_encontrados: slots.length },
          { ok: slots.length > 0 },
        );
        if (slots.length === 0)
          return falha(
            "NO_AVAILABILITY",
            "Não há vaga disponível nos próximos 30 dias com esses critérios.",
          );
        const primeira = slots[0]!;
        return {
          ok: true,
          proxima: {
            medico_id: primeira.medico_id,
            medico: primeira.medico_nome,
            especialidade: primeira.especialidade,
            data: primeira.data,
            hora: primeira.hora,
            inicio: primeira.inicio,
            fim: primeira.fim,
          },
          seguintes: slots.slice(1, 4).map((s) => ({
            medico: s.medico_nome,
            data: s.data,
            hora: s.hora,
            inicio: s.inicio,
            fim: s.fim,
          })),
        };
      }



      case "identificar_paciente": {
        const p = zIdentificar.parse(args);
        const cpf = somenteDigitos(p.cpf);
        if (!isCPFValido(cpf)) return falha("VALIDATION_ERROR", "CPF inválido.");
        const { data, error } = await supabaseAdmin.rpc("integracao_resolver_paciente", {
          _clinica_id: ctx.clinicaId,
          _cpf_digits: cpf,
          _nome: p.nome,
          _data_nascimento: p.data_nascimento,
          _telefone: ctx.telefone ?? "",
          _email: null,
          _sexo: "nao_informar",
        } as never);
        if (error) {
          await auditar(ctx, "identificar_paciente", { cpf: "***" }, {
            ok: false,
            erro: "INTERNAL_ERROR",
          });
          return falha("INTERNAL_ERROR", "Não consegui concluir a identificação agora.");
        }
        const r = (data ?? {}) as { paciente_id?: string; criado?: boolean; mismatch?: boolean };
        if (r.mismatch || !r.paciente_id) {
          await auditar(ctx, "identificar_paciente", { cpf: "***" }, {
            ok: false,
            erro: "PATIENT_DATA_MISMATCH",
          });
          return falha(
            "PATIENT_DATA_MISMATCH",
            "Os dados não conferem. Confira CPF, nome completo e data de nascimento, ou procure a recepção.",
          );
        }
        ctx.pacienteId = r.paciente_id;
        ctx.pacienteNome = p.nome;
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
          paciente: { nome: p.nome.split(" ")[0], cadastro: r.criado ? "novo" : "existente" },
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

        // --- Idempotência: mesma intenção, mesmo horário, um único registro.
        const { data: jaExiste } = await supabaseAdmin
          .from("agendamentos")
          .select("id, inicio")
          .eq("clinica_id", ctx.clinicaId)
          .eq("paciente_id", ctx.pacienteId)
          .eq("inicio", p.inicio)
          .not("status", "in", "(cancelado)")
          .maybeSingle();
        if (jaExiste) {
          await auditar(ctx, "agendar", p, {
            ok: true,
            erro: "APPOINTMENT_ALREADY_EXISTS",
            id: (jaExiste as { id: string }).id,
          });
          return {
            ok: true,
            duplicado: true,
            agendamento: {
              data: formatarData(p.inicio),
              hora: formatarHora(p.inicio),
              procedimento: p.procedimento,
            },
          };
        }

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
              origem_integracao: "nina_ai",
            },
          },
          {
            clinica_id: ctx.clinicaId,
            editing_id: null,
            payload: {
              clinica_id: ctx.clinicaId,
              paciente_nome: ctx.pacienteNome,
              paciente_id: ctx.pacienteId,
              medico_id: p.medico_id,
              inicio: p.inicio,
              fim: p.fim,
              procedimento: p.procedimento,
              status: "agendado",
              observacoes: [`Agendado pela Nina (WhatsApp)`, p.observacoes]
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
          },
        );

        if (!r.ok) {
          const msg =
            "validation_error" in r ? r.validation_error.message : r.pg_error.message;
          const slotOcupado = /slot|hor[áa]rio|dispon/i.test(msg);
          await auditar(ctx, "agendar", p, {
            ok: false,
            erro: slotOcupado ? "SLOT_UNAVAILABLE" : "VALIDATION_ERROR",
          });
          return falha(slotOcupado ? "SLOT_UNAVAILABLE" : "VALIDATION_ERROR", msg);
        }

        await auditar(ctx, "agendar", p, { ok: true, id: r.id });
        return {
          ok: true,
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
