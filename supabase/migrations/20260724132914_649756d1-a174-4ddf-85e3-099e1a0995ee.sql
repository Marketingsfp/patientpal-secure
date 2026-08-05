alter table public.cb_convenio_regras
  drop constraint if exists cb_convenio_regras_limite_ck;

alter table public.cb_convenio_regras
  add constraint cb_convenio_regras_limite_ck
  check (
    limite_qtd is null or (
      limite_qtd > 0
      and limite_periodo in ('dia','semana','mes','ano','contrato')
      and limite_escopo  in ('contrato','paciente','titular_ou_dependente')
      and excedente_modo in ('percentual_particular','valor_fixo','particular','bloquear','regra_padrao_convenio')
    )
  );

comment on column public.cb_convenio_regras.limite_periodo is 'dia | semana | mes | ano | contrato';