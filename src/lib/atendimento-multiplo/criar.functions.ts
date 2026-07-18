// Cria N agendamentos irmãos vinculados por `atendimento_grupo_id`.
// Fluxo "Atendimento Múltiplo" da recepção: um paciente, vários serviços
// diferentes (consulta + lab + RX, por ex.), cada um com seu próprio
// profissional/recurso e horário. Nada muda em cobrança, guia, NFS-e ou
// pagamento — cada linha continua sendo um agendamento normal com seu
// próprio fin_atendimento; apenas ficam ligados pelo grupo.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ItemAtendimentoMultiplo = {
  procedimento: string;
  medico_id: string | null;
  inicio: string; // ISO
  fim: string;    // ISO
  tipo_atendimento: "particular" | "convenio";
  observacoes?: string | null;
};

export type CriarAtendimentoMultiploInput = {
  clinica_id: string;
  paciente_id: string;
  paciente_nome: string;
  itens: ItemAtendimentoMultiplo[];
  observacoes_gerais?: string | null;
};

export type CriarAtendimentoMultiploResult =
  | {
      ok: true;
      grupo_id: string;
      agendamento_ids: string[];
    }
  | {
      ok: false;
      message: string;
    };

export const criarAtendimentoMultiplo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CriarAtendimentoMultiploInput) => data)
  .handler(async ({ data, context }): Promise<CriarAtendimentoMultiploResult> => {
    const { supabase } = context;
    const { clinica_id, paciente_id, paciente_nome, itens, observacoes_gerais } = data;

    if (!itens || itens.length === 0) {
      return { ok: false, message: "Adicione pelo menos um serviço ao atendimento." };
    }
    if (itens.length > 20) {
      return { ok: false, message: "Máximo de 20 serviços por atendimento múltiplo." };
    }

    // Paciente precisa ter telefone + data_nascimento (regra da agenda).
    const { data: pac } = await supabase
      .from("pacientes")
      .select("telefone,data_nascimento")
      .eq("id", paciente_id)
      .maybeSingle();
    const semTel = !pac?.telefone || !String(pac.telefone).trim();
    const semNasc = !pac?.data_nascimento;
    if (semTel || semNasc) {
      const falta = [semTel && "telefone", semNasc && "data de nascimento"]
        .filter(Boolean)
        .join(" e ");
      return {
        ok: false,
        message: `Preencha ${falta} do paciente antes de agendar (Cadastro do paciente).`,
      };
    }

    // MED-03: este fluxo cria agendamentos por um caminho separado (não
    // passa por criarAgendamento), então tinha as mesmas duas lacunas —
    // nada checava se o paciente já tinha outro agendamento no mesmo
    // horário, nem bloqueava data já passada.
    const hojeInicio = new Date();
    hojeInicio.setHours(0, 0, 0, 0);
    const passado = itens.find((it) => new Date(it.inicio).getTime() < hojeInicio.getTime());
    if (passado) {
      return { ok: false, message: "Não é possível criar um agendamento para uma data que já passou." };
    }
    const overlap = (aIni: string, aFim: string, bIni: string, bFim: string) =>
      new Date(aIni).getTime() < new Date(bFim).getTime() && new Date(aFim).getTime() > new Date(bIni).getTime();
    for (let i = 0; i < itens.length; i++) {
      for (let j = i + 1; j < itens.length; j++) {
        if (overlap(itens[i].inicio, itens[i].fim, itens[j].inicio, itens[j].fim)) {
          return {
            ok: false,
            message: `Dois serviços deste atendimento têm horários conflitantes entre si (item ${i + 1} e ${j + 1}).`,
          };
        }
      }
    }
    const minIni = itens.reduce((min, it) => (it.inicio < min ? it.inicio : min), itens[0].inicio);
    const maxFim = itens.reduce((max, it) => (it.fim > max ? it.fim : max), itens[0].fim);
    const { data: existentes } = await supabase
      .from("agendamentos")
      .select("id, inicio, fim")
      .eq("clinica_id", clinica_id)
      .eq("paciente_id", paciente_id)
      .neq("status", "cancelado")
      .lt("inicio", maxFim)
      .gt("fim", minIni);
    const conflitoExistente = ((existentes ?? []) as Array<{ id: string; inicio: string; fim: string }>)
      .find((ex) => itens.some((it) => overlap(it.inicio, it.fim, ex.inicio, ex.fim)));
    if (conflitoExistente) {
      return {
        ok: false,
        message: `Este paciente já tem outro agendamento nesse horário (${new Date(conflitoExistente.inicio).toLocaleString("pt-BR")}). Escolha outro horário ou cancele o conflito primeiro.`,
      };
    }

    // Um único grupo id para todos os agendamentos deste atendimento.
    const grupoId =
      (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.() ??
      // Fallback simples (extremamente improvável cair aqui em Cloudflare Workers).
      Array.from({ length: 4 }, () => Math.random().toString(16).slice(2, 10)).join("-");

    const rows = itens.map((it) => ({
      clinica_id,
      paciente_id,
      paciente_nome,
      medico_id: it.medico_id,
      inicio: it.inicio,
      fim: it.fim,
      procedimento: it.procedimento,
      status: "agendado" as const,
      observacoes: it.observacoes ?? observacoes_gerais ?? null,
      tipo_atendimento: it.tipo_atendimento,
      atendimento_grupo_id: grupoId,
    }));

    // Backfill de agenda_id — para cada item com médico, tenta localizar a
    // `medico_agenda` ativa no dia. Sem isso, o filtro "por agenda" da agenda
    // clássica esconde os agendamentos criados aqui.
    const medicoIds = Array.from(
      new Set(itens.map((it) => it.medico_id).filter((x): x is string => !!x)),
    );
    if (medicoIds.length > 0) {
      const { data: agendas } = await supabase
        .from("medico_agendas")
        .select("id, medico_id, ativo")
        .in("medico_id", medicoIds)
        .eq("clinica_id", clinica_id)
        .eq("ativo", true);
      const agendaByMedico = new Map<string, string>();
      for (const a of (agendas ?? []) as Array<{ id: string; medico_id: string }>) {
        if (!agendaByMedico.has(a.medico_id)) agendaByMedico.set(a.medico_id, a.id);
      }
      for (const r of rows) {
        if (r.medico_id && agendaByMedico.has(r.medico_id)) {
          (r as Record<string, unknown>).agenda_id = agendaByMedico.get(r.medico_id);
        }
      }
    }

    const { data: novos, error } = await supabase
      .from("agendamentos")
      .insert(rows)
      .select("id");

    if (error || !novos) {
      return {
        ok: false,
        message: error?.message ?? "Não foi possível criar o atendimento múltiplo.",
      };
    }

    return {
      ok: true,
      grupo_id: grupoId,
      agendamento_ids: (novos as Array<{ id: string }>).map((r) => r.id),
    };
  });