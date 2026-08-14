import { supabase } from "@/integrations/supabase/client";
import { makeCache } from "@/lib/cache/single-flight";

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

export type MedicoRef = {
  id: string;
  nome: string;
  sexo?: string | null;
  usa_sistema?: boolean | null;
  especialidade_id?: string | null;
  procedimento_padrao_id?: string | null;
  procedimento_padrao_em_branco?: boolean | null;
};

// `makeCache` acrescenta "single flight": chamadas simultâneas para a mesma
// clínica compartilham a MESMA requisição em vez de cada uma bater no banco.
const cProcedimentos = makeCache<ProcedimentoRef[]>(TTL_REFS_MS);
const cMedicoProcs = makeCache<MedicoProcedimentoRef[]>(TTL_REFS_MS);
const cMedicoConvenios = makeCache<MedicoConvenioRef[]>(TTL_REFS_MS);
const cProcedimentosComValor = makeCache<ProcComValor[]>(TTL_VALORES_MS);
const cMedicos = makeCache<MedicoRef[]>(TTL_REFS_MS);

export function getProcedimentosAgenda(clinicaId: string): Promise<ProcedimentoRef[]> {
  return cProcedimentos.get(clinicaId, async () => {
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
    return rows;
  });
}

export function getMedicosAgenda(clinicaId: string): Promise<MedicoRef[]> {
  return cMedicos.get(clinicaId, async () => {
    const { data, error } = await supabase
      .from("medicos")
      .select(
        "id,nome,sexo,usa_sistema,especialidade_id,procedimento_padrao_id,procedimento_padrao_em_branco",
      )
      .eq("clinica_id", clinicaId)
      .eq("ativo", true)
      .order("nome");
    if (error) throw error;
    return (data ?? []) as MedicoRef[];
  });
}

export function getMedicoProcedimentosAgenda(clinicaId: string): Promise<MedicoProcedimentoRef[]> {
  return cMedicoProcs.get(clinicaId, async () => {
    // PostgREST limita a resposta a 1000 linhas por requisição; usar pageSize
    // maior faria o loop parar cedo e "sumir" vínculos de médico na agenda.
    const pageSize = 1000;
    const rows: MedicoProcedimentoRef[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("medico_procedimentos")
        .select("medico_id,procedimento_id,especialidade_id,created_at,medicos!inner(clinica_id)")
        .eq("medicos.clinica_id", clinicaId)
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const page = (data ?? []) as unknown as MedicoProcedimentoRef[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    return rows;
  });
}

export function getMedicoConveniosAgenda(clinicaId: string): Promise<MedicoConvenioRef[]> {
  return cMedicoConvenios.get(clinicaId, async () => {
    const pageSize = 1000;
    const rows: MedicoConvenioRef[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("medico_convenios")
        .select("medico_id,nome,ativo,medicos!inner(clinica_id)")
        .eq("ativo", true)
        .eq("medicos.clinica_id", clinicaId)
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const page = (data ?? []) as unknown as MedicoConvenioRef[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    return rows;
  });
}

export function getProcedimentosComValor(clinicaId: string): Promise<ProcComValor[]> {
  return cProcedimentosComValor.get(clinicaId, async () => {
    const pageSize = 1000;
    const rows: ProcComValor[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("procedimentos")
        .select(
          "nome,valor_dinheiro,valor_pix,valor_padrao,valor_cartao,valor_cartao_credito,valor_cartao_debito,valor_dinheiro_pix",
        )
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .range(from, from + pageSize - 1);
      if (error) break;
      const page = (data ?? []) as ProcComValor[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    return rows;
  });
}

/**
 * Invalida os caches. Se `clinicaId` for passado, limpa só aquela clínica;
 * sem argumento, limpa todas.
 */
export function invalidateAgendaRefs(clinicaId?: string): void {
  cProcedimentos.invalidate(clinicaId);
  cMedicoProcs.invalidate(clinicaId);
  cMedicoConvenios.invalidate(clinicaId);
  cProcedimentosComValor.invalidate(clinicaId);
  cMedicos.invalidate(clinicaId);
}
