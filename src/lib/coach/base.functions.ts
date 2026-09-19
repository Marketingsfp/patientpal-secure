/**
 * Geração da base de conhecimento do Coach — no servidor.
 *
 * Antes isso rodava no navegador da atendente: ao passar de 24 horas, a tela
 * baixava milhares de procedimentos e tentava gravar o cache, o que as regras
 * de acesso barravam em silêncio — e a leitura pesada se repetia a cada
 * abertura. Agora quem gera é o servidor, só para quem tem permissão de gestor
 * do Coach; a atendente apenas lê o cache.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { gerarBaseDoSistema, type ClienteBase } from "@/lib/coach/base-conhecimento.dados";

export type BaseConhecimentoGerada = {
  texto: string;
  geradoEm: string;
  tamanho: number;
};

export const gerarBaseConhecimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clinicaId: string; clinicaNome?: string | null }) => {
    if (!input?.clinicaId) throw new Error("Selecione uma clínica.");
    return input;
  })
  .handler(async ({ data, context }): Promise<BaseConhecimentoGerada> => {
    const db = context.supabase as unknown as ClienteBase;

    // Só gestor do Coach gera/atualiza a base (mesma regra das telas e das
    // políticas do banco).
    const { data: podeGerir, error: erroPermissao } = await context.supabase.rpc(
      "coach_pode_gerir",
      { _clinica_id: data.clinicaId },
    );
    if (erroPermissao) throw new Error(erroPermissao.message);
    if (!podeGerir) throw new Error("Só a gestão do Coach pode atualizar a base da clínica.");

    const { texto, geradoEm, tamanho } = await gerarBaseDoSistema(
      db,
      data.clinicaId,
      data.clinicaNome ?? null,
    );

    const { error } = await context.supabase.from("coach_config_clinica").upsert(
      {
        clinica_id: data.clinicaId,
        tabela_servicos: texto,
        base_gerada_em: geradoEm.toISOString(),
      },
      { onConflict: "clinica_id" },
    );
    if (error) throw new Error(error.message);

    return { texto, geradoEm: geradoEm.toISOString(), tamanho };
  });
