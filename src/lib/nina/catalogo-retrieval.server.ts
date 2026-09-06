/**
 * FASE 5 — RECUPERAÇÃO NO CATÁLOGO PUBLICADO (camada de banco).
 *
 * SEGREGAÇÃO NA ORIGEM: a consulta seleciona apenas colunas públicas. Nota
 * interna, rascunho, registro em RASCUNHO e registro ARQUIVADO nunca saem do
 * banco — não é o modelo que decide o que omitir.
 *
 * Ligado por clínica pela flag `nina_catalogo_fonte_enabled`. Sem linha em
 * `clinica_feature_flags` = desligado (a planilha continua sendo a fonte).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  montarResultadoCatalogo,
  type ProfissionalPublicado,
  type ServicoPublicado,
} from "./catalogo-conhecimento";
import type { ResultadoConhecimento } from "./knowledge-contract";

export const FLAG_NINA_CATALOGO_FONTE = "nina_catalogo_fonte_enabled";

/** Colunas públicas — `nota_interna` e `rascunho` ficam de fora de propósito. */
const COLUNAS_SERVICO =
  "id, nome, valor, valor_observacao, descricao_publica, preparo, restricoes, executantes, formas_pagamento";
const COLUNAS_PROFISSIONAL =
  "id, nome, especialidades, atende_consultorio, formas_pagamento, convenios, horarios, tipo_atendimento, observacao_publica, aviso_dia, aviso_valido_de, aviso_valido_ate";

export async function flagCatalogoFonteAtiva(clinicaId: string | null): Promise<boolean> {
  if (!clinicaId) return false;
  const { data, error } = await supabaseAdmin
    .from("clinica_feature_flags")
    .select("ativo")
    .eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_NINA_CATALOGO_FONTE)
    .maybeSingle();
  if (error || !data) return false;
  return Boolean((data as { ativo?: boolean }).ativo);
}

function termosBusca(query: string): string[] {
  return String(query ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
    .slice(0, 6);
}

const PALAVRAS_CONSULTA = /(consulta|medic|doutor|dra|dr\b|especialista|atende)/i;

/**
 * Busca só o necessário: filtra por nome/termos e limita o retorno. Nunca
 * devolve o catálogo inteiro.
 */
export async function buscarNoCatalogo(pedido: {
  clinicaId: string;
  query: string;
  medico?: string | null;
  limite?: number;
}): Promise<ResultadoConhecimento> {
  const limite = Math.min(Math.max(pedido.limite ?? 6, 1), 12);
  const termos = termosBusca(pedido.query);
  const hojeISO = new Date().toISOString().slice(0, 10);
  const perguntaSobreConsulta =
    PALAVRAS_CONSULTA.test(pedido.query ?? "") || Boolean(pedido.medico);

  let qServicos = supabaseAdmin
    .from("nina_cat_servicos")
    .select(COLUNAS_SERVICO)
    .eq("clinica_id", pedido.clinicaId)
    .eq("status", "PUBLICADO")
    .limit(limite);
  if (termos.length) {
    qServicos = qServicos.or(termos.map((t) => `nome.ilike.%${t}%`).join(","));
  }

  let qProfissionais = supabaseAdmin
    .from("nina_cat_profissionais")
    .select(COLUNAS_PROFISSIONAL)
    .eq("clinica_id", pedido.clinicaId)
    .eq("status", "PUBLICADO")
    .limit(limite);
  if (pedido.medico) {
    qProfissionais = qProfissionais.ilike("nome", `%${pedido.medico}%`);
  } else if (termos.length) {
    qProfissionais = qProfissionais.or(
      termos
        .map((t) => `nome.ilike.%${t}%,especialidades.cs.[{"nome":"${t}"}]`)
        .join(","),
    );
  }

  const [servicos, profissionais] = await Promise.all([
    qServicos,
    perguntaSobreConsulta || termos.length ? qProfissionais : Promise.resolve({ data: [], error: null }),
  ]);

  if (servicos.error) throw new Error(servicos.error.message);
  if (profissionais.error) throw new Error(profissionais.error.message);

  const listaServicos = (servicos.data ?? []) as unknown as ServicoPublicado[];
  const listaProfissionais = (profissionais.data ?? []) as unknown as ProfissionalPublicado[];

  // Ambiguidade: mais de um item distinto compatível com a pergunta.
  const itensDistintos = new Set(
    [...listaServicos.map((s) => s.nome), ...listaProfissionais.map((p) => p.nome)].map((n) =>
      String(n ?? "").toLowerCase().trim(),
    ),
  );

  return montarResultadoCatalogo({
    servicos: listaServicos,
    profissionais: listaProfissionais,
    hojeISO,
    ambiguo: itensDistintos.size > 1,
  });
}
