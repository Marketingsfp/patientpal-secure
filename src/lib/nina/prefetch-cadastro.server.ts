/**
 * Pré-busca do cadastro — execução no servidor.
 *
 * Usa o MESMO Tool Broker do turno (mesma implementação das ferramentas, mesmo
 * cache/idempotência). Nunca lança e nunca passa do prazo: qualquer falha ou
 * demora devolve `null` e o turno segue o fluxo atual.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ResultadoBroker } from "./tool-broker";
import { FLAG_PREFETCH_CADASTRO, PRAZO_PREFETCH_MS, planejarPrefetch, type PlanoPrefetch } from "./prefetch-cadastro";
import type { IntencaoNina } from "./atendimento-fase1";

/** Sem linha gravada = ligada. Erro de leitura = desligada (não arrisca o turno). */
export async function prefetchAtivoNaClinica(clinicaId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("clinica_feature_flags")
    .select("ativo")
    .eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_PREFETCH_CADASTRO)
    .maybeSingle();
  if (error) return false;
  if (!data) return true;
  return Boolean(data.ativo);
}

export type ResultadoPrefetch = {
  plano: PlanoPrefetch;
  resultados: Array<{ nome: string; args: string; r: ResultadoBroker }>;
  duracaoMs: number;
};

export type MotivoSemPrefetch = { motivo: string; duracaoMs: number; termo?: string };

export async function executarPrefetchCadastro(p: {
  clinicaId: string;
  mensagem: string;
  intencao: IntencaoNina | IntencaoNina[] | null;
  nomePopular: { especialidade: string } | null;
  ferramentasDisponiveis: string[];
  executar: (nome: string, args: string) => Promise<ResultadoBroker>;
}): Promise<ResultadoPrefetch | MotivoSemPrefetch> {
  const inicio = Date.now();
  const fim = (motivo: string, termo?: string): MotivoSemPrefetch => ({ motivo, duracaoMs: Date.now() - inicio, termo });
  const trabalho = (async (): Promise<ResultadoPrefetch | MotivoSemPrefetch> => {
    if (!(await prefetchAtivoNaClinica(p.clinicaId))) return fim("flag desligada");
    const { catalogoDoTurno } = await import("./catalogo-turno.server");
    const catalogo = await catalogoDoTurno(p.clinicaId);
    const plano = planejarPrefetch(p.mensagem, p.intencao, catalogo, p.nomePopular);
    if (!plano) return fim("termo não identificado com segurança");
    if (!plano.chamadas.every((c) => p.ferramentasDisponiveis.includes(c.nome)))
      return fim("ferramenta indisponível no turno", plano.termo);
    const resultados = await Promise.all(plano.chamadas.map(async (c) => {
      const args = JSON.stringify(c.args);
      return { nome: c.nome, args, r: await p.executar(c.nome, args) };
    }));
    if (resultados.some((x) => !x.r.success || x.r.erro)) return fim("ferramenta falhou", plano.termo);
    return { plano, resultados, duracaoMs: Date.now() - inicio };
  })().catch((e) => fim(`erro: ${e instanceof Error ? e.message : String(e)}`));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<MotivoSemPrefetch>((res) => {
    timer = setTimeout(() => res(fim("passou do prazo")), PRAZO_PREFETCH_MS);
  });
  try {
    return await Promise.race([trabalho, prazo]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
