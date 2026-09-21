// Migration de conteúdo, sem schema novo ou alteração do histórico.
import { writeFile } from "node:fs/promises";
import { ALTERACOES_LIMITE_ESCLARECIMENTO } from "../../src/lib/nina/prompt/limite-esclarecimento";

export const MIGRATION_LIMITE_ESCLARECIMENTO =
  "supabase/migrations/20260921150000_nina_duas_perguntas_esclarecimento.sql";
export const COMENTARIO_LIMITE_ESCLARECIMENTO =
  "Regra autorizada 21/09/2026: até duas perguntas de identificação por solicitação, com continuidade imediata ao esclarecer.";

export function gerarMigrationLimiteEsclarecimento() {
  const alteracoes = JSON.stringify(ALTERACOES_LIMITE_ESCLARECIMENTO);
  return `-- Gerada por scripts/nina/gerar-limite-esclarecimento.ts.
-- Publica a nova regra junto do código que persiste e respeita o limite.
-- Preserva conteúdo/autoria/datas das versões anteriores e o painel interno.
DO $nina_duas_perguntas$
DECLARE
  anterior public.nina_instrucoes_versoes;
  alteracao jsonb;
  novo text;
  proxima integer;
  comentario_publicacao text := '${COMENTARIO_LIMITE_ESCLARECIMENTO}';
BEGIN
  LOCK TABLE public.nina_instrucoes_versoes IN SHARE ROW EXCLUSIVE MODE;
  FOR anterior IN SELECT * FROM public.nina_instrucoes_versoes WHERE escopo = 'whatsapp' AND status = 'publicada'
  LOOP
    IF EXISTS (SELECT 1 FROM public.nina_instrucoes_versoes v
      WHERE v.clinica_id IS NOT DISTINCT FROM anterior.clinica_id AND v.escopo = anterior.escopo
        AND v.comentario = comentario_publicacao) THEN CONTINUE; END IF;
    novo := anterior.conteudo;
    FOR alteracao IN SELECT value FROM jsonb_array_elements($alteracoes$${alteracoes}$alteracoes$::jsonb)
    LOOP
      IF position(alteracao->>1 in novo) > 0 AND position(alteracao->>0 in novo) = 0 THEN CONTINUE; END IF;
      IF cardinality(string_to_array(novo, alteracao->>0)) <> 2 THEN
        RAISE EXCEPTION 'Instruções de esclarecimento divergiram da versão auditada. Reconciliar antes de publicar.';
      END IF;
      novo := replace(novo, alteracao->>0, alteracao->>1);
    END LOOP;
    IF novo = anterior.conteudo THEN CONTINUE; END IF;
    IF length(novo) > 60000 THEN RAISE EXCEPTION 'Prompt ultrapassa o limite de publicação.'; END IF;
    SELECT coalesce(max(v.versao), 0) + 1 INTO proxima FROM public.nina_instrucoes_versoes v
      WHERE v.clinica_id IS NOT DISTINCT FROM anterior.clinica_id AND v.escopo = anterior.escopo;
    UPDATE public.nina_instrucoes_versoes SET status = 'arquivada' WHERE id = anterior.id;
    INSERT INTO public.nina_instrucoes_versoes
      (clinica_id, escopo, versao, conteudo, status, comentario, versao_anterior_id, publicado_em)
    VALUES (anterior.clinica_id, anterior.escopo, proxima, novo, 'publicada', comentario_publicacao, anterior.id, now());
  END LOOP;
END;
$nina_duas_perguntas$;
`;
}

if (import.meta.main)
  await writeFile(MIGRATION_LIMITE_ESCLARECIMENTO, gerarMigrationLimiteEsclarecimento(), "utf8");
