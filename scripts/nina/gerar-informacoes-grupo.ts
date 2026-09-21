import { writeFile } from "node:fs/promises";
import { REGRA_INFORMACOES_GRUPO } from "../../src/lib/nina/clinicas-grupo";

export const MIGRATION_INFORMACOES_GRUPO =
  "supabase/migrations/20260921180000_nina_informacoes_publicas_grupo.sql";
export function gerarMigrationInformacoesGrupo() {
  return `-- Gerada por scripts/nina/gerar-informacoes-grupo.ts. Só instruções, sem schema/dados operacionais.
DO $grupo$
DECLARE
  anterior public.nina_instrucoes_versoes;
  regra text := $regra$${REGRA_INFORMACOES_GRUPO}$regra$;
  comentario_novo text := '21/09/2026: informações públicas das três clínicas do grupo, sem mudar a clínica operacional.';
  novo text;
  proxima integer;
BEGIN
  LOCK TABLE public.nina_instrucoes_versoes IN SHARE ROW EXCLUSIVE MODE;
  FOR anterior IN SELECT * FROM public.nina_instrucoes_versoes WHERE escopo='whatsapp' AND status='publicada'
  LOOP
    IF EXISTS (SELECT 1 FROM public.nina_instrucoes_versoes v
      WHERE v.clinica_id IS NOT DISTINCT FROM anterior.clinica_id AND v.escopo=anterior.escopo AND v.comentario=comentario_novo)
      THEN CONTINUE; END IF;
    IF position(regra in anterior.conteudo)>0 THEN CONTINUE; END IF;
    IF position('INSTRUÇÃO INST-01' in anterior.conteudo)>0 THEN
      RAISE EXCEPTION 'INST-01 já existe com outro conteúdo; reconciliar antes de publicar.';
    END IF;
    novo := anterior.conteudo || E'\\n\\n' || regra;
    IF length(novo)>60000 THEN RAISE EXCEPTION 'Prompt ultrapassa limite de publicação.'; END IF;
    SELECT coalesce(max(v.versao),0)+1 INTO proxima FROM public.nina_instrucoes_versoes v
      WHERE v.clinica_id IS NOT DISTINCT FROM anterior.clinica_id AND v.escopo=anterior.escopo;
    UPDATE public.nina_instrucoes_versoes SET status='arquivada' WHERE id=anterior.id;
    INSERT INTO public.nina_instrucoes_versoes (clinica_id,escopo,versao,conteudo,status,comentario,versao_anterior_id,publicado_em)
      VALUES (anterior.clinica_id,anterior.escopo,proxima,novo,'publicada',comentario_novo,anterior.id,now());
  END LOOP;
END;
$grupo$;
`;
}
if (import.meta.main)
  await writeFile(MIGRATION_INFORMACOES_GRUPO, gerarMigrationInformacoesGrupo(), "utf8");
