-- Totem: as funções públicas de check-in passam a exigir o token do totem
-- (clinicas.token_publico) ou um funcionário logado da própria clínica.

CREATE TABLE IF NOT EXISTS public.totem_checkin_tentativas (
  clinica_id uuid NOT NULL,
  minuto timestamptz NOT NULL,
  falhas integer NOT NULL DEFAULT 0,
  PRIMARY KEY (clinica_id, minuto)
);
GRANT ALL ON public.totem_checkin_tentativas TO service_role;
ALTER TABLE public.totem_checkin_tentativas ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._totem_autorizado(_clinica_id uuid, _token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _clinica_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.clinicas c
             WHERE c.id = _clinica_id AND c.token_publico IS NOT NULL
               AND coalesce(_token, '') <> '' AND c.token_publico = _token)
    OR (auth.uid() IS NOT NULL AND public.is_member(auth.uid(), _clinica_id))
  );
$$;
REVOKE EXECUTE ON FUNCTION public._totem_autorizado(uuid, text) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.totem_checkin_cpf(uuid, text);
DROP FUNCTION IF EXISTS public.totem_checkin_paciente(uuid, uuid);
DROP FUNCTION IF EXISTS public.totem_match_biometria(uuid, jsonb, double precision);

-- Núcleo comum do check-in (interno, não exposto).
CREATE OR REPLACE FUNCTION public._totem_checkin_executar(_clinica_id uuid, _paciente_id uuid, _origem text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare v_pac record; v_ag record; v_moveu boolean := false;
begin
  select id, nome into v_pac from pacientes where clinica_id = _clinica_id and id = _paciente_id limit 1;
  if v_pac is null then
    return jsonb_build_object('ok', false, 'erro', 'Paciente não encontrado. Procure a recepção.');
  end if;
  select a.id, a.inicio, a.fluxo_etapa into v_ag from agendamentos a
   where a.clinica_id = _clinica_id and a.paciente_id = v_pac.id
     and (a.inicio at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
     and a.status <> 'cancelado'
   order by a.inicio limit 1;
  if v_ag is null then
    return jsonb_build_object('ok', false, 'erro', 'Sem agendamento para hoje. Procure a recepção.');
  end if;
  if v_ag.fluxo_etapa is distinct from 'triagem' and v_ag.fluxo_etapa is distinct from 'atendimento' then
    update agendamentos set fluxo_etapa = 'recepcao', fluxo_atualizado_em = now() where id = v_ag.id;
    v_moveu := true;
  end if;
  if v_moveu then
    begin
      insert into public.agendamento_historico_notas (clinica_id, agendamento_id, user_email, user_nome, texto)
      values (_clinica_id, v_ag.id, null, 'Totem', 'Check-in realizado pelo Totem (' || _origem || ')');
    exception when others then null;
    end;
  end if;
  return jsonb_build_object('ok', true, 'paciente_nome', split_part(trim(v_pac.nome), ' ', 1),
    'inicio', v_ag.inicio, 'medico', null, 'procedimento', null);
end;
$$;
REVOKE EXECUTE ON FUNCTION public._totem_checkin_executar(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.totem_checkin_cpf(_clinica_id uuid, _cpf text, _token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  v_cpf text := regexp_replace(coalesce(_cpf, ''), '\D', '', 'g');
  v_min timestamptz := date_trunc('minute', now());
  v_falhas integer;
  v_pac_id uuid;
begin
  if not public._totem_autorizado(_clinica_id, _token) then
    return jsonb_build_object('ok', false, 'erro', 'Não foi possível fazer o check-in. Procure a recepção.');
  end if;
  if length(v_cpf) <> 11 then
    return jsonb_build_object('ok', false, 'erro', 'CPF inválido');
  end if;
  select falhas into v_falhas from public.totem_checkin_tentativas where clinica_id = _clinica_id and minuto = v_min;
  if coalesce(v_falhas, 0) >= 20 then
    return jsonb_build_object('ok', false, 'erro', 'Muitas tentativas, procure a recepção.');
  end if;
  select id into v_pac_id from pacientes
   where clinica_id = _clinica_id
     and (cpf_digits = v_cpf or regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf)
   limit 1;
  if v_pac_id is null then
    insert into public.totem_checkin_tentativas (clinica_id, minuto, falhas) values (_clinica_id, v_min, 1)
    on conflict (clinica_id, minuto) do update set falhas = totem_checkin_tentativas.falhas + 1;
    delete from public.totem_checkin_tentativas where minuto < now() - interval '1 hour';
    return jsonb_build_object('ok', false, 'erro', 'Paciente não encontrado. Procure a recepção.');
  end if;
  return public._totem_checkin_executar(_clinica_id, v_pac_id, 'CPF');
end;
$$;

CREATE OR REPLACE FUNCTION public.totem_checkin_paciente(_clinica_id uuid, _paciente_id uuid, _token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if _paciente_id is null or not public._totem_autorizado(_clinica_id, _token) then
    return jsonb_build_object('ok', false, 'erro', 'Não foi possível fazer o check-in. Procure a recepção.');
  end if;
  return public._totem_checkin_executar(_clinica_id, _paciente_id, 'reconhecimento facial');
end;
$$;

CREATE OR REPLACE FUNCTION public.totem_match_biometria(_clinica_id uuid, _descriptor jsonb, _threshold double precision, _token text)
RETURNS TABLE(paciente_id uuid, nome text, distancia double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c_threshold_max constant double precision := 0.6;
  v_threshold double precision;
  v_query float[];
BEGIN
  IF NOT public._totem_autorizado(_clinica_id, _token) THEN RETURN; END IF;
  IF _descriptor IS NULL OR jsonb_typeof(_descriptor) <> 'array' OR jsonb_array_length(_descriptor) <> 128 THEN
    RETURN;
  END IF;
  v_threshold := least(coalesce(_threshold, c_threshold_max), c_threshold_max);
  IF v_threshold <= 0 THEN RETURN; END IF;
  SELECT array_agg((v)::float ORDER BY ord) INTO v_query
    FROM jsonb_array_elements_text(_descriptor) WITH ORDINALITY AS t(v, ord);
  RETURN QUERY
  WITH candidatos AS (
    SELECT b.paciente_id, p.nome,
      (SELECT sqrt(sum(power(v_query[i] - (b.descriptor->>(i-1))::float, 2))) FROM generate_series(1, 128) i) AS dist
    FROM public.paciente_biometria b
    JOIN public.pacientes p ON p.id = b.paciente_id
    WHERE b.clinica_id = _clinica_id AND b.revogado_em IS NULL
      AND jsonb_typeof(b.descriptor) = 'array' AND jsonb_array_length(b.descriptor) = 128
  )
  SELECT c.paciente_id, split_part(trim(c.nome), ' ', 1), c.dist
  FROM candidatos c WHERE c.dist <= v_threshold ORDER BY c.dist ASC LIMIT 1;
END;
$$;

-- Totem público: reconhecimento + check-in numa etapa só, sem devolver o id do paciente.
CREATE OR REPLACE FUNCTION public.totem_checkin_facial(_clinica_id uuid, _descriptor jsonb, _threshold double precision, _token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare v_id uuid;
begin
  if not public._totem_autorizado(_clinica_id, _token) then
    return jsonb_build_object('ok', false, 'erro', 'Não foi possível fazer o check-in. Procure a recepção.');
  end if;
  select m.paciente_id into v_id from public.totem_match_biometria(_clinica_id, _descriptor, _threshold, _token) m limit 1;
  if v_id is null then
    return jsonb_build_object('ok', false, 'reconhecido', false, 'erro', 'Não reconhecemos seu rosto. Digite o CPF.');
  end if;
  return public._totem_checkin_executar(_clinica_id, v_id, 'reconhecimento facial');
end;
$$;

REVOKE EXECUTE ON FUNCTION public.totem_checkin_cpf(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.totem_checkin_paciente(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.totem_match_biometria(uuid, jsonb, double precision, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.totem_checkin_facial(uuid, jsonb, double precision, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.totem_checkin_cpf(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.totem_checkin_paciente(uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.totem_match_biometria(uuid, jsonb, double precision, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.totem_checkin_facial(uuid, jsonb, double precision, text) TO anon, authenticated;
