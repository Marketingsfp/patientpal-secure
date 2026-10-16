import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ProfissionalPublicado, ServicoPublicado } from "./catalogo-conhecimento";
import { congelarProfundo } from "./congelar";

// A projeção acontece no banco: rascunho e nota interna nunca entram no modelo.
export const COLUNAS_BASE_SERVICO =
  "id, procedimento_id, nome, valor, valor_observacao, descricao_publica, preparo, restricoes, executantes, formas_pagamento, estrutura, status, updated_at";
export const COLUNAS_BASE_PROFISSIONAL =
  "id, medico_id, nome, especialidades, atende_consultorio, formas_pagamento, convenios, horarios, tipo_atendimento, observacao_publica, aviso_dia, aviso_valido_de, aviso_valido_ate, unidades(nome), medicos(sexo), estrutura, status, updated_at";

export async function lerFonteEditorial(clinicaId: string, db: any = supabaseAdmin) {
  async function paginas<T>(tabela: string, colunas: string): Promise<T[]> {
    const resultado: T[] = [];
    let ultimoId: string | undefined;
    for (;;) {
      let q = db
        .from(tabela)
        .select(colunas)
        .eq("clinica_id", clinicaId)
        .eq("status", "PUBLICADO")
        .order("id", { ascending: true })
        .limit(250);
      if (ultimoId) q = q.gt("id", ultimoId);
      const { data, error } = await q;
      if (error)
        throw new Error(
          "Não foi possível ler a base publicada. Confira a disponibilidade da base de conhecimento.",
        );
      if (!data?.length) return resultado;
      const proximoId = data.at(-1).id;
      if (!proximoId || proximoId === ultimoId)
        throw new Error("A leitura da base publicada não avançou.");
      resultado.push(...data);
      ultimoId = proximoId;
    }
  }
  const [servicos, profissionais] = await Promise.all([
    paginas<ServicoPublicado>("nina_cat_servicos", COLUNAS_BASE_SERVICO),
    paginas<ProfissionalPublicado & { medico_id: string | null }>(
      "nina_cat_profissionais",
      COLUNAS_BASE_PROFISSIONAL,
    ),
  ]);
  return { servicos, profissionais };
}

type BaseEditorial = Awaited<ReturnType<typeof lerFonteEditorial>>;

/**
 * Teto do cache da base no atendimento. A assinatura abaixo percebe qualquer
 * mudança nos itens publicados; o teto cobre o que vem de outra tabela (sexo
 * do profissional, nome da unidade).
 */
export const VALIDADE_MAXIMA_BASE_MS = 5 * 60_000;
const cacheBase = new Map<
  string,
  { assinatura: string; em: number; leitura: Promise<BaseEditorial> }
>();

export function limparCacheBaseEditorial() {
  cacheBase.clear();
}

/** Quantidade e última alteração dos itens publicados: muda a cada publicação, edição ou remoção. */
async function assinaturaBase(clinicaId: string): Promise<string> {
  const db = supabaseAdmin as any;
  const ultima = (tabela: string) =>
    db
      .from(tabela)
      .select("updated_at", { count: "exact" })
      .eq("clinica_id", clinicaId)
      .eq("status", "PUBLICADO")
      .order("updated_at", { ascending: false })
      .limit(1);
  const [s, p] = await Promise.all([ultima("nina_cat_servicos"), ultima("nina_cat_profissionais")]);
  if (s.error || p.error)
    throw new Error(
      "Não foi possível ler a base publicada. Confira a disponibilidade da base de conhecimento.",
    );
  return [s.count, s.data?.[0]?.updated_at, p.count, p.data?.[0]?.updated_at].join("|");
}

/** A cópia antiga do cadastro só serve ao editor; a Nina a descarta (catalogo-conhecimento.ts). */
function semFormatoAntigo<R extends { estrutura?: unknown }>(registro: R): R {
  const estrutura = registro.estrutura as Record<string, unknown> | null | undefined;
  if (!estrutura || typeof estrutura !== "object" || !("formato_antigo" in estrutura))
    return registro;
  const { formato_antigo: _antigo, ...resto } = estrutura;
  return { ...registro, estrutura: resto };
}

/**
 * Base publicada para as respostas da Nina (16/10/2026). Antes, cada resposta
 * relia a base inteira (~12 MB na Menino Jesus) e cada ferramenta a copiava: com
 * 10 respostas ao mesmo tempo o worker caía por memória. Agora há uma leitura
 * por clínica, compartilhada e congelada, refeita só quando a base muda.
 */
export async function lerFonteEditorialDoAtendimento(clinicaId: string): Promise<BaseEditorial> {
  const assinatura = await assinaturaBase(clinicaId);
  const agora = Date.now();
  const guardada = cacheBase.get(clinicaId);
  if (
    guardada &&
    guardada.assinatura === assinatura &&
    agora - guardada.em < VALIDADE_MAXIMA_BASE_MS
  )
    return guardada.leitura;
  const leitura = lerFonteEditorial(clinicaId).then((base) =>
    congelarProfundo({
      servicos: base.servicos.map(semFormatoAntigo),
      profissionais: base.profissionais.map(semFormatoAntigo),
    }),
  );
  cacheBase.set(clinicaId, { assinatura, em: agora, leitura });
  try {
    return await leitura;
  } catch (e) {
    if (cacheBase.get(clinicaId)?.leitura === leitura) cacheBase.delete(clinicaId);
    throw e;
  }
}
