ALTER TABLE public.coach_config_clinica
  ADD COLUMN IF NOT EXISTS complemento text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS base_gerada_em timestamptz;

COMMENT ON COLUMN public.coach_config_clinica.tabela_servicos IS
  'Cache da base de conhecimento gerada a partir das tabelas do sistema (procedimentos, catálogo da Nina, médicos, unidades). Não é digitada à mão.';
COMMENT ON COLUMN public.coach_config_clinica.complemento IS
  'Informações extras escritas pela gestora; anexadas ao final da base enviada à IA.';