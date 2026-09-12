/**
 * FASE 4 — Instruções da Nina no runtime.
 * FASE 2 (Publicação e carregamento consistentes) — reescrita da seleção de
 * versão.
 *
 * O Prompt Principal vem da versão PUBLICADA em
 * `public.nina_instrucoes_versoes` (escopo global, clinica_id NULL).
 *
 * Regras desta camada:
 *  - Carregamento SEMPRE no backend (o frontend nunca envia prompt).
 *  - VERIFICAÇÃO DE VERSÃO no início de cada turno: uma consulta barata lê o
 *    ponteiro da versão publicada (id/versão/data). O texto só é buscado
 *    quando a versão mudou. Assim uma publicação vale para TODAS as
 *    instâncias no próximo turno, sem esperar TTL e sem reiniciar conversas.
 *  - VERSÃO FIXA POR TURNO: dentro do mesmo turno todas as rodadas usam o
 *    mesmo snapshot. Publicar no meio de uma resposta só vale no turno
 *    seguinte.
 *  - Política de falha explícita: última versão válida enquanto ela couber na
 *    idade máxima; passando disso, o texto do código, sempre identificado
 *    como fallback e com o motivo registrado. NUNCA prompt vazio e nunca o
 *    texto do código apresentado como se fosse a versão publicada.
 *  - Uma versão inválida (marcador desconhecido) não substitui a última
 *    válida conhecida.
 *  - O conteúdo editável controla apenas COMPORTAMENTO do modelo. Ele não
 *    concede permissão, não altera RLS, não libera tools e não remove
 *    confirmação de operação crítica — isso continua em código/banco.
 */
import {
  renderizarTemplateInstrucoes,
  validarTemplateInstrucoes,
  type EscopoInstrucoesTemplate,
} from "./instrucoes-template";

export type EscopoRuntime = EscopoInstrucoesTemplate;

export type OrigemInstrucoes = "publicada" | "cache" | "codigo";

export type SnapshotInstrucoes = {
  escopo: EscopoRuntime;
  versao: number | null;
  versaoId: string | null;
  /** Data em que essa versão foi publicada (rastreabilidade histórica). */
  publicadoEm: string | null;
  /** publicada = banco; cache = última válida conhecida; codigo = fallback. */
  origem: OrigemInstrucoes;
  texto: string;
  /** Conteúdo publicado ANTES da substituição de dados (auditoria). */
  template: string;
  /** true só quando a versão publicada não pôde ser usada. */
  fallbackPorErro: boolean;
  /** Motivo legível da origem (por que caiu para cache/código). */
  motivo: string | null;
  /** Idade do conteúdo em cache, em ms (null quando lido do banco agora). */
  idadeMs: number | null;
};

/** Janela em que o ponteiro de versão é considerado recente o bastante. */
const TTL_PONTEIRO_MS = 5_000;
/** Idade máxima da última versão válida conhecida antes de virar fallback. */
export const IDADE_MAX_CACHE_MS = 15 * 60_000;
/** Tempo que o snapshot fica preso ao turno (guarda contra turno esquecido). */
const TTL_TURNO_MS = 5 * 60_000;

type Entrada = {
  conteudo: string;
  versao: number;
  versaoId: string;
  publicadoEm: string | null;
  /** Momento em que o CONTEÚDO foi lido do banco. */
  em: number;
  /** Momento da última confirmação de que essa ainda é a versão publicada. */
  confirmadoEm: number;
};

/** Última versão publicada conhecida por escopo (também serve de fallback). */
const cache = new Map<EscopoRuntime, Entrada>();
/** Início da janela de falha contínua, para não errar em silêncio. */
const falhaDesde = new Map<EscopoRuntime, number>();
/** Snapshot fixado por turno: mesmas rodadas, mesma versão. */
const porTurno = new Map<string, { snapshot: SnapshotInstrucoes; em: number }>();

/** Chamado após publicar: a próxima execução relê do banco. */
export function invalidarCacheInstrucoes(escopo?: EscopoRuntime) {
  if (escopo) cache.delete(escopo);
  else cache.clear();
}

/** Usado pelos testes para partir de um estado limpo. */
export function _resetCacheInstrucoes() {
  cache.clear();
  falhaDesde.clear();
  porTurno.clear();
}

function registrarFalha(escopo: EscopoRuntime, motivo: string, detalhe?: unknown) {
  const agora = Date.now();
  const desde = falhaDesde.get(escopo) ?? agora;
  falhaDesde.set(escopo, desde);
  const minutos = Math.round((agora - desde) / 60000);
  console.error(
    `[NINA_INSTRUCOES] fallback ativo (escopo=${escopo}, motivo=${motivo}, há ${minutos} min)`,
    detalhe ?? "",
  );
}

/** Compatibilidade: renderização agora mora no módulo compartilhado. */
export function renderizarInstrucoes(
  template: string,
  valores: Record<string, string>,
): { ok: true; texto: string } | { ok: false; restante: string } {
  const r = renderizarTemplateInstrucoes(template, valores);
  return r.ok ? { ok: true, texto: r.texto } : { ok: false, restante: r.restante };
}

type Ponteiro = { versaoId: string; versao: number; publicadoEm: string | null };

/** Consulta barata: só o ponteiro da versão publicada, sem trazer o texto. */
async function lerPonteiro(escopo: EscopoRuntime): Promise<Ponteiro | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("nina_instrucoes_versoes")
    .select("id, versao, publicado_em")
    .is("clinica_id", null)
    .eq("escopo", escopo)
    .eq("status", "publicada")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { versaoId: data.id, versao: data.versao, publicadoEm: data.publicado_em ?? null };
}

async function lerConteudo(versaoId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("nina_instrucoes_versoes")
    .select("conteudo")
    .eq("id", versaoId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const conteudo = data?.conteudo;
  if (typeof conteudo !== "string" || conteudo.trim() === "") return null;
  return conteudo;
}

/**
 * Resolve a versão publicada válida, comparando o ponteiro do banco com o
 * que está em memória. Retorna null quando não há versão utilizável.
 */
async function resolverPublicada(
  escopo: EscopoRuntime,
  inicioDeTurno: boolean,
): Promise<Entrada | null> {
  const agora = Date.now();
  const atual = cache.get(escopo);

  // No início de um turno o ponteiro é SEMPRE reconferido — é isso que faz
  // uma publicação valer em todas as instâncias sem esperar TTL. A janela
  // curta só evita consultas repetidas em chamadas sem turno identificado.
  if (!inicioDeTurno && atual && agora - atual.confirmadoEm < TTL_PONTEIRO_MS) return atual;

  const ponteiro = await lerPonteiro(escopo);
  if (!ponteiro) return null;

  if (atual && atual.versaoId === ponteiro.versaoId) {
    atual.confirmadoEm = agora;
    return atual;
  }

  const conteudo = await lerConteudo(ponteiro.versaoId);
  if (!conteudo) return null;

  // Versão inválida NÃO substitui a última válida conhecida.
  const valida = validarTemplateInstrucoes(escopo, conteudo);
  if (!valida.ok) {
    registrarFalha(escopo, `v${ponteiro.versao} inválida: ${valida.mensagem}`);
    return null;
  }

  const entrada: Entrada = {
    conteudo,
    versao: ponteiro.versao,
    versaoId: ponteiro.versaoId,
    publicadoEm: ponteiro.publicadoEm,
    em: agora,
    confirmadoEm: agora,
  };
  cache.set(escopo, entrada);
  return entrada;
}

function snapshotDoCodigo(
  escopo: EscopoRuntime,
  fallbackCodigo: string,
  motivo: string,
): SnapshotInstrucoes {
  return {
    escopo,
    versao: null,
    versaoId: null,
    publicadoEm: null,
    origem: "codigo",
    texto: fallbackCodigo,
    template: fallbackCodigo,
    fallbackPorErro: true,
    motivo,
    idadeMs: null,
  };
}

/**
 * Snapshot do Prompt Principal para UM turno.
 * `fallbackCodigo` é o texto que a Nina usava antes desta fase.
 * `turnoId` fixa a versão durante todas as rodadas do mesmo turno.
 */
export async function promptInstrucoes(
  escopo: EscopoRuntime,
  // FASE 2 — quando os valores dependem do PRÓPRIO texto da versão (identidade
  // de apresentação publicada), passe uma função: ela recebe o template exato
  // do snapshot do turno, garantindo instruções e identidade da MESMA versão.
  valores: Record<string, string> | ((template: string) => Record<string, string>),
  fallbackCodigo: string,
  turnoId?: string | null,
): Promise<SnapshotInstrucoes> {
  const agora = Date.now();

  if (turnoId) {
    for (const [k, v] of porTurno) if (agora - v.em > TTL_TURNO_MS) porTurno.delete(k);
    const fixado = porTurno.get(turnoId);
    if (fixado) return fixado.snapshot;
  }

  let entrada: Entrada | null = null;
  let erroLeitura: string | null = null;
  try {
    entrada = await resolverPublicada(escopo, Boolean(turnoId));
    if (entrada) falhaDesde.delete(escopo);
    else erroLeitura = "nenhuma versão publicada utilizável";
  } catch (e) {
    erroLeitura = e instanceof Error ? e.message : "erro ao carregar";
    registrarFalha(escopo, "erro ao carregar", e);
  }

  const doBanco = entrada !== null;
  // Política de falha: última versão válida conhecida, respeitando idade máxima.
  const ultima = entrada ?? cache.get(escopo) ?? null;
  let snapshot: SnapshotInstrucoes;

  if (!ultima) {
    snapshot = snapshotDoCodigo(
      escopo,
      fallbackCodigo,
      erroLeitura ?? "nenhuma versão publicada",
    );
    registrarFalha(escopo, snapshot.motivo ?? "sem versão");
  } else {
    const idadeMs = agora - ultima.em;
    if (!doBanco && idadeMs > IDADE_MAX_CACHE_MS) {
      snapshot = snapshotDoCodigo(
        escopo,
        fallbackCodigo,
        `última versão válida (v${ultima.versao}) passou da idade máxima de ${Math.round(
          IDADE_MAX_CACHE_MS / 60000,
        )} min`,
      );
      registrarFalha(escopo, snapshot.motivo ?? "cache vencido");
    } else {
      const render = renderizarTemplateInstrucoes(ultima.conteudo, valores);
      if (render.ok) {
        snapshot = {
          escopo,
          versao: ultima.versao,
          versaoId: ultima.versaoId,
          publicadoEm: ultima.publicadoEm,
          origem: doBanco ? "publicada" : "cache",
          texto: render.texto,
          template: ultima.conteudo,
          fallbackPorErro: !doBanco,
          motivo: doBanco
            ? null
            : `leitura da versão publicada falhou (${erroLeitura ?? "indisponível"}) — usando a última versão válida (v${ultima.versao})`,
          idadeMs: doBanco ? null : idadeMs,
        };
      } else {
        registrarFalha(escopo, `marcador não substituído ${render.restante} na v${ultima.versao}`);
        snapshot = snapshotDoCodigo(
          escopo,
          fallbackCodigo,
          `v${ultima.versao} tem marcador não substituído (${render.restante})`,
        );
      }
    }
  }

  if (turnoId) porTurno.set(turnoId, { snapshot, em: agora });
  return snapshot;
}
