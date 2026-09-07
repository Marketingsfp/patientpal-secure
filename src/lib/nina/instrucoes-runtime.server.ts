/**
 * FASE 4 — Instruções da Nina no runtime.
 *
 * O Prompt Principal passa a vir da versão PUBLICADA em
 * `public.nina_instrucoes_versoes` (escopo global, clinica_id NULL).
 *
 * Regras desta camada:
 *  - Carregamento SEMPRE no backend (o frontend nunca envia prompt).
 *  - Snapshot por execução: quem carregou a v12 termina com a v12, mesmo que
 *    a v13 seja publicada no meio do caminho.
 *  - Cache curto em memória por instância + invalidação na publicação.
 *  - Fallback: última versão válida conhecida; se não houver, o texto do
 *    código. NUNCA prompt vazio. Toda queda para fallback é registrada.
 *  - O conteúdo editável controla apenas COMPORTAMENTO do modelo. Ele não
 *    concede permissão, não altera RLS, não libera tools e não remove
 *    confirmação de operação crítica — isso continua em código/banco.
 */

export type EscopoRuntime = "whatsapp" | "painel_interno";

export type SnapshotInstrucoes = {
  escopo: EscopoRuntime;
  versao: number | null;
  versaoId: string | null;
  /** Data em que essa versão foi publicada (rastreabilidade histórica). */
  publicadoEm: string | null;
  /** publicada = banco; cache = última válida conhecida; codigo = fallback. */
  origem: "publicada" | "cache" | "codigo";
  texto: string;
};

const TTL_MS = 30_000;

type Entrada = {
  conteudo: string;
  versao: number;
  versaoId: string;
  publicadoEm: string | null;
  em: number;
};

/** Última versão publicada conhecida por escopo (também serve de fallback). */
const cache = new Map<EscopoRuntime, Entrada>();
/** Início da janela de falha contínua, para não errar em silêncio. */
const falhaDesde = new Map<EscopoRuntime, number>();

/** Chamado após publicar: a próxima execução relê do banco. */
export function invalidarCacheInstrucoes(escopo?: EscopoRuntime) {
  if (escopo) cache.delete(escopo);
  else cache.clear();
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

/**
 * Substitui apenas os marcadores conhecidos (allowlist). Qualquer `${...}`
 * remanescente invalida a versão — não vamos mandar marcador cru ao modelo.
 */
export function renderizarInstrucoes(
  template: string,
  valores: Record<string, string>,
): { ok: true; texto: string } | { ok: false; restante: string } {
  let texto = template;
  for (const [marcador, valor] of Object.entries(valores)) {
    texto = texto.split(marcador).join(valor ?? "");
  }
  const restante = /\$\{[^}]*\}/.exec(texto);
  if (restante) return { ok: false, restante: restante[0] };
  return { ok: true, texto };
}

async function lerPublicada(escopo: EscopoRuntime): Promise<Entrada | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("nina_instrucoes_versoes")
    .select("id, versao, conteudo, publicado_em")
    .is("clinica_id", null)
    .eq("escopo", escopo)
    .eq("status", "publicada")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || typeof data.conteudo !== "string" || data.conteudo.trim() === "") return null;
  return {
    conteudo: data.conteudo,
    versao: data.versao,
    versaoId: data.id,
    publicadoEm: data.publicado_em ?? null,
    em: Date.now(),
  };
}

/**
 * Snapshot do Prompt Principal para UMA execução.
 * `fallbackCodigo` é o texto que a Nina usava antes desta fase.
 */
export async function promptInstrucoes(
  escopo: EscopoRuntime,
  valores: Record<string, string>,
  fallbackCodigo: string,
): Promise<SnapshotInstrucoes> {
  const emCache = cache.get(escopo);
  let entrada: Entrada | null = emCache && Date.now() - emCache.em < TTL_MS ? emCache : null;

  if (!entrada) {
    try {
      const lida = await lerPublicada(escopo);
      if (lida) {
        cache.set(escopo, lida);
        falhaDesde.delete(escopo);
        entrada = lida;
      } else {
        registrarFalha(escopo, "nenhuma versão publicada");
      }
    } catch (e) {
      registrarFalha(escopo, "erro ao carregar", e);
    }
  }

  const base = entrada ?? emCache ?? null;
  if (base) {
    const render = renderizarInstrucoes(base.conteudo, valores);
    if (render.ok) {
      return {
        escopo,
        versao: base.versao,
        versaoId: base.versaoId,
        publicadoEm: base.publicadoEm,
        origem: entrada ? "publicada" : "cache",
        texto: render.texto,
      };
    }
    registrarFalha(escopo, `marcador desconhecido ${render.restante} na v${base.versao}`);
  }

  return {
    escopo,
    versao: null,
    versaoId: null,
    publicadoEm: null,
    origem: "codigo",
    texto: fallbackCodigo,
  };
}
