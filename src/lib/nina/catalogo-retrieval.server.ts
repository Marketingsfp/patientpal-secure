/**
 * FASE 5 — RECUPERAÇÃO NO CATÁLOGO PUBLICADO (camada de banco).
 *
 * SEGREGAÇÃO NA ORIGEM: a consulta seleciona apenas colunas públicas. Nota
 * interna, rascunho, registro em RASCUNHO e registro ARQUIVADO nunca saem do
 * banco — não é o modelo que decide o que omitir.
 *
 * FASE 7: fonte única. Não há flag de seleção de fonte nem fallback — o que
 * não está PUBLICADO aqui é tratado como informação desconhecida.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  montarResultadoCatalogo,
  type ProfissionalPublicado,
  type ServicoPublicado,
} from "./catalogo-conhecimento";
import type { ResultadoConhecimento } from "./knowledge-contract";

/** Colunas públicas — `nota_interna` e `rascunho` ficam de fora de propósito. */
const COLUNAS_SERVICO =
  "id, nome, valor, valor_observacao, descricao_publica, preparo, restricoes, executantes, formas_pagamento";
const COLUNAS_PROFISSIONAL =
  "id, nome, especialidades, atende_consultorio, formas_pagamento, convenios, horarios, tipo_atendimento, observacao_publica, aviso_dia, aviso_valido_de, aviso_valido_ate, unidades(nome)";

/** Tetos de leitura por clínica — nunca o catálogo inteiro sem limite. */
const TETO_PROFISSIONAIS = 60;
const TETO_SERVICOS = 40;

function semAcento(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function termosBusca(query: string): string[] {
  return semAcento(query)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
    .slice(0, 6);
}

/**
 * Variações autorizadas do MESMO termo (plural e par especialidade/
 * especialista). Não inventa sinônimo clínico: só reduz a diferença de escrita
 * entre o que o paciente digita e o que está cadastrado.
 */
function variantes(termo: string): string[] {
  const v = new Set<string>([termo]);
  if (termo.endsWith("s")) v.add(termo.slice(0, -1));
  else v.add(`${termo}s`);
  if (termo.endsWith("ologista")) v.add(`${termo.slice(0, -8)}ologia`);
  if (termo.endsWith("ologia")) v.add(`${termo.slice(0, -6)}ologista`);
  if (termo.endsWith("ista")) v.add(termo.slice(0, -4));
  return [...v].filter((t) => t.length >= 3);
}

function todasVariantes(termos: string[]): string[] {
  return [...new Set(termos.flatMap(variantes))].slice(0, 18);
}

const PALAVRAS_CONSULTA = /(consulta|medic|doutor|dra|dr\b|especialista|atende)/i;

/** Quantos termos da pergunta aparecem no registro (nome vale mais). */
function pontuar(alvoNome: string, alvoSecundario: string, termos: string[]): number {
  const nome = semAcento(alvoNome);
  const sec = semAcento(alvoSecundario);
  let score = 0;
  for (const t of termos) {
    const vs = variantes(t);
    if (vs.some((x) => nome.includes(x))) score += 2;
    else if (vs.some((x) => sec.includes(x))) score += 1;
  }
  return score;
}

function especialidadesTexto(p: ProfissionalPublicado): string {
  return Array.isArray(p.especialidades)
    ? (p.especialidades as Array<Record<string, unknown>>)
        .map((e) => semAcento(e?.["nome"]))
        .join(" ")
    : "";
}

/** O profissional atende no dia pedido? Sem horário cadastrado, não exclui. */
function atendeNoDia(p: ProfissionalPublicado, dia: string | null): boolean {
  if (!dia) return true;
  const horarios = Array.isArray(p.horarios) ? (p.horarios as Array<Record<string, unknown>>) : [];
  if (!horarios.length) return true;
  const alvo = semAcento(dia);
  return horarios.some((h) => semAcento(h["dia"]).includes(alvo) || alvo.includes(semAcento(h["dia"])));
}

/**
 * Busca só o necessário: filtra por termos, pontua por relevância e limita o
 * retorno. Nunca devolve o catálogo inteiro.
 */
export async function buscarNoCatalogo(pedido: {
  clinicaId: string;
  query: string;
  medico?: string | null;
  dia?: string | null;
  limite?: number;
}): Promise<ResultadoConhecimento> {
  const limite = Math.min(Math.max(pedido.limite ?? 6, 1), 12);
  const termos = termosBusca(pedido.query);
  const expandidos = todasVariantes(termos);
  const hojeISO = new Date().toISOString().slice(0, 10);
  const perguntaSobreConsulta =
    PALAVRAS_CONSULTA.test(pedido.query ?? "") || Boolean(pedido.medico);

  // Serviços: lê um conjunto maior de candidatos e só depois corta pelos mais
  // relevantes — cortar antes de pontuar descartava o registro certo.
  let qServicos = supabaseAdmin
    .from("nina_cat_servicos")
    .select(COLUNAS_SERVICO)
    .eq("clinica_id", pedido.clinicaId)
    .eq("status", "PUBLICADO")
    .limit(TETO_SERVICOS);
  if (expandidos.length) {
    qServicos = qServicos.or(
      expandidos
        .flatMap((t) => [`nome.ilike.%${t}%`, `descricao_publica.ilike.%${t}%`])
        .join(","),
    );
  }

  // Profissionais: a especialidade fica em JSONB, onde o filtro exato do
  // PostgREST não casa com o termo digitado (acento/caixa). Lemos apenas os
  // publicados da clínica, com teto, e casamos nome/especialidade aqui.
  let qProfissionais = supabaseAdmin
    .from("nina_cat_profissionais")
    .select(COLUNAS_PROFISSIONAL)
    .eq("clinica_id", pedido.clinicaId)
    .eq("status", "PUBLICADO")
    .limit(TETO_PROFISSIONAIS);
  if (pedido.medico) {
    qProfissionais = qProfissionais.ilike("nome", `%${pedido.medico}%`);
  }

  const [servicos, profissionais] = await Promise.all([
    qServicos,
    perguntaSobreConsulta || termos.length ? qProfissionais : Promise.resolve({ data: [], error: null }),
  ]);

  if (servicos.error) throw new Error(servicos.error.message);
  if (profissionais.error) throw new Error(profissionais.error.message);

  const brutosServicos = (servicos.data ?? []) as unknown as ServicoPublicado[];
  const pontuados = brutosServicos
    .map((s) => ({ s, score: pontuar(s.nome, String(s.descricao_publica ?? ""), termos) }))
    .filter((x) => (termos.length ? x.score > 0 : true))
    .sort((a, b) => b.score - a.score);
  const listaServicos = pontuados.slice(0, limite).map((x) => x.s);

  const brutosProfissionais = (profissionais.data ?? []) as unknown as ProfissionalPublicado[];
  const listaProfissionais = (
    pedido.medico
      ? brutosProfissionais
      : brutosProfissionais.filter((p) => pontuar(p.nome, especialidadesTexto(p), termos) > 0)
  )
    .filter((p) => atendeNoDia(p, pedido.dia ?? null))
    .slice(0, limite);

  // Ambiguidade REAL: dois exames/procedimentos diferentes disputam a mesma
  // pergunta. Vários profissionais da mesma especialidade não é ambiguidade —
  // é a lista legítima que o paciente pediu.
  const servicosDistintos = new Set(
    listaServicos.map((s) => String(s.nome ?? "").toLowerCase().trim()),
  );
  const melhor = pontuados[0]?.score ?? 0;
  const empatados = pontuados.filter((x) => x.score === melhor).length;
  const ambiguo = servicosDistintos.size > 1 && empatados > 1;

  return montarResultadoCatalogo({
    servicos: listaServicos,
    profissionais: listaProfissionais,
    hojeISO,
    ambiguo,
    priorizar: perguntaSobreConsulta && listaProfissionais.length ? "profissional" : "servico",
  });
}

