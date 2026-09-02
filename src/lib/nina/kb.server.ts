/**
 * Base de Conhecimentos da Nina — pipeline de ingestão e consulta (server-only).
 *
 * UPLOAD → VALIDAÇÃO → PARSE → NORMALIZAÇÃO → VALIDAÇÃO DOS REGISTROS →
 * ARMAZENAMENTO → ÍNDICES → EMBEDDINGS → TESTE DE INTEGRIDADE → ATIVAÇÃO.
 *
 * Garantias:
 * - Ativação atômica: a versão anterior continua ATIVA enquanto a nova processa.
 * - Idempotente: reprocessar a mesma versão apaga e recria os registros dela.
 * - Cache de leitura chaveado por base + versão (troca de versão invalida tudo).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import * as XLSX from "xlsx";
import {
  expandirTermos,
  normalizarTexto,
  parsePlanilha,
  validarRegistros,
  type RegistroKb,
} from "./kb-parser";

export const BUCKET_KB = "nina-kb";
const MODELO_EMBEDDING = "google/text-embedding-004";
const DIM = 768;

export interface BaseKb {
  id: string;
  clinica_id: string;
  titulo: string;
  arquivo_nome: string;
  versao: number;
  status: string;
  registros_total: number;
  processado_em: string | null;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/* Leitura do arquivo                                                  */
/* ------------------------------------------------------------------ */

export function lerArquivo(buffer: ArrayBuffer): Array<{ nome: string; matriz: string[][] }> {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false, raw: false });
  return wb.SheetNames.map((nome) => {
    const sheet = wb.Sheets[nome];
    const matriz = XLSX.utils.sheet_to_json<string[]>(sheet as any, {
      header: 1,
      blankrows: true,
      defval: "",
      raw: false,
    });
    return { nome, matriz: matriz.map((l) => (l ?? []).map((c) => String(c ?? ""))) };
  });
}

/* ------------------------------------------------------------------ */
/* Embeddings                                                          */
/* ------------------------------------------------------------------ */

async function gerarEmbeddings(textos: string[]): Promise<Array<number[] | null>> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return textos.map(() => null);
  const saida: Array<number[] | null> = [];
  const LOTE = 64;
  for (let i = 0; i < textos.length; i += LOTE) {
    const lote = textos.slice(i, i + LOTE);
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODELO_EMBEDDING, input: lote }),
      });
      if (!res.ok) {
        console.error("[Nina KB] embeddings falharam", res.status, await res.text().catch(() => ""));
        saida.push(...lote.map(() => null));
        continue;
      }
      const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
      for (let j = 0; j < lote.length; j++) {
        const e = json.data?.[j]?.embedding;
        saida.push(Array.isArray(e) && e.length === DIM ? e : null);
      }
    } catch (e) {
      console.error("[Nina KB] embeddings erro", (e as Error).message);
      saida.push(...lote.map(() => null));
    }
  }
  return saida;
}

/* ------------------------------------------------------------------ */
/* Processamento                                                       */
/* ------------------------------------------------------------------ */

export interface ResultadoProcessamento {
  ok: boolean;
  registros: number;
  motivos: string[];
  avisos: string[];
  embeddings: number;
}

/**
 * Processa (ou reprocessa) uma versão da base. Só ativa a nova versão quando
 * todas as validações passam; em caso de falha grave a base anterior segue ATIVA.
 */
export async function processarBase(baseId: string): Promise<ResultadoProcessamento> {
  const { data: base, error: erroBase } = await supabaseAdmin
    .from("nina_kb_bases")
    .select("*")
    .eq("id", baseId)
    .maybeSingle();
  if (erroBase || !base) throw new Error("Base de conhecimentos não encontrada.");

  const eraAtiva = base.status === "ATIVA";
  await supabaseAdmin
    .from("nina_kb_bases")
    .update({ status: "PROCESSANDO", erros: [] })
    .eq("id", baseId);

  const falhar = async (motivos: string[], avisos: string[] = []) => {
    await supabaseAdmin
      .from("nina_kb_bases")
      .update({
        status: eraAtiva ? "ATIVA" : "ERRO",
        erros: motivos,
        validacao: { ok: false, motivos, avisos },
        processado_em: new Date().toISOString(),
      })
      .eq("id", baseId);
    invalidarCache(base.clinica_id);
    return { ok: false, registros: 0, motivos, avisos, embeddings: 0 };
  };

  // 1) Download
  const { data: arquivo, error: erroArquivo } = await supabaseAdmin.storage
    .from(BUCKET_KB)
    .download(base.storage_path as string);
  if (erroArquivo || !arquivo)
    return falhar([`Não foi possível ler o arquivo enviado: ${erroArquivo?.message ?? "arquivo ausente"}`]);

  // 2) Parse + normalização
  let abas: Array<{ nome: string; matriz: string[][] }>;
  try {
    abas = lerArquivo(await arquivo.arrayBuffer());
  } catch (e) {
    return falhar([`Falha ao abrir a planilha: ${(e as Error).message}`]);
  }
  const parse = parsePlanilha(abas);

  // 3) Validação de integridade
  const validacao = validarRegistros(parse);
  if (!validacao.ok) return falhar(validacao.motivos, validacao.avisos);

  // 4) Gravação idempotente (limpa os registros desta versão antes de recriar)
  await supabaseAdmin.from("nina_kb_registros").delete().eq("base_id", baseId);

  const embeddings = await gerarEmbeddings(
    parse.registros.map((r) => textoParaEmbedding(r)),
  );
  let comEmbedding = 0;

  const linhas = parse.registros.map((r, i) => {
    if (embeddings[i]) comEmbedding++;
    return {
      base_id: baseId,
      clinica_id: base.clinica_id,
      versao: base.versao,
      secao: r.secao,
      categoria: r.categoria,
      tipo: r.tipo,
      procedimento: r.procedimento,
      medico: r.medico,
      dia: r.dia,
      horario: r.horario,
      preco_dinheiro: r.preco_dinheiro,
      preco_cartao: r.preco_cartao,
      observacoes: r.observacoes,
      preparo: r.preparo,
      extras: r.extras,
      bruto: r.bruto,
      linha_origem: r.linha_origem,
      aba_origem: r.aba_origem,
      texto_busca: r.texto_busca,
      embedding: embeddings[i] ? JSON.stringify(embeddings[i]) : null,
    };
  });

  const LOTE = 400;
  for (let i = 0; i < linhas.length; i += LOTE) {
    const { error } = await supabaseAdmin
      .from("nina_kb_registros")
      .upsert(linhas.slice(i, i + LOTE) as any, {
        onConflict: "base_id,aba_origem,linha_origem,procedimento,medico,dia,horario",
        ignoreDuplicates: false,
      });
    if (error) {
      await supabaseAdmin.from("nina_kb_registros").delete().eq("base_id", baseId);
      return falhar([`Falha ao gravar os registros: ${error.message}`], validacao.avisos);
    }
  }

  // 5) Teste de integridade pós-gravação
  const { count } = await supabaseAdmin
    .from("nina_kb_registros")
    .select("id", { count: "exact", head: true })
    .eq("base_id", baseId);
  if (!count) return falhar(["Os registros não foram gravados corretamente."], validacao.avisos);

  // 6) Ativação atômica: nova ATIVA, demais da clínica INATIVAS.
  await supabaseAdmin
    .from("nina_kb_bases")
    .update({ status: "INATIVA" })
    .eq("clinica_id", base.clinica_id)
    .eq("status", "ATIVA")
    .neq("id", baseId);

  await supabaseAdmin
    .from("nina_kb_bases")
    .update({
      status: "ATIVA",
      registros_total: count,
      linhas_lidas: parse.linhasLidas,
      erros: [],
      validacao: { ...validacao, embeddings: comEmbedding },
      processado_em: new Date().toISOString(),
      ativada_em: new Date().toISOString(),
    })
    .eq("id", baseId);

  invalidarCache(base.clinica_id);

  return {
    ok: true,
    registros: count,
    motivos: [],
    avisos: validacao.avisos,
    embeddings: comEmbedding,
  };
}

function textoParaEmbedding(r: RegistroKb): string {
  return [
    r.categoria && `Especialidade: ${r.categoria}`,
    r.procedimento && `Procedimento: ${r.procedimento}`,
    r.medico && `Profissional: ${r.medico}`,
    r.dia && `Dia: ${r.dia}`,
    r.horario && `Horário: ${r.horario}`,
    r.preco_dinheiro !== null && `Dinheiro/PIX: R$ ${r.preco_dinheiro}`,
    r.preco_cartao !== null && `Cartão: R$ ${r.preco_cartao}`,
    r.preparo && `Preparo: ${r.preparo}`,
    r.observacoes && `Observação: ${r.observacoes}`,
  ]
    .filter(Boolean)
    .join(" | ");
}

/* ------------------------------------------------------------------ */
/* Cache por versão                                                    */
/* ------------------------------------------------------------------ */

type BaseCache = { base: BaseKb | null; em: number };
const cacheBase = new Map<string, BaseCache>();
const TTL = 30_000;

export function invalidarCache(clinicaId: string) {
  cacheBase.delete(clinicaId);
}

export async function baseAtiva(clinicaId: string): Promise<BaseKb | null> {
  const c = cacheBase.get(clinicaId);
  if (c && Date.now() - c.em < TTL) return c.base;
  const { data } = await supabaseAdmin
    .from("nina_kb_bases")
    .select("id, clinica_id, titulo, arquivo_nome, versao, status, registros_total, processado_em, created_at")
    .eq("clinica_id", clinicaId)
    .eq("status", "ATIVA")
    .maybeSingle();
  const base = (data as BaseKb | null) ?? null;
  cacheBase.set(clinicaId, { base, em: Date.now() });
  return base;
}

/* ------------------------------------------------------------------ */
/* Consulta (estruturada + semântica)                                  */
/* ------------------------------------------------------------------ */

export interface AchadoKb {
  id: string;
  categoria: string | null;
  tipo: string | null;
  procedimento: string | null;
  medico: string | null;
  dia: string | null;
  horario: string | null;
  preco_dinheiro: number | null;
  preco_cartao: number | null;
  observacoes: string | null;
  preparo: string | null;
  linha_origem: number | null;
  aba_origem: string | null;
  score: number;
  origem: "estruturada" | "semantica";
}

export interface RespostaConsultaKb {
  encontrado: boolean;
  ambiguo: boolean;
  base: { id: string; versao: number; arquivo: string } | null;
  registros: AchadoKb[];
  mensagem?: string;
}

function pontuar(reg: any, termos: string[]): number {
  const alvo = String(reg.texto_busca ?? "");
  let score = 0;
  for (const t of termos) {
    if (!t || t.length < 3) continue;
    if (alvo.includes(t)) score += t.length >= 5 ? 2 : 1;
  }
  return score;
}

/**
 * Consulta a base ATIVA da clínica. Estruturado primeiro; a busca semântica
 * complementa (observações, preparos, perguntas em linguagem natural).
 */
export async function consultarBase(params: {
  clinicaId: string;
  termo: string;
  medico?: string | null;
  dia?: string | null;
  limite?: number;
}): Promise<RespostaConsultaKb> {
  const base = await baseAtiva(params.clinicaId);
  if (!base)
    return {
      encontrado: false,
      ambiguo: false,
      base: null,
      registros: [],
      mensagem: "Nenhuma Base de Conhecimentos ativa nesta clínica.",
    };

  const limite = Math.min(params.limite ?? 8, 20);
  const termos = expandirTermos(params.termo ?? "");

  let q = supabaseAdmin
    .from("nina_kb_registros")
    .select(
      "id, categoria, tipo, procedimento, medico, dia, horario, preco_dinheiro, preco_cartao, observacoes, preparo, linha_origem, aba_origem, texto_busca",
    )
    .eq("base_id", base.id)
    .limit(400);
  if (params.medico) q = q.ilike("medico", `%${params.medico}%`);
  if (params.dia) {
    const d = normalizarTexto(params.dia).slice(0, 3);
    q = q.ilike("dia", `%${d}%`);
  }
  if (termos.length) {
    const filtro = termos
      .filter((t) => t.length >= 3)
      .slice(0, 8)
      .map((t) => `texto_busca.ilike.%${t}%`)
      .join(",");
    if (filtro) q = q.or(filtro);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let achados: AchadoKb[] = (data ?? [])
    .map((r: any) => ({ ...r, score: pontuar(r, termos), origem: "estruturada" as const }))
    .filter((r) => r.score > 0 || (!termos.length && (params.medico || params.dia)))
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);

  // Complemento semântico quando o estruturado não trouxe nada convincente.
  if (achados.length === 0) {
    const semanticos = await buscaSemantica(base.id, params.termo, limite);
    achados = semanticos;
  }

  const melhor = achados[0]?.score ?? 0;
  const empatados = achados.filter(
    (a) => a.score >= melhor * 0.95 && normalizarTexto(a.procedimento ?? "") !== normalizarTexto(achados[0]?.procedimento ?? ""),
  );

  return {
    encontrado: achados.length > 0,
    ambiguo: empatados.length > 0,
    base: { id: base.id, versao: base.versao, arquivo: base.arquivo_nome },
    registros: achados.map((a) => ({ ...a, texto_busca: undefined } as unknown as AchadoKb)),
  };
}

async function buscaSemantica(baseId: string, termo: string, limite: number): Promise<AchadoKb[]> {
  const [vetor] = await gerarEmbeddings([termo]);
  if (!vetor) return [];
  const { data, error } = await supabaseAdmin.rpc("nina_kb_buscar_semantico", {
    p_base_id: baseId,
    p_embedding: JSON.stringify(vetor),
    p_limite: limite,
  });
  if (error) {
    console.error("[Nina KB] busca semântica falhou", error.message);
    return [];
  }
  return (data ?? []).map((r: any) => ({
    ...r,
    score: Number(r.similaridade ?? 0) * 3,
    origem: "semantica" as const,
  }));
}

/** Registra a consulta para auditoria/homologação (nunca bloqueia a resposta). */
export async function registrarConsultaKb(entrada: {
  clinicaId: string;
  baseId: string | null;
  versao: number | null;
  canal: string;
  pergunta: string;
  termos: string[];
  encontrados: AchadoKb[];
  registroUsado?: string | null;
  resposta?: string | null;
}) {
  try {
    await supabaseAdmin.from("nina_kb_consultas").insert({
      clinica_id: entrada.clinicaId,
      base_id: entrada.baseId,
      versao: entrada.versao,
      canal: entrada.canal,
      pergunta: entrada.pergunta.slice(0, 2000),
      termos: entrada.termos.slice(0, 30),
      encontrados: entrada.encontrados.slice(0, 10).map((e) => ({
        id: e.id,
        procedimento: e.procedimento,
        medico: e.medico,
        linha: e.linha_origem,
        score: e.score,
        origem: e.origem,
      })),
      registro_usado: entrada.registroUsado ?? entrada.encontrados[0]?.id ?? null,
      score: entrada.encontrados[0]?.score ?? null,
      resposta: entrada.resposta?.slice(0, 4000) ?? null,
    });
  } catch (e) {
    console.error("[Nina KB] log de consulta falhou", (e as Error).message);
  }
}

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

/** Regras anti-alucinação anexadas ao prompt quando a clínica tem base ativa. */
export async function blocoPromptBaseConhecimento(clinicaId: string): Promise<string> {
  const base = await baseAtiva(clinicaId);
  if (!base) return "";
  return `BASE DE CONHECIMENTOS OFICIAL DA CLÍNICA (fonte de verdade administrativa)
Arquivo: "${base.titulo}" — versão ${base.versao} (${base.registros_total} registros).

REGRAS OBRIGATÓRIAS:
- Antes de responder qualquer coisa sobre especialidades, exames, procedimentos, médicos, dias, horários de atendimento, preços (dinheiro/PIX e cartão), preparos, observações ou regras administrativas, CHAME a ferramenta "consultar_base_conhecimento".
- Use SOMENTE os fatos retornados pela ferramenta. Nunca complete com conhecimento geral, nunca estime preço, nunca associe um médico a um procedimento que a base não relacione.
- Se a ferramenta não encontrar a informação com segurança, responda: "Não encontrei essa informação na minha base no momento. Vou encaminhar sua dúvida para nossa equipe." e siga o fluxo de atendimento humano.
- Se houver mais de um resultado parecido, NÃO escolha: pergunte ao paciente qual exame/procedimento está no pedido médico.
- O horário que aparece na base é a ESCALA administrativa do profissional, NÃO é vaga disponível. Disponibilidade real de agendamento vem sempre das ferramentas de agenda.
- Ao continuar a conversa ("e quanto custa?", "precisa de preparo?"), consulte a base de novo usando o procedimento já mencionado; não confie apenas no que foi dito antes.`;
}
