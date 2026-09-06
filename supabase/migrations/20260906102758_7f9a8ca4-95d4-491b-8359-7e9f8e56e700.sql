-- Lista (uma única vez por consulta) as clínicas ativas do usuário autenticado.
-- Sem argumentos de coluna, o Postgres avalia isto como InitPlan: 1 chamada por
-- consulta, em vez de 1 chamada por linha varrida (causa dos timeouts 57014).
CREATE OR REPLACE FUNCTION public.clinicas_do_usuario()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    array_agg(cm.clinica_id),
    ARRAY[]::uuid[]
  )
  FROM public.clinica_memberships cm
  WHERE cm.user_id = auth.uid() AND cm.ativo = true
$function$;

GRANT EXECUTE ON FUNCTION public.clinicas_do_usuario() TO authenticated;

-- Mesma regra de visibilidade (membro ativo da clínica), avaliada uma vez.
DROP POLICY IF EXISTS pacientes_member_select ON public.pacientes;
CREATE POLICY pacientes_member_select
  ON public.pacientes
  FOR SELECT
  TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()));