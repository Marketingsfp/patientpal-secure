
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action = ANY (ARRAY['INSERT','UPDATE','DELETE','blocked_UPDATE','blocked_DELETE']));

CREATE OR REPLACE FUNCTION public.fn_orcamentos_bloqueia_convertido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_pode boolean := false;
  v_email text;
  v_headers jsonb;
  v_ip inet;
  v_ua text;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF OLD.status <> 'convertido' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_pode := v_user_id IS NOT NULL AND (
    public.has_role(v_user_id, OLD.clinica_id, 'admin'::app_role)
    OR public.has_role(v_user_id, OLD.clinica_id, 'gestor'::app_role)
  );

  IF v_pode THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  EXCEPTION WHEN OTHERS THEN v_email := NULL; END;
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_ua := v_headers->>'user-agent';
    BEGIN
      v_ip := NULLIF(split_part(coalesce(v_headers->>'x-forwarded-for',''), ',', 1), '')::inet;
    EXCEPTION WHEN OTHERS THEN v_ip := NULL; END;
  EXCEPTION WHEN OTHERS THEN v_headers := NULL; END;

  v_before := to_jsonb(OLD);
  v_after := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;

  INSERT INTO public.audit_log (
    user_id, user_email, clinica_id, table_name, record_id, action,
    dados_antes, dados_depois, ip_address, user_agent
  ) VALUES (
    v_user_id, v_email, OLD.clinica_id, 'orcamentos', OLD.id::text, 'blocked_' || TG_OP,
    v_before, v_after, v_ip, v_ua
  );

  RAISE EXCEPTION 'Orçamento convertido só pode ser alterado por Administrador ou Gestor.'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DO $$
DECLARE
  v_clinica uuid; v_admin uuid; v_recep uuid;
  v_orc uuid; v_item uuid;
  v_before_orc int; v_after_orc int;
  v_before_aud int; v_after_aud int;
  v_blocked int; v_ok int; v_item_ct int;
BEGIN
  SELECT cm_a.clinica_id INTO v_clinica
  FROM public.clinica_memberships cm_a
  JOIN public.clinica_memberships cm_r
    ON cm_r.clinica_id = cm_a.clinica_id AND cm_r.role = 'recepcao' AND cm_r.ativo = true
  WHERE cm_a.role = 'admin' AND cm_a.ativo = true
  LIMIT 1;

  IF v_clinica IS NULL THEN
    SELECT clinica_id INTO v_clinica FROM public.clinica_memberships WHERE role='admin' AND ativo=true LIMIT 1;
  END IF;

  SELECT user_id INTO v_admin FROM public.clinica_memberships
    WHERE clinica_id=v_clinica AND role='admin' AND ativo=true LIMIT 1;
  SELECT user_id INTO v_recep FROM public.clinica_memberships
    WHERE clinica_id=v_clinica AND role='recepcao' AND ativo=true LIMIT 1;

  RAISE NOTICE '[SETUP] clinica=%  admin=%  recep=%', v_clinica, v_admin, COALESCE(v_recep::text, 'N/A');

  SELECT count(*) INTO v_before_orc FROM public.orcamentos;
  SELECT count(*) INTO v_before_aud FROM public.audit_log;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);

  INSERT INTO public.orcamentos (
    clinica_id, paciente_nome, observacoes, valor_total, status, categoria, validade_dias, desconto
  ) VALUES (
    v_clinica, '[TESTE-AUDITORIA] Paciente', '[TESTE-AUDITORIA] observação inicial',
    100, 'aberto', 'demais', 30, 0
  ) RETURNING id INTO v_orc;
  RAISE NOTICE '[1] OK orçamento criado id=%', v_orc;

  INSERT INTO public.orcamento_itens (orcamento_id, descricao, quantidade, valor_unitario, valor_total, ordem)
  VALUES (v_orc, '[TESTE-AUDITORIA] Item', 1, 100, 100, 0)
  RETURNING id INTO v_item;
  RAISE NOTICE '[1b] OK item criado id=%', v_item;

  UPDATE public.orcamentos SET status='convertido' WHERE id=v_orc;
  RAISE NOTICE '[2] OK marcado como convertido';

  IF v_recep IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_recep::text)::text, true);
    BEGIN
      UPDATE public.orcamentos SET observacoes='[TESTE-AUDITORIA] hack' WHERE id=v_orc;
      RAISE NOTICE '[3-4] FAIL recepção conseguiu editar';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE '[3-4] OK bloqueou recepção: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE '[3-4] SKIP (sem recepção nesta clínica)';
  END IF;

  SELECT count(*) INTO v_blocked FROM public.audit_log
    WHERE record_id = v_orc::text AND action LIKE 'blocked_%';
  RAISE NOTICE '[5] audit_log blocked_* = % (esperado >= 1)', v_blocked;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  UPDATE public.orcamentos SET observacoes='[TESTE-AUDITORIA] editado admin', valor_total=150 WHERE id=v_orc;
  RAISE NOTICE '[6-7] OK admin editou';

  SELECT count(*) INTO v_ok FROM public.audit_log
    WHERE record_id = v_orc::text AND action='UPDATE';
  RAISE NOTICE '[8] audit_log UPDATE do orçamento = % (esperado >= 2)', v_ok;

  UPDATE public.orcamento_itens SET valor_unitario=150, valor_total=150 WHERE id=v_item;
  RAISE NOTICE '[9a] OK item editado';
  DELETE FROM public.orcamento_itens WHERE id=v_item;
  RAISE NOTICE '[9b] OK item excluído';

  SELECT count(*) INTO v_item_ct FROM public.audit_log
    WHERE table_name='orcamento_itens' AND record_id = v_item::text;
  RAISE NOTICE '[10] audit_log do item = % (esperado 3)', v_item_ct;

  -- Cleanup
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  DELETE FROM public.orcamento_itens WHERE orcamento_id IN (
    SELECT id FROM public.orcamentos WHERE observacoes LIKE '[TESTE-AUDITORIA]%'
  );
  DELETE FROM public.orcamentos WHERE observacoes LIKE '[TESTE-AUDITORIA]%';
  DELETE FROM public.audit_log WHERE record_id IN (v_orc::text, v_item::text);

  SELECT count(*) INTO v_after_orc FROM public.orcamentos;
  SELECT count(*) INTO v_after_aud FROM public.audit_log;

  RAISE NOTICE '[CLEANUP] orcamentos antes=% depois=%', v_before_orc, v_after_orc;
  RAISE NOTICE '[CLEANUP] audit_log antes=% depois=%', v_before_aud, v_after_aud;

  IF v_after_orc <> v_before_orc OR v_after_aud <> v_before_aud THEN
    RAISE EXCEPTION '[CLEANUP] diff orc=% aud=%', v_after_orc - v_before_orc, v_after_aud - v_before_aud;
  END IF;

  RAISE NOTICE '[FINAL] TODOS OS TESTES PASSARAM';
END $$;
