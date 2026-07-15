CREATE OR REPLACE FUNCTION public.meus_cartoes()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _email text;
  _result jsonb;
BEGIN
  SELECT lower(email) INTO _email FROM auth.users WHERE id = auth.uid();
  IF _email IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _result
  FROM (
    SELECT
      c.id, c.numero, c.data_inicio, p.vigencia_meses, c.status,
      c.paciente_id, c.paciente_nome,
      (c.data_inicio + (p.vigencia_meses || ' months')::interval)::date AS validade,
      p.nome AS plano_nome, p.tipo AS plano_tipo, p.descricao_beneficios,
      cl.nome AS clinica_nome, cl.telefone AS clinica_telefone,
      (SELECT lower(pac.email) FROM public.pacientes pac WHERE pac.id = c.paciente_id) AS titular_email,
      CASE
        WHEN (SELECT lower(pac.email) FROM public.pacientes pac WHERE pac.id = c.paciente_id) = _email THEN 'titular'
        ELSE 'dependente'
      END AS papel,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', d.id, 'nome', d.paciente_nome, 'parentesco', d.parentesco, 'tipo', d.tipo))
        FROM public.contrato_dependentes d
        WHERE d.contrato_id = c.id AND d.ativo
      ), '[]'::jsonb) AS dependentes,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', m.id, 'parcela', m.parcela, 'vencimento', m.vencimento,
          'valor', m.valor, 'status', m.status, 'pago_em', m.pago_em
        ) ORDER BY m.parcela)
        FROM public.contrato_mensalidades m WHERE m.contrato_id = c.id
      ), '[]'::jsonb) AS mensalidades
    FROM public.contratos_assinatura c
    JOIN public.planos_assinatura p ON p.id = c.plano_id
    LEFT JOIN public.clinicas cl ON cl.id = c.clinica_id
    WHERE c.status IN ('ativo','pendente_assinatura')
      AND (
        EXISTS (SELECT 1 FROM public.pacientes pac WHERE pac.id = c.paciente_id AND lower(pac.email) = _email)
        OR EXISTS (
          SELECT 1 FROM public.contrato_dependentes d
          JOIN public.pacientes pac ON pac.id = d.paciente_id
          WHERE d.contrato_id = c.id AND d.ativo AND lower(pac.email) = _email
        )
      )
    ORDER BY c.data_inicio DESC
  ) t;

  RETURN _result;
END;$function$;