/**
 * FONTE OPERACIONAL DA NINA — leitura do cadastro do sistema (server-only).
 *
 * Substitui a leitura do catálogo editorial (tabelas `nina_cat_*`, removidas): a Nina informa o que está no cadastro
 * de médicos/horários/procedimentos, do jeito que está. Quem corrige é a equipe, na origem.
 *
 * Só responde para clínicas com a flag `nina_informa_cadastro` ligada. Sem a flag, a clínica se
 * comporta como uma "clínica sem catálogo": a Nina encaminha para a recepção (decisão anterior
 * para São Francisco de Paula e Consulta Hoje).
 *
 * O cadastro tem milhares de procedimentos; por isso o resultado fica em cache curto (60 s) por
 * clínica, compartilhado entre as respostas. Uma alteração no cadastro chega à Nina em até 1 min.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hojeBR } from "@/lib/date-utils";
import {
  mapearProfissionais,
  mapearServicos,
  type AgendaOp,
  type DisponibilidadeOp,
  type EspecialidadeOp,
  type MedicoOp,
  type ProcedimentoOp,
  type ProfissionalOperacional,
  type VinculoOp,
} from "./fonte-operacional";
import type { ServicoPublicado } from "./catalogo-conhecimento";

export const FLAG_NINA_INFORMA_CADASTRO = "nina_informa_cadastro";
export const VALIDADE_CACHE_MS = 60_000;
const PAGINA = 1000;

export type FonteOperacional = { servicos: ServicoPublicado[]; profissionais: ProfissionalOperacional[] };

const VAZIA = (): FonteOperacional => ({ servicos: [], profissionais: [] });

/** A Nina informa pelo cadastro nesta clínica? Sem linha = não (encaminha para a recepção). */
export async function ninaInformaPeloCadastro(clinicaId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("clinica_feature_flags")
    .select("ativo")
    .eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_NINA_INFORMA_CADASTRO)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.ativo === true;
}

type Consulta = { range: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };

/** Lê todas as páginas (o servidor limita a 1000 linhas por resposta). */
async function todasAsPaginas<T>(montar: () => Consulta): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await montar().range(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    const pagina = (data ?? []) as T[];
    linhas.push(...pagina);
    if (pagina.length < PAGINA) return linhas;
  }
}

async function lerCadastro(clinicaId: string): Promise<FonteOperacional> {
  const db = supabaseAdmin as unknown as { from: (t: string) => any };
  const [medicos, disponibilidades, agendas, procedimentos, vinculos, especialidades] = await Promise.all([
    todasAsPaginas<MedicoOp>(() =>
      db.from("medicos").select("id, nome, especialidade_id, visivel_agendamento_online")
        .eq("clinica_id", clinicaId).eq("ativo", true).order("id", { ascending: true })),
    todasAsPaginas<DisponibilidadeOp>(() =>
      db.from("medico_disponibilidades")
        .select("id, medico_id, agenda_id, dia_semana, hora_inicio, hora_fim, observacoes, limite_pacientes, vigencia_inicio, vigencia_fim")
        .eq("clinica_id", clinicaId).eq("ativo", true).order("id", { ascending: true })),
    todasAsPaginas<AgendaOp>(() =>
      db.from("medico_agendas").select("id, medico_id, nome, ordem_chegada")
        .eq("clinica_id", clinicaId).eq("ativo", true).order("id", { ascending: true })),
    todasAsPaginas<ProcedimentoOp>(() =>
      db.from("procedimentos")
        .select("id, nome, tipo, valor_padrao, valor_dinheiro_pix, valor_dinheiro, valor_cartao, preparo")
        .eq("clinica_id", clinicaId).eq("ativo", true).order("id", { ascending: true })),
    todasAsPaginas<VinculoOp & { medicos?: unknown }>(() =>
      db.from("medico_procedimentos")
        .select("id, medico_id, procedimento_id, especialidade_id, medicos!inner(clinica_id)")
        .eq("medicos.clinica_id", clinicaId).order("id", { ascending: true })),
    todasAsPaginas<EspecialidadeOp>(() => db.from("especialidades").select("id, nome").order("id", { ascending: true })),
  ]);
  const entrada = {
    medicos, disponibilidades, agendas, procedimentos, especialidades,
    vinculos: vinculos.map(({ medico_id, procedimento_id, especialidade_id }) => ({ medico_id, procedimento_id, especialidade_id })),
    hojeISO: hojeBR(),
  };
  return { profissionais: mapearProfissionais(entrada), servicos: mapearServicos(entrada) };
}

const cache = new Map<string, { em: number; leitura: Promise<FonteOperacional> }>();

/** Uso editorial autenticado: leitura fresca para prévia/cópia manual, sem ativar atendimento. */
export async function lerFonteParaSincronizacao(clinicaId: string): Promise<FonteOperacional> {
  const db = supabaseAdmin as unknown as { from: (t: string) => any };
  const [fonte, vinculos] = await Promise.all([
    lerCadastro(clinicaId),
    // Mesma origem de Cadastros > Médicos > Editar médico > Especialidade.
    // A tabela não tem clinica_id: o escopo vem do médico vinculado.
    todasAsPaginas<{ medico_id: string; especialidade: EspecialidadeOp | null }>(() =>
      db.from("medico_especialidades")
        .select("medico_id, especialidade:especialidades(id, nome), medicos!inner(clinica_id)")
        .eq("medicos.clinica_id", clinicaId)
        .order("medico_id", { ascending: true }).order("especialidade_id", { ascending: true })),
  ]);
  const medicos = new Set(fonte.profissionais.map((p) => p.id));
  const porMedico = new Map<string, EspecialidadeOp[]>();
  for (const v of vinculos) {
    if (!medicos.has(v.medico_id)) continue;
    if (!v.especialidade?.id || !v.especialidade.nome?.trim())
      throw new Error("Não foi possível conferir uma especialidade do cadastro médico. Nenhum registro foi sincronizado.");
    const lista = porMedico.get(v.medico_id) ?? [];
    lista.push(v.especialidade);
    porMedico.set(v.medico_id, lista);
  }
  return {
    ...fonte,
    profissionais: fonte.profissionais.map((p) => ({
      ...p,
      // Uma lista vazia é um cadastro sem especialidade, não autorização para
      // recuperar o campo legado ou inferir especialidades pelos procedimentos.
      especialidades: porMedico.get(p.id) ?? [],
    })),
  };
}

/** Limpa o cache (uso em testes). */
export function limparCacheFonteOperacional() {
  cache.clear();
}

/**
 * Consultas e exames/procedimentos da clínica, como estão no cadastro. Clínica sem a flag devolve
 * vazio (a Nina encaminha para a recepção). Falha de leitura não fica em cache e propaga o erro.
 */
export async function lerFonteOperacional(clinicaId: string): Promise<FonteOperacional> {
  const agora = Date.now();
  const guardada = cache.get(clinicaId);
  if (guardada && agora - guardada.em < VALIDADE_CACHE_MS) return guardada.leitura;
  const leitura = (async () => ((await ninaInformaPeloCadastro(clinicaId)) ? await lerCadastro(clinicaId) : VAZIA()))();
  cache.set(clinicaId, { em: agora, leitura });
  try {
    return await leitura;
  } catch (e) {
    if (cache.get(clinicaId)?.leitura === leitura) cache.delete(clinicaId);
    throw e;
  }
}
