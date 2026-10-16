ALTER TABLE public.clinica_dominios ADD COLUMN IF NOT EXISTS restringir_acesso boolean NOT NULL DEFAULT false;

UPDATE public.clinica_dominios SET restringir_acesso = true
WHERE hostname = 'sistema.clinicaconsultahoje.com.br'
  AND clinica_id = 'e9e41341-0e53-4216-8284-caeeaf6fb887';

-- Decide se o usuário logado pode usar o endereço. Só UX/política: não libera dado nenhum (RLS segue igual).
CREATE OR REPLACE FUNCTION public.acesso_por_dominio(_hostname text)
RETURNS TABLE(restrito boolean, pode boolean, clinica_id uuid, clinica_nome text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d record;
  uid uuid := auth.uid();
BEGIN
  SELECT cd.clinica_id, c.nome INTO d
  FROM public.clinica_dominios cd JOIN public.clinicas c ON c.id = cd.clinica_id
  WHERE cd.ativo AND cd.restringir_acesso AND cd.hostname = public.normalizar_hostname(_hostname)
  LIMIT 1;
  IF d.clinica_id IS NULL THEN
    RETURN QUERY SELECT false, true, NULL::uuid, NULL::text;
    RETURN;
  END IF;
  RETURN QUERY SELECT true,
    (uid IS NOT NULL AND (
      EXISTS (SELECT 1 FROM public.clinica_memberships m
              WHERE m.user_id = uid AND m.clinica_id = d.clinica_id AND m.ativo)
      OR public.is_platform_admin(uid))),
    d.clinica_id, d.nome;
END $$;

REVOKE ALL ON FUNCTION public.acesso_por_dominio(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acesso_por_dominio(text) TO authenticated;