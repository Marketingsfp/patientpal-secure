-- Permite que usuários com papel 'financeiro' na clínica atualizem sessões de caixa (necessário para desfazer fechamento)
CREATE OR REPLACE FUNCTION public.is_financeiro_clinica(_user_id uuid, _clinica_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinica_memberships
    WHERE user_id = _user_id AND clinica_id = _clinica_id AND ativo = true
      AND role = 'financeiro'
  )
$$;

DROP POLICY IF EXISTS cx_sess_update_financeiro ON public.caixa_sessoes;
CREATE POLICY cx_sess_update_financeiro ON public.caixa_sessoes
FOR UPDATE TO authenticated
USING (public.is_financeiro_clinica(auth.uid(), clinica_id))
WITH CHECK (public.is_financeiro_clinica(auth.uid(), clinica_id));

DROP POLICY IF EXISTS cx_sess_select_financeiro ON public.caixa_sessoes;
CREATE POLICY cx_sess_select_financeiro ON public.caixa_sessoes
FOR SELECT TO authenticated
USING (public.is_financeiro_clinica(auth.uid(), clinica_id));