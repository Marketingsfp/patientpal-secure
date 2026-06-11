-- 1) Stop broadcasting medicos via Realtime (biometric face_descriptor leak)
ALTER PUBLICATION supabase_realtime DROP TABLE public.medicos;

-- 2) Lock down payment-gateway recipient IDs (column-level)
REVOKE SELECT (paytime_recipient_id) ON public.clinicas FROM authenticated, anon;
REVOKE SELECT (paytime_recipient_id) ON public.medicos  FROM authenticated, anon;
-- service_role keeps full access (used by server functions / edge code)