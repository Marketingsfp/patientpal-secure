-- "Reaplicar regras" (cartão benefícios) recalculava e fazia upsert dos
-- valores que casavam com alguma regra, mas nunca limpava valores antigos
-- de procedimentos que deixaram de casar (regra removida/alterada) — o
-- procedimento ficava com o preço antigo, sem forma de distinguir se era
-- um valor manual (digitado no cadastro do serviço) ou um valor calculado
-- por uma regra que já não existe mais.
--
-- Adiciona a coluna que faltava para essa distinção: 'origem' identifica se
-- o valor foi digitado manualmente ou calculado por uma regra. O código
-- (regras-tab.tsx) passa a apagar as linhas origem='regra' do convênio
-- antes de reaplicar, preservando as origem='manual' intactas.
alter table public.procedimento_cb_convenio_valores
  add column if not exists origem text not null default 'manual';

alter table public.procedimento_cb_convenio_valores
  drop constraint if exists procedimento_cb_convenio_valores_origem_check;
alter table public.procedimento_cb_convenio_valores
  add constraint procedimento_cb_convenio_valores_origem_check
  check (origem in ('manual', 'regra'));
