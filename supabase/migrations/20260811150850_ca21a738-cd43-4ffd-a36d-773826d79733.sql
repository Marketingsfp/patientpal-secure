UPDATE public.agendamentos
SET observacoes = NULLIF(
  btrim(regexp_replace(observacoes, '(?im)^[ \t]*SLOT GERADO AUTOMATICAMENTE[ \t]*\r?\n?', '', 'g')),
  ''
)
WHERE observacoes ILIKE '%SLOT GERADO AUTOMATICAMENTE%';