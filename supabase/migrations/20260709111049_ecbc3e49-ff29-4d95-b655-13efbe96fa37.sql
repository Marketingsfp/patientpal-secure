UPDATE public.agendamentos SET ficha_numero = 27
WHERE id = '64730cfe-193e-4a69-a856-c652f431f6d8';

UPDATE public.agendamentos SET ficha_numero = 10
WHERE paciente_nome ILIKE 'DIVA DE CARVALHO XAVIER%'
  AND inicio::date = '2026-07-09';