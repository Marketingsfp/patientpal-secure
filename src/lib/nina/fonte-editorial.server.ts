import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ProfissionalPublicado, ServicoPublicado } from "./catalogo-conhecimento";

// A projeção acontece no banco: rascunho e nota interna nunca entram no modelo.
export const COLUNAS_BASE_SERVICO =
  "id, procedimento_id, nome, valor, valor_observacao, descricao_publica, preparo, restricoes, executantes, formas_pagamento, estrutura, status, updated_at";
export const COLUNAS_BASE_PROFISSIONAL =
  "id, medico_id, nome, especialidades, atende_consultorio, formas_pagamento, convenios, horarios, tipo_atendimento, observacao_publica, aviso_dia, aviso_valido_de, aviso_valido_ate, unidades(nome), estrutura, status, updated_at";

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
