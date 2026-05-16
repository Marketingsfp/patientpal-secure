-- Enum tipos de senha e status
CREATE TYPE public.tipo_senha AS ENUM ('N', 'P', 'E', 'R');
CREATE TYPE public.status_senha AS ENUM ('emitida', 'chamada', 'atendida', 'cancelada');

-- Tabela de pacientes (mínima; expandida na Fase 2)
CREATE TABLE public.pacientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cpf text,
  telefone text,
  data_nascimento date,
  consentimento_lgpd_em timestamptz,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pacientes_nome_chk CHECK (length(trim(nome)) BETWEEN 2 AND 200),
  CONSTRAINT pacientes_cpf_chk CHECK (cpf IS NULL OR length(cpf) BETWEEN 11 AND 14),
  CONSTRAINT pacientes_tel_chk CHECK (telefone IS NULL OR length(telefone) <= 30),
  UNIQUE (clinica_id, cpf)
);
CREATE INDEX ix_pacientes_clinica ON public.pacientes(clinica_id);

ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY pacientes_member_select ON public.pacientes
  FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

CREATE POLICY pacientes_staff_insert ON public.pacientes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid(), clinica_id));

CREATE POLICY pacientes_staff_update ON public.pacientes
  FOR UPDATE TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

CREATE POLICY pacientes_manager_delete ON public.pacientes
  FOR DELETE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER trg_pacientes_touch BEFORE UPDATE ON public.pacientes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Biometria facial (consentimento explícito, LGPD art. 11)
CREATE TABLE public.paciente_biometria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  descriptor jsonb NOT NULL, -- array float 128d (face-api.js)
  consentimento_em timestamptz NOT NULL DEFAULT now(),
  revogado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT biometria_descriptor_chk CHECK (jsonb_typeof(descriptor) = 'array')
);
CREATE INDEX ix_biometria_clinica_ativa ON public.paciente_biometria(clinica_id) WHERE revogado_em IS NULL;
CREATE INDEX ix_biometria_paciente ON public.paciente_biometria(paciente_id);

ALTER TABLE public.paciente_biometria ENABLE ROW LEVEL SECURITY;

CREATE POLICY biometria_member_select ON public.paciente_biometria
  FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

CREATE POLICY biometria_member_insert ON public.paciente_biometria
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid(), clinica_id));

-- Revogar/atualizar (marcar revogado_em): membros podem
CREATE POLICY biometria_member_update ON public.paciente_biometria
  FOR UPDATE TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

CREATE POLICY biometria_manager_delete ON public.paciente_biometria
  FOR DELETE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));

-- Senhas (fila)
CREATE TABLE public.senhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  tipo public.tipo_senha NOT NULL,
  numero integer NOT NULL,
  codigo text NOT NULL, -- ex: P-007
  status public.status_senha NOT NULL DEFAULT 'emitida',
  paciente_id uuid REFERENCES public.pacientes(id) ON DELETE SET NULL,
  identificado_por_facial boolean NOT NULL DEFAULT false,
  guiche text,
  chamada_por uuid,
  emitida_em timestamptz NOT NULL DEFAULT now(),
  chamada_em timestamptz,
  atendida_em timestamptz,
  cancelada_em timestamptz,
  data_dia date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  CONSTRAINT senhas_numero_chk CHECK (numero BETWEEN 1 AND 9999),
  UNIQUE (clinica_id, data_dia, tipo, numero)
);
CREATE INDEX ix_senhas_fila ON public.senhas(clinica_id, data_dia, status, tipo);
CREATE INDEX ix_senhas_recentes ON public.senhas(clinica_id, emitida_em DESC);

ALTER TABLE public.senhas ENABLE ROW LEVEL SECURITY;

CREATE POLICY senhas_member_select ON public.senhas
  FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

CREATE POLICY senhas_member_insert ON public.senhas
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid(), clinica_id));

CREATE POLICY senhas_member_update ON public.senhas
  FOR UPDATE TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

CREATE POLICY senhas_manager_delete ON public.senhas
  FOR DELETE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));

-- RPC: emite próxima senha do tipo, gerando numero sequencial diário atômico
CREATE OR REPLACE FUNCTION public.emitir_senha(
  _clinica_id uuid,
  _tipo public.tipo_senha,
  _paciente_id uuid DEFAULT NULL,
  _identificado_facial boolean DEFAULT false
) RETURNS public.senhas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _proximo integer;
  _prefixo text;
  _row public.senhas;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.is_member(_user_id, _clinica_id) THEN
    RAISE EXCEPTION 'Sem acesso à clínica';
  END IF;

  -- Lock por clinica+tipo+dia para evitar duplicado
  PERFORM pg_advisory_xact_lock(
    hashtext(_clinica_id::text || ':' || _tipo::text || ':' || _hoje::text)
  );

  SELECT COALESCE(MAX(numero), 0) + 1 INTO _proximo
  FROM public.senhas
  WHERE clinica_id = _clinica_id AND data_dia = _hoje AND tipo = _tipo;

  _prefixo := _tipo::text;

  INSERT INTO public.senhas
    (clinica_id, tipo, numero, codigo, paciente_id, identificado_por_facial, data_dia)
  VALUES
    (_clinica_id, _tipo, _proximo, _prefixo || '-' || lpad(_proximo::text, 3, '0'),
     _paciente_id, COALESCE(_identificado_facial, false), _hoje)
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.emitir_senha(uuid, public.tipo_senha, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emitir_senha(uuid, public.tipo_senha, uuid, boolean) TO authenticated;

-- RPC: chamar próxima senha (ordem prioridade: E > P > R > N, depois ordem de emissão)
CREATE OR REPLACE FUNCTION public.chamar_proxima_senha(
  _clinica_id uuid,
  _guiche text
) RETURNS public.senhas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _row public.senhas;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.is_member(_user_id, _clinica_id) THEN
    RAISE EXCEPTION 'Sem acesso à clínica';
  END IF;
  IF _guiche IS NULL OR length(trim(_guiche)) = 0 OR length(_guiche) > 30 THEN
    RAISE EXCEPTION 'Guichê inválido';
  END IF;

  UPDATE public.senhas
  SET status = 'chamada',
      chamada_em = now(),
      chamada_por = _user_id,
      guiche = _guiche
  WHERE id = (
    SELECT id FROM public.senhas
    WHERE clinica_id = _clinica_id
      AND data_dia = _hoje
      AND status = 'emitida'
    ORDER BY CASE tipo
        WHEN 'E' THEN 1
        WHEN 'P' THEN 2
        WHEN 'R' THEN 3
        WHEN 'N' THEN 4
      END,
      emitida_em
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.chamar_proxima_senha(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chamar_proxima_senha(uuid, text) TO authenticated;

-- Realtime
ALTER TABLE public.senhas REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.senhas;