/** Uma leitura do catálogo por resposta, compartilhada por todas as ferramentas.
 * Não armazena vagas, pacientes, reservas ou dados entre respostas. */
import { AsyncLocalStorage } from "node:async_hooks";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ProfissionalPublicado, ServicoPublicado } from "./catalogo-conhecimento";
import { registrarEtapa } from "./evidencias.server";

/** Apenas campos publicados; nunca carregar nota interna ou rascunho. */
export const COLUNAS_SERVICO =
  "id, nome, valor, valor_observacao, descricao_publica, preparo, restricoes, executantes, formas_pagamento, estrutura, status, updated_at";
export const COLUNAS_PROFISSIONAL =
  "id, nome, especialidades, atende_consultorio, formas_pagamento, convenios, horarios, tipo_atendimento, observacao_publica, aviso_dia, aviso_valido_de, aviso_valido_ate, unidades(nome), estrutura, status, updated_at";
export const TAMANHO_PAGINA = 250;
type Tabela = "nina_cat_servicos" | "nina_cat_profissionais";
type Catalogo = {
  servicos: ServicoPublicado[];
  // O vínculo operacional fica no servidor; o conversor de resposta não o expõe.
  profissionais: (ProfissionalPublicado & { medico_id: string | null })[];
};
const escopo = new AsyncLocalStorage<{ clinicaId: string; leitura?: Promise<Catalogo> }>();

export function comCatalogoDoTurno<T>(clinicaId: string, fn: () => Promise<T>): Promise<T> {
  return escopo.run({ clinicaId }, fn);
}

export function temCatalogoDoTurno(): boolean {
  return Boolean(escopo.getStore()?.leitura);
}

/** Sem escopo, os leitores independentes mantêm seu comportamento anterior. */
export function catalogoDoTurno(clinicaId: string): Promise<Catalogo> | null {
  const turno = escopo.getStore();
  if (!turno) return null;
  if (turno.clinicaId !== clinicaId) throw new Error("O catálogo solicitado não pertence à clínica deste turno.");
  // Memoriza a promessa ANTES de aguardar: chamadas concorrentes e falhas não
  // provocam outra leitura. Uma nova resposta sempre cria outro escopo.
  turno.leitura ??= Promise.all([
    lerPublicadosBanco<ServicoPublicado>("nina_cat_servicos", COLUNAS_SERVICO, clinicaId),
    lerPublicadosBanco<Catalogo["profissionais"][number]>("nina_cat_profissionais", `${COLUNAS_PROFISSIONAL}, medico_id`, clinicaId),
  ]).then(([servicos, profissionais]) => {
    registrarEtapa({ tipo: "consulta", fonte: "catalogo", titulo: "Leitura única do catálogo nesta resposta",
      dados: { clinica_id: clinicaId, status: "PUBLICADO", servicos: servicos.length,
        profissionais: profissionais.length, escopo: "resposta", cache: false },
      codigo: { arquivo: "src/lib/nina/catalogo-turno.server.ts", funcao: "catalogoDoTurno" } });
    return { servicos, profissionais };
  });
  // Cada consumidor recebe sua cópia: filtrar/enriquecer resultados não muda
  // os dados que as demais ferramentas e a revisão da resposta vão consultar.
  return turno.leitura.then(catalogo => structuredClone(catalogo));
}

export async function lerPublicados<T extends { id: string }>(
  tabela: Tabela, colunas: string, clinicaId: string, ids?: string[],
): Promise<T[]> {
  const catalogo = await catalogoDoTurno(clinicaId);
  if (!catalogo) return lerPublicadosBanco<T>(tabela, colunas, clinicaId, ids);
  const linhas = tabela === "nina_cat_servicos" ? catalogo.servicos : catalogo.profissionais;
  return linhas.filter(r => !ids || ids.includes(r.id)).map(r => {
    const fonte = r as unknown as Record<string, unknown>;
    return Object.fromEntries(colunas.split(",").map(c => c.trim()).map(c => {
      if (c === "aliases:estrutura->aliases") return ["aliases", (fonte.estrutura as { aliases?: unknown } | null)?.aliases];
      const campo = c === "unidades(nome)" ? "unidades" : c;
      return [campo, fonte[campo]];
    })) as T;
  });
}

async function lerPublicadosBanco<T extends { id: string }>(
  tabela: Tabela, colunas: string, clinicaId: string, ids?: string[],
): Promise<T[]> {
  if (ids && !ids.length) return [];
  const linhas: T[] = [];
  let cursor: string | null = null;
  for (;;) {
    let consulta = supabaseAdmin.from(tabela).select(colunas)
      .eq("clinica_id", clinicaId).eq("status", "PUBLICADO")
      .order("id", { ascending: true }).limit(Math.min(TAMANHO_PAGINA, ids?.length ?? TAMANHO_PAGINA));
    if (cursor) consulta = consulta.gt("id", cursor);
    if (ids) consulta = consulta.in("id", ids);
    const resposta = await consulta;
    if (resposta.error) throw new Error(resposta.error.message);
    const pagina = (resposta.data ?? []) as unknown as T[];
    if (!pagina.length) return linhas;
    const proximo = pagina[pagina.length - 1]?.id;
    if (!proximo || (cursor && proximo <= cursor)) {
      throw new Error("A paginação do catálogo não avançou; não foi possível concluir a busca.");
    }
    linhas.push(...pagina);
    if (ids && linhas.length >= ids.length) return linhas;
    cursor = proximo;
    // Só a página vazia encerra: o servidor pode impor um limite menor.
  }
}
