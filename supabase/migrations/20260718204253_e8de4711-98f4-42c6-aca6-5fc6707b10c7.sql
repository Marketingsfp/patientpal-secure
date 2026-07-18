DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='perfis_permissoes') THEN
    UPDATE public.perfis_permissoes
       SET permissoes = permissoes - 'atendimento-multiplo'
     WHERE permissoes ? 'atendimento-multiplo';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='usuarios_permissoes') THEN
    UPDATE public.usuarios_permissoes
       SET permissoes = permissoes - 'atendimento-multiplo'
     WHERE permissoes ? 'atendimento-multiplo';
  END IF;
END $$;