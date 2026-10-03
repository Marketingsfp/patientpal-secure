import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { hojeBR, janelaDiaClinica } from "@/lib/date-utils";
import {
  periodoDashboard,
  resumirMensagensHumanas,
  resumirEncerramentosHumanos,
  resumirPrimeiraRespostaHumanas,
} from "./dashboard-oszap";

const LIMITE = 20000;
const PAGINA = 1000;
/** Metadados paginados, sem texto de mensagens ou dados pessoais de pacientes. */
async function lerPaginas<T>(
  consulta: (
    de: number,
    ate: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const linhas: T[] = [];
  let parcial = false;
  for (let de = 0; de <= LIMITE; de += PAGINA) {
    const r = await consulta(de, de === LIMITE ? de : de + PAGINA - 1);
    if (r.error) throw Error(r.error.message);
    if (de === LIMITE) {
      parcial = !!r.data?.length;
      break;
    }
    linhas.push(...(r.data ?? []));
    if (!r.data || r.data.length < PAGINA) break;
  }
  return { linhas, parcial };
}

async function autorizarGestao(db: SupabaseClient<Database>, userId: string, clinicaId: string) {
  const r = await db.rpc("can_manage_clinica", { _clinica_id: clinicaId, _user_id: userId });
  if (r.error) throw Error(r.error.message);
  if (r.data !== true)
    throw Error("O dashboard completo de atendimento é destinado à administração e supervisão.");
}

/** Só leitura; resultados por período civil, sem ciclo ou indicadores da IA. */
export async function carregarResumoDashboardOsZap(
  db: SupabaseClient<Database>,
  userId: string,
  clinicaId: string,
  dias: number,
) {
  await autorizarGestao(db, userId, clinicaId);
  const periodo = periodoDashboard(dias);
  const inicio = janelaDiaClinica(periodo.de).inicio;
  const fim = janelaDiaClinica(periodo.ate).fimExclusivo;
  const avisos: string[] = [];
  async function ler<T>(nome: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch {
      avisos.push(`${nome}: não foi possível consultar.`);
      return null;
    }
  }
  const humano =
    "owner_type.neq.AI,atribuida_user_id.not.is.null,resolved_by.not.is.null,handoff_em.not.is.null";
  const [historico, mensagens, encerramentos, primeiraResposta, transferencias] = await Promise.all(
    [
      ler("Histórico humano", async () => {
        const [total, fechadas] = await Promise.all([
          db
            .from("atend_conversas")
            .select("id", { count: "exact", head: true })
            .eq("clinica_id", clinicaId)
            .eq("is_teste", false)
            .or(humano),
          db
            .from("atend_conversas")
            .select("id", { count: "exact", head: true })
            .eq("clinica_id", clinicaId)
            .eq("is_teste", false)
            .or(humano)
            .in("status", ["closed", "finished"]),
        ]);
        if (total.error || fechadas.error) throw total.error || fechadas.error;
        return { total: total.count ?? 0, encerradas: fechadas.count ?? 0 };
      }),
      ler("Mensagens das atendentes", async () => {
        const r = await lerPaginas((de, ate) =>
          db
            .from("whatsapp_mensagens")
            .select("created_at, conversa_id, enviada_por_user_id, enviada_por, status")
            .eq("clinica_id", clinicaId)
            .eq("is_teste", false)
            .eq("direction", "out")
            .neq("status", "system")
            .or("enviada_por.eq.humano,enviada_por_user_id.not.is.null")
            .gte("created_at", inicio)
            .lt("created_at", fim)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(de, ate),
        );
        return { ...resumirMensagensHumanas(r.linhas), parcial: r.parcial };
      }),
      ler("Encerramentos humanos", async () => {
        const r = await lerPaginas((de, ate) =>
          db
            .from("atend_conversas")
            .select("resolved_by, resolved_at, handoff_em, assigned_at")
            .eq("clinica_id", clinicaId)
            .eq("is_teste", false)
            .or(humano)
            .gte("resolved_at", inicio)
            .lt("resolved_at", fim)
            .order("resolved_at", { ascending: false })
            .order("id", { ascending: false })
            .range(de, ate),
        );
        return { ...resumirEncerramentosHumanos(r.linhas), parcial: r.parcial };
      }),
      ler("Primeira resposta humana", async () => {
        const r = await lerPaginas((de, ate) =>
          db
            .from("atend_conversas")
            .select("sla_first_response_seg")
            .eq("clinica_id", clinicaId)
            .eq("is_teste", false)
            .or(humano)
            .gte("primeiro_resp_em", inicio)
            .lt("primeiro_resp_em", fim)
            .order("primeiro_resp_em", { ascending: false })
            .order("id", { ascending: false })
            .range(de, ate),
        );
        return {
          ...resumirPrimeiraRespostaHumanas(r.linhas.map((l) => l.sla_first_response_seg)),
          parcial: r.parcial,
        };
      }),
      ler("Transferências manuais", async () => {
        const r = await lerPaginas((de, ate) =>
          db
            .from("atend_transferencias")
            .select("conversa_id")
            .eq("clinica_id", clinicaId)
            .not("de_user_id", "is", null)
            .gte("created_at", inicio)
            .lt("created_at", fim)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(de, ate),
        );
        const ids = [...new Set(r.linhas.map((l) => l.conversa_id))];
        const reais = new Set<string>();
        for (let i = 0; i < ids.length; i += 200) {
          const q = await db
            .from("atend_conversas")
            .select("id")
            .eq("clinica_id", clinicaId)
            .eq("is_teste", false)
            .in("id", ids.slice(i, i + 200));
          if (q.error) throw q.error;
          for (const c of q.data ?? []) reais.add(c.id);
        }
        return {
          total: r.linhas.filter((l) => reais.has(l.conversa_id)).length,
          parcial: r.parcial,
        };
      }),
    ],
  );
  const ids = [
    ...new Set(
      [...(mensagens?.porPessoa ?? []), ...(encerramentos?.porPessoa ?? [])].map((p) => p.id),
    ),
  ];
  const pessoas = await ler("Nomes da equipe", async () => {
    const nomes: { id: string; nome: string | null }[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const r = await db
        .from("profiles")
        .select("id, nome")
        .in("id", ids.slice(i, i + 200));
      if (r.error) throw r.error;
      nomes.push(...(r.data ?? []));
    }
    const map = new Map(nomes.map((p) => [p.id, p.nome]));
    return ids.map((id) => ({
      id,
      nome: map.get(id) || "Nome não disponível",
      mensagens: mensagens?.porPessoa.find((p) => p.id === id)?.total ?? 0,
      encerradas: encerramentos?.porPessoa.find((p) => p.id === id)?.total ?? 0,
    }));
  });
  return {
    periodo,
    inicio,
    fim,
    historico,
    mensagens,
    encerramentos,
    primeiraResposta,
    transferencias,
    pessoas,
    avisos,
    limite: LIMITE,
    atualizadoEm: new Date().toISOString(),
  };
}

/** Usa a regra central da TV, devolvendo somente a operação humana. */
export async function carregarFilaHumanaDashboard(
  db: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  userId: string,
  clinicaId: string,
) {
  const { carregarPainelTv } = await import("./painel-tv.server");
  const f = await carregarPainelTv(db, admin, clinicaId, userId);
  // Autoria humana comprovada; não herda o total de todos os encerramentos da TV.
  let encerramentosHoje: ReturnType<typeof resumirEncerramentosHumanos> | null = null;
  let encerramentosHojeParcial = false;
  try {
    const { inicio, fimExclusivo } = janelaDiaClinica(hojeBR());
    const r = await lerPaginas((de, ate) =>
      db
        .from("atend_conversas")
        .select("resolved_by, resolved_at, handoff_em, assigned_at")
        .eq("clinica_id", clinicaId)
        .eq("is_teste", false)
        .not("resolved_by", "is", null)
        .gte("resolved_at", inicio)
        .lt("resolved_at", fimExclusivo)
        .order("resolved_at", { ascending: false })
        .order("id", { ascending: false })
        .range(de, ate),
    );
    encerramentosHoje = resumirEncerramentosHumanos(r.linhas);
    encerramentosHojeParcial = r.parcial;
  } catch {
    // Falha de contagem não inventa zero nem indisponibiliza a fila inteira.
  }
  let departamentos:
    | null
    | { id: string | null; nome: string; abertas: number; semResponsavel: number }[] = null;
  let departamentosParcial = false;
  try {
    const [conversas, depts] = await Promise.all([
      lerPaginas((de, ate) =>
        db
          .from("atend_conversas")
          .select("departamento_id, atribuida_user_id")
          .eq("clinica_id", clinicaId)
          .eq("is_teste", false)
          .neq("owner_type", "AI")
          .not("status", "in", "(closed,finished)")
          .order("id", { ascending: true })
          .range(de, ate),
      ),
      db.from("atend_departamentos").select("id, nome").eq("clinica_id", clinicaId),
    ]);
    if (depts.error) throw depts.error;
    const nomes = new Map((depts.data ?? []).map((d) => [d.id, d.nome]));
    const mapa = new Map<
      string | null,
      { id: string | null; nome: string; abertas: number; semResponsavel: number }
    >();
    for (const c of conversas.linhas) {
      const row = mapa.get(c.departamento_id) ?? {
        id: c.departamento_id,
        nome: c.departamento_id
          ? nomes.get(c.departamento_id) || "Departamento não disponível"
          : "Sem departamento",
        abertas: 0,
        semResponsavel: 0,
      };
      row.abertas++;
      if (!c.atribuida_user_id) row.semResponsavel++;
      mapa.set(c.departamento_id, row);
    }
    departamentos = [...mapa.values()].sort((a, b) => b.abertas - a.abertas);
    departamentosParcial = conversas.parcial;
  } catch {
    /* Fila principal permanece disponível; o bloco de departamentos declara a ausência. */
  }
  return {
    atendentes: f.atendentes.map((p) => ({
      ...p,
      resolvidasHoje: encerramentosHoje
        ? (encerramentosHoje.porPessoa.find((a) => a.id === p.id)?.total ?? 0)
        : null,
    })),
    emAndamento: f.emAndamento,
    naoAtribuidas: f.naoAtribuidas,
    espera: f.espera,
    resolvidasHoje: encerramentosHoje?.total ?? null,
    encerramentosHojeParcial,
    departamentos,
    departamentosParcial,
    atualizadoEm: f.atualizadoEm,
  };
}
