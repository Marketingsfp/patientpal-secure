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
import { agoraNaClinica } from "@/lib/nina-agora";
import { normalizarBuscaCatalogo, termosItemCatalogo } from "./catalogo-sem-registro";
import {
  montarResultadoCatalogo,
  type ProfissionalPublicado,
  type ServicoPublicado,
} from "./catalogo-conhecimento";
import type { ResultadoConhecimento } from "./knowledge-contract";

/** Colunas públicas — `nota_interna` e `rascunho` ficam de fora de propósito. */
const COLUNAS_SERVICO =
  "id, nome, valor, valor_observacao, descricao_publica, preparo, restricoes, executantes, formas_pagamento, status, updated_at";
const COLUNAS_PROFISSIONAL =
  "id, nome, especialidades, atende_consultorio, formas_pagamento, convenios, horarios, tipo_atendimento, observacao_publica, aviso_dia, aviso_valido_de, aviso_valido_ate, unidades(nome), status, updated_at";

/** A busca percorre um índice público leve; os detalhes só são lidos após a seleção. */
const INDICE_SERVICO = "id, nome, descricao_publica, status, updated_at";
const INDICE_PROFISSIONAL = "id, nome, especialidades, horarios, status, updated_at";
const TAMANHO_PAGINA = 250;
type IndiceServico = Pick<ServicoPublicado, "id" | "nome" | "descricao_publica">;
type IndiceProfissional = Pick<ProfissionalPublicado, "id" | "nome" | "especialidades" | "horarios">;

async function lerPublicados<T extends { id: string }>(
  tabela: "nina_cat_servicos" | "nina_cat_profissionais",
  colunas: string,
  clinicaId: string,
  ids?: string[],
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
    // Só a página vazia encerra a busca: o servidor pode impor um limite
    // menor que o solicitado. Cursor por ID evita saltar registros nesse caso.
  }
}

function semAcento(v: unknown): string {
  return normalizarBuscaCatalogo(String(v ?? ""));
}

function termosBusca(query: string): string[] {
  const especificos = termosItemCatalogo(query);
  if (especificos.length) return especificos.slice(0, 6);
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

function especialidadesTexto(p: IndiceProfissional): string {
  return Array.isArray(p.especialidades)
    ? (p.especialidades as Array<Record<string, unknown>>)
        .map((e) => semAcento(e?.["nome"]))
        .join(" ")
    : "";
}

/** O profissional atende no dia pedido? Sem horário cadastrado, não exclui. */
function atendeNoDia(p: IndiceProfissional, dia: string | null): boolean {
  if (!dia) return true;
  const horarios = Array.isArray(p.horarios) ? (p.horarios as Array<Record<string, unknown>>) : [];
  if (!horarios.length) return true;
  const alvo = semAcento(dia);
  return horarios.some((h) => semAcento(h["dia"]).includes(alvo) || alvo.includes(semAcento(h["dia"])));
}

/**
 * Compara pergunta e índice completo sem acentos, pontua e só então limita.
 * O modelo recebe apenas os detalhes públicos dos registros selecionados.
 */
export async function buscarNoCatalogo(pedido: {
  clinicaId: string;
  query: string;
  medico?: string | null;
  dia?: string | null;
  limite?: number;
}, agora: Date = new Date()): Promise<ResultadoConhecimento> {
  const limite = Math.min(Math.max(pedido.limite ?? 6, 1), 12);
  const termos = termosBusca(pedido.query);
  const expandidos = todasVariantes(termos);
  const hojeISO = agoraNaClinica(undefined, agora).iso;
  const perguntaSobreConsulta =
    PALAVRAS_CONSULTA.test(pedido.query ?? "") || Boolean(pedido.medico);

  // Não usar ILIKE como pré-filtro: ele exclui nomes acentuados antes da
  // normalização. Não cortar em 40/60: qualquer publicado pode ser o correto.
  const [brutosServicos, brutosProfissionais] = await Promise.all([
    lerPublicados<IndiceServico>("nina_cat_servicos", INDICE_SERVICO, pedido.clinicaId),
    perguntaSobreConsulta || termos.length
      ? lerPublicados<IndiceProfissional>("nina_cat_profissionais", INDICE_PROFISSIONAL, pedido.clinicaId)
      : Promise.resolve([] as IndiceProfissional[]),
  ]);
  const pontuados = brutosServicos
    .map((s) => ({ s, score: pontuar(s.nome, String(s.descricao_publica ?? ""), termos) }))
    .filter((x) => (termos.length ? x.score > 0 : true))
    .sort((a, b) => b.score - a.score);
  const idsServicos = pontuados.slice(0, limite).map((x) => x.s.id);
  const medico = semAcento(pedido.medico).trim();
  const profissionaisRelevantes = brutosProfissionais
    .map((p) => ({ p, score: pontuar(p.nome, especialidadesTexto(p), termos) }))
    .filter(({ p, score }) => medico ? semAcento(p.nome).includes(medico) : score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ p }) => p)
    .filter((p) => atendeNoDia(p, pedido.dia ?? null));
  const idsProfissionais = profissionaisRelevantes.slice(0, limite).map((p) => p.id);
  const [detalhesServicos, detalhesProfissionais] = await Promise.all([
    lerPublicados<ServicoPublicado>("nina_cat_servicos", COLUNAS_SERVICO, pedido.clinicaId, idsServicos),
    lerPublicados<ProfissionalPublicado>("nina_cat_profissionais", COLUNAS_PROFISSIONAL, pedido.clinicaId, idsProfissionais),
  ]);
  // O banco ordena por ID para paginar; a resposta mantém a relevância da busca.
  const listaServicos = idsServicos.flatMap((id) => detalhesServicos.filter((s) => s.id === id));
  const listaProfissionais = idsProfissionais.flatMap((id) => detalhesProfissionais.filter((p) => p.id === id));

  // Ambiguidade REAL: dois exames/procedimentos diferentes disputam a mesma
  // pergunta. Vários profissionais da mesma especialidade não é ambiguidade —
  // é a lista legítima que o paciente pediu.
  const servicosDistintos = new Set(
    listaServicos.map((s) => String(s.nome ?? "").toLowerCase().trim()),
  );
  const melhor = pontuados[0]?.score ?? 0;
  const empatados = pontuados.filter((x) => x.score === melhor).length;
  const ambiguo = servicosDistintos.size > 1 && empatados > 1;

  const resultado = montarResultadoCatalogo({
    servicos: listaServicos,
    profissionais: listaProfissionais,
    hojeISO,
    ambiguo,
    priorizar: perguntaSobreConsulta && listaProfissionais.length ? "profissional" : "servico",
  });

  // Evidência preservada da consulta: seção, filtros, registros encontrados
  // (com versão e estado de publicação NA OCASIÃO) e o que foi selecionado.
  // Snapshot histórico — uma alteração posterior no catálogo não o reescreve.
  try {
    const { registrarEtapa } = await import("./evidencias.server");
    const snapshot = (
      lista: readonly Record<string, unknown>[],
      campos: readonly string[],
    ) =>
      lista.map((r) => ({
        id: String(r["id"] ?? ""),
        nome: String(r["nome"] ?? ""),
        versao: (r["updated_at"] as string | null) ?? null,
        publicacao: (r["status"] as string | null) ?? null,
        camposEncontrados: campos.filter(
          (c) => r[c] !== null && r[c] !== undefined && r[c] !== "",
        ),
      }));
    const camposServico = COLUNAS_SERVICO.split(", ");
    const camposProf = COLUNAS_PROFISSIONAL.replace("unidades(nome)", "unidades").split(", ");
    const codigo = {
      arquivo: "src/lib/nina/catalogo-retrieval.server.ts",
      funcao: "buscarNoCatalogo",
      regra: "somente registros PUBLICADOS da própria clínica; colunas públicas",
    } as const;
    registrarEtapa({
      tipo: "consulta",
      fonte: "catalogo",
      titulo: "Exames e procedimentos",
      dados: {
        secao: "Exames e procedimentos",
        filtros: {
          clinica_id: pedido.clinicaId,
          status: "PUBLICADO",
          termos,
          termos_expandidos: expandidos,
          tamanho_pagina: TAMANHO_PAGINA,
          busca_completa: true,
          comparacao: "sem acentos e sem distinção de maiúsculas/minúsculas",
          limite,
        },
        cache: false,
        total_examinado: brutosServicos.length,
        encontrados: snapshot(pontuados.map(({ s }) => s) as never, INDICE_SERVICO.split(", ")),
        selecionados: listaServicos.map((s) => String(s.id ?? "")),
        camposEnviados: camposServico.filter((c) => c !== "id"),
        knowledgeStatus: resultado.knowledge_status,
      },
      codigo,
    });
    registrarEtapa({
      tipo: "consulta",
      fonte: "catalogo",
      titulo: "Consultas e profissionais",
      dados: {
        secao: "Consultas e profissionais",
        filtros: {
          clinica_id: pedido.clinicaId,
          status: "PUBLICADO",
          medico: pedido.medico ?? null,
          dia: pedido.dia ?? null,
          termos,
          tamanho_pagina: TAMANHO_PAGINA,
          busca_completa: true,
          comparacao: "sem acentos e sem distinção de maiúsculas/minúsculas",
          limite,
        },
        cache: false,
        total_examinado: brutosProfissionais.length,
        encontrados: snapshot(profissionaisRelevantes as never, INDICE_PROFISSIONAL.split(", ")),
        selecionados: listaProfissionais.map((p) => String(p.id ?? "")),
        camposEnviados: camposProf.filter((c) => c !== "id"),
        knowledgeStatus: resultado.knowledge_status,
      },
      codigo,
    });
  } catch {
    /* auditoria nunca interrompe o atendimento */
  }

  return resultado;
}
