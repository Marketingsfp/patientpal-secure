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
  enfermagem_recurso_id: string | null;
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
      enfermagem_recurso_id: it.enfermagem_recurso_id,
      inicio: it.inicio,
      fim: it.fim,
      procedimento: it.procedimento,
      status: "agendado" as const,
      observacoes: it.observacoes ?? observacoes_gerais ?? null,
      tipo_atendimento: it.tipo_atendimento,
      atendimento_grupo_id: grupoId,
    }));

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