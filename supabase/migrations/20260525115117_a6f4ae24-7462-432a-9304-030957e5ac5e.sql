
-- 1) chat_membros: remove self-join for 'grupo' channels — only creator can add members
DROP POLICY IF EXISTS membros_insert ON public.chat_membros;
CREATE POLICY membros_insert ON public.chat_membros
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chat_canais c
    WHERE c.id = chat_membros.canal_id
      AND public.is_member(auth.uid(), c.clinica_id)
      AND c.criado_por = auth.uid()
  )
);

-- 2) prestadores: restrict INSERT to managers only
DROP POLICY IF EXISTS prest_insert ON public.prestadores;
CREATE POLICY prest_insert ON public.prestadores
FOR INSERT TO authenticated
WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

-- 3) medicos: revoke SELECT on repasse columns from authenticated
REVOKE SELECT (percentual_repasse_padrao, valor_repasse_padrao, tipo_repasse)
  ON public.medicos FROM authenticated;

-- Extend the existing sensitive-data function to include repasse fields
CREATE OR REPLACE FUNCTION public.medico_dados_sensiveis(_medico_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _row record;
BEGIN
  SELECT m.id, m.clinica_id, m.user_id, m.cpf, m.rg, m.data_nascimento,
         m.banco, m.agencia, m.conta, m.pix_chave,
         m.tipo_repasse, m.percentual_repasse_padrao, m.valor_repasse_padrao
    INTO _row
    FROM public.medicos m
   WHERE m.id = _medico_id;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Médico não encontrado';
  END IF;

  IF NOT (
    public.can_manage_clinica(auth.uid(), _row.clinica_id)
    OR _row.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Sem permissão para ler dados sensíveis';
  END IF;

  RETURN jsonb_build_object(
    'cpf', _row.cpf,
    'rg', _row.rg,
    'data_nascimento', _row.data_nascimento,
    'banco', _row.banco,
    'agencia', _row.agencia,
    'conta', _row.conta,
    'pix_chave', _row.pix_chave,
    'tipo_repasse', _row.tipo_repasse,
    'percentual_repasse_padrao', _row.percentual_repasse_padrao,
    'valor_repasse_padrao', _row.valor_repasse_padrao
  );
END;
$function$;

-- Managers-only list function: returns repasse data for all doctors in a clinic
CREATE OR REPLACE FUNCTION public.medicos_repasse_lista(_clinica_id uuid)
RETURNS TABLE(id uuid, tipo_repasse text, percentual_repasse_padrao numeric, valor_repasse_padrao numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT m.id, m.tipo_repasse::text, m.percentual_repasse_padrao, m.valor_repasse_padrao
  FROM public.medicos m
  WHERE m.clinica_id = _clinica_id
    AND public.can_manage_clinica(auth.uid(), _clinica_id);
$function$;
