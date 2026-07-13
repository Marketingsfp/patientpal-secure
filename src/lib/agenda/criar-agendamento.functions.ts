// Extração 1:1 do miolo server-side do handler `submit` de
// `src/routes/_authenticated/app.agenda.tsx` (linhas ~2422–2550).
//
// Regras preservadas literalmente:
//   1. Bloqueio de agendamento quando paciente não tem telefone/data_nascimento.
//   2. Bloqueio quando médico não tem agenda aberta no dia (nenhum slot).
//   3. Bloqueio quando não há slot `DISPONÍVEL` cobrindo o intervalo escolhido.
//   4. Bypass de checagem de slot para recursos de enfermagem.
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
// O caller é responsável por: montar o payload final, decidir se a checagem
// de agenda/slot é necessária (`mudou_horario_ou_medico` && !recurso), fazer
// toasts, controlar `setSaving`, invalidar queries e fechar o modal. Este
// arquivo NÃO altera nenhum desses fluxos.

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
  // Checagens que consultam o banco — o caller diz se devem rodar (mantém a
  // mesma gate do submit clássico, que só valida agenda quando mudou o
  // horário/médico e o médico não é recurso).
  checagens: {
    validar_paciente_completo: boolean; // sempre true na clássica
    validar_agenda_aberta: boolean;     // form.medico_id && mudouHorarioOuMedico && !ehRecurso
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
    // ---------- 2/3/4. Agenda aberta + slot livre cobrindo o intervalo (2440-2478) ----------
    if (checagens.validar_agenda_aberta && payload.medico_id) {
      const di = new Date(payload.inicio);
      const df = new Date(payload.fim);
      const inicioDia = new Date(di.getFullYear(), di.getMonth(), di.getDate(), 0, 0, 0).toISOString();
      const fimDia = new Date(di.getFullYear(), di.getMonth(), di.getDate(), 23, 59, 59).toISOString();
      const { data: slotsDia } = await supabase
        .from("agendamentos")
        .select("id,paciente_nome,inicio,fim", { count: "exact", head: false })
        .eq("clinica_id", clinica_id)
        .eq("medico_id", payload.medico_id)
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
            message: "Este médico não tem agenda aberta nessa data. Gere os horários em Disponibilidades antes de agendar.",
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
            message: "Não há horário livre desse médico cobrindo o intervalo escolhido. Escolha um slot DISPONÍVEL na agenda ou gere mais horários em Disponibilidades.",
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
    } else if (editing_id) {
      const payloadEdicao = multiModo === "laboratorio"
      ? { ...payload, procedimento: procedimentos.join(" + ") }
      : payload;
      let q2 = supabase.from("agendamentos").update(payloadEdicao).eq("id", editing_id);
      if (slotPacienteNomeNaValidacao !== null) q2 = q2.eq("paciente_nome", slotPacienteNomeNaValidacao);
      const { data: upd2, error } = await q2.select("id");
      if (error) return { ok: false, pg_error: toPgErrorLikeLocal(error) };
      if (slotPacienteNomeNaValidacao !== null && (!upd2 || upd2.length === 0)) return conflitoDeSlot;
    } else {
      const payloadNovo = multiModo === "laboratorio"
        ? { ...payload, procedimento: procedimentos.join(" + ") }
        : payload;
      const { data: novo, error } = await supabase
        .from("agendamentos")
        .insert(payloadNovo)
        .select("id")
        .single();
      if (error || !novo) return { ok: false, pg_error: toPgErrorLikeLocal(error) };
      novoId = novo.id;
    }

    // ---------- 7. Vínculos com agendamento_orcamento_itens (2530-2550) ----------
    let vinculo_warning: { pg_error: PgErrorLike } | undefined;
    if (payload.orcamento_id && novoId && pending_orc_item_ids.length > 0) {
      const vinculos = pending_orc_item_ids.map((itemId) => ({
        clinica_id,
        agendamento_id: novoId!,
        orcamento_id: payload.orcamento_id!,
        orcamento_item_id: itemId,
      }));
      if (editing_id) {
        await supabase
          .from("agendamento_orcamento_itens")
          .delete()
          .eq("agendamento_id", editing_id);
      }
      const { error: vErr } = await supabase
        .from("agendamento_orcamento_itens")
        .insert(vinculos as never);
      if (vErr) vinculo_warning = { pg_error: toPgErrorLikeLocal(vErr) };
    }

    return { ok: true, id: novoId!, sibling_ids: siblingIds, vinculo_warning };
  });