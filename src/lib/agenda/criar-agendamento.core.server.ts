// Núcleo (server-only) da criação/edição de agendamento.
//
// Este arquivo é a ÚNICA fonte das regras. Ele foi extraído, sem alteração de
// comportamento, de `criar-agendamento.functions.ts` — que hoje só embrulha
// esta função com autenticação de funcionário (`requireSupabaseAuth`).
// A API de integração (`/api/integrations/v1`) chama exatamente esta mesma
// função, com um ator diferente. Nenhuma regra é duplicada.
//
// Regras preservadas literalmente:
//   0. Procedimento obrigatório quando há paciente.
//   1. Bloqueio de agendamento quando paciente não tem telefone/data_nascimento.
//   2. Bloqueio quando o médico não tem agenda aberta no dia (nenhum slot).
//   3. Bloqueio quando não há slot `DISPONÍVEL` cobrindo o intervalo escolhido.
//   4b. Tipo da agenda × tipo do procedimento.
//   5. Bloqueio por mensalidade vencida (cartão benefícios) quando
//      tipo_atendimento = "convenio".
//   6. INSERT/UPDATE via RPC transacional (single ou multi-exame).
//   7. Vínculos com `agendamento_orcamento_itens` (dentro da mesma RPC).
//
// CRIT-04: quem decide se a checagem de agenda/slot roda é o servidor,
// comparando o payload com o que está gravado — nunca o caller.
//
// Escopo de clínica: para ator "integracao" (service role, sem RLS) a clínica
// é conferida no código, obrigatoriamente, antes de qualquer leitura/gravação.

import { hojeBR, janelaDiaClinica, TZ_CLINICA } from "@/lib/date-utils";
import { assertEscopoClinica, type CtxAgenda } from "./ator.server";
import type {
  CriarAgendamentoInput,
  CriarAgendamentoResult,
  PgErrorLike,
} from "./criar-agendamento.types";

export type CriarAgendamentoCoreInput = CriarAgendamentoInput & {
  /**
   * Marcação de origem quando o agendamento nasce de uma integração externa.
   * Gravada DEPOIS do salvamento (a RPC transacional não conhece esses
   * campos). Nunca preenchida pelo fluxo interno de funcionário.
   */
  integracao_marca?: { origem_integracao: string; id_externo: string } | null;
};

export async function criarAgendamentoCore(
  ctx: CtxAgenda,
  data: CriarAgendamentoCoreInput,
): Promise<CriarAgendamentoResult> {
  const supabase = ctx.db;
  // Escopo obrigatório sob service role (no-op para funcionário logado).
  assertEscopoClinica(ctx.ator, data.clinica_id);
  assertEscopoClinica(ctx.ator, data.payload.clinica_id);

  const normalizarLocal = (s: string) =>
    (s ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const isSlotLivreLocal = (pacienteNome: string | null | undefined) => {
    const nome = normalizarLocal(pacienteNome ?? "").trim();
    return nome === "disponivel" || nome === "bloqueio";
  };
  const toPgErrorLikeLocal = (err: unknown): PgErrorLike => {
    const e = (err ?? {}) as { message?: string; details?: string; hint?: string; code?: string };
    return {
      message: e.message ?? "Erro desconhecido",
      details: e.details ?? null,
      hint: e.hint ?? null,
      code: e.code ?? null,
    };
  };
  // Marcos de tempo do próprio servidor — ver `tempos` em
  // CriarAgendamentoResult. Só medem; não alteram nenhuma decisão.
  const tInicio = Date.now();
  let tDepoisDasLeituras = tInicio;
  const { clinica_id, editing_id, payload, checagens, pending_orc_item_ids } = data;
  const procedimentos = Array.from(
    new Set((data.procedimentos ?? []).map((p) => String(p ?? "").trim()).filter(Boolean)),
  );
  const multiModo = procedimentos.length > 1 ? (data.multi_exames_modo ?? null) : null;

  // ---------- 0. Procedimento obrigatório (2026-07-16) ----------
  if (payload.paciente_id) {
    const textoPayload = String(payload.procedimento ?? "").trim();
    const temProcedimentoNaLista = procedimentos.length > 0;
    if (!textoPayload && !temProcedimentoNaLista) {
      return {
        ok: false,
        validation_error: {
          message: "Selecione o procedimento antes de salvar o agendamento.",
        },
      };
    }
  }

  // ---------- Escopo do registro em edição (integração) ----------
  // Sob service role a RLS não impede editar agendamento de outra clínica;
  // aqui isso é conferido antes de qualquer outra coisa.
  if (editing_id && ctx.ator.tipo === "integracao") {
    const { data: alvo } = await supabase
      .from("agendamentos")
      .select("clinica_id")
      .eq("id", editing_id)
      .maybeSingle();
    assertEscopoClinica(ctx.ator, alvo?.clinica_id ?? null);
  }

  // ---------- Leituras do banco: todas em paralelo (perf) ----------
  const pacienteId = payload.paciente_id;
  const recursoId = payload.medico_id;

  const di = new Date(payload.inicio);
  const df = new Date(payload.fim);
  const inicioDia = new Date(di.getFullYear(), di.getMonth(), di.getDate(), 0, 0, 0).toISOString();
  const fimDia = new Date(di.getFullYear(), di.getMonth(), di.getDate(), 23, 59, 59).toISOString();

  // Nomes usados na checagem "tipo da agenda × tipo do procedimento" (4b).
  const nomesProcParaTipo = (
    procedimentos.length > 0 ? procedimentos : [String(payload.procedimento ?? "").trim()]
  )
    .map((n) => n.trim())
    .filter(Boolean);

  type AgendaComTipos = {
    id: string;
    medico_agenda_procedimentos: Array<{ procedimentos: { tipo: string | null } | null }>;
  };

  const [pacCheck, atual, conflitos, slotsDia, procsEscolhidos, agendasDoMedico, blk] =
    await Promise.all([
      // 1. Paciente com telefone e data de nascimento preenchidos.
      checagens.validar_paciente_completo && pacienteId
        ? supabase
            .from("pacientes")
            .select("telefone,data_nascimento")
            .eq("id", pacienteId)
            .maybeSingle()
            .then((r) => r.data)
        : Promise.resolve(null),
      // Registro atual (edição) — diz o que de fato está mudando.
      editing_id
        ? supabase
            .from("agendamentos")
            .select("medico_id, paciente_id, inicio, fim, agenda_id")
            .eq("id", editing_id)
            .maybeSingle()
            .then((r) => r.data)
        : Promise.resolve(null),
      // MED-03. Outro agendamento do MESMO paciente no mesmo horário.
      // `medico_id` entra na leitura porque a regra passou a distinguir
      // conflito com o MESMO profissional (bloqueia) de conflito com outro
      // profissional (só avisa) — ver o trecho da checagem mais abaixo.
      pacienteId
        ? supabase
            .from("agendamentos")
            .select("id, inicio, medico_id")
            .eq("clinica_id", clinica_id)
            .eq("paciente_id", pacienteId)
            .neq("status", "cancelado")
            .lt("inicio", payload.fim)
            .gt("fim", payload.inicio)
            .then((r) => r.data)
        : Promise.resolve(null),
      // 2/3/4. Horários do médico no dia (agenda aberta + slot livre).
      recursoId
        ? supabase
            .from("agendamentos")
            .select("id,paciente_nome,inicio,fim,agenda_id")
            .eq("clinica_id", clinica_id)
            .eq("medico_id", recursoId)
            .gte("inicio", inicioDia)
            .lte("inicio", fimDia)
            .limit(500)
            .then((r) => r.data)
        : Promise.resolve(null),
      // 4b. Tipo (consulta/exame/procedimento) dos procedimentos pedidos.
      nomesProcParaTipo.length > 0
        ? supabase
            .from("procedimentos")
            .select("nome,tipo")
            .eq("clinica_id", clinica_id)
            .in("nome", nomesProcParaTipo)
            .then((r) => r.data)
        : Promise.resolve(null),
      // 4b. Agendas deste médico + tipos liberados em cada uma.
      recursoId
        ? supabase
            .from("medico_agendas")
            .select("id, medico_agenda_procedimentos(procedimentos(tipo))")
            .eq("clinica_id", clinica_id)
            .eq("medico_id", recursoId)
            .then((r) => (r.error ? null : (r.data as unknown as AgendaComTipos[])))
        : Promise.resolve(null),
      // 5. Mensalidade vencida no cartão benefícios.
      checagens.validar_inadimplencia && pacienteId && payload.tipo_atendimento === "convenio"
        ? supabase
            .rpc("paciente_cartao_inadimplente", {
              _paciente_id: pacienteId,
              _clinica_id: clinica_id,
            })
            .then((r) => r.data)
        : Promise.resolve(null),
    ]);
  tDepoisDasLeituras = Date.now();

  // ---------- 1. Paciente com telefone e data_nascimento (2422-2436) ----------
  if (checagens.validar_paciente_completo && pacienteId) {
    const semTel = !pacCheck?.telefone || !String(pacCheck.telefone).trim();
    const semNasc = !pacCheck?.data_nascimento;
    if (semTel || semNasc) {
      const faltando = [semTel && "telefone", semNasc && "data de nascimento"]
        .filter(Boolean)
        .join(" e ");
      return {
        ok: false,
        validation_error: {
          message: `Preencha ${faltando} do paciente (campos abaixo do nome) e clique em "Confirmar dados" antes de salvar.`,
        },
      };
    }
  }

  // Snapshot do próprio slot (paciente_nome) no momento da validação — trava
  // otimista no UPDATE, fechando a janela entre "validei que está livre" e
  // "gravei o agendamento".
  let slotPacienteNomeNaValidacao: string | null = null;

  const horarioMudou =
    !editing_id ||
    !atual ||
    new Date(atual.inicio).getTime() !== new Date(payload.inicio).getTime() ||
    new Date(atual.fim).getTime() !== new Date(payload.fim).getTime();

  let precisaValidarAgenda = false;
  if (recursoId) {
    if (!editing_id || !atual) {
      // Criação nova (ou registro atual não encontrado): falha fechado.
      precisaValidarAgenda = true;
    } else {
      precisaValidarAgenda = atual.medico_id !== recursoId || horarioMudou;
    }
  }

  if (horarioMudou) {
    // Início do dia civil da CLÍNICA (America/Sao_Paulo).
    const { inicio: inicioDiaClinica } = janelaDiaClinica(hojeBR());
    if (new Date(payload.inicio).getTime() < new Date(inicioDiaClinica).getTime()) {
      return {
        ok: false,
        validation_error: {
          message: "Não é possível criar ou mover um agendamento para uma data que já passou.",
        },
      };
    }
  }
  const pacienteOuHorarioMudou =
    horarioMudou || !atual || atual.paciente_id !== payload.paciente_id;
  if (pacienteId && pacienteOuHorarioMudou) {
    // MED-03 (revisto em 2026-09-02). Antes, QUALQUER agendamento do mesmo
    // paciente que cruzasse o horário bloqueava — inclusive com outro médico e
    // outra especialidade, o que impedia a rotina normal da clínica (paciente
    // que faz exame e consulta no mesmo dia, ou dois procedimentos ao mesmo
    // tempo com profissionais diferentes).
    //
    // Agora só é bloqueio de verdade o choque na agenda do MESMO profissional
    // (duas fichas no mesmo horário com o mesmo médico). Com profissional
    // diferente vira aviso: a tela pergunta e, confirmando, reenvia com
    // `confirmacoes.permitir_conflito_paciente`.
    const conflitos_ = (conflitos ?? []) as Array<{
      id: string;
      inicio: string;
      medico_id: string | null;
    }>;
    const outros = conflitos_.filter((c) => c.id !== editing_id);
    const mesmoProfissional = recursoId
      ? (outros.find((c) => c.medico_id === recursoId) ?? null)
      : null;
    const conflito = mesmoProfissional ?? outros[0] ?? null;
    if (conflito) {
      const quando = new Date(conflito.inicio).toLocaleString("pt-BR", { timeZone: TZ_CLINICA });
      if (mesmoProfissional) {
        return {
          ok: false,
          validation_error: {
            message: `Este paciente já tem outro agendamento nesse horário com o mesmo profissional (${quando}). Escolha outro horário ou cancele o conflito primeiro.`,
          },
        };
      }
      if (!data.confirmacoes?.permitir_conflito_paciente) {
        return {
          ok: false,
          validation_error: {
            message: `Atenção: este paciente já tem outro atendimento nesse horário (${quando}), com outro profissional. Deseja agendar mesmo assim?`,
            confirmavel: "conflito_paciente",
          },
        };
      }
    }
  }

  // ---------- 2/3/4. Agenda aberta + slot livre cobrindo o intervalo ----------
  if (precisaValidarAgenda && recursoId) {
    const rotuloRecurso = "médico";
    const lista = (slotsDia ?? []) as {
      id: string;
      paciente_nome: string;
      inicio: string;
      fim: string;
      agenda_id: string | null;
    }[];
    if (editing_id) {
      slotPacienteNomeNaValidacao = lista.find((x) => x.id === editing_id)?.paciente_nome ?? null;
    }
    const excluindoEditing = editing_id ? lista.filter((x) => x.id !== editing_id) : lista;
    if (excluindoEditing.length === 0) {
      return {
        ok: false,
        validation_error: {
          message: `Este ${rotuloRecurso} não tem agenda aberta nessa data. Gere os horários antes de agendar.`,
        },
      };
    }
    const inicioMs = di.getTime();
    const fimMs = df.getTime();
    const slotEscolhido = excluindoEditing.find((s) => {
      if (!isSlotLivreLocal(s.paciente_nome)) return false;
      const sIni = new Date(s.inicio).getTime();
      const sFim = new Date(s.fim).getTime();
      return sIni <= inicioMs && sFim >= fimMs;
    });
    if (!slotEscolhido) {
      return {
        ok: false,
        validation_error: {
          message: `Não há horário livre desse ${rotuloRecurso} cobrindo o intervalo escolhido. Escolha um slot DISPONÍVEL na agenda ou gere mais horários.`,
        },
      };
    }

    // ---------- 4b. Tipo da agenda × tipo do procedimento ----------
    const agendaAlvoId = slotEscolhido.agenda_id;
    if (agendaAlvoId && nomesProcParaTipo.length > 0) {
      const daAgenda = (agendasDoMedico ?? []).find((a) => a.id === agendaAlvoId) ?? null;
      let tiposAgenda: Set<string>;
      if (daAgenda) {
        tiposAgenda = new Set(
          (daAgenda.medico_agenda_procedimentos ?? [])
            .map((l) => l.procedimentos?.tipo)
            .filter((t): t is string => !!t),
        );
      } else {
        const { data: linkados } = await supabase
          .from("medico_agenda_procedimentos")
          .select("procedimento_id, procedimentos!inner(tipo)")
          .eq("agenda_id", agendaAlvoId);
        tiposAgenda = new Set(
          ((linkados ?? []) as Array<{ procedimentos: { tipo: string | null } | null }>)
            .map((l) => l.procedimentos?.tipo)
            .filter((t): t is string => !!t),
        );
      }
      const isConsulta =
        tiposAgenda.size > 0 && tiposAgenda.size === 1 && tiposAgenda.has("consulta");
      const isExame =
        tiposAgenda.size > 0 &&
        Array.from(tiposAgenda).every((t) => t === "exame" || t === "procedimento");
      if (isConsulta || isExame) {
        const rotuloAgenda = isConsulta ? "consultas" : "exames";
        const procs = (procsEscolhidos ?? []) as Array<{ nome: string; tipo: string | null }>;
        const incompatível = procs.find((p) => {
          if (!p.tipo) return false;
          if (isConsulta) return p.tipo !== "consulta";
          return p.tipo === "consulta";
        });
        if (incompatível) {
          const tipoProcLabel = incompatível.tipo === "consulta" ? "consulta" : "exame";
          return {
            ok: false,
            validation_error: {
              message: `Esta agenda é de ${rotuloAgenda}. O procedimento "${incompatível.nome}" é de ${tipoProcLabel} e não pode ser agendado aqui. Escolha uma agenda compatível ou outro procedimento.`,
              toast_duration: 8000,
            },
          };
        }
      }
    }
  }

  // ---------- 5. Inadimplência em cartão benefícios ----------
  if (checagens.validar_inadimplencia && pacienteId && payload.tipo_atendimento === "convenio") {
    const info = (blk ?? {}) as unknown as {
      bloqueado?: boolean;
      total_aberto?: number;
      mensalidades?: Array<{ vencimento: string; valor: number; convenio_nome?: string }>;
    };
    if (info.bloqueado) {
      const linhas = (info.mensalidades ?? [])
        .slice(0, 5)
        .map(
          (m) =>
            `• ${m.convenio_nome ?? "Cartão"} — venc. ${m.vencimento?.split("-").reverse().join("/")} R$ ${Number(m.valor).toFixed(2)}`,
        )
        .join("\n");
      const msg = `Paciente com mensalidade(s) vencida(s) no cartão benefícios.\nTotal em aberto: R$ ${Number(info.total_aberto ?? 0).toFixed(2)}\n\n${linhas}\n\nAgendamento bloqueado até a regularização — ou troque o Tipo de atendimento para "Particular".`;
      return { ok: false, validation_error: { message: msg, toast_duration: 10000 } };
    }
  }

  // ---------- 6. INSERT ou UPDATE do agendamento ----------
  let novoId: string | null = editing_id;
  let siblingIds: string[] = [];
  const conflitoDeSlot: CriarAgendamentoResult = {
    ok: false,
    validation_error: {
      message:
        "Este horário acabou de ser ocupado por outro atendimento. Atualize a agenda e escolha outro horário.",
    },
  };
  if (multiModo === "imagem") {
    const grupoId =
      (globalThis.crypto as { randomUUID?: () => string } | undefined)?.randomUUID?.() ??
      Array.from({ length: 4 }, () => Math.random().toString(16).slice(2, 10)).join("-");
    const { data: rpcData, error } = await supabase.rpc("salvar_agendamento_multi_imagem", {
      _editing_id: editing_id,
      _clinica_id: clinica_id,
      _paciente_id: payload.paciente_id,
      _paciente_nome: payload.paciente_nome,
      _medico_id: payload.medico_id,
      _inicio: payload.inicio,
      _fim: payload.fim,
      _procedimentos: procedimentos,
      _status: payload.status,
      _observacoes: payload.observacoes,
      _data_pagamento: payload.data_pagamento,
      _orcamento_id: payload.orcamento_id,
      _tipo_atendimento: payload.tipo_atendimento,
      _forma_pagamento_prevista: payload.forma_pagamento_prevista,
      _especialidade_id: payload.especialidade_id ?? null,
      _grupo_id: grupoId,
      _paciente_nome_esperado_no_slot: editing_id ? slotPacienteNomeNaValidacao : null,
      _orcamento_item_ids: pending_orc_item_ids,
    } as never);
    if (error) {
      if ((error as { code?: string }).code === "23505") return conflitoDeSlot;
      return { ok: false, pg_error: toPgErrorLikeLocal(error) };
    }
    const resultado = (rpcData ?? {}) as { principal_id?: string; sibling_ids?: string[] };
    if (!resultado.principal_id) {
      return {
        ok: false,
        pg_error: toPgErrorLikeLocal(new Error("Retorno inesperado ao salvar multi-exame.")),
      };
    }
    novoId = resultado.principal_id;
    siblingIds = resultado.sibling_ids ?? [];
  } else {
    const procedimentoFinal =
      multiModo === "laboratorio" ? procedimentos.join(" + ") : payload.procedimento;
    const { data: rpcData, error } = await supabase.rpc("salvar_agendamento_e_vincular_orcamento", {
      _editing_id: editing_id,
      _clinica_id: clinica_id,
      _paciente_id: payload.paciente_id,
      _paciente_nome: payload.paciente_nome,
      _medico_id: payload.medico_id,
      _inicio: payload.inicio,
      _fim: payload.fim,
      _procedimento: procedimentoFinal,
      _status: payload.status,
      _observacoes: payload.observacoes,
      _data_pagamento: payload.data_pagamento,
      _orcamento_id: payload.orcamento_id,
      _tipo_atendimento: payload.tipo_atendimento,
      _forma_pagamento_prevista: payload.forma_pagamento_prevista,
      _especialidade_id: payload.especialidade_id ?? null,
      _orcamento_item_ids: pending_orc_item_ids,
      _paciente_nome_esperado_no_slot: editing_id ? slotPacienteNomeNaValidacao : null,
    } as never);
    if (error) {
      if ((error as { code?: string }).code === "23505") return conflitoDeSlot;
      return { ok: false, pg_error: toPgErrorLikeLocal(error) };
    }
    const resultado = (rpcData ?? {}) as { id?: string };
    if (!resultado.id) {
      return {
        ok: false,
        pg_error: toPgErrorLikeLocal(new Error("Retorno inesperado ao salvar agendamento.")),
      };
    }
    novoId = resultado.id;
  }

  // ---------- 6b. Marcação de origem da integração ----------
  // A RPC transacional não conhece esses campos; a marcação é gravada logo
  // após o salvamento, no mesmo escopo de clínica já validado. Falha aqui
  // não desfaz o agendamento — vira erro explícito para o caller decidir.
  if (data.integracao_marca && novoId) {
    const { error: eMarca } = await supabase
      .from("agendamentos")
      .update({
        origem_integracao: data.integracao_marca.origem_integracao,
        id_externo: data.integracao_marca.id_externo,
      } as never)
      .eq("id", novoId)
      .eq("clinica_id", clinica_id);
    if (eMarca) return { ok: false, pg_error: toPgErrorLikeLocal(eMarca) };
  }

  const tFim = Date.now();
  return {
    ok: true,
    id: novoId!,
    sibling_ids: siblingIds,
    tempos: {
      leituras: tDepoisDasLeituras - tInicio,
      gravacao: tFim - tDepoisDasLeituras,
      total: tFim - tInicio,
    },
  };
}
