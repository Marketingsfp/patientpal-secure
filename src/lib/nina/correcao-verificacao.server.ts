/**
 * FASE 3 — Conferência do valor efetivo depois da gravação.
 *
 * Gravar não é o fim: a correção só é considerada verificada quando o sistema
 * lê de novo o valor que passou a valer e confirma que é o valor novo. Se a
 * leitura não bater, o estado fica "aplicado" (gravado) e não "verificado".
 */

type Sb = any;

export type Verificacao = {
  conferido: boolean;
  alvo: string;
  esperado: string;
  efetivo: string | null;
  revisao: string | null;
  motivo: string;
  em: string;
};

function normalizar(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Relê o item do catálogo e compara o campo alterado. */
export async function verificarItemCatalogo(
  supabase: Sb,
  clinicaId: string,
  entrada: { itemId: string; campo: string; valorEsperado: string },
): Promise<Verificacao> {
  const em = new Date().toISOString();
  const { data, error } = await supabase
    .from("nina_cat_servicos")
    .select(`id, nome, status, ${entrada.campo}`)
    .eq("id", entrada.itemId)
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  if (error || !data) {
    return {
      conferido: false,
      alvo: `catálogo · ${entrada.itemId} · ${entrada.campo}`,
      esperado: entrada.valorEsperado,
      efetivo: null,
      revisao: null,
      motivo: error?.message ?? "Item do catálogo não encontrado na releitura.",
      em,
    };
  }
  const efetivo = (data as Record<string, unknown>)[entrada.campo];
  const alvo = `catálogo · ${String((data as { nome?: string }).nome ?? "")} · ${entrada.campo}`;
  const a = normalizar(efetivo);
  const b = normalizar(entrada.valorEsperado);
  const numeros: string[] = b.match(/\d+/g) ?? [];
  const numerosEfetivos: string[] = a.match(/\d+/g) ?? [];
  const bate = numeros.length
    ? numeros.every((n) => numerosEfetivos.includes(n))
    : Boolean(b) && a.includes(b);
  return {
    conferido: bate && String((data as { status?: string }).status) === "PUBLICADO",
    alvo,
    esperado: entrada.valorEsperado,
    efetivo: efetivo == null ? null : String(efetivo),
    revisao: String((data as { status?: string }).status ?? ""),
    motivo: bate
      ? "Releitura do catálogo publicado confirma o valor corrigido."
      : "A releitura do catálogo não trouxe o valor corrigido.",
    em,
  };
}

/** Relê a versão publicada da Arquitetura e confere o conteúdo efetivo. */
export async function verificarPromptPublicado(
  supabase: Sb,
  entrada: { conteudoEsperado: string; versaoEsperada: number | null },
): Promise<Verificacao> {
  const em = new Date().toISOString();
  const { lerPromptPublicado } = await import("./correcao-ferramentas.server");
  const atual = await lerPromptPublicado(supabase);
  if (!atual) {
    return {
      conferido: false,
      alvo: "Arquitetura · prompt WhatsApp",
      esperado: `versão ${entrada.versaoEsperada ?? "?"}`,
      efetivo: null,
      revisao: null,
      motivo: "Não há versão publicada na releitura.",
      em,
    };
  }
  const mesmoConteudo = atual.conteudo.trim() === entrada.conteudoEsperado.trim();
  const mesmaVersao =
    entrada.versaoEsperada == null || Number(atual.versao) === Number(entrada.versaoEsperada);
  return {
    conferido: mesmoConteudo && mesmaVersao,
    alvo: "Arquitetura · prompt WhatsApp",
    esperado: `versão ${entrada.versaoEsperada ?? "?"}`,
    efetivo: `versão ${atual.versao}`,
    revisao: String(atual.id),
    motivo:
      mesmoConteudo && mesmaVersao
        ? "A versão publicada em vigor é exatamente a que foi gravada."
        : "A versão em vigor não corresponde à publicação desta correção.",
    em,
  };
}
