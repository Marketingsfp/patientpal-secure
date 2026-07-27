-- =========================================================
-- Etapa B — unificação Planos -> Convênios
-- =========================================================

-- 0) Trava de segurança: não prosseguir se algum contrato tiver plano sem convênio
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.contratos_assinatura
   WHERE plano_id IS NOT NULL AND convenio_id IS NULL;
  IF v > 0 THEN
    RAISE EXCEPTION 'Abortado: % contrato(s) com plano e sem convenio', v;
  END IF;
END $$;

-- 1) Arquivo morto (somente leitura, apenas administradores)
CREATE TABLE public.planos_assinatura_arquivo AS
  SELECT * FROM public.planos_assinatura;

GRANT SELECT ON public.planos_assinatura_arquivo TO authenticated;
GRANT ALL ON public.planos_assinatura_arquivo TO service_role;
ALTER TABLE public.planos_assinatura_arquivo ENABLE ROW LEVEL SECURITY;
CREATE POLICY paa_select_admin ON public.planos_assinatura_arquivo
  FOR SELECT TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));

-- 2) contrato_dependentes_validar -> apenas convênio
CREATE OR REPLACE FUNCTION public.contrato_dependentes_validar()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_contrato record;
  v_max integer := 0;
  v_ativos integer;
begin
  if NEW.ativo is distinct from true then
    return NEW;
  end if;

  select id, paciente_id, status, convenio_id
  into v_contrato
  from contratos_assinatura
  where id = NEW.contrato_id;

  if v_contrato.id is null then
    raise exception 'Contrato não encontrado.';
  end if;
  if v_contrato.status = 'cancelado' then
    raise exception 'Este contrato está cancelado — não é possível incluir dependentes.';
  end if;
  if v_contrato.paciente_id = NEW.paciente_id then
    raise exception 'O titular não pode ser dependente do próprio contrato.';
  end if;

  select count(*) into v_ativos
  from contrato_dependentes
  where contrato_id = NEW.contrato_id
    and ativo = true
    and paciente_id = NEW.paciente_id
    and id is distinct from NEW.id;
  if v_ativos > 0 then
    raise exception 'Esse paciente já é dependente ativo deste contrato.' using errcode = '23505';
  end if;

  if v_contrato.convenio_id is not null then
    select max_dependentes into v_max from cb_convenios where id = v_contrato.convenio_id;
  end if;
  v_max := coalesce(v_max, 0);

  select count(*) into v_ativos
  from contrato_dependentes
  where contrato_id = NEW.contrato_id
    and ativo = true
    and id is distinct from NEW.id;
  if v_ativos >= v_max then
    raise exception 'Limite de % dependente(s) deste contrato foi atingido.', v_max;
  end if;

  return NEW;
end;
$function$;

-- 3) contrato_publico -> lê do convênio
CREATE OR REPLACE FUNCTION public.contrato_publico(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _c record; _result jsonb;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN RAISE EXCEPTION 'Token inválido'; END IF;
  SELECT c.*, cv.nome AS plano_nome, cv.beneficios AS descricao_beneficios,
         cv.modelo_contrato AS template_contrato,
         cv.modalidade AS plano_tipo, cl.nome AS clinica_nome, cl.cnpj AS clinica_cnpj,
         cl.endereco AS clinica_endereco, cl.cidade AS clinica_cidade
  INTO _c FROM public.contratos_assinatura c
  LEFT JOIN public.cb_convenios cv ON cv.id = c.convenio_id
  LEFT JOIN public.clinicas cl ON cl.id = c.clinica_id
  WHERE c.token_publico = _token LIMIT 1;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'Contrato não encontrado'; END IF;
  _result := jsonb_build_object(
    'contrato', to_jsonb(_c),
    'dependentes', COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM public.contrato_dependentes d WHERE d.contrato_id = _c.id AND d.ativo), '[]'::jsonb)
  );
  RETURN _result;
END;$function$;

-- 4) meus_cartoes -> lê do convênio
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
      c.id, c.numero, c.data_inicio, cv.vigencia_meses, c.status,
      c.paciente_id, c.paciente_nome,
      c.titular_apenas_financeiro,
      (c.data_inicio + (COALESCE(cv.vigencia_meses, 12) || ' months')::interval)::date AS validade,
      cv.nome AS plano_nome, cv.modalidade AS plano_tipo, cv.beneficios AS descricao_beneficios,
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
    LEFT JOIN public.cb_convenios cv ON cv.id = c.convenio_id
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

-- 5) pendencias_paciente -> lê do convênio
CREATE OR REPLACE FUNCTION public.pendencias_paciente(_paciente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
DECLARE _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  WITH mens AS (
    SELECT m.id, m.numero_parcela, m.vencimento, m.valor, m.status,
           c.numero AS contrato_numero, cv.nome AS plano_nome,
           GREATEST(0, _hoje - m.vencimento) AS dias_atraso
    FROM public.contrato_mensalidades m
    JOIN public.contratos_assinatura c ON c.id = m.contrato_id
    LEFT JOIN public.cb_convenios cv ON cv.id = c.convenio_id
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
END;$function$;

-- 6) Renovação / troca de convênio deixam de copiar plano_id
DO $$
DECLARE d text; o oid;
BEGIN
  FOR o IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('renovar_contrato_troca_plano','trocar_convenio_contrato') LOOP
    d := pg_get_functiondef(o);
    d := replace(d, 'clinica_id, plano_id, paciente_id', 'clinica_id, paciente_id');
    d := replace(d, 'v_contrato.clinica_id, v_contrato.plano_id, v_contrato.paciente_id', 'v_contrato.clinica_id, v_contrato.paciente_id');
    d := regexp_replace(d, '[ \t]*v_contrato\.plano_id,[ \t]*\r?\n', '', 'g');
    IF position('plano_id' in d) > 0 THEN
      RAISE EXCEPTION 'Ainda restou plano_id na funcao %', o::regprocedure;
    END IF;
    EXECUTE d;
  END LOOP;
END $$;

-- 7) Remove a coluna de plano dos contratos e exclui a tabela
ALTER TABLE public.contratos_assinatura DROP COLUMN plano_id;
DROP TABLE public.planos_assinatura;
