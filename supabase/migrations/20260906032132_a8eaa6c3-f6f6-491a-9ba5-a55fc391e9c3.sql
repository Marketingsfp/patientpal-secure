CREATE TABLE public.atend_protocolo_atendimento_config (
  clinica_id uuid PRIMARY KEY REFERENCES public.clinicas(id) ON DELETE CASCADE,
  prefixo text NOT NULL DEFAULT 'MJ',
  proximo_seq bigint NOT NULL DEFAULT 1,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.atend_protocolo_atendimento_config TO authenticated;
GRANT ALL ON public.atend_protocolo_atendimento_config TO service_role;

ALTER TABLE public.atend_protocolo_atendimento_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pac_select" ON public.atend_protocolo_atendimento_config
  FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "pac_cud" ON public.atend_protocolo_atendimento_config
  FOR ALL TO authenticated
  USING (can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER trg_pac_updated_at
  BEFORE UPDATE ON public.atend_protocolo_atendimento_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.atend_conversas
  ADD COLUMN IF NOT EXISTS protocolo_atendimento text,
  ADD COLUMN IF NOT EXISTS protocolo_sessao_id text,
  ADD COLUMN IF NOT EXISTS protocolo_em timestamptz;

CREATE OR REPLACE FUNCTION public.atend_gerar_protocolo_atendimento(
  _clinica_id uuid,
  _conversa_id uuid,
  _session_id text DEFAULT NULL
)
RETURNS TABLE(protocolo text, novo boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cfg public.atend_protocolo_atendimento_config%ROWTYPE;
  _atual text;
  _atual_sess text;
  _seq bigint;
  _res text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('atend_protocolo_atendimento:'||_clinica_id::text));

  SELECT c.protocolo_atendimento, c.protocolo_sessao_id
    INTO _atual, _atual_sess
    FROM public.atend_conversas c
   WHERE c.id = _conversa_id AND c.clinica_id = _clinica_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Mesmo ciclo de atendimento: reaproveita o número já gerado.
  IF _atual IS NOT NULL
     AND (_session_id IS NULL OR _atual_sess IS NULL OR _atual_sess = _session_id) THEN
    protocolo := _atual; novo := false; RETURN NEXT; RETURN;
  END IF;

  SELECT * INTO _cfg FROM public.atend_protocolo_atendimento_config
   WHERE clinica_id = _clinica_id;
  IF NOT FOUND OR NOT _cfg.ativo THEN
    RETURN;
  END IF;

  _seq := _cfg.proximo_seq;
  _res := _cfg.prefixo || '-' || _seq::text;

  UPDATE public.atend_protocolo_atendimento_config
     SET proximo_seq = _seq + 1, updated_at = now()
   WHERE clinica_id = _clinica_id;

  UPDATE public.atend_conversas
     SET protocolo_atendimento = _res,
         protocolo_sessao_id = _session_id,
         protocolo_em = now()
   WHERE id = _conversa_id AND clinica_id = _clinica_id;

  protocolo := _res; novo := true; RETURN NEXT; RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.atend_gerar_protocolo_atendimento(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.atend_gerar_protocolo_atendimento(uuid, uuid, text) TO service_role;

INSERT INTO public.atend_protocolo_atendimento_config (clinica_id, prefixo)
VALUES ('7570ddde-8c1c-4b55-ba72-cf12b2a6c940', 'MJ')
ON CONFLICT (clinica_id) DO NOTHING;