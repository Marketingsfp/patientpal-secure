DELETE FROM public.caixa_movimentos
WHERE lancamento_id IN (
  '01271ed8-82a0-4a36-b983-d049409ded62',
  'd3cb0ad9-546f-408c-8ef6-b6c0805e0087',
  '5b672874-0f0c-4a28-a1e7-b69835738502'
);

UPDATE public.fin_lancamentos
SET status = 'cancelado', updated_at = now(),
    observacoes = coalesce(observacoes || ' | ', '') || 'Cancelado: lançamento de teste'
WHERE id IN (
  '01271ed8-82a0-4a36-b983-d049409ded62',
  'd3cb0ad9-546f-408c-8ef6-b6c0805e0087',
  '5b672874-0f0c-4a28-a1e7-b69835738502'
);

UPDATE public.contrato_mensalidades
SET status = 'cancelado', updated_at = now()
WHERE contrato_id IN (
  '019f1788-e3c0-4721-968d-4a50e540e5dc',
  'a16c4cab-8b4e-4616-bc0e-cfa10484770b'
);

UPDATE public.contratos_assinatura
SET status = 'cancelado',
    cancelado_em = now(),
    cancelamento_motivo = 'Contrato de teste',
    updated_at = now()
WHERE id IN (
  '019f1788-e3c0-4721-968d-4a50e540e5dc',
  'a16c4cab-8b4e-4616-bc0e-cfa10484770b'
);