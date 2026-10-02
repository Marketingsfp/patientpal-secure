ALTER TABLE public.nfse
  ADD COLUMN IF NOT EXISTS consulta_erro_codigo text NULL,
  ADD COLUMN IF NOT EXISTS consulta_erro_mensagem text NULL,
  ADD COLUMN IF NOT EXISTS consulta_erro_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS consultado_em timestamptz NULL;

COMMENT ON COLUMN public.nfse.consulta_erro_codigo IS 'Código do erro da última CONSULTA de status na Focus (ex.: limite_excedido). Falha da nossa consulta, não da emissão. Limpo quando uma consulta seguinte responde com status.';
COMMENT ON COLUMN public.nfse.consulta_erro_mensagem IS 'Mensagem do erro da última consulta de status na Focus, para exibir na tela.';
COMMENT ON COLUMN public.nfse.consulta_erro_em IS 'Quando a última consulta de status na Focus falhou.';
COMMENT ON COLUMN public.nfse.consultado_em IS 'Quando foi feita a última consulta de status na Focus (com sucesso ou falha). Vazio em notas nunca consultadas depois desta coluna existir.';