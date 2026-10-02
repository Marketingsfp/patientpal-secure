ALTER TABLE public.nfse_emitentes
  ADD COLUMN IF NOT EXISTS regime_apuracao_sn smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pct_total_tributos_sn numeric(5,2) NULL;

ALTER TABLE public.nfse_emitentes
  ADD CONSTRAINT nfse_emitentes_regime_apuracao_sn_chk CHECK (regime_apuracao_sn IN (1, 2, 3));

COMMENT ON COLUMN public.nfse_emitentes.regime_apuracao_sn IS
  'Regime de apuração dos tributos do Simples Nacional (regApTribSN da DPS / regime_tributario_simples_nacional no Focus NFe): 1 = tributos federais e municipal pelo Simples Nacional; 2 = tributos federais pelo Simples Nacional e ISSQN por fora; 3 = tributos federais e municipal fora do Simples Nacional.';
COMMENT ON COLUMN public.nfse_emitentes.pct_total_tributos_sn IS
  'Percentual total aproximado de tributos federais pelo Simples Nacional, informado pela contabilidade, usado no pTotTribSN.';