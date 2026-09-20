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
import { normalizarBuscaCatalogo } from "./catalogo-sem-registro";
import {
  montarResultadoCatalogo,
  type ProfissionalPublicado,
  type ServicoPublicado,
} from "./catalogo-conhecimento";
import type { ResultadoConhecimento } from "./knowledge-contract";
import type { TipoAtendimentoCatalogo } from "./catalogo-pesquisa";
import {
  compararNomeProfissional,
  prepararBuscaCatalogo,
  perguntaIdentificacaoProfissional,
  nomeProfissionalNaPergunta,
} from "./catalogo-busca";

/** Colunas públicas — `nota_interna` e `rascunho` ficam de fora de propósito. */
const COLUNAS_SERVICO =
  "id, nome, valor, valor_observacao, descricao_publica, preparo, restricoes, executantes, formas_pagamento, estrutura, status, updated_at";
const COLUNAS_PROFISSIONAL =
  "id, nome, especialidades, atende_consultorio, formas_pagamento, convenios, horarios, tipo_atendimento, observacao_publica, aviso_dia, aviso_valido_de, aviso_valido_ate, unidades(nome), estrutura, status, updated_at";

/** A busca percorre um índice público leve; os detalhes só são lidos após a seleção. */
const INDICE_SERVICO = "id, nome, descricao_publica, aliases:estrutura->aliases, status, updated_at";
const INDICE_PROFISSIONAL = "id, nome, especialidades, horarios, aliases:estrutura->aliases, status, updated_at";
const TAMANHO_PAGINA = 250;
type IndiceServico = Pick<ServicoPublicado, "id" | "nome" | "descricao_publica"> & { aliases?: unknown };
type IndiceProfissional = Pick<
  ProfissionalPublicado,
  "id" | "nome" | "especialidades" | "horarios"
> & { aliases?: unknown };

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
    let consulta = supabaseAdmin
      .from(tabela)
      .select(colunas)
      .eq("clinica_id", clinicaId)
      .eq("status", "PUBLICADO")
      .order("id", { ascending: true })
      .limit(Math.min(TAMANHO_PAGINA, ids?.length ?? TAMANHO_PAGINA));
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

function aliasesDoIndice(i: { aliases?: unknown }): string[] {
  return Array.isArray(i.aliases) ? i.aliases.filter((v): v is string => typeof v === "string") : [];
}

function semAcento(v: unknown): string {
  return normalizarBuscaCatalogo(String(v ?? ""));
}

const PALAVRAS_CONSULTA = /\b(?:consultas?|especialistas?|doutor|doutora|dra?)\b/i;
const PALAVRAS_PROCEDIMENTO = /\b(?:exames?|procedimentos?)\b/i;

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
  return horarios.some(
    (h) => semAcento(h["dia"]).includes(alvo) || alvo.includes(semAcento(h["dia"])),
  );
}

/**
 * Compara pergunta e índice completo sem acentos, pontua e só então limita.
 * O modelo recebe apenas os detalhes públicos dos registros selecionados.
 */
export async function buscarNoCatalogo(
  pedido: {
    clinicaId: string;
    query: string;
    tipo_atendimento?: TipoAtendimentoCatalogo;
    medico?: string | null;
    dia?: string | null;
    limite?: number;
  },
  agora: Date = new Date(),
): Promise<ResultadoConhecimento> {
  const limite = Math.min(Math.max(pedido.limite ?? 6, 1), 12);
  const hojeISO = agoraNaClinica(undefined, agora).iso;
  let tipoAtendimento = pedido.tipo_atendimento ?? "nao_identificado";
  // Compatibilidade com pesquisas antigas. A categoria explícita do pedido prevalece.
  if (tipoAtendimento === "nao_identificado") {
    if (PALAVRAS_PROCEDIMENTO.test(pedido.query)) tipoAtendimento = "exame_procedimento";
    else if (PALAVRAS_CONSULTA.test(pedido.query) || pedido.medico) tipoAtendimento = "consulta";
  }

  // Não usar ILIKE como pré-filtro: ele exclui nomes acentuados antes da
  // normalização. Não cortar em 40/60: qualquer publicado pode ser o correto.
  const [brutosServicos, brutosProfissionais] = await Promise.all([
    tipoAtendimento === "consulta" ? [] : lerPublicados<IndiceServico>("nina_cat_servicos", INDICE_SERVICO, pedido.clinicaId),
    tipoAtendimento === "exame_procedimento" ? [] : lerPublicados<IndiceProfissional>(
      "nina_cat_profissionais",
      INDICE_PROFISSIONAL,
      pedido.clinicaId,
    ),
  ]);
  const busca = prepararBuscaCatalogo(pedido.query, [
    ...brutosServicos.flatMap((s) => [s.nome, ...aliasesDoIndice(s), String(s.descricao_publica ?? "")]),
    ...brutosProfissionais.flatMap((p) => [p.nome, ...aliasesDoIndice(p), especialidadesTexto(p)]),
  ]);
  const termos = busca.termos;
  const expandidos = busca.ajustes;
  if (tipoAtendimento === "nao_identificado") {
    // "Cardiologia" no cadastro de especialidades é uma consulta. A mera
    // menção na descrição de um exame não transforma a especialidade em exame.
    const nomeDeServico = brutosServicos.some((s) => [s.nome, ...aliasesDoIndice(s)].some(n => busca.pontuar(n, "") > 0));
    const nomeOuEspecialidade = brutosProfissionais.some((p) => [p.nome, ...aliasesDoIndice(p)].some(n => busca.pontuar(n, especialidadesTexto(p)) > 0));
    if (nomeOuEspecialidade && !nomeDeServico) tipoAtendimento = "consulta";
    else if (nomeDeServico && !nomeOuEspecialidade) tipoAtendimento = "exame_procedimento";
  }
  const perguntaSobreConsulta = tipoAtendimento === "consulta";
  const pontuados = (perguntaSobreConsulta ? [] : brutosServicos)
    .map((s) => ({ s, score: Math.max(...[s.nome, ...aliasesDoIndice(s)].map(n => busca.pontuar(n, String(s.descricao_publica ?? "")))) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const idsServicos = pontuados.slice(0, limite).map((x) => x.s.id);
  const medico = semAcento(pedido.medico || nomeProfissionalNaPergunta(pedido.query)).trim();
  const profissionaisRelevantes = (tipoAtendimento === "exame_procedimento" ? [] : brutosProfissionais)
    .map((p) => ({ p, score: Math.max(...[p.nome, ...aliasesDoIndice(p)].map(n => busca.pontuar(n, especialidadesTexto(p)))) }))
    .filter(({ p, score }) =>
      medico ? p.id === medico || compararNomeProfissional(medico, p.nome) !== null : score > 0,
    )
    .sort((a, b) => b.score - a.score)
    .map(({ p }) => p)
    .filter((p) => atendeNoDia(p, pedido.dia ?? null));
  const idsProfissionais = profissionaisRelevantes
    .slice(0, medico ? Math.max(6, limite) : limite)
    .map((p) => p.id);
  const [detalhesServicos, detalhesProfissionais] = await Promise.all([
    lerPublicados<ServicoPublicado>(
      "nina_cat_servicos",
      COLUNAS_SERVICO,
      pedido.clinicaId,
      idsServicos,
    ),
    lerPublicados<ProfissionalPublicado>(
      "nina_cat_profissionais",
      COLUNAS_PROFISSIONAL,
      pedido.clinicaId,
      idsProfissionais,
    ),
  ]);
  // O banco ordena por ID para paginar; a resposta mantém a relevância da busca.
  const listaServicos = idsServicos.flatMap((id) => detalhesServicos.filter((s) => s.id === id));
  const listaProfissionais = idsProfissionais.flatMap((id) =>
    detalhesProfissionais.filter((p) => p.id === id),
  );

  // Ambiguidade REAL: dois exames/procedimentos diferentes disputam a mesma
  // pergunta. Vários profissionais da mesma especialidade não é ambiguidade —
  // é a lista legítima que o paciente pediu.
  const melhor = pontuados[0]?.score ?? 0;
  const ambiguo =
    new Set(pontuados.filter((x) => x.score === melhor).map((x) => semAcento(x.s.nome))).size > 1;

  const resultado = montarResultadoCatalogo({
    servicos: listaServicos,
    profissionais: listaProfissionais,
    hojeISO,
    ambiguo,
    priorizar: perguntaSobreConsulta && listaProfissionais.length ? "profissional" : "servico",
  });
  resultado.tipo_atendimento = tipoAtendimento;

  // Esclarecimento é um resultado próprio, não ausência nem escolha do primeiro.
  // Analisa o conjunto ANTES do limite; limite=1 não elimina a ambiguidade.
  const perguntaPorNome =
    Boolean(medico) || profissionaisRelevantes.some((p) => busca.pontuar(p.nome, "") > 0);
  const medicosAmbiguos =
    perguntaPorNome &&
    (profissionaisRelevantes.length > 1 ||
      busca.ajustes.length > 0 ||
      profissionaisRelevantes.some(
        (p) => compararNomeProfissional(medico, p.nome) === "aproximado",
      ));
  const termosCorrigidos =
    busca.ajustes.find((a) => a.original === termos[0])?.candidatos ?? termos;
  const familiaSemTipo =
    termos.length === 1 &&
    termosCorrigidos.some((t) => ["ultrassonografia", "radiografia"].includes(t)) &&
    listaServicos.length > 0;
  const pedirServico =
    (ambiguo || familiaSemTipo) && !(perguntaSobreConsulta && listaProfissionais.length);
  if (
    resultado.knowledge_status !== "conflict" &&
    (medicosAmbiguos || pedirServico || busca.siglasDesconhecidas.length)
  ) {
    const opcoes = medicosAmbiguos
      ? listaProfissionais.map((p) => ({
          id: p.id,
          nome: p.nome,
          especialidade: Array.isArray(p.especialidades)
            ? p.especialidades
                .map((e) => String(e?.nome ?? ""))
                .filter(Boolean)
                .join(", ")
            : "",
          unidade: p.unidades?.nome ?? null,
        }))
      : pedirServico
        ? pontuados
            .filter((x) => x.score === melhor)
            .slice(0, 6)
            .map(({ s }) => ({ id: s.id, nome: s.nome }))
        : [];
    const tipo = medicosAmbiguos ? "profissional" : pedirServico ? "procedimento" : "sigla";
    const nomes = opcoes.map((p) =>
      [p.nome, "especialidade" in p ? p.especialidade : null, "unidade" in p ? p.unidade : null]
        .filter(Boolean)
        .join(" — "),
    );
    const pergunta =
      tipo === "profissional"
        ? perguntaIdentificacaoProfissional(opcoes)
        : tipo === "procedimento"
          ? `Qual exame ou procedimento você deseja?\n${nomes.join("\n")}`
          : `Pode informar por extenso o nome do atendimento ou como está escrito no pedido? Não consegui identificar a sigla ${busca.siglasDesconhecidas.join(", ").toUpperCase()}.`;
    resultado.esclarecimento = { tipo, pergunta, opcoes };
    resultado.procedure = null;
    resultado.price = null;
    resultado.instrucao = `O atendimento ou profissional ainda precisa ser identificado. Faça esta pergunta ao paciente: ${pergunta} Não escolha pelo primeiro resultado, não informe valores ou preparo nem consulte/reserve agenda até esclarecer. A dúvida de identificação não comprova ausência na base e não aciona transferência por item não encontrado. Depois da resposta, reconsulte a base com o contexto e os qualificadores confirmados.`;
  }

  // Evidência preservada da consulta: seção, filtros, registros encontrados
  // (com versão e estado de publicação NA OCASIÃO) e o que foi selecionado.
  // Snapshot histórico — uma alteração posterior no catálogo não o reescreve.
  try {
    const { registrarEtapa } = await import("./evidencias.server");
    const snapshot = (lista: readonly Record<string, unknown>[], campos: readonly string[]) =>
      lista.map((r) => ({
        id: String(r["id"] ?? ""),
        nome: String(r["nome"] ?? ""),
        versao: (r["updated_at"] as string | null) ?? null,
        publicacao: (r["status"] as string | null) ?? null,
        camposEncontrados: campos.filter((c) => r[c] !== null && r[c] !== undefined && r[c] !== ""),
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
          tipo_atendimento: tipoAtendimento,
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
          tipo_atendimento: tipoAtendimento,
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
