// Extração 1:1 do miolo server-side do handler `submit` de
// `src/routes/_authenticated/app.agenda.tsx` (linhas ~2422–2550).
//
// Regras preservadas literalmente:
//   1. Bloqueio de agendamento quando paciente não tem telefone/data_nascimento.
//   2. Bloqueio quando médico/recurso de enfermagem não tem agenda aberta no dia (nenhum slot).
//   3. Bloqueio quando não há slot `DISPONÍVEL` cobrindo o intervalo escolhido.
//   4. [revertido — ver nota "recursos de enfermagem" abaixo] Bypass de checagem de slot para recursos de enfermagem.
//   5. Bloqueio por mensalidade vencida (cartão benefícios) quando
//      tipo_atendimento = "convenio".
//   6. INSERT em `agendamentos` (novo) OU UPDATE (edição).
//   7. Vínculos com `agendamento_orcamento_itens` — em edição, limpa vínculos
//      antigos antes de inserir os novos.
//
// Nenhuma regra nova. Nenhuma mensagem alterada. Nenhuma reordenação de
// checagens. As validações puramente client-side (nome preenchido, `fim >
// inicio`, procedimento não-vazio, edição de agendamento pago, etc.)
// permanecem inline no `submit` clássico — não são migradas nesta etapa.
//
// O caller é responsável por: montar o payload final, fazer toasts,
// controlar `setSaving`, invalidar queries e fechar o modal. Este arquivo
// NÃO altera nenhum desses fluxos.
//
// CRIT-04: a checagem de "esse horário está dentro do expediente?" NÃO é
// mais decidida pelo caller (`checagens.validar_agenda_aberta` é ignorada
// para esse fim) — o próprio servidor decide, comparando o payload contra
// o que já está gravado no banco. Um caller que "esqueça" de pedir a
// checagem não consegue mais burlar a validação.
//
// Recursos de enfermagem (salas/equipamentos): antes eram bypassados por
// completo dessa checagem (regra 4 acima) — dois pacientes podiam cair no
// mesmo recurso/horário sem erro nenhum, e sem a trava otimista contra
// corrida (que depende da checagem ter rodado). Agora o recurso de
// enfermagem passa pela MESMA checagem que o médico, só trocando a coluna
// filtrada (`enfermagem_recurso_id` em vez de `medico_id`).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CriarAgendamentoInput = {
  clinica_id: string;
  // Presença = UPDATE do agendamento com esse id; ausência = INSERT.
  editing_id: string | null;
  // Payload final já montado pelo caller (equivale ao `payload` do submit clássico).
  payload: {
    clinica_id: string;
    paciente_nome: string;
    paciente_id: string | null;
    medico_id: string | null;
    enfermagem_recurso_id: string | null;
    inicio: string;
    fim: string;
    procedimento: string | null;
    status: "agendado" | "cancelado" | "confirmado" | "faltou" | "realizado";
    observacoes: string | null;
    data_pagamento: string | null;
    orcamento_id: string | null;
    tipo_atendimento: "particular" | "convenio";
    forma_pagamento_prevista: string | null;
    especialidade_id?: string | null;
  };
  procedimentos?: string[];
  multi_exames_modo?: "laboratorio" | "imagem" | null;
  // Checagens que consultam o banco.
  checagens: {
    validar_paciente_completo: boolean; // sempre true na clássica
    // Mantido por compatibilidade — NÃO é mais usado para decidir se a
    // checagem de agenda/slot roda (CRIT-04). O servidor decide sozinho;
    // ver criarAgendamento.handler.
    validar_agenda_aberta: boolean;
    validar_inadimplencia: boolean;     // paciente_id && tipo_atendimento === "convenio"
  };
  pending_orc_item_ids: string[];
};

// Resultado estruturado — preserva fielmente `toast.error(msg, { duration })`
// e o `mostrarErro(vErr, "...")` do submit clássico (que a UI já sabe tratar).
export type CriarAgendamentoResult =
  | {
      ok: true;
      id: string;
      /**
       * IDs de agendamentos-irmãos criados junto com o principal (modo imagem
       * multi-exame). Vazio no caso comum (1 exame ou modo laboratório).
       * O caller precisa desses IDs para registrar pagamento único cobrindo
       * todos os exames do mesmo horário/paciente.
       */
      sibling_ids?: string[];
      // Vínculo de itens de orçamento falhou, mas o agendamento foi salvo.
      // A UI clássica exibe: mostrarErro(vErr, "agendamento salvo, mas
      // vínculo com itens do orçamento falhou").
      vinculo_warning?: { pg_error: PgErrorLike };
    }
  | {
      ok: false;
      // Erro de validação com mensagem PT-BR pronta para toast.
      validation_error: { message: string; toast_duration?: number };
    }
  | {
      ok: false;
      // Erro do Postgres/Supabase — a UI passa para `mostrarErro`.
      pg_error: PgErrorLike;
    };

export type PgErrorLike = {
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

export const criarAgendamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CriarAgendamentoInput) => data)
  .handler(async ({ data, context }): Promise<CriarAgendamentoResult> => {
    const { supabase } = context;
    const normalizarLocal = (s: string) =>
      (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
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
    const { clinica_id, editing_id, payload, checagens, pending_orc_item_ids } = data;
    const procedimentos = Array.from(new Set((data.procedimentos ?? [])
      .map((p) => String(p ?? "").trim())
      .filter(Boolean)));
    const multiModo = procedimentos.length > 1 ? data.multi_exames_modo ?? null : null;

    // ---------- 1. Paciente com telefone e data_nascimento (2422-2436) ----------
    if (checagens.validar_paciente_completo && payload.paciente_id) {
      const { data: pacCheck } = await supabase
        .from("pacientes")
        .select("telefone,data_nascimento")
        .eq("id", payload.paciente_id)
        .maybeSingle();
      const semTel = !pacCheck?.telefone || !String(pacCheck.telefone).trim();
      const semNasc = !pacCheck?.data_nascimento;
      if (semTel || semNasc) {
        const faltando = [semTel && "telefone", semNasc && "data de nascimento"].filter(Boolean).join(" e ");
        return {
          ok: false,
          validation_error: {
            message: `Preencha ${faltando} do paciente (campos abaixo do nome) e clique em "Confirmar dados" antes de salvar.`,
          },
        };
      }
    }

    // Snapshot do próprio slot (paciente_nome) no momento da validação — usado
    // logo abaixo como trava otimista no UPDATE, para fechar a janela entre
    // "validei que está livre" e "gravei o agendamento" onde dois operadores
    // simultâneos poderiam consumir o mesmo horário (um sobrescreveria o
    // outro silenciosamente, sem erro).
    let slotPacienteNomeNaValidacao: string | null = null;

    // CRIT-04 + ALTA (recursos de enfermagem): antes o CALLER decidia (via
    // checagens.validar_agenda_aberta) se a checagem "esse horário está
    // dentro do expediente?" rodava — bastava não setar essa flag para
    // criar/mover um agendamento para qualquer horário sem o servidor
    // nunca conferir. E a checagem SÓ existia para médico: agendamentos de
    // recurso de enfermagem (salas/equipamentos, que também têm horários
    // pré-gerados como "DISPONÍVEL") pulavam a checagem de conflito por
    // completo — dois pacientes podiam cair no mesmo recurso/horário sem
    // erro nenhum, e sem a trava otimista contra corrida (que depende desta
    // mesma checagem ter rodado).
    //
    // Agora quem decide é o próprio servidor, para os dois casos: roda
    // sempre que há médico OU recurso de enfermagem, e o recurso/horário
    // está de fato mudando — comparado ao que já está GRAVADO no banco,
    // nunca ao que o caller alega em `checagens`.
    const recursoField: "medico_id" | "enfermagem_recurso_id" | null = payload.medico_id
      ? "medico_id"
      : payload.enfermagem_recurso_id
        ? "enfermagem_recurso_id"
        : null;
    const recursoId = recursoField === "medico_id" ? payload.medico_id : payload.enfermagem_recurso_id;

    // Uma única leitura do registro atual (edição) — usada para decidir se
    // agenda/paciente/horário estão de fato mudando, servindo às duas
    // checagens abaixo (MED-03) e à de recurso mais adiante.
    const atual = editing_id
      ? (await supabase
          .from("agendamentos")
          .select("medico_id, enfermagem_recurso_id, paciente_id, inicio, fim")
          .eq("id", editing_id)
          .maybeSingle()).data
      : null;
    const horarioMudou = !editing_id || !atual
      || new Date(atual.inicio).getTime() !== new Date(payload.inicio).getTime()
      || new Date(atual.fim).getTime() !== new Date(payload.fim).getTime();

    let precisaValidarAgenda = false;
    if (recursoField && recursoId) {
      if (!editing_id || !atual) {
        // Criação nova (ou registro atual não encontrado): sempre precisa
        // validar — falha fechado, não aberto.
        precisaValidarAgenda = true;
      } else {
        const atualRecursoId = recursoField === "medico_id" ? atual.medico_id : atual.enfermagem_recurso_id;
        precisaValidarAgenda = atualRecursoId !== recursoId || horarioMudou;
      }
    }

    // MED-03: nada conferia se o PACIENTE já tinha outro agendamento
    // (com qualquer médico/recurso) no mesmo horário, nem bloqueava criar
    // um agendamento numa data já passada — em nenhuma das telas, porque
    // essa checagem nunca existiu neste ponto único e compartilhado.
    if (horarioMudou) {
      const hojeInicio = new Date();
      hojeInicio.setHours(0, 0, 0, 0);
      if (new Date(payload.inicio).getTime() < hojeInicio.getTime()) {
        return {
          ok: false,
          validation_error: {
            message: "Não é possível criar ou mover um agendamento para uma data que já passou.",
          },
        };
      }
    }
    const pacienteOuHorarioMudou = horarioMudou || !atual || atual.paciente_id !== payload.paciente_id;
    if (payload.paciente_id && pacienteOuHorarioMudou) {
      const { data: conflitos } = await supabase
        .from("agendamentos")
        .select("id, inicio")
        .eq("clinica_id", clinica_id)
        .eq("paciente_id", payload.paciente_id)
        .neq("status", "cancelado")
        .lt("inicio", payload.fim)
        .gt("fim", payload.inicio);
      const conflito = (conflitos ?? []).find((c) => c.id !== editing_id);
      if (conflito) {
        return {
          ok: false,
          validation_error: {
            message: `Este paciente já tem outro agendamento nesse horário (${new Date(conflito.inicio).toLocaleString("pt-BR")}). Escolha outro horário ou cancele o conflito primeiro.`,
          },
        };
      }
    }

    // ---------- 2/3/4. Agenda aberta + slot livre cobrindo o intervalo (2440-2478) ----------
    if (precisaValidarAgenda && recursoField && recursoId) {
      const rotuloRecurso = recursoField === "medico_id" ? "médico" : "recurso de enfermagem";
      const di = new Date(payload.inicio);
      const df = new Date(payload.fim);
      const inicioDia = new Date(di.getFullYear(), di.getMonth(), di.getDate(), 0, 0, 0).toISOString();
      const fimDia = new Date(di.getFullYear(), di.getMonth(), di.getDate(), 23, 59, 59).toISOString();
      const { data: slotsDia } = await supabase
        .from("agendamentos")
        .select("id,paciente_nome,inicio,fim", { count: "exact", head: false })
        .eq("clinica_id", clinica_id)
        .eq(recursoField, recursoId)
        .gte("inicio", inicioDia)
        .lte("inicio", fimDia)
        .limit(500);
      const lista = (slotsDia ?? []) as { id: string; paciente_nome: string; inicio: string; fim: string }[];
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
      const cobre = excluindoEditing.some((s) => {
        if (!isSlotLivreLocal(s.paciente_nome)) return false;
        const sIni = new Date(s.inicio).getTime();
        const sFim = new Date(s.fim).getTime();
        return sIni <= inicioMs && sFim >= fimMs;
      });
      if (!cobre) {
        return {
          ok: false,
          validation_error: {
            message: `Não há horário livre desse ${rotuloRecurso} cobrindo o intervalo escolhido. Escolha um slot DISPONÍVEL na agenda ou gere mais horários.`,
          },
        };
      }
    }

    // ---------- 5. Inadimplência em cartão benefícios (2483-2501) ----------
    if (checagens.validar_inadimplencia && payload.paciente_id && payload.tipo_atendimento === "convenio") {
      const { data: blk } = await supabase.rpc("paciente_cartao_inadimplente", {
        _paciente_id: payload.paciente_id,
        _clinica_id: clinica_id,
      });
      const info = (blk ?? {}) as {
        bloqueado?: boolean;
        total_aberto?: number;
        mensalidades?: Array<{ vencimento: string; valor: number; convenio_nome?: string }>;
      };
      if (info.bloqueado) {
        const linhas = (info.mensalidades ?? [])
          .slice(0, 5)
          .map((m) => `• ${m.convenio_nome ?? "Cartão"} — venc. ${m.vencimento?.split("-").reverse().join("/")} R$ ${Number(m.valor).toFixed(2)}`)
          .join("\n");
        const msg = `Paciente com mensalidade(s) vencida(s) no cartão benefícios.\nTotal em aberto: R$ ${Number(info.total_aberto ?? 0).toFixed(2)}\n\n${linhas}\n\nAgendamento bloqueado até a regularização — ou troque o Tipo de atendimento para "Particular".`;
        return { ok: false, validation_error: { message: msg, toast_duration: 10000 } };
      }
    }

    // ---------- 6. INSERT ou UPDATE do agendamento (2519-2527) ----------
    let novoId: string | null = editing_id;
    let siblingIds: string[] = [];
    // Erro de conflito compartilhado pelos dois ramos de UPDATE abaixo: a
    // condição extra .eq("paciente_nome", snapshot) faz o UPDATE não casar
    // nenhuma linha se outro operador já ocupou este exato horário entre a
    // validação (passo 2/3/4) e este ponto — sem isso, o segundo UPDATE
    // simplesmente sobrescrevia o primeiro paciente em silêncio.
    const conflitoDeSlot: CriarAgendamentoResult = {
      ok: false,
      validation_error: {
        message: "Este horário acabou de ser ocupado por outro atendimento. Atualize a agenda e escolha outro horário.",
      },
    };
    if (multiModo === "imagem") {
      // Principal (UPDATE ou INSERT) + irmãos (INSERT) numa única transação
      // (RPC) — antes eram passos separados: se a inserção dos irmãos
      // falhasse depois do UPDATE do principal já commitado, o agendamento
      // principal ficava alterado sozinho, sem os irmãos. A RPC também
      // grava atendimento_grupo_id em todas as linhas, vinculando o
      // multi-exame como um grupo (antes não havia vínculo nenhum entre
      // as linhas irmãs).
      const grupoId = (globalThis.crypto as { randomUUID?: () => string } | undefined)?.randomUUID?.()
        ?? Array.from({ length: 4 }, () => Math.random().toString(16).slice(2, 10)).join("-");
      const { data: rpcData, error } = await supabase.rpc("salvar_agendamento_multi_imagem", {
        _editing_id: editing_id,
        _clinica_id: clinica_id,
        _paciente_id: payload.paciente_id,
        _paciente_nome: payload.paciente_nome,
        _medico_id: payload.medico_id,
        _enfermagem_recurso_id: payload.enfermagem_recurso_id,
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
        return { ok: false, pg_error: toPgErrorLikeLocal(new Error("Retorno inesperado ao salvar multi-exame.")) };
      }
      novoId = resultado.principal_id;
      siblingIds = resultado.sibling_ids ?? [];
    } else {
      // ALTA-12: antes o vínculo com agendamento_orcamento_itens (passo 7)
      // rodava DEPOIS de já ter salvo o agendamento, como passo separado —
      // se falhasse, o agendamento ficava criado (sucesso!) mas os itens do
      // orçamento ficavam órfãos, nunca marcados como agendados/cobrados, e
      // o erro virava só um aviso fácil de ignorar (vinculo_warning). A RPC
      // agora grava agendamento + vínculo na MESMA transação.
      const procedimentoFinal = multiModo === "laboratorio"
        ? procedimentos.join(" + ")
        : payload.procedimento;
      const { data: rpcData, error } = await supabase.rpc("salvar_agendamento_e_vincular_orcamento", {
        _editing_id: editing_id,
        _clinica_id: clinica_id,
        _paciente_id: payload.paciente_id,
        _paciente_nome: payload.paciente_nome,
        _medico_id: payload.medico_id,
        _enfermagem_recurso_id: payload.enfermagem_recurso_id,
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
        return { ok: false, pg_error: toPgErrorLikeLocal(new Error("Retorno inesperado ao salvar agendamento.")) };
      }
      novoId = resultado.id;
    }

    return { ok: true, id: novoId!, sibling_ids: siblingIds };
  });