
-- 1) chat_membros: restrict self-insert to group channels; private/direct require creator
DROP POLICY IF EXISTS membros_insert ON public.chat_membros;
CREATE POLICY membros_insert ON public.chat_membros
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_canais c
      WHERE c.id = chat_membros.canal_id
        AND is_member(auth.uid(), c.clinica_id)
        AND (
          c.criado_por = auth.uid()
          OR (chat_membros.user_id = auth.uid() AND c.tipo = 'grupo')
        )
    )
  );

-- 2) hr_contratos: restrict SELECT to managers OR own contract
DROP POLICY IF EXISTS hr_contr_select ON public.hr_contratos;
CREATE POLICY hr_contr_select ON public.hr_contratos
  FOR SELECT USING (
    can_manage_clinica(auth.uid(), clinica_id)
    OR user_id = auth.uid()
  );

-- 3) prestadores: restrict SELECT and UPDATE to managers
DROP POLICY IF EXISTS prest_select ON public.prestadores;
CREATE POLICY prest_select ON public.prestadores
  FOR SELECT USING (can_manage_clinica(auth.uid(), clinica_id));

DROP POLICY IF EXISTS prest_update ON public.prestadores;
CREATE POLICY prest_update ON public.prestadores
  FOR UPDATE USING (can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));

-- 4) medicos: column-level protection for sensitive personal/bank data
-- Row-level SELECT remains is_member (dropdowns, agenda, listings keep working);
-- sensitive columns are revoked from authenticated and exposed via SECURITY DEFINER RPC
REVOKE SELECT ON public.medicos FROM authenticated;
GRANT SELECT (
  id, user_id, clinica_id, nome, crm, crm_uf, especialidade_id,
  telefone, email, percentual_repasse_padrao, ativo, created_at, updated_at,
  tipo_repasse, valor_repasse_padrao, paytime_recipient_id, sexo,
  cep, logradouro, numero, complemento, bairro, cidade, estado,
  nacionalidade, estado_civil, face_atualizado_em, face_descriptor
) ON public.medicos TO authenticated;

CREATE OR REPLACE FUNCTION public.medico_dados_sensiveis(_medico_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _row record;
BEGIN
  SELECT m.id, m.clinica_id, m.user_id, m.cpf, m.rg, m.data_nascimento,
         m.banco, m.agencia, m.conta, m.pix_chave
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
    'pix_chave', _row.pix_chave
  );
END;
$$;

REVOKE ALL ON FUNCTION public.medico_dados_sensiveis(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.medico_dados_sensiveis(uuid) TO authenticated;
