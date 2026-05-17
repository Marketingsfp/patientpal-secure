
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS face_descriptor double precision[],
  ADD COLUMN IF NOT EXISTS face_atualizado_em timestamptz;

ALTER TABLE public.medicos
  ADD COLUMN IF NOT EXISTS face_descriptor double precision[],
  ADD COLUMN IF NOT EXISTS face_atualizado_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_pacientes_face ON public.pacientes ((face_descriptor IS NOT NULL)) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_medicos_face ON public.medicos ((face_descriptor IS NOT NULL)) WHERE ativo;

CREATE OR REPLACE FUNCTION public.pendencias_paciente(_paciente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
DECLARE _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  WITH mens AS (
    SELECT m.id, m.numero_parcela, m.vencimento, m.valor, m.status,
           c.numero AS contrato_numero, p.nome AS plano_nome,
           GREATEST(0, _hoje - m.vencimento) AS dias_atraso
    FROM public.contrato_mensalidades m
    JOIN public.contratos_assinatura c ON c.id = m.contrato_id
    JOIN public.planos_assinatura p ON p.id = c.plano_id
    WHERE m.status IN ('pendente','aberto','atrasado')
      AND (c.paciente_id = _paciente_id OR EXISTS(
        SELECT 1 FROM public.contrato_dependentes d WHERE d.contrato_id = c.id AND d.paciente_id = _paciente_id AND d.ativo
      ))
      AND is_member(auth.uid(), c.clinica_id)
  ),
  lanc AS (
    SELECT l.id, l.descricao, l.data_vencimento AS vencimento, l.valor,
           GREATEST(0, _hoje - COALESCE(l.data_vencimento, l.data)) AS dias_atraso
    FROM public.fin_lancamentos l
    WHERE l.paciente_id = _paciente_id
      AND l.tipo = 'receita'
      AND l.status IN ('pendente')
      AND is_member(auth.uid(), l.clinica_id)
  )
  SELECT jsonb_build_object(
    'mensalidades', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.vencimento) FROM mens m), '[]'::jsonb),
    'lancamentos', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.vencimento) FROM lanc l), '[]'::jsonb),
    'total_aberto', COALESCE((SELECT SUM(valor) FROM mens), 0) + COALESCE((SELECT SUM(valor) FROM lanc), 0),
    'total_atrasado', COALESCE((SELECT SUM(valor) FROM mens WHERE dias_atraso > 0), 0) + COALESCE((SELECT SUM(valor) FROM lanc WHERE dias_atraso > 0), 0),
    'qtd_atrasadas', COALESCE((SELECT COUNT(*) FROM mens WHERE dias_atraso > 0), 0) + COALESCE((SELECT COUNT(*) FROM lanc WHERE dias_atraso > 0), 0)
  ) INTO _result;
  RETURN _result;
END;$$;

CREATE OR REPLACE FUNCTION public.pacientes_face_lista(_clinica_id uuid)
RETURNS TABLE(id uuid, nome text, descriptor double precision[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.nome, p.face_descriptor
  FROM public.pacientes p
  WHERE p.clinica_id = _clinica_id AND p.ativo AND p.face_descriptor IS NOT NULL
    AND is_member(auth.uid(), p.clinica_id);
$$;

CREATE OR REPLACE FUNCTION public.medicos_face_lista(_clinica_id uuid)
RETURNS TABLE(id uuid, nome text, email text, user_id uuid, descriptor double precision[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.nome, m.email, m.user_id, m.face_descriptor
  FROM public.medicos m
  WHERE m.clinica_id = _clinica_id AND m.ativo AND m.face_descriptor IS NOT NULL
    AND is_member(auth.uid(), m.clinica_id);
$$;
