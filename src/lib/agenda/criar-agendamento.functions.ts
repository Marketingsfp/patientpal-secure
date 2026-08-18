// Extração 1:1 do miolo server-side do handler `submit` de
// `src/routes/_authenticated/app.agenda.tsx` (linhas ~2422–2550).
//
// Regras preservadas literalmente:
//   1. Bloqueio de agendamento quando paciente não tem telefone/data_nascimento.
//   2. Bloqueio quando médico/recurso de enfermagem não tem agenda aberta no dia (nenhum slot).
//   3. Bloqueio quando não há slot `DISPONÍVEL` cobrindo o intervalo escolhido.
//   4. (removido) Bypass de checagem de slot para recursos de enfermagem.
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
// Recursos de enfermagem foram removidos do sistema — hoje só existe o
// caminho `medico_id`.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hojeBR, janelaDiaClinica } from "@/lib/date-utils";

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
    validar_inadimplencia: boolean; // paciente_id && tipo_atendimento === "convenio"
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
      /**
       * Diagnóstico de performance (milissegundos gastos DENTRO do servidor).
       * Serve para separar o que é tempo de banco do que é tempo de rede
       * entre o navegador e o Worker: se o cliente esperou 900ms na chamada
       * mas aqui dentro passaram 150ms, os outros 750ms são rede, não banco.
       * Não influencia nenhuma regra — a UI só registra no console.
       */
      tempos?: { leituras: number; gravacao: number; total: number };
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
    // Vale para agendamentos de paciente real (paciente_id preenchido).
    // Slots operacionais (DISPONÍVEL/BLOQUEIO) não têm paciente_id e ficam
    // fora dessa checagem.
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

    // ---------- Leituras do banco: todas em paralelo (perf) ----------
    // Antes, cada checagem abaixo só começava depois que a anterior tinha
    // respondido: eram até 8 idas e voltas ao Supabase EM SÉRIE só para
    // salvar um agendamento. Como este handler roda no Worker (longe do
    // banco), esse enfileiramento era o grosso da espera que a recepção
    // sente entre clicar em salvar e a tela de pagamento abrir.
    //
    // Nenhuma dessas consultas precisa do RESULTADO de outra — só as
    // DECISÕES precisam. Então todas saem juntas num único Promise.all, e as
    // validações continuam sendo avaliadas logo abaixo exatamente na mesma
    // ordem, com as mesmas mensagens e os mesmos critérios de antes.
    //
    // Duas leituras passam a ser disparadas também em casos em que antes
    // eram puladas (os horários do dia e os procedimentos escolhidos): saber
    // se valia a pena buscá-las exigia esperar o registro atual chegar, o
    // que custaria uma ida e volta inteira. São consultas pequenas e
    // indexadas, e o resultado só é USADO sob exatamente as mesmas condições
    // de antes.
    const pacienteId = payload.paciente_id;
    const recursoId = payload.medico_id;

    const di = new Date(payload.inicio);
    const df = new Date(payload.fim);
    const inicioDia = new Date(
      di.getFullYear(),
      di.getMonth(),
      di.getDate(),
      0,
      0,
      0,
    ).toISOString();
    const fimDia = new Date(
      di.getFullYear(),
      di.getMonth(),
      di.getDate(),
      23,
      59,
      59,
    ).toISOString();

    // Nomes usados na checagem "tipo da agenda × tipo do procedimento" (4b).
    const nomesProcParaTipo = (
      procedimentos.length > 0 ? procedimentos : [String(payload.procedimento ?? "").trim()]
    )
      .map((n) => n.trim())
      .filter(Boolean);

    // Whitelist de procedimentos por agenda. Antes só dava para consultar
    // DEPOIS de descobrir qual agenda o slot escolhido usava (mais uma ida e
    // volta em série); agora trazemos todas as agendas deste médico de uma
    // vez, junto com as demais leituras, e escolhemos a certa em memória.
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
        pacienteId
          ? supabase
              .from("agendamentos")
              .select("id, inicio")
              .eq("clinica_id", clinica_id)
              .eq("paciente_id", pacienteId)
              .neq("status", "cancelado")
              .lt("inicio", payload.fim)
              .gt("fim", payload.inicio)
              .then((r) => r.data)
          : Promise.resolve(null),
        // 2/3/4. Horários do médico no dia (agenda aberta + slot livre).
        // O `count: "exact"` que existia aqui foi removido: obrigava o banco
        // a contar as linhas e o número nunca era usado.
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
    const horarioMudou =
      !editing_id ||
      !atual ||
      new Date(atual.inicio).getTime() !== new Date(payload.inicio).getTime() ||
      new Date(atual.fim).getTime() !== new Date(payload.fim).getTime();

    let precisaValidarAgenda = false;
    if (recursoId) {
      if (!editing_id || !atual) {
        // Criação nova (ou registro atual não encontrado): sempre precisa
        // validar — falha fechado, não aberto.
        precisaValidarAgenda = true;
      } else {
        precisaValidarAgenda = atual.medico_id !== recursoId || horarioMudou;
      }
    }

    // MED-03: nada conferia se o PACIENTE já tinha outro agendamento
    // (com qualquer médico/recurso) no mesmo horário, nem bloqueava criar
    // um agendamento numa data já passada — em nenhuma das telas, porque
    // essa checagem nunca existiu neste ponto único e compartilhado.
    if (horarioMudou) {
      // Início do dia civil da CLÍNICA (America/Sao_Paulo). Este código roda
      // no Worker do Cloudflare, em UTC: com `new Date()` + `setHours(0,0,0)`
      // a fronteira ficava 3h deslocada, ora bloqueando horários válidos do
      // próprio dia, ora liberando o fim da tarde de ontem.
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
      // Regra global (todas as clínicas): agenda de CONSULTA só aceita
      // procedimentos com tipo='consulta'; agenda de EXAME só aceita
      // 'exame'/'procedimento'. Cruzamos o tipo do procedimento escolhido
      // com o whitelist de procedimentos linkados à agenda de destino
      // (medico_agenda_procedimentos). Agendas sem linkagem (whitelist
      // vazio) ou mistas ficam fora da checagem.
      const agendaAlvoId = slotEscolhido.agenda_id;
      if (agendaAlvoId && nomesProcParaTipo.length > 0) {
        // Caminho normal: a agenda do slot está entre as que já vieram no
        // pré-carregamento acima — zero ida e volta extra. O `else` é rede
        // de segurança (agenda de outro médico, ou a consulta agrupada ter
        // falhado): cai na consulta pontual original, o comportamento antigo.
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

    // ---------- 5. Inadimplência em cartão benefícios (2483-2501) ----------
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
        message:
          "Este horário acabou de ser ocupado por outro atendimento. Atualize a agenda e escolha outro horário.",
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
      // ALTA-12: antes o vínculo com agendamento_orcamento_itens (passo 7)
      // rodava DEPOIS de já ter salvo o agendamento, como passo separado —
      // se falhasse, o agendamento ficava criado (sucesso!) mas os itens do
      // orçamento ficavam órfãos, nunca marcados como agendados/cobrados, e
      // o erro virava só um aviso fácil de ignorar (vinculo_warning). A RPC
      // agora grava agendamento + vínculo na MESMA transação.
      const procedimentoFinal =
        multiModo === "laboratorio" ? procedimentos.join(" + ") : payload.procedimento;
      const { data: rpcData, error } = await supabase.rpc(
        "salvar_agendamento_e_vincular_orcamento",
        {
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
        } as never,
      );
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
  });
