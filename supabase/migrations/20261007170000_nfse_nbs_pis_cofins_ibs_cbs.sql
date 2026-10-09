-- NFS-e Nacional: NBS, PIS/COFINS e IBS/CBS como no portal.
-- Colunas opcionais: vazias mantêm o comportamento anterior (CST 08, sem NBS
-- e sem IBS/CBS).
alter table public.nfse_emitentes
  add column if not exists codigo_nbs text,
  add column if not exists pis_cofins_cst text,
  add column if not exists aliquota_pis numeric(6,4),
  add column if not exists aliquota_cofins numeric(6,4),
  add column if not exists ibs_cbs_cst text,
  add column if not exists ibs_cbs_classificacao text,
  add column if not exists ibs_cbs_indicador_operacao text;

comment on column public.nfse_emitentes.codigo_nbs is 'NBS padrão (9 dígitos) quando a descrição não define o tipo de serviço.';
comment on column public.nfse_emitentes.aliquota_pis is 'Alíquota PIS em % (ex.: 0.65). Só não optante do Simples.';
comment on column public.nfse_emitentes.aliquota_cofins is 'Alíquota COFINS em % (ex.: 3). Só não optante do Simples.';

-- NBS efetivamente usado na nota; o reenvio repete este valor.
alter table public.nfse add column if not exists codigo_nbs text;
