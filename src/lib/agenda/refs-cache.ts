import { supabase } from "@/integrations/supabase/client";

/**
 * Cache in-memory (por clínica) das listas de referência usadas na Agenda.
 *
 * Motivação: a abertura da Agenda dispara ~10 SELECTs paralelos para popular
 * dropdowns (procedimentos, médico×procedimento, convênios etc.). Essas
 * listas mudam pouco durante uma sessão de uso, então um TTL curto elimina a
 * maior parte das chamadas repetidas sem alterar o comportamento visível.
 *
 * Sempre que a página de Procedimentos salvar/excluir/alterar algo, chame
 * `invalidateAgendaRefs(clinicaId)` para forçar a próxima leitura a ir ao
 * banco.
 */

export type ProcedimentoRef = {
  id: string;
  nome: string;
  tipo: string | null;
  grupo?: string | null;
  tipo_procedimento?: string | null;
};

export type MedicoProcedimentoRef = {
  medico_id: string | null;
  procedimento_id: string;
  especialidade_id?: string | null;
  created_at?: string | null;
};

export type MedicoConvenioRef = {
  medico_id: string;
  nome: string;
  ativo: boolean | null;
};

export type ProcComValor = {
  nome: string;
  valor_dinheiro: number | null;
  valor_pix: number | null;
  valor_padrao: number | null;
  valor_cartao: number | null;
  valor_cartao_credito: number | null;
  valor_cartao_debito: number | null;
  valor_dinheiro_pix: number | null;
};

const TTL_REFS_MS = 60_000; // 60s — listas leves
const TTL_VALORES_MS = 300_000; // 5min — valores mudam pouco

type Entry<T> = { ts: number; data: T };

const cProcedimentos = new Map<string, Entry<ProcedimentoRef[]>>();
const cMedicoProcs = new Map<string, Entry<MedicoProcedimentoRef[]>>();
const cMedicoConvenios = new Map<string, Entry<MedicoConvenioRef[]>>();
const cProcedimentosComValor = new Map<string, Entry<ProcComValor[]>>();

function fresh<T>(entry: Entry<T> | undefined, ttl: number): T | null {
  if (!entry) return null;
  return Date.now() - entry.ts < ttl ? entry.data : null;
}

export async function getProcedimentosAgenda(
  clinicaId: string,
): Promise<ProcedimentoRef[]> {
  const cached = fresh(cProcedimentos.get(clinicaId), TTL_REFS_MS);
  if (cached) return cached;
  const pageSize = 1000;
  const rows: ProcedimentoRef[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("procedimentos")
      .select("id,nome,tipo,grupo,tipo_procedimento")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true)
      .order("nome")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as ProcedimentoRef[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  cProcedimentos.set(clinicaId, { ts: Date.now(), data: rows });
  return rows;
}

export async function getMedicoProcedimentosAgenda(
  clinicaId: string,
): Promise<MedicoProcedimentoRef[]> {
  const cached = fresh(cMedicoProcs.get(clinicaId), TTL_REFS_MS);
  if (cached) return cached;
  // PostgREST cap the response at 1000 rows per request by default. Using a
  // pageSize acima disso faz o loop de paginação parar cedo (o servidor
  // devolve 1000, o código compara com 5000, pensa que terminou e nunca lê
  // as próximas páginas — causando vínculos de médico "sumirem" na agenda).
  const pageSize = 1000;
  const rows: MedicoProcedimentoRef[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("medico_procedimentos")
      .select(
        "medico_id,procedimento_id,especialidade_id,created_at,medicos!inner(clinica_id)",
      )
      .eq("medicos.clinica_id", clinicaId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as MedicoProcedimentoRef[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  cMedicoProcs.set(clinicaId, { ts: Date.now(), data: rows });
  return rows;
}

export async function getMedicoConveniosAgenda(
  clinicaId: string,
): Promise<MedicoConvenioRef[]> {
  const cached = fresh(cMedicoConvenios.get(clinicaId), TTL_REFS_MS);
  if (cached) return cached;
  const { data, error } = await supabase
    .from("medico_convenios")
    .select("medico_id,nome,ativo,medicos!inner(clinica_id)")
    .eq("ativo", true)
    .eq("medicos.clinica_id", clinicaId);
  if (error) throw error;
  const rows = (data ?? []) as unknown as MedicoConvenioRef[];
  cMedicoConvenios.set(clinicaId, { ts: Date.now(), data: rows });
  return rows;
}

export async function getProcedimentosComValor(
  clinicaId: string,
): Promise<ProcComValor[]> {
  const cached = fresh(cProcedimentosComValor.get(clinicaId), TTL_VALORES_MS);
  if (cached) return cached;
  const { data } = await supabase
    .from("procedimentos")
    .select(
      "nome,valor_dinheiro,valor_pix,valor_padrao,valor_cartao,valor_cartao_credito,valor_cartao_debito,valor_dinheiro_pix",
    )
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .limit(5000);
  const rows = (data ?? []) as ProcComValor[];
  cProcedimentosComValor.set(clinicaId, { ts: Date.now(), data: rows });
  return rows;
}

/**
 * Invalida os caches. Se `clinicaId` for passado, limpa só aquela clínica;
 * sem argumento, limpa todas.
 */
export function invalidateAgendaRefs(clinicaId?: string): void {
  if (clinicaId) {
    cProcedimentos.delete(clinicaId);
    cMedicoProcs.delete(clinicaId);
    cMedicoConvenios.delete(clinicaId);
    cProcedimentosComValor.delete(clinicaId);
    return;
  }
  cProcedimentos.clear();
  cMedicoProcs.clear();
  cMedicoConvenios.clear();
  cProcedimentosComValor.clear();
}