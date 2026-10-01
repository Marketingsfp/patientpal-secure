-- Fim da base de conhecimento da Nina (decisão do responsável em 01/10/2026).
--
-- A Nina passa a informar SÓ pelo cadastro do sistema (Clínica médica > Cadastros: médicos,
-- horários, consultas, exames e procedimentos). Esta migration remove o que sobrou da base:
--   * nina_cat_servicos, nina_cat_profissionais (catálogo editorial);
--   * nina_kb_bases, nina_kb_registros (base de texto antiga);
--   * nina_kb_consultas (log das consultas; traz perguntas de pacientes: NÃO é arquivado);
--   * a função nina_kb_buscar_semantico.
--
-- ORDEM DE USO (importante):
--   1) publicar o código (a Nina e as telas já não leem estas tabelas);
--   2) a migration 20260930170000 (liga a flag nina_informa_cadastro) e a v55 das instruções;
--   3) só então aplicar esta. A trava abaixo recusa a execução se a flag não estiver ligada.
--
-- BACKUP: os dados editoriais (catálogo e base de texto) ficam copiados no schema
-- arquivo_base_conhecimento, fechado para qualquer usuário da aplicação (só o administrador do
-- banco lê). Quando a equipe der o ok final, apague com:
--   DROP SCHEMA arquivo_base_conhecimento CASCADE;
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clinica_feature_flags
    WHERE flag_key = 'nina_informa_cadastro' AND ativo
  ) THEN
    RAISE EXCEPTION 'Nada foi apagado: a Nina ainda não informa pelo cadastro em nenhuma clínica (flag nina_informa_cadastro desligada). Aplique antes a migration 20260930170000 e valide a Nina.';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS arquivo_base_conhecimento;
REVOKE ALL ON SCHEMA arquivo_base_conhecimento FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['nina_cat_servicos', 'nina_cat_profissionais', 'nina_kb_bases', 'nina_kb_registros']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND to_regclass('arquivo_base_conhecimento.' || t) IS NULL THEN
      EXECUTE format('CREATE TABLE arquivo_base_conhecimento.%I AS TABLE public.%I', t, t);
      EXECUTE format('ALTER TABLE arquivo_base_conhecimento.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON arquivo_base_conhecimento.%I FROM PUBLIC, anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'nina_kb_buscar_semantico'
  LOOP
    EXECUTE format('DROP FUNCTION %s', f.assinatura);
  END LOOP;
END $$;

-- Tudo em um comando: as chaves entre elas (registros/consultas → bases) caem juntas.
DROP TABLE IF EXISTS
  public.nina_kb_consultas,
  public.nina_kb_registros,
  public.nina_kb_bases,
  public.nina_cat_profissionais,
  public.nina_cat_servicos;

COMMIT;
