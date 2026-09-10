/**
 * FASE 5 — CARREGAMENTO DOS TEMPLATES PUBLICADOS (server-only).
 *
 * Mesma lógica das Instruções: existe UMA versão publicada por chave e escopo,
 * lida com cache curto e reconferida no início de cada turno. Quando não há
 * publicação, o padrão do código assume — publicações anteriores continuam
 * funcionando sem migração de conteúdo.
 */
import {
  ESCOPO_TEMPLATES,
  MAPA_TEMPLATES,
  validarTemplatePublicado,
  type TextosTemplates,
} from "./templates";

const TTL_MS = 60_000;

type Entrada = { textos: TextosTemplates; carregadoEm: number; versaoInstrucoes: string | null };

const cache = new Map<string, Entrada>();

function chaveCache(clinicaId: string | null, escopo: string): string {
  return `${clinicaId ?? "global"}|${escopo}`;
}

export type TemplatesResolvidos = {
  textos: TextosTemplates;
  /** Publicação de comportamento a que estes textos estão vinculados. */
  versaoInstrucoes: string | null;
  /** Chaves recusadas na validação (o padrão do código assumiu). */
  recusadas: Array<{ chave: string; motivo: string }>;
};

/** Lê os templates publicados desta clínica (com herança do global). */
export async function carregarTemplatesPublicados(args: {
  clinicaId: string | null;
  escopo?: string;
  inicioDeTurno?: boolean;
}): Promise<TemplatesResolvidos> {
  const escopo = args.escopo ?? ESCOPO_TEMPLATES;
  const ck = chaveCache(args.clinicaId, escopo);
  const agora = Date.now();
  const atual = cache.get(ck);
  if (!args.inicioDeTurno && atual && agora - atual.carregadoEm < TTL_MS) {
    return { textos: atual.textos, versaoInstrucoes: atual.versaoInstrucoes, recusadas: [] };
  }

  const recusadas: Array<{ chave: string; motivo: string }> = [];
  const textos: TextosTemplates = {};
  let versaoInstrucoes: string | null = null;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = (supabaseAdmin as any)
      .from("nina_mensagens_templates")
      .select("clinica_id, chave, texto, instrucoes_versao_id")
      .eq("escopo", escopo)
      .eq("status", "publicada");
    q = args.clinicaId
      ? q.or(`clinica_id.is.null,clinica_id.eq.${args.clinicaId}`)
      : q.is("clinica_id", null);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    // Global primeiro, clínica depois: a clínica sobrescreve o global.
    const linhas = ((data ?? []) as Array<{
      clinica_id: string | null;
      chave: string;
      texto: string;
      instrucoes_versao_id: string | null;
    }>).sort((a, b) => Number(Boolean(a.clinica_id)) - Number(Boolean(b.clinica_id)));
    for (const l of linhas) {
      if (!MAPA_TEMPLATES[l.chave]) {
        recusadas.push({ chave: l.chave, motivo: "chave desconhecida" });
        continue;
      }
      const v = validarTemplatePublicado(l.chave, l.texto);
      if (!v.ok) {
        recusadas.push({ chave: l.chave, motivo: v.motivo });
        continue;
      }
      textos[l.chave] = l.texto;
      versaoInstrucoes = l.instrucoes_versao_id ?? versaoInstrucoes;
    }
  } catch (e) {
    // Falha de leitura NUNCA derruba o atendimento: o padrão do código assume.
    console.error("[NINA_TEMPLATES] leitura falhou, usando padrões", e);
    const anterior = cache.get(ck);
    if (anterior) {
      return {
        textos: anterior.textos,
        versaoInstrucoes: anterior.versaoInstrucoes,
        recusadas: [{ chave: "*", motivo: "leitura falhou; cache anterior mantido" }],
      };
    }
    return { textos: {}, versaoInstrucoes: null, recusadas: [{ chave: "*", motivo: "leitura falhou" }] };
  }

  cache.set(ck, { textos, carregadoEm: agora, versaoInstrucoes });
  return { textos, versaoInstrucoes, recusadas };
}

/** Usado após publicar/restaurar: força releitura na próxima resposta. */
export function invalidarCacheTemplates(): void {
  cache.clear();
}
