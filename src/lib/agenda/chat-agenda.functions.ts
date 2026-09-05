/**
 * Agenda dentro da conversa — leitura da MESMA agenda do sistema.
 *
 * Nada aqui cria estrutura paralela: a disponibilidade sai das próprias linhas
 * "DISPONÍVEL" de `agendamentos` (exatamente o que o núcleo de criação exige
 * para deixar marcar) e a gravação continua sendo feita pelo motor existente
 * (`criarAgendamento` → `criarAgendamentoCore`), com todas as travas dele.
 *
 * Todas as consultas rodam com o usuário autenticado (RLS), então a atendente
 * só enxerga a clínica onde é membro.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SEM_RESULTADO = "00000000-0000-0000-0000-000000000000";
const TZ = "America/Sao_Paulo";

function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Limites do dia (AAAA-MM-DD) no fuso da clínica, em ISO UTC. */
function janelaDia(dataISO: string) {
  const ini = new Date(`${dataISO}T00:00:00-03:00`);
  const fim = new Date(`${dataISO}T23:59:59-03:00`);
  return { ini: ini.toISOString(), fim: fim.toISOString() };
}

function horaBR(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dataBRISO(iso: string) {
  // AAAA-MM-DD no fuso da clínica
  const p = new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ }).split("/");
  return `${p[2]}-${p[1]}-${p[0]}`;
}

/* ------------------------------------------------------------ catálogo */

export const catalogoAgendaChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [proc, med, esp, agendas] = await Promise.all([
      context.supabase
        .from("procedimentos")
        .select("id, nome, tipo, duracao_minutos")
        .eq("clinica_id", data.clinicaId)
        .eq("ativo", true)
        .order("nome"),
      context.supabase
        .from("medicos")
        .select("id, nome, especialidade_id")
        .eq("clinica_id", data.clinicaId)
        .eq("ativo", true)
        .order("nome"),
      context.supabase.from("especialidades").select("id, nome"),
      context.supabase
        .from("medico_agendas")
        .select("medico_id, ordem_chegada")
        .eq("clinica_id", data.clinicaId)
        .eq("ativo", true),
    ]);
    const ordemChegada = new Set(
      ((agendas.data ?? []) as Array<{ medico_id: string; ordem_chegada: boolean | null }>)
        .filter((a) => a.ordem_chegada)
        .map((a) => a.medico_id),
    );
    return {
      procedimentos: (proc.data ?? []) as Array<{
        id: string;
        nome: string;
        tipo: string | null;
        duracao_minutos: number | null;
      }>,
      medicos: ((med.data ?? []) as Array<{
        id: string;
        nome: string;
        especialidade_id: string | null;
      }>).map((m) => ({ ...m, ordem_chegada: ordemChegada.has(m.id) })),
      especialidades: (esp.data ?? []) as Array<{ id: string; nome: string }>,
    };
  });

/* -------------------------------------------------------- disponibilidade */

const SlotsInput = z.object({
  clinicaId: z.string().uuid(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  medicoId: z.string().uuid().nullable().optional(),
});

export type SlotChat = {
  inicio: string;
  fim: string;
  hora: string;
  medico_id: string;
  medico_nome: string;
  livre: boolean;
  ordem_chegada: boolean;
};

/** Horários de um dia: livres e ocupados (ocupado só para contexto visual). */
export const slotsAgendaChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SlotsInput.parse(d))
  .handler(async ({ data, context }): Promise<SlotChat[]> => {
    const { ini, fim } = janelaDia(data.data);
    let q = context.supabase
      .from("agendamentos")
      .select("medico_id, inicio, fim, paciente_nome, status, agenda_id")
      .eq("clinica_id", data.clinicaId)
      .gte("inicio", ini)
      .lte("inicio", fim)
      .neq("status", "cancelado")
      .order("inicio")
      .limit(800);
    if (data.medicoId) q = q.eq("medico_id", data.medicoId);
    const { data: linhas, error } = await q;
    if (error) throw new Error(error.message);

    const rows = (linhas ?? []) as Array<{
      medico_id: string | null;
      inicio: string;
      fim: string;
      paciente_nome: string | null;
      agenda_id: string | null;
    }>;
    const medIds = [...new Set(rows.map((r) => r.medico_id).filter(Boolean) as string[])];
    const [{ data: meds }, { data: ags }] = await Promise.all([
      context.supabase
        .from("medicos")
        .select("id, nome")
        .in("id", medIds.length ? medIds : [SEM_RESULTADO]),
      context.supabase
        .from("medico_agendas")
        .select("id, ordem_chegada")
        .eq("clinica_id", data.clinicaId),
    ]);
    const nome = new Map(
      ((meds ?? []) as Array<{ id: string; nome: string }>).map((m) => [m.id, m.nome]),
    );
    const oc = new Map(
      ((ags ?? []) as Array<{ id: string; ordem_chegada: boolean | null }>).map((a) => [
        a.id,
        !!a.ordem_chegada,
      ]),
    );

    return rows
      .filter((r) => r.medico_id && nome.has(r.medico_id))
      .map((r) => {
        const n = normalizar(r.paciente_nome ?? "");
        return {
          inicio: r.inicio,
          fim: r.fim,
          hora: horaBR(r.inicio),
          medico_id: r.medico_id as string,
          medico_nome: nome.get(r.medico_id as string) ?? "",
          // "bloqueio" nunca é oferecido nem exibido como ocupado comum.
          livre: n === "disponivel",
          ordem_chegada: r.agenda_id ? (oc.get(r.agenda_id) ?? false) : false,
        };
      })
      .filter((s) => s.livre || normalizar(s.medico_nome) !== "");
  });

/** Dias do mês que possuem pelo menos uma vaga livre (para pintar o calendário). */
export const diasComVagaChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        medicoId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<string[]> => {
    let q = context.supabase
      .from("agendamentos")
      .select("inicio, paciente_nome")
      .eq("clinica_id", data.clinicaId)
      .gte("inicio", janelaDia(data.de).ini)
      .lte("inicio", janelaDia(data.ate).fim)
      .neq("status", "cancelado")
      .limit(5000);
    if (data.medicoId) q = q.eq("medico_id", data.medicoId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const dias = new Set<string>();
    for (const r of (rows ?? []) as Array<{ inicio: string; paciente_nome: string | null }>) {
      if (normalizar(r.paciente_nome ?? "") === "disponivel") dias.add(dataBRISO(r.inicio));
    }
    return [...dias].sort();
  });

/** Próxima vaga a partir de agora (opcionalmente de um médico). */
export const proximaVagaChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        medicoId: z.string().uuid().nullable().optional(),
        dias: z.number().int().min(1).max(90).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const agora = new Date();
    const ate = new Date(agora.getTime() + (data.dias ?? 60) * 86_400_000);
    let q = context.supabase
      .from("agendamentos")
      .select("medico_id, inicio, fim, paciente_nome")
      .eq("clinica_id", data.clinicaId)
      .gte("inicio", agora.toISOString())
      .lte("inicio", ate.toISOString())
      .neq("status", "cancelado")
      .order("inicio")
      .limit(2000);
    if (data.medicoId) q = q.eq("medico_id", data.medicoId);
    const { data: rows } = await q;
    const livres = ((rows ?? []) as Array<{
      medico_id: string | null;
      inicio: string;
      fim: string;
      paciente_nome: string | null;
    }>).filter((r) => normalizar(r.paciente_nome ?? "") === "disponivel");

    if (data.medicoId) {
      const p = livres[0];
      return p
        ? { data: dataBRISO(p.inicio), hora: horaBR(p.inicio), inicio: p.inicio, medico_id: p.medico_id }
        : null;
    }
    // Sem médico definido: primeira vaga de cada profissional (para "ver outros").
    const porMedico = new Map<string, { inicio: string }>();
    for (const l of livres) {
      if (l.medico_id && !porMedico.has(l.medico_id)) porMedico.set(l.medico_id, { inicio: l.inicio });
    }
    const ids = [...porMedico.keys()];
    const { data: meds } = await context.supabase
      .from("medicos")
      .select("id, nome")
      .in("id", ids.length ? ids : [SEM_RESULTADO]);
    const nome = new Map(
      ((meds ?? []) as Array<{ id: string; nome: string }>).map((m) => [m.id, m.nome]),
    );
    return ids
      .map((id) => ({
        medico_id: id,
        medico_nome: nome.get(id) ?? "",
        data: dataBRISO(porMedico.get(id)!.inicio),
        hora: horaBR(porMedico.get(id)!.inicio),
        inicio: porMedico.get(id)!.inicio,
      }))
      .filter((m) => m.medico_nome)
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
  });

/* ------------------------------------------------------------- pacientes */

export const buscarPacientesChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ clinicaId: z.string().uuid(), termo: z.string().trim().min(2).max(120) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const digitos = data.termo.replace(/\D/g, "");
    const filtros = [`nome.ilike.%${data.termo}%`];
    if (digitos.length >= 3) filtros.push(`cpf.ilike.%${digitos}%`, `telefone.ilike.%${digitos}%`);
    const { data: rows } = await context.supabase
      .from("pacientes")
      .select("id, nome, cpf, telefone, data_nascimento")
      .eq("clinica_id", data.clinicaId)
      .or(filtros.join(","))
      .order("nome")
      .limit(20);
    return (rows ?? []) as Array<{
      id: string;
      nome: string;
      cpf: string | null;
      telefone: string | null;
      data_nascimento: string | null;
    }>;
  });

/** Agendamentos futuros do paciente — usado só para alertar possível duplicidade. */
export const agendamentosFuturosChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clinicaId: z.string().uuid(), pacienteId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("agendamentos")
      .select("id, inicio, procedimento, medico_id, status")
      .eq("clinica_id", data.clinicaId)
      .eq("paciente_id", data.pacienteId)
      .gte("inicio", new Date().toISOString())
      .in("status", ["agendado", "confirmado"])
      .order("inicio")
      .limit(5);
    const lista = (rows ?? []) as Array<{
      id: string;
      inicio: string;
      procedimento: string | null;
      medico_id: string | null;
    }>;
    const ids = [...new Set(lista.map((l) => l.medico_id).filter(Boolean) as string[])];
    const { data: meds } = await context.supabase
      .from("medicos")
      .select("id, nome")
      .in("id", ids.length ? ids : [SEM_RESULTADO]);
    const nome = new Map(
      ((meds ?? []) as Array<{ id: string; nome: string }>).map((m) => [m.id, m.nome]),
    );
    return lista.map((l) => ({
      id: l.id,
      data: dataBRISO(l.inicio),
      hora: horaBR(l.inicio),
      procedimento: l.procedimento,
      medico_nome: l.medico_id ? (nome.get(l.medico_id) ?? null) : null,
    }));
  });

/* ------------------------------------------------- evento interno na conversa */

export const registrarAgendamentoNaConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        agendamentoId: z.string().uuid(),
        resumo: z.string().max(400),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Evento interno da timeline. Não vai para o WhatsApp.
    const { error } = await context.supabase.from("atend_conversa_eventos").insert({
      clinica_id: data.clinicaId,
      conversa_id: data.conversaId,
      evento: "AGENDAMENTO_CRIADO",
      user_id: context.userId,
      motivo: data.resumo,
      detalhes: { agendamento_id: data.agendamentoId } as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
