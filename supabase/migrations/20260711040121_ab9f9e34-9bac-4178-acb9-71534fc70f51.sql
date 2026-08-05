
DO $$
DECLARE
  v_ids uuid[] := ARRAY[
    '092161b2-cda0-4d8a-a8f6-1b16a13bf12c'::uuid,
    '57d02357-3867-47ef-8a83-d54111fa8bf4'::uuid,
    'ae3cc64d-7644-459f-93fd-be3fb591775f'::uuid
  ];
  v_mens_ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(id), '{}') INTO v_mens_ids
  FROM public.contrato_mensalidades
  WHERE contrato_id = ANY(v_ids);

  DELETE FROM public.gr_impressoes WHERE mensalidade_id = ANY(v_mens_ids);
  DELETE FROM public.boletos WHERE mensalidade_id = ANY(v_mens_ids);
  DELETE FROM public.boletos WHERE contrato_id = ANY(v_ids);
  DELETE FROM public.contrato_mensalidades WHERE contrato_id = ANY(v_ids);
  DELETE FROM public.contrato_dependentes WHERE contrato_id = ANY(v_ids);
  DELETE FROM public.contratos_assinatura WHERE id = ANY(v_ids);
END $$;
