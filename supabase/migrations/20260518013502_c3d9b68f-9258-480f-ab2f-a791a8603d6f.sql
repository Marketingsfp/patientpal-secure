
-- 1) Endurecer assinar_contrato_publico: aceitar apenas data URLs de imagem PNG/JPEG
CREATE OR REPLACE FUNCTION public.assinar_contrato_publico(_token text, _assinatura_svg text, _ip text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _id uuid;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN RAISE EXCEPTION 'Token inválido'; END IF;
  IF _assinatura_svg IS NULL OR length(_assinatura_svg) < 50 THEN RAISE EXCEPTION 'Assinatura inválida'; END IF;
  IF length(_assinatura_svg) > 2000000 THEN RAISE EXCEPTION 'Assinatura muito grande'; END IF;
  -- Aceitar somente data URL de imagem PNG ou JPEG em base64 (evita XSS via HTML/JS embutido)
  IF _assinatura_svg !~ '^data:image/(png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$' THEN
    RAISE EXCEPTION 'Formato de assinatura não suportado';
  END IF;
  IF _ip IS NOT NULL AND length(_ip) > 64 THEN RAISE EXCEPTION 'IP inválido'; END IF;

  UPDATE public.contratos_assinatura
    SET assinatura_svg = _assinatura_svg,
        assinado_em = COALESCE(assinado_em, now()),
        assinatura_ip = _ip
  WHERE token_publico = _token
  RETURNING id INTO _id;
  IF _id IS NULL THEN RAISE EXCEPTION 'Contrato não encontrado'; END IF;
  RETURN _id;
END;$function$;

-- 2) Bloquear escalação de privilégios em clinica_memberships
DROP POLICY IF EXISTS memberships_self_insert_first ON public.clinica_memberships;

CREATE POLICY memberships_manager_insert
  ON public.clinica_memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));

-- 3) Restringir Realtime: exigir que o usuário seja membro da clínica do canal
-- Convenção de tópico: "clinica:<uuid>" (qualquer subtópico após dois pontos é permitido)
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "realtime_clinica_member_select" ON realtime.messages;
DROP POLICY IF EXISTS "realtime_clinica_member_insert" ON realtime.messages;

CREATE POLICY "realtime_clinica_member_select"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    (realtime.topic() LIKE 'clinica:%')
    AND public.is_member(
      auth.uid(),
      NULLIF(split_part(split_part(realtime.topic(), ':', 2), ':', 1), '')::uuid
    )
  );

CREATE POLICY "realtime_clinica_member_insert"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (realtime.topic() LIKE 'clinica:%')
    AND public.is_member(
      auth.uid(),
      NULLIF(split_part(split_part(realtime.topic(), ':', 2), ':', 1), '')::uuid
    )
  );
