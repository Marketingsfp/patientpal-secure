UPDATE public.medicos
SET nome = regexp_replace(nome, '^\s*(dr|dra)\.?\s+', '', 'i')
WHERE nome ~* '^\s*(dr|dra)\.?\s+';
