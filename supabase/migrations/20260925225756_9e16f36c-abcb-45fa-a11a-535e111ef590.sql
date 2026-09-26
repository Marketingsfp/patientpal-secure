ALTER TABLE public.nina_teste_carga_amostras DROP CONSTRAINT IF EXISTS nina_teste_carga_amostras_status_chk;

ALTER TABLE public.nina_teste_carga_amostras ADD CONSTRAINT nina_teste_carga_amostras_status_chk
  CHECK (status = ANY (ARRAY['ok','erro','timeout','cancelado','dispensado']));