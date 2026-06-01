
UPDATE public.agendamentos a SET
  status = 'realizado',
  fluxo_etapa = 'finalizado',
  data_pagamento = COALESCE(s.data_pagamento AT TIME ZONE 'America/Sao_Paulo', a.data_pagamento),
  fluxo_atualizado_em = now(),
  updated_at = now()
FROM public._stg_pagos2 s
JOIN public.medicos m ON m.clinica_id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940' AND m.nome = s.medico_nome
WHERE a.clinica_id = m.clinica_id
  AND a.medico_id = m.id
  AND (a.inicio AT TIME ZONE 'UTC') = s.inicio_local;

DROP TABLE public._stg_pagos2;
