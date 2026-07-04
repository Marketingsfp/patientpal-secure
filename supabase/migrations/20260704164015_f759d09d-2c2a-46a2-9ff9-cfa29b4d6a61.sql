
DO $$
DECLARE
  v_perfil uuid := 'aa4ab6ac-f4f4-4b03-9d78-bb7941338ac3';
BEGIN
  -- Remove módulos ocultos
  DELETE FROM public.perfil_permissoes
  WHERE perfil_id = v_perfil
    AND modulo IN ('anamneses','documentos');

  -- Garante módulos essenciais
  INSERT INTO public.perfil_permissoes (perfil_id, modulo, acesso)
  VALUES
    (v_perfil, 'procedimentos', 'read'),
    (v_perfil, 'fluxo', 'write'),
    (v_perfil, 'painel', 'write'),
    (v_perfil, 'recepcao', 'write'),
    (v_perfil, 'perfil-proprio', 'write')
  ON CONFLICT (perfil_id, modulo) DO UPDATE
    SET acesso = EXCLUDED.acesso;

  -- Garante caixa como write
  UPDATE public.perfil_permissoes
     SET acesso = 'write'
   WHERE perfil_id = v_perfil AND modulo = 'caixa';
END $$;
