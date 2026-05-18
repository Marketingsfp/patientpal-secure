-- Restrict realtime channel subscriptions by clinica membership.
-- Channel topics use the convention "<scope>-<clinica_id>" (e.g. painel-<uuid>, recepcao-<uuid>, fluxo-<uuid>).
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read clinica channels" ON realtime.messages;
CREATE POLICY "Authenticated can read clinica channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Topic must contain a clinica uuid the caller is a member of.
  EXISTS (
    SELECT 1
    FROM public.clinica_memberships m
    WHERE m.user_id = auth.uid()
      AND position(m.clinica_id::text in realtime.messages.topic) > 0
  )
);

DROP POLICY IF EXISTS "Authenticated can broadcast on clinica channels" ON realtime.messages;
CREATE POLICY "Authenticated can broadcast on clinica channels"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.clinica_memberships m
    WHERE m.user_id = auth.uid()
      AND position(m.clinica_id::text in realtime.messages.topic) > 0
  )
);
