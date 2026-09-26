-- Bateria por profissional: depois que a Nina encaminha a conversa, os passos
-- seguintes daquele cenário são gravados como "dispensado" (não enviam
-- mensagem). A regra antiga só aceitava ok/erro/timeout/cancelado e recusava a
-- gravação; após três tentativas o teste inteiro terminava com
-- CARGA_RESULTADO_NAO_SALVO (cargas 98a6327b e ec79d793 de 25/09/2026).
-- Aditiva e reexecutável: só amplia os valores aceitos.
ALTER TABLE public.nina_teste_carga_amostras
  DROP CONSTRAINT IF EXISTS nina_teste_carga_amostras_status_chk;
ALTER TABLE public.nina_teste_carga_amostras
  ADD CONSTRAINT nina_teste_carga_amostras_status_chk
  CHECK (status = ANY (ARRAY['ok'::text, 'erro'::text, 'timeout'::text, 'cancelado'::text, 'dispensado'::text]));
