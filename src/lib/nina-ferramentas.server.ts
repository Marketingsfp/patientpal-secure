/**
 * Ferramentas da Nina (server-only).
 *
 * A Nina deixa de ser só leitura: agora ela pode CONSULTAR e EXECUTAR ações no
 * sistema. Duas garantias importantes:
 *
 *  1. Tudo roda com o cliente Supabase do PRÓPRIO usuário logado. Ou seja, a
 *     RLS e as permissões de módulo continuam valendo exatamente como quando o
 *     colaborador clica na tela. A Nina não ganha poder além do de quem pediu.
 *  2. Agendamento, reagendamento e mudança de status passam pelos MESMOS
 *     núcleos de regra de negócio usados pela Agenda e pela API de integração
 *     (`criar-agendamento.core.server`, `reagendar-agendamento.core.server`,
 *     `status-agendamento.core.server`). Nada de INSERT/UPDATE solto em cima
 *     da agenda.
 *
 * Tabelas com segredo (chaves de API, tokens de integração, biometria) ficam
 * fora do alcance, mesmo que a RLS do usuário permitisse.
 */

/** Tabelas nunca acessíveis pela Nina (segredos / biometria / auditoria bruta). */
const BLOQUEADAS = new Set([
  "integracao_api_keys",
  "integracao_idempotencia",
  "integracao_rate_limit",
  "integration_secrets",
  "whatsapp_configs",
  "paciente_biometria",
  "medico_biometria",
  "atend_bot_configs",
]);

/** Tabelas em que a Nina só lê (gravação passa pelos núcleos de regra). */
const SOMENTE_LEITURA = new Set([
  "agendamentos",
  "audit_log",
  "user_roles",
  "perfil_permissoes",
  "perfis_acesso",
  "role_permissions",
  "permissions",
  "clinica_memberships",
  "clinica_feature_flags",
]);

const LIMITE_MAX = 200;

function checarTabela(tabela: string, escrita: boolean) {
  if (!/^[a-z0-9_]+$/.test(tabela)) throw new Error(`Tabela inválida: ${tabela}`);
  if (BLOQUEADAS.has(tabela))
    throw new Error(`Sem acesso à tabela ${tabela} por política interna.`);
  if (escrita && SOMENTE_LEITURA.has(tabela))
    throw new Error(
      `A tabela ${tabela} é somente leitura para a Nina. Use as ferramentas específicas de agenda.`,
    );
}

type Filtro = { coluna: string; operador?: string; valor: unknown };

function aplicarFiltros(q: any, filtros: Filtro[] | undefined) {
  for (const f of filtros ?? []) {
    const op = (f.operador ?? "eq").toLowerCase();
    const v = f.valor as any;
    switch (op) {
      case "eq":
        q = q.eq(f.coluna, v);
        break;
      case "neq":
        q = q.neq(f.coluna, v);
        break;
      case "gt":
        q = q.gt(f.coluna, v);
        break;
      case "gte":
        q = q.gte(f.coluna, v);
        break;
      case "lt":
        q = q.lt(f.coluna, v);
        break;
      case "lte":
        q = q.lte(f.coluna, v);
        break;
      case "like":
      case "ilike":
        q = q.ilike(f.coluna, typeof v === "string" && v.includes("%") ? v : `%${v}%`);
        break;
      case "is":
        q = q.is(f.coluna, v === "null" ? null : v);
        break;
      case "in":
        q = q.in(f.coluna, Array.isArray(v) ? v : String(v).split(","));
        break;
      default:
        throw new Error(`Operador não suportado: ${op}`);
    }
  }
  return q;
}

/** Definições no formato de function calling (OpenAI-compatible). */
export const FERRAMENTAS_NINA = [
  {
    type: "function",
    function: {
      name: "consultar_dados",
      description:
        "Consulta qualquer tabela do sistema (pacientes, agendamentos, orçamentos, financeiro, estoque, contratos, prontuários, RH, etc.) respeitando as permissões do usuário logado. Sempre filtra pela clínica atual quando a tabela tem clinica_id.",
      parameters: {
        type: "object",
        properties: {
          tabela: {
            type: "string",
            description: "Nome da tabela, ex.: pacientes, agendamentos, fin_lancamentos",
          },
          colunas: { type: "string", description: "Colunas separadas por vírgula. Padrão: *" },
          filtros: {
            type: "array",
            description: "Filtros aplicados em AND",
            items: {
              type: "object",
              properties: {
                coluna: { type: "string" },
                operador: {
                  type: "string",
                  description: "eq, neq, gt, gte, lt, lte, ilike, is, in",
                },
                valor: { type: "string" },
              },
              required: ["coluna", "valor"],
            },
          },
          ordenar: { type: "string", description: "Coluna de ordenação" },
          desc: { type: "boolean", description: "Ordem decrescente" },
          limite: { type: "number", description: "Máximo de linhas (até 200)" },
        },
        required: ["tabela"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "contar_registros",
      description: "Conta quantos registros existem numa tabela com os filtros informados.",
      parameters: {
        type: "object",
        properties: {
          tabela: { type: "string" },
          filtros: {
            type: "array",
            items: {
              type: "object",
              properties: {
                coluna: { type: "string" },
                operador: { type: "string" },
                valor: { type: "string" },
              },
              required: ["coluna", "valor"],
            },
          },
        },
        required: ["tabela"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_registro",
      description:
        "Cria um registro em uma tabela (ex.: pacientes, orcamentos, fin_lancamentos, estoque_produtos). NÃO serve para agendamentos — use criar_agendamento.",
      parameters: {
        type: "object",
        properties: {
          tabela: { type: "string" },
          valores: { type: "string", description: "JSON com os campos do registro" },
        },
        required: ["tabela", "valores"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "atualizar_registro",
      description:
        "Atualiza um registro existente pelo id. NÃO serve para agendamentos — use reagendar_agendamento ou alterar_status_agendamento.",
      parameters: {
        type: "object",
        properties: {
          tabela: { type: "string" },
          id: { type: "string" },
          valores: { type: "string", description: "JSON com os campos a alterar" },
        },
        required: ["tabela", "id", "valores"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_agendamento",
      description:
        "Cria um agendamento usando as mesmas regras da tela de Agenda (valida paciente, agenda aberta, slot livre e inadimplência de convênio).",
      parameters: {
        type: "object",
        properties: {
          paciente_nome: { type: "string" },
          paciente_id: { type: "string" },
          medico_id: { type: "string" },
          inicio: { type: "string", description: "ISO 8601, ex.: 2026-08-26T09:00:00-03:00" },
          fim: { type: "string", description: "ISO 8601" },
          procedimento: { type: "string" },
          observacoes: { type: "string" },
          tipo_atendimento: { type: "string", description: "particular ou convenio" },
        },
        required: ["paciente_nome", "inicio", "fim"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reagendar_agendamento",
      description:
        "Move um agendamento existente para outro horário (e opcionalmente outro médico).",
      parameters: {
        type: "object",
        properties: {
          agendamento_id: { type: "string" },
          novo_inicio: { type: "string" },
          novo_fim: { type: "string" },
          novo_medico_id: { type: "string" },
          motivo: {
            type: "string",
            description:
              "Por que o horário está sendo mudado (ex.: paciente pediu outro horário). Fica no histórico do agendamento.",
          },
        },
        required: ["agendamento_id", "novo_inicio", "novo_fim"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "alterar_status_agendamento",
      description:
        "Altera o status de um ou mais agendamentos (agendado, confirmado, em_atendimento, realizado, cancelado, faltou).",
      parameters: {
        type: "object",
        properties: {
          agendamento_ids: { type: "string", description: "IDs separados por vírgula" },
          novo_status: { type: "string" },
          motivo: {
            type: "string",
            description:
              "Obrigatório ao cancelar: por que o atendimento está sendo cancelado. Fica no histórico do agendamento.",
          },
        },
        required: ["agendamento_ids", "novo_status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_disponibilidade",
      description:
        "Horários REALMENTE livres na agenda (mesma fonte usada pela recepção). Use antes de propor qualquer horário — não deduza a partir da tabela de disponibilidades.",
      parameters: {
        type: "object",
        properties: {
          especialidade: { type: "string" },
          medico_id: { type: "string" },
          data: { type: "string", description: "AAAA-MM-DD" },
          periodo: { type: "string", description: "manha, tarde ou noite" },
          dias: { type: "number", description: "Janela de busca em dias (padrão 14)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_base_conhecimento",
      description:
        "Base de Conhecimentos oficial da clínica (planilha administrativa). Use SEMPRE antes de responder sobre especialidades, exames, procedimentos, médicos, dias/horários de atendimento, preços em dinheiro/PIX e cartão, preparos e observações. Horário aqui é escala administrativa, não vaga disponível.",
      parameters: {
        type: "object",
        properties: {
          termo: { type: "string", description: "Assunto perguntado." },
          medico: { type: "string" },
          dia: { type: "string" },
        },
        required: ["termo"],
      },
    },
  },
] as const;

function parseJson(txt: unknown, campo: string): Record<string, unknown> {
  if (typeof txt === "object" && txt) return txt as Record<string, unknown>;
  try {
    const o = JSON.parse(String(txt));
    if (!o || typeof o !== "object") throw new Error("não é objeto");
    return o as Record<string, unknown>;
  } catch {
    throw new Error(`Campo ${campo} deve ser um JSON de objeto válido.`);
  }
}

/** Colunas de escopo por clínica presentes na maioria das tabelas. */
async function temClinicaId(supabase: any, tabela: string) {
  const { error } = await supabase.from(tabela).select("clinica_id").limit(1);
  return !error;
}

export async function executarFerramentaNina(
  supabase: any,
  userId: string,
  clinicaId: string,
  nome: string,
  argsRaw: unknown,
): Promise<unknown> {
  const args = (
    typeof argsRaw === "string" ? parseJson(argsRaw, "arguments") : (argsRaw ?? {})
  ) as any;

  switch (nome) {
    case "consultar_base_conhecimento": {
      // FASE 3: única porta de acesso à planilha oficial.
      const { searchKnowledgeBase } = await import("@/lib/nina/knowledge.server");
      const termo = String(args.termo ?? "").trim().slice(0, 200);
      if (termo.length < 2) throw new Error("Informe o assunto da consulta.");
      return await searchKnowledgeBase({
        clinicaId,
        query: termo,
        medico: args.medico ? String(args.medico).slice(0, 160) : null,
        dia: args.dia ? String(args.dia).slice(0, 40) : null,
        canal: "interno",
      });
    }

    case "consultar_dados": {
      const tabela = String(args.tabela ?? "");
      checarTabela(tabela, false);
      const limite = Math.min(Number(args.limite) || 30, LIMITE_MAX);
      let q = supabase.from(tabela).select(String(args.colunas || "*"));
      if (await temClinicaId(supabase, tabela)) q = q.eq("clinica_id", clinicaId);
      q = aplicarFiltros(q, args.filtros);
      if (args.ordenar) q = q.order(String(args.ordenar), { ascending: !args.desc });
      const { data, error } = await q.limit(limite);
      if (error) throw new Error(error.message);
      return { linhas: data ?? [], total: (data ?? []).length };
    }

    case "contar_registros": {
      const tabela = String(args.tabela ?? "");
      checarTabela(tabela, false);
      let q = supabase.from(tabela).select("*", { count: "exact", head: true });
      if (await temClinicaId(supabase, tabela)) q = q.eq("clinica_id", clinicaId);
      q = aplicarFiltros(q, args.filtros);
      const { count, error } = await q;
      if (error) throw new Error(error.message);
      return { total: count ?? 0 };
    }

    case "criar_registro": {
      const tabela = String(args.tabela ?? "");
      checarTabela(tabela, true);
      const valores = parseJson(args.valores, "valores");
      if (await temClinicaId(supabase, tabela)) valores["clinica_id"] = clinicaId;
      const { data, error } = await supabase.from(tabela).insert(valores).select().maybeSingle();
      if (error) throw new Error(error.message);
      return { criado: data };
    }

    case "atualizar_registro": {
      const tabela = String(args.tabela ?? "");
      checarTabela(tabela, true);
      const valores = parseJson(args.valores, "valores");
      delete valores["clinica_id"];
      delete valores["id"];
      let q = supabase.from(tabela).update(valores).eq("id", String(args.id));
      if (await temClinicaId(supabase, tabela)) q = q.eq("clinica_id", clinicaId);
      const { data, error } = await q.select().maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Registro não encontrado nesta clínica (ou sem permissão).");
      return { atualizado: data };
    }

    case "criar_agendamento": {
      const { criarAgendamentoCore } = await import("@/lib/agenda/criar-agendamento.core.server");
      const tipo = args.tipo_atendimento === "convenio" ? "convenio" : "particular";
      const pacienteId = args.paciente_id ? String(args.paciente_id) : null;
      const r = await criarAgendamentoCore(
        { db: supabase, ator: { tipo: "usuario", userId } } as any,
        {
          clinica_id: clinicaId,
          editing_id: null,
          payload: {
            clinica_id: clinicaId,
            paciente_nome: String(args.paciente_nome),
            paciente_id: pacienteId,
            medico_id: args.medico_id ? String(args.medico_id) : null,
            inicio: String(args.inicio),
            fim: String(args.fim),
            procedimento: args.procedimento ? String(args.procedimento) : null,
            status: "agendado",
            observacoes: args.observacoes ? String(args.observacoes) : null,
            data_pagamento: null,
            orcamento_id: null,
            tipo_atendimento: tipo,
            forma_pagamento_prevista: null,
          },
          checagens: {
            validar_paciente_completo: true,
            validar_agenda_aberta: true,
            validar_inadimplencia: Boolean(pacienteId) && tipo === "convenio",
          },
          pending_orc_item_ids: [],
          // Sem tela para perguntar: atendimento em paralelo com OUTRO
          // profissional já entra confirmado (choque com o mesmo profissional
          // continua bloqueado).
          confirmacoes: { permitir_conflito_paciente: true },
        },
      );
      return r;
    }

    case "reagendar_agendamento": {
      const { reagendarAgendamentoCore } =
        await import("@/lib/agenda/reagendar-agendamento.core.server");
      return await reagendarAgendamentoCore(
        { db: supabase, ator: { tipo: "usuario", userId } } as any,
        {
          clinica_id: clinicaId,
          agendamento_id: String(args.agendamento_id),
          novo_inicio: String(args.novo_inicio),
          novo_fim: String(args.novo_fim),
          novo_medico_id: args.novo_medico_id ? String(args.novo_medico_id) : null,
          // A Nina age em nome de um usuário, então o núcleo não gera motivo
          // automático — quem identifica a origem aqui somos nós.
          motivo: args.motivo
            ? `Assistente Nina: ${String(args.motivo)}`
            : "Reagendado pela assistente Nina",
        },
      );
    }

    case "alterar_status_agendamento": {
      const { atualizarStatusAgendamentoCore } =
        await import("@/lib/agenda/status-agendamento.core.server");
      const ids = String(args.agendamento_ids ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length === 0) throw new Error("Informe pelo menos um agendamento_id.");
      return await atualizarStatusAgendamentoCore(
        { db: supabase, ator: { tipo: "usuario", userId } } as any,
        {
          agendamento_ids: ids,
          novo_status: String(args.novo_status) as any,
          motivo: args.motivo
            ? `Assistente Nina: ${String(args.motivo)}`
            : "Cancelado pela assistente Nina",
        },
      );
    }

    case "consultar_disponibilidade": {
      // Mesma função usada pela Nina do WhatsApp e pela API de integração:
      // a disponibilidade tem uma única fonte no sistema.
      const { consultarDisponibilidadeCore } = await import("@/lib/nina/paciente-tools.server");
      let especialidadeId: string | null = args.especialidade_id
        ? String(args.especialidade_id)
        : null;
      if (!especialidadeId && args.especialidade) {
        const { data: esps } = await supabase
          .from("especialidades")
          .select("id, nome")
          .eq("ativo", true);
        const alvo = String(args.especialidade)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();
        const achada = (esps ?? []).find((e: any) =>
          String(e.nome)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .includes(alvo.slice(0, 5)),
        );
        especialidadeId = achada?.id ?? null;
      }
      const slots = await consultarDisponibilidadeCore({
        clinicaId,
        especialidadeId,
        medicoId: args.medico_id ? String(args.medico_id) : null,
        dias: Number(args.dias) || (args.data ? 30 : 14),
        periodo: (args.periodo as any) ?? null,
        data: args.data ? String(args.data) : null,
      });
      return { horarios: slots.slice(0, 20), total: slots.length };
    }

    default:
      throw new Error(`Ferramenta desconhecida: ${nome}`);
  }
}
